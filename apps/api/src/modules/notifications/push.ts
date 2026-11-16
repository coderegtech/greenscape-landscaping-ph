// Push delivery. NotificationDelivery rows are the queue: a worker claims due PENDING rows with a lease
// (FOR UPDATE SKIP LOCKED + nextAttemptAt pushed forward), sends them, then settles each row. A crash mid-send just lets
// the lease expire and the row is picked up again, and several API instances can run workers without double-sending.
import webpush from 'web-push';
import type { Deps } from '../../lib/deps.ts';
import { MAX_PUSH_ATTEMPTS, MAX_SUBSCRIPTION_FAILURES, PUSH_LEASE_MS, backoffMs, classifyPushError, pushOptions } from './logic.ts';

type PushDeps = Pick<Deps, 'db' | 'redis' | 'env' | 'log'>;

export type PushSender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, body: string, opts: { TTL: number; urgency: 'very-low' | 'low' | 'normal' | 'high' }) => Promise<unknown>;

/** `send` is injectable so tests can stand in for the push service; production always uses web-push. */
export function createPushWorker(deps: PushDeps, send?: PushSender) {
  const { db, env, log } = deps;
  const enabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  const sendPush: PushSender = send ?? ((sub, body, opts) => webpush.sendNotification(sub, body, { ...opts, vapidDetails: { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! } }));

  /** Claim up to `limit` due deliveries. Attempts are counted at claim time, so a crash still consumes one. */
  async function claim(limit: number) {
    return db.$queryRaw<{ id: string }[]>`
      UPDATE "NotificationDelivery" SET "attempts" = "attempts" + 1, "nextAttemptAt" = now() + (${PUSH_LEASE_MS} * interval '1 millisecond')
      WHERE "id" IN (
        SELECT "id" FROM "NotificationDelivery"
        WHERE "status" = 'PENDING' AND "nextAttemptAt" <= now()
        ORDER BY "nextAttemptAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
      RETURNING "id"`;
  }

  async function deliver(id: string) {
    const d = await db.notificationDelivery.findUnique({ where: { id }, include: { notification: true, subscription: { include: { user: { select: { status: true } } } } } });
    if (!d || d.status !== 'PENDING') return;
    const { notification: n, subscription: sub } = d;
    if (!sub) return void (await db.notificationDelivery.update({ where: { id }, data: { status: 'GONE', failureReason: 'subscription removed' } }));
    // Suspended or deleted since it was queued: private notices must not reach the device any more.
    if (sub.user.status !== 'ACTIVE') return void (await db.notificationDelivery.update({ where: { id }, data: { status: 'FAILED', failureReason: 'account not active' } }));
    if (n.readAt || (n.expiresAt && n.expiresAt < new Date())) {
      // Read on another device (or expired) before the push went out: nothing to show.
      return void (await db.notificationDelivery.update({ where: { id }, data: { status: 'SENT', failureReason: 'skipped: already read or expired' } }));
    }
    const href = (n.payload as { href?: string } | null)?.href ?? '/';
    const body = JSON.stringify({ id: n.id, title: n.title, body: n.message, url: href, tag: n.id, type: n.type, priority: n.priority, icon: '/icon.png' });
    let outcome: ReturnType<typeof classifyPushError>;
    try {
      await sendPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, pushOptions(n.priority));
      outcome = { kind: 'sent' };
    } catch (err) {
      outcome = classifyPushError(err as { statusCode?: number; message?: string });
    }

    if (outcome.kind === 'sent') {
      await db.$transaction([
        db.notificationDelivery.update({ where: { id }, data: { status: 'SENT', deliveredAt: new Date(), failureReason: null } }),
        db.pushSubscription.update({ where: { id: sub.id }, data: { failureCount: 0, lastActiveAt: new Date() } }),
      ]);
    } else if (outcome.kind === 'gone') {
      log.info({ subscriptionId: sub.id, userId: sub.userId }, 'push subscription expired or revoked; removing');
      await db.notificationDelivery.update({ where: { id }, data: { status: 'GONE', failureReason: 'subscription expired or revoked' } });
      await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
    } else {
      const final = outcome.kind === 'failed' || d.attempts >= MAX_PUSH_ATTEMPTS;
      log.warn({ deliveryId: id, attempts: d.attempts, final, reason: outcome.reason }, 'push delivery failed');
      await db.notificationDelivery.update({
        where: { id },
        data: final ? { status: 'FAILED', failureReason: outcome.reason } : { nextAttemptAt: new Date(Date.now() + backoffMs(d.attempts)), failureReason: outcome.reason },
      });
      // Only a delivery that gave up counts against the subscription: a push-service outage (every retry fails) must not delete healthy devices.
      if (final) {
        const failures = await db.pushSubscription.update({ where: { id: sub.id }, data: { failureCount: { increment: 1 } }, select: { failureCount: true } });
        if (failures.failureCount >= MAX_SUBSCRIPTION_FAILURES) {
          log.info({ subscriptionId: sub.id }, 'push subscription kept failing; removing');
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        }
      }
    }
  }

  async function pass(): Promise<number> {
    let sent = 0;
    for (;;) {
      const batch = await claim(25);
      if (!batch.length) return sent;
      await Promise.all(batch.map((b) => deliver(b.id).catch((err) => log.error({ err, deliveryId: b.id }, 'push send crashed'))));
      sent += batch.length;
    }
  }

  let inflight: Promise<number> | null = null;
  let again = false;
  /** Sends everything due now. Concurrent callers share one run (plus a follow-up pass if work arrived meanwhile) and all wait for it. */
  function drain(): Promise<number> {
    if (!enabled) return Promise.resolve(0);
    if (inflight) {
      again = true;
      return inflight;
    }
    inflight = (async () => {
      let sent = 0;
      do {
        again = false;
        sent += await pass();
      } while (again);
      return sent;
    })().finally(() => { inflight = null; });
    return inflight;
  }

  /** Housekeeping: expired notifications, long-silent subscriptions, old delivery records. */
  async function purge(now = new Date()) {
    const day = 86_400_000;
    const [notifications, subscriptions] = await Promise.all([
      db.notification.deleteMany({ where: { expiresAt: { lt: now } } }),
      db.pushSubscription.deleteMany({ where: { lastActiveAt: { lt: new Date(now.getTime() - 90 * day) } } }),
    ]);
    return { notifications: notifications.count, subscriptions: subscriptions.count };
  }

  function start(pollMs = 5_000, purgeMs = 3_600_000) {
    const poll = setInterval(() => void drain().catch((err) => log.error({ err }, 'push drain failed')), pollMs);
    const clean = setInterval(
      () => void purge().then((r) => (r.notifications || r.subscriptions) && log.info(r, 'notification purge')).catch((err) => log.error({ err }, 'notification purge failed')),
      purgeMs,
    );
    poll.unref();
    clean.unref();
    void drain().catch(() => undefined); // anything queued before a restart goes out now
    return { stop: () => { clearInterval(poll); clearInterval(clean); } };
  }

  return { enabled, drain, purge, start };
}
export type PushWorker = ReturnType<typeof createPushWorker>;
