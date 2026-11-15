import { randomUUID } from 'node:crypto';
import { AppQuery, BroadcastBody, type NotificationApp, ClearQuery, NotificationListQuery, NotificationPage, PreferenceUpdate, PushSubscriptionBody, PushUnsubscribeBody, z } from '@greenscape/validation';
import { Router } from 'express';
import { audit } from '../../lib/audit.ts';
import { assertRolesExist } from '../users/roles.ts';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { registry } from '../../lib/openapi.ts';
import { currentAuth, requireAuth, requirePermission } from '../../middleware/auth.ts';
import { formLimit } from '../../middleware/form-limit.ts';

const Id = z.object({ id: z.string().uuid() });

const api = (method: 'get' | 'post' | 'put' | 'delete', path: string, summary: string, extra: { body?: z.ZodType; query?: z.ZodType; schema?: z.ZodType } = {}) =>
  registry.registerPath({ method, path: `/v1/notifications${path}`, tags: ['notifications'], auth: true, summary, body: extra.body, query: extra.query, responses: { 200: { description: 'ok', schema: extra.schema } } });
api('get', '', 'Your notifications for one app (`web` or `admin`), newest first, cursor-paginated, with the unread count.', { query: NotificationListQuery, schema: NotificationPage });
api('post', '/{id}/read', 'Mark one notification read (own only).');
api('post', '/read-all', 'Mark all read for an app.', { query: AppQuery });
api('delete', '/{id}', 'Delete one notification (own only).');
api('delete', '', 'Delete all (or only read) notifications for an app.', { query: ClearQuery });
api('get', '/preferences', 'Per-category in-app / push / sound settings.');
api('put', '/preferences', 'Save settings. Account and security notices cannot be hidden from the inbox.', { body: PreferenceUpdate });
api('get', '/push/config', 'Whether push is on, and the public VAPID key the browser subscribes with.');
api('post', '/push/subscriptions', 'Register this browser for push (one row per device).', { body: PushSubscriptionBody });
api('delete', '/push/subscriptions', 'Remove a push subscription.', { body: PushUnsubscribeBody });
api('post', '/push/test', 'Send a test alert to your own devices for one app. Rate-limited.', { query: AppQuery });
api('post', '/broadcast', 'Send an announcement (notifications.broadcast). Audited; rate-limited.', { body: BroadcastBody });

/** Who may receive pushes from a portal: a device registers for the console or the employee portal only with access to it. */
const PORTAL_PERMISSION: Record<NotificationApp, string | null> = { web: null, admin: 'admin.access', employee: 'attendance.self' };

export function notificationRoutes(deps: Deps) {
  const { notifications: n, env, db } = deps;
  const r = Router();
  r.use(requireAuth);
  const uid = (res: Parameters<typeof currentAuth>[0]) => currentAuth(res).userId;

  r.get('/', async (req, res) => {
    const q = NotificationListQuery.parse(req.query);
    res.set('cache-control', 'no-store').json(NotificationPage.parse(await n.list(uid(res), q)));
  });

  r.post('/read-all', async (req, res) => {
    const { app } = AppQuery.parse(req.query);
    res.json({ updated: await n.markAllRead(uid(res), app) });
  });
  r.delete('/', async (req, res) => {
    const q = ClearQuery.parse(req.query);
    res.json({ deleted: await n.clear(uid(res), q.app, q.readOnly) });
  });

  r.get('/preferences', async (_req, res) => res.set('cache-control', 'no-store').json({ preferences: await n.preferences(uid(res)) }));
  r.put('/preferences', async (req, res) => res.json({ preferences: await n.setPreferences(uid(res), PreferenceUpdate.parse(req.body).preferences) }));

  r.get('/push/config', (_req, res) => res.json({ enabled: n.worker.enabled, publicKey: n.worker.enabled ? env.VAPID_PUBLIC_KEY : null }));
  r.post('/push/subscriptions', async (req, res) => {
    if (!n.worker.enabled) throw new AppError(503, 'PUSH_DISABLED', 'Push notifications are not configured on this server');
    const b = PushSubscriptionBody.parse(req.body);
    const need = PORTAL_PERMISSION[b.app];
    if (need && !currentAuth(res).permissions.has(need)) throw AppError.forbidden('Your account cannot use this portal');
    await n.subscribe(uid(res), { app: b.app, deviceId: b.deviceId, endpoint: b.subscription.endpoint, p256dh: b.subscription.keys.p256dh, auth: b.subscription.keys.auth, userAgent: req.get('user-agent') });
    res.status(201).json({ ok: true });
  });
  r.delete('/push/subscriptions', async (req, res) => {
    await n.unsubscribe(uid(res), PushUnsubscribeBody.parse(req.body).endpoint);
    res.json({ ok: true });
  });

  // Goes through the real pipeline (inbox, live, push queue) to the caller's own devices only; nobody else can be named.
  r.post('/push/test', formLimit(deps, 'push-test', 10), async (req, res) => {
    const { app } = AppQuery.parse(req.query);
    const devices = await db.pushSubscription.count({ where: { userId: uid(res), app } });
    if (!devices) throw new AppError(409, 'NO_DEVICE', 'Turn on alerts on this device first');
    await n.notify({ userId: uid(res), app, type: 'push.test', category: 'account', title: 'Test alert', message: 'Alerts work on this device.', href: app === 'web' ? '/account/notifications' : '/notifications', priority: 'HIGH' });
    res.status(201).json({ devices });
  });

  r.post('/broadcast', requirePermission('notifications.broadcast'), formLimit(deps, 'broadcast', 20), async (req, res) => {
    const b = BroadcastBody.parse(req.body);
    await assertRolesExist(db, b.roles ?? []);
    // Audience: the chosen roles; otherwise everyone who can use that app (staff for `admin`, employees for `employee`,
    // every active account for `web`).
    const ids = b.roles?.length
      ? (await db.user.findMany({ where: { status: 'ACTIVE', roles: { some: { role: { key: { in: b.roles } } } } }, select: { id: true } })).map((u) => u.id)
      : b.app === 'admin'
        ? await n.usersWithPermission('admin.access')
        : b.app === 'employee'
          ? await n.usersWithPermission('attendance.self')
          : (await db.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })).map((u) => u.id);
    const id = randomUUID();
    const delivered = await n.notifyMany(ids, { app: b.app, type: 'system.announcement', category: 'system', title: b.title, message: b.message, href: b.href, priority: b.priority, dedupeKey: `broadcast:${id}` });
    await audit(db, req, res, { action: 'notification.broadcast', entityType: 'Notification', entityId: id, after: { app: b.app, roles: b.roles ?? null, title: b.title, recipients: ids.length } });
    res.status(201).json({ recipients: ids.length, delivered });
  });

  // `:id` routes last so they never shadow the static paths above.
  r.post('/:id/read', async (req, res) => {
    await n.markRead(uid(res), Id.parse(req.params).id);
    res.json({ ok: true });
  });
  r.delete('/:id', async (req, res) => {
    await n.remove(uid(res), Id.parse(req.params).id);
    res.json({ ok: true });
  });

  return r;
}
