// The notification service: the only code that writes Notification rows. Business code never calls this directly; it
// emits an event (lib/events.ts) and handlers.ts turns that into notify() calls.
import { Prisma } from '@greenscape/database';
import { CATEGORY_KEYS, NOTIFICATION_CATEGORIES, type NotificationApp, type NotificationCategory, type NotificationPreferenceItem, type NotificationView } from '@greenscape/validation';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { decodeCursor, effectivePreference, encodeCursor } from './logic.ts';
import { createPushWorker, type PushSender } from './push.ts';

type ServiceDeps = Pick<Deps, 'db' | 'redis' | 'env' | 'log' | 'realtime'>;
const PUSH_PER_MINUTE = 20; // per user; beyond it the notification is still in the inbox, just not pushed again
const RETENTION_DAYS = 90;

export interface NotifyInput {
  userId: string;
  app: NotificationApp;
  type: string;
  category: NotificationCategory;
  title: string;
  message: string;
  /** Path inside `app`; opens when the notification is clicked. */
  href?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  /** Same key for the same recipient = stored once, however many times the event is replayed. */
  dedupeKey?: string;
}

type Row = { id: string; type: string; category: string; title: string; message: string; payload: Prisma.JsonValue; priority: NotificationView['priority']; readAt: Date | null; createdAt: Date };
export const toView = (n: Row): NotificationView => ({
  id: n.id,
  type: n.type,
  category: n.category as NotificationCategory,
  title: n.title,
  message: n.message,
  href: (n.payload as { href?: string } | null)?.href ?? null,
  priority: n.priority,
  read: n.readAt !== null,
  createdAt: n.createdAt.toISOString(),
});

export function createNotifications(deps: ServiceDeps, send?: PushSender) {
  const { db, redis, env, log } = deps;
  const hub = deps.realtime; // live delivery to the recipient's open tabs (Socket.IO); the row is already stored
  const worker = createPushWorker(deps, send);

  async function pushAllowed(userId: string) {
    try {
      const key = `${env.CACHE_PREFIX}:notif:push:${userId}`;
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, 60);
      return n <= PUSH_PER_MINUTE;
    } catch {
      return true; // Redis down: don't drop pushes because the limiter is unreachable
    }
  }

  /** Stores a notification (once per dedupeKey), streams it to the recipient's open tabs and queues pushes. Returns null when skipped. */
  async function notify(input: NotifyInput): Promise<NotificationView | null> {
    const saved = await db.notificationPreference.findUnique({ where: { userId_category: { userId: input.userId, category: input.category } } });
    const pref = effectivePreference(input.category, saved);
    if (!pref.inApp) return null;

    let row;
    try {
      row = await db.notification.create({
        data: {
          recipientId: input.userId,
          app: input.app,
          type: input.type,
          category: input.category,
          title: input.title,
          message: input.message,
          payload: input.href ? { href: input.href } : undefined,
          priority: input.priority ?? 'NORMAL',
          dedupeKey: input.dedupeKey,
          expiresAt: new Date(Date.now() + RETENTION_DAYS * 86_400_000),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null; // already stored: idempotent replay
      throw err;
    }
    const view = toView(row);
    hub.publish({ userId: input.userId, app: input.app, event: 'created', data: { notification: view, sound: pref.sound } });

    if (pref.push && worker.enabled && (await pushAllowed(input.userId))) {
      // Best effort: the notification is already stored and streamed; a subscription removed mid-way must not fail the event.
      try {
        const subs = await db.pushSubscription.findMany({ where: { userId: input.userId, app: input.app, user: { status: 'ACTIVE' } }, select: { id: true } });
        if (subs.length) {
          await db.notificationDelivery.createMany({ data: subs.map((s) => ({ notificationId: row.id, subscriptionId: s.id })), skipDuplicates: true });
          void worker.drain().catch(() => undefined);
        }
      } catch (err) {
        log.warn({ err: (err as Error).message, notificationId: row.id }, 'could not queue push deliveries');
      }
    }
    return view;
  }

  /** Active users who hold a permission through any role. Staff audiences are always resolved this way, never by role name. */
  async function usersWithPermission(permission: string) {
    const rows = await db.user.findMany({ where: { status: 'ACTIVE', roles: { some: { role: { permissions: { some: { permission: { key: permission } } } } } } }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async function notifyMany(userIds: string[], input: Omit<NotifyInput, 'userId'>) {
    let delivered = 0;
    for (let i = 0; i < userIds.length; i += 25) {
      const results = await Promise.all(userIds.slice(i, i + 25).map((userId) => notify({ ...input, userId }).catch((err) => { log.error({ err, userId, type: input.type }, 'notify failed'); return null; })));
      delivered += results.filter(Boolean).length;
    }
    return delivered;
  }

  const notifyPermission = async (permission: string, input: Omit<NotifyInput, 'userId'>) => notifyMany(await usersWithPermission(permission), input);

  // ── reads and state changes. Every query is scoped to the caller's own userId: ownership is part of the WHERE. ──
  const unreadCount = (userId: string, app: NotificationApp) => db.notification.count({ where: { recipientId: userId, app, readAt: null } });

  async function list(userId: string, q: { app: NotificationApp; cursor?: string; limit: number; unread: boolean; category?: NotificationCategory }) {
    const cur = q.cursor ? decodeCursor(q.cursor) : null;
    if (q.cursor && !cur) throw AppError.badRequest('Invalid cursor');
    const rows = await db.notification.findMany({
      where: {
        recipientId: userId,
        app: q.app,
        ...(q.unread ? { readAt: null } : {}),
        ...(q.category ? { category: q.category } : {}),
        ...(cur ? { OR: [{ createdAt: { lt: cur.createdAt } }, { createdAt: cur.createdAt, id: { lt: cur.id } }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    return { items: page.map(toView), nextCursor: rows.length > q.limit && last ? encodeCursor(last.createdAt, last.id) : null, unreadCount: await unreadCount(userId, q.app) };
  }

  async function markRead(userId: string, id: string) {
    const n = await db.notification.findFirst({ where: { id, recipientId: userId }, select: { id: true, app: true } });
    if (!n) throw AppError.notFound('Notification not found'); // someone else's id looks exactly like a missing one
    await db.notification.updateMany({ where: { id, recipientId: userId, readAt: null }, data: { readAt: new Date() } });
    hub.publish({ userId, app: n.app as NotificationApp, event: 'read', data: { ids: [id] } });
  }

  async function markAllRead(userId: string, app: NotificationApp) {
    const { count } = await db.notification.updateMany({ where: { recipientId: userId, app, readAt: null }, data: { readAt: new Date() } });
    if (count) hub.publish({ userId, app, event: 'read_all', data: {} });
    return count;
  }

  async function remove(userId: string, id: string) {
    const n = await db.notification.findFirst({ where: { id, recipientId: userId }, select: { app: true } });
    if (!n) throw AppError.notFound('Notification not found');
    await db.notification.deleteMany({ where: { id, recipientId: userId } });
    hub.publish({ userId, app: n.app as NotificationApp, event: 'deleted', data: { ids: [id] } });
  }

  async function clear(userId: string, app: NotificationApp, readOnly: boolean) {
    const { count } = await db.notification.deleteMany({ where: { recipientId: userId, app, ...(readOnly ? { readAt: { not: null } } : {}) } });
    if (count) hub.publish({ userId, app, event: 'cleared', data: { readOnly } });
    return count;
  }

  // ── preferences ──
  async function preferences(userId: string): Promise<NotificationPreferenceItem[]> {
    const rows = await db.notificationPreference.findMany({ where: { userId } });
    return CATEGORY_KEYS.map((category) => ({ category, ...effectivePreference(category, rows.find((r) => r.category === category)) }));
  }

  async function setPreferences(userId: string, items: NotificationPreferenceItem[]) {
    await db.$transaction(
      items.map((p) => {
        const e = effectivePreference(p.category, p);
        const data = { inApp: NOTIFICATION_CATEGORIES[p.category].locked ? true : p.inApp, push: e.push, sound: p.sound };
        return db.notificationPreference.upsert({ where: { userId_category: { userId, category: p.category } }, create: { userId, category: p.category, ...data }, update: data });
      }),
    );
    return preferences(userId);
  }

  // ── devices ──
  async function subscribe(userId: string, b: { app: NotificationApp; deviceId: string; endpoint: string; p256dh: string; auth: string; userAgent?: string }) {
    const data = { userId, app: b.app, deviceId: b.deviceId, endpoint: b.endpoint, p256dh: b.p256dh, auth: b.auth, userAgent: b.userAgent?.slice(0, 300), failureCount: 0, lastActiveAt: new Date() };
    // The same browser can re-subscribe with a new endpoint (key rotation) or be handed to another account on a shared
    // computer: the endpoint is globally unique and always belongs to the account signed in now.
    await db.$transaction([
      db.pushSubscription.deleteMany({ where: { OR: [{ endpoint: b.endpoint, userId: { not: userId } }, { userId, app: b.app, deviceId: b.deviceId, endpoint: { not: b.endpoint } }] } }),
      db.pushSubscription.upsert({ where: { endpoint: b.endpoint }, create: data, update: data }),
    ]);
  }
  const unsubscribe = (userId: string, endpoint: string) => db.pushSubscription.deleteMany({ where: { userId, endpoint } });

  return { worker, notify, notifyMany, notifyPermission, usersWithPermission, list, unreadCount, markRead, markAllRead, remove, clear, preferences, setPreferences, subscribe, unsubscribe };
}
export type Notifications = ReturnType<typeof createNotifications>;
