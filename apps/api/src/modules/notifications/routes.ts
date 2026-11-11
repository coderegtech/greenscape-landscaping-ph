import { randomUUID } from 'node:crypto';
import { ROLE_KEYS } from '@greenscape/database/rbac';
import { AppQuery, BroadcastBody, ClearQuery, NotificationListQuery, NotificationPage, PreferenceUpdate, PushSubscriptionBody, PushUnsubscribeBody, z } from '@greenscape/validation';
import { Router } from 'express';
import { audit } from '../../lib/audit.ts';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { registry } from '../../lib/openapi.ts';
import { currentAuth, requireAuth, requirePermission } from '../../middleware/auth.ts';
import { formLimit } from '../../middleware/form-limit.ts';

const Id = z.object({ id: z.string().uuid() });
const MAX_STREAMS_PER_USER = 10; // tabs and devices; protects the process from a runaway client
const STREAM_MAX_MS = 30 * 60_000; // closed on purpose so the client reconnects with a fresh access token
const HEARTBEAT_MS = 25_000; // keeps proxies from idling the connection out

const api = (method: 'get' | 'post' | 'put' | 'delete', path: string, summary: string, extra: { body?: z.ZodType; query?: z.ZodType; schema?: z.ZodType } = {}) =>
  registry.registerPath({ method, path: `/v1/notifications${path}`, tags: ['notifications'], auth: true, summary, body: extra.body, query: extra.query, responses: { 200: { description: 'ok', schema: extra.schema } } });
api('get', '', 'Your notifications for one app (`web` or `admin`), newest first, cursor-paginated, with the unread count.', { query: NotificationListQuery, schema: NotificationPage });
api('get', '/stream', 'Server-sent events: `ready`, `created`, `read`, `read_all`, `deleted`, `cleared`, `reconnect`. Send the Bearer token with fetch (EventSource cannot).', { query: AppQuery });
api('post', '/{id}/read', 'Mark one notification read (own only).');
api('post', '/read-all', 'Mark all read for an app.', { query: AppQuery });
api('delete', '/{id}', 'Delete one notification (own only).');
api('delete', '', 'Delete all (or only read) notifications for an app.', { query: ClearQuery });
api('get', '/preferences', 'Per-category in-app / push / sound settings.');
api('put', '/preferences', 'Save settings. Account and security notices cannot be hidden from the inbox.', { body: PreferenceUpdate });
api('get', '/push/config', 'Whether push is on, and the public VAPID key the browser subscribes with.');
api('post', '/push/subscriptions', 'Register this browser for push (one row per device).', { body: PushSubscriptionBody });
api('delete', '/push/subscriptions', 'Remove a push subscription.', { body: PushUnsubscribeBody });
api('post', '/broadcast', 'Send an announcement (notifications.broadcast). Audited; rate-limited.', { body: BroadcastBody });

export function notificationRoutes(deps: Deps) {
  const { notifications: n, env, db } = deps;
  const r = Router();
  r.use(requireAuth);
  const uid = (res: Parameters<typeof currentAuth>[0]) => currentAuth(res).userId;

  r.get('/', async (req, res) => {
    const q = NotificationListQuery.parse(req.query);
    res.set('cache-control', 'no-store').json(NotificationPage.parse(await n.list(uid(res), q)));
  });

  r.get('/stream', (req, res) => {
    const { app } = AppQuery.parse(req.query);
    const userId = uid(res);
    if (n.hub.count(userId) >= MAX_STREAMS_PER_USER) throw new AppError(429, 'TOO_MANY_STREAMS', 'Too many open connections for this account');
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const send = (event: string, data: unknown = {}) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.write('retry: 3000\n\n');
    const off = n.hub.subscribe(userId, (e) => { if (e.app === app) send(e.event, e.data); });
    send('ready', { at: new Date().toISOString() }); // the client re-fetches on every `ready`: that is how missed events are recovered
    const beat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    const cap = setTimeout(() => { send('reconnect'); res.end(); }, STREAM_MAX_MS);
    req.on('close', () => { clearInterval(beat); clearTimeout(cap); off(); });
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
    await n.subscribe(uid(res), { app: b.app, deviceId: b.deviceId, endpoint: b.subscription.endpoint, p256dh: b.subscription.keys.p256dh, auth: b.subscription.keys.auth, userAgent: req.get('user-agent') });
    res.status(201).json({ ok: true });
  });
  r.delete('/push/subscriptions', async (req, res) => {
    await n.unsubscribe(uid(res), PushUnsubscribeBody.parse(req.body).endpoint);
    res.json({ ok: true });
  });

  r.post('/broadcast', requirePermission('notifications.broadcast'), formLimit(deps, 'broadcast', 20), async (req, res) => {
    const b = BroadcastBody.parse(req.body);
    const unknown = (b.roles ?? []).filter((k) => !(ROLE_KEYS as string[]).includes(k));
    if (unknown.length) throw AppError.badRequest('Unknown roles', { unknown });
    // Audience: the chosen roles; otherwise everyone who can use that app (staff for `admin`, every active account for `web`).
    const ids = b.roles?.length
      ? (await db.user.findMany({ where: { status: 'ACTIVE', roles: { some: { role: { key: { in: b.roles } } } } }, select: { id: true } })).map((u) => u.id)
      : b.app === 'admin'
        ? await n.usersWithPermission('admin.access')
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
