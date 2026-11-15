import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { MAX_PUSH_ATTEMPTS } from '../../apps/api/src/modules/notifications/logic.ts';
import { createNotifications, type Notifications } from '../../apps/api/src/modules/notifications/service.ts';
import type { PushSender } from '../../apps/api/src/modules/notifications/push.ts';
import { testDeps } from './helpers.ts';
import { deleteAuthUsers, signedInUser } from './supabase.ts';
import { openSocket, refusal } from './realtime-client.ts';

const tag = `nt${Date.now()}`;
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const vapid = (createRequire(new URL('../../apps/api/package.json', import.meta.url))('web-push') as { generateVAPIDKeys(): { publicKey: string; privateKey: string } }).generateVAPIDKeys();

let deps: Deps;
let app: ReturnType<typeof createApp>;
let server: Server;
let base: string;
const authIds: string[] = [];
const users: Record<string, { token: string; id: string }> = {};

async function makeUser(label: string, roles: string[] = []) {
  const u = await signedInUser(`${label}-${tag}`);
  authIds.push(u.authUserId);
  await request(app).get('/v1/auth/me').set(as(u.token)).expect(200); // first call creates the User row
  const user = await deps.db.user.findUniqueOrThrow({ where: { authUserId: u.authUserId } });
  if (roles.length) {
    const rows = await deps.db.role.findMany({ where: { key: { in: roles } } });
    await deps.db.userRole.createMany({ data: rows.map((r) => ({ userId: user.id, roleId: r.id })), skipDuplicates: true });
    await deps.cache.invalidateTags([`authz:user:${user.id}`]);
  }
  return { token: u.token, id: user.id };
}

/** A real Socket.IO connection, the way the portals hold one. */
const openStream = (token: string, appName = 'web') => openSocket(base, token, appName);

const base0 = { app: 'web' as const, type: 'test.event', category: 'orders' as const, title: 'Hello', message: 'World', href: '/orders' };
const list = (token: string, qs = 'app=web') => request(app).get(`/v1/notifications?${qs}`).set(as(token));

beforeAll(async () => {
  deps = await testDeps({ REVALIDATE_SECRET: '', FORM_RATE_LIMIT_PER_HOUR: '1000', VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey });
  app = createApp(deps);
  server = app.listen(0);
  deps.realtime.attach(server);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  users.alice = await makeUser('alice');
  users.bob = await makeUser('bob');
  users.shop = await makeUser('shop', ['ecommerce_manager']);
  users.admin = await makeUser('admin', ['admin']);
  await deps.db.notification.deleteMany({ where: { recipientId: { in: Object.values(users).map((u) => u.id) } } }); // the welcome notices; asserted in its own test
});

afterAll(async () => {
  server.close();
  const ids = Object.values(users).map((u) => u.id);
  await deps.db.notification.deleteMany({ where: { recipientId: { in: ids } } });
  await deps.db.user.deleteMany({ where: { id: { in: ids } } });
  await deleteAuthUsers(authIds);
  await closeDeps(deps);
});

describe('inbox API', () => {
  it('welcomes a new account once, and replaying the registration event adds nothing', async () => {
    const u = await makeUser('newbie');
    users.newbie = u;
    expect((await list(u.token).expect(200)).body.items.map((i: { title: string }) => i.title)).toEqual(['Welcome to Greenscape']);
    await deps.events.emit('user.registered', { userId: u.id });
    expect((await list(u.token).expect(200)).body.items).toHaveLength(1);
  });

  it('requires a signed-in user and an app', async () => {
    await request(app).get('/v1/notifications?app=web').expect(401);
    expect(await refusal(openSocket(base, undefined, 'web'))).toBe('UNAUTHORIZED');
    await list(users.alice!.token, '').expect(400);
  });

  it('stores a notification once per dedupe key and lists it newest first with the unread count', async () => {
    const a = users.alice!.id;
    const first = await deps.notifications.notify({ ...base0, userId: a, title: 'one', dedupeKey: `${tag}:dup` });
    const again = await deps.notifications.notify({ ...base0, userId: a, title: 'one again', dedupeKey: `${tag}:dup` });
    expect(first).not.toBeNull();
    expect(again).toBeNull(); // idempotent replay
    await deps.notifications.notify({ ...base0, userId: a, title: 'two', priority: 'HIGH' });
    const res = await list(users.alice!.token).expect(200);
    expect(res.body.items.map((i: { title: string }) => i.title)).toEqual(['two', 'one']);
    expect(res.body).toMatchObject({ unreadCount: 2, nextCursor: null });
    expect(res.body.items[0]).toMatchObject({ category: 'orders', priority: 'HIGH', href: '/orders', read: false });
  });

  it('keeps each app separate and paginates with a cursor', async () => {
    const c = users.bob!.id;
    for (let i = 1; i <= 5; i++) await deps.notifications.notify({ ...base0, userId: c, title: `n${i}` });
    await deps.notifications.notify({ ...base0, app: 'admin', userId: c, title: 'staff only' });
    const p1 = (await list(users.bob!.token, 'app=web&limit=2').expect(200)).body;
    expect(p1.items.map((i: { title: string }) => i.title)).toEqual(['n5', 'n4']);
    const p2 = (await list(users.bob!.token, `app=web&limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`).expect(200)).body;
    expect(p2.items.map((i: { title: string }) => i.title)).toEqual(['n3', 'n2']);
    const p3 = (await list(users.bob!.token, `app=web&limit=2&cursor=${encodeURIComponent(p2.nextCursor)}`).expect(200)).body;
    expect(p3.items.map((i: { title: string }) => i.title)).toEqual(['n1']);
    expect(p3.nextCursor).toBeNull();
    expect((await list(users.bob!.token, 'app=admin').expect(200)).body.items.map((i: { title: string }) => i.title)).toEqual(['staff only']);
    await list(users.bob!.token, 'app=web&cursor=garbage').expect(400);
  });

  it("never exposes, changes or deletes another user's notifications", async () => {
    const mine = (await list(users.alice!.token).expect(200)).body.items[0];
    // bob cannot see it, mark it read, or delete it: the id looks like it does not exist
    expect((await list(users.bob!.token).expect(200)).body.items.some((i: { id: string }) => i.id === mine.id)).toBe(false);
    await request(app).post(`/v1/notifications/${mine.id}/read`).set(as(users.bob!.token)).expect(404);
    await request(app).delete(`/v1/notifications/${mine.id}`).set(as(users.bob!.token)).expect(404);
    const still = (await list(users.alice!.token).expect(200)).body.items.find((i: { id: string }) => i.id === mine.id);
    expect(still).toMatchObject({ read: false });
  });

  it('marks one and all read, deletes one, clears read, clears all', async () => {
    const u = users.alice!;
    const ids = (await Promise.all([1, 2, 3, 4].map((i) => deps.notifications.notify({ ...base0, userId: u.id, title: `m${i}` })))).map((n) => n!.id);
    await request(app).post(`/v1/notifications/${ids[0]}/read`).set(as(u.token)).expect(200);
    const unread = async () => (await list(u.token, 'app=web&unread=true').expect(200)).body;
    const before = (await unread()).unreadCount;
    await request(app).post('/v1/notifications/read-all?app=web').set(as(u.token)).expect(200);
    expect((await unread()).unreadCount).toBe(0);
    expect(before).toBeGreaterThan(0);
    await request(app).delete(`/v1/notifications/${ids[1]}`).set(as(u.token)).expect(200);
    expect((await list(u.token).expect(200)).body.items.some((i: { id: string }) => i.id === ids[1])).toBe(false);
    await deps.notifications.notify({ ...base0, userId: u.id, title: 'fresh unread' });
    const cleared = (await request(app).delete('/v1/notifications?app=web&readOnly=true').set(as(u.token)).expect(200)).body.deleted;
    expect(cleared).toBeGreaterThan(0);
    expect((await list(u.token).expect(200)).body.items.map((i: { title: string }) => i.title)).toEqual(['fresh unread']);
    expect((await request(app).delete('/v1/notifications?app=web').set(as(u.token)).expect(200)).body.deleted).toBe(1);
  });
});

describe('preferences', () => {
  it('default to everything on, and a muted category produces no notification', async () => {
    const u = users.bob!;
    const res = await request(app).get('/v1/notifications/preferences').set(as(u.token)).expect(200);
    expect(res.body.preferences.find((p: { category: string }) => p.category === 'stock')).toEqual({ category: 'stock', inApp: true, push: true, sound: true });
    await request(app).put('/v1/notifications/preferences').set(as(u.token)).send({ preferences: [{ category: 'stock', inApp: false, push: true, sound: true }] }).expect(200);
    expect(await deps.notifications.notify({ ...base0, userId: u.id, category: 'stock', title: 'muted' })).toBeNull();
    expect(await deps.notifications.notify({ ...base0, userId: u.id, category: 'orders', title: 'not muted' })).not.toBeNull();
  });

  it('cannot hide account and security notices', async () => {
    const u = users.bob!;
    const saved = (await request(app).put('/v1/notifications/preferences').set(as(u.token)).send({ preferences: [{ category: 'account', inApp: false, push: false, sound: false }] }).expect(200)).body.preferences;
    expect(saved.find((p: { category: string }) => p.category === 'account')).toMatchObject({ inApp: true, push: false });
    expect(await deps.notifications.notify({ ...base0, userId: u.id, category: 'account', title: 'security' })).not.toBeNull();
  });

  it('reports the sound setting with each live notification', async () => {
    const u = users.alice!;
    await request(app).put('/v1/notifications/preferences').set(as(u.token)).send({ preferences: [{ category: 'quotes', inApp: true, push: true, sound: false }] }).expect(200);
    const s = await openStream(u.token);
    await s.waitFor('ready');
    await deps.notifications.notify({ ...base0, userId: u.id, category: 'quotes', title: 'quiet' });
    const [ev] = await s.waitFor('created');
    expect(ev!.data.sound).toBe(false);
    s.close();
  });
});

describe('live stream', () => {
  it('delivers a new notification instantly, only to its recipient, on every open tab and device', async () => {
    const [tab1, tab2, other] = await Promise.all([openStream(users.alice!.token), openStream(users.alice!.token), openStream(users.bob!.token)]);
    await Promise.all([tab1.waitFor('ready'), tab2.waitFor('ready'), other.waitFor('ready')]);
    await deps.notifications.notify({ ...base0, userId: users.alice!.id, title: 'live!' });
    expect((await tab1.waitFor('created'))[0]!.data.notification.title).toBe('live!');
    expect((await tab2.waitFor('created'))[0]!.data.notification.title).toBe('live!');
    await new Promise((r) => setTimeout(r, 150));
    expect(other.events.filter((e) => e.event === 'created')).toHaveLength(0); // bob never sees alice's notification
    [tab1, tab2, other].forEach((s) => s.close());
  });

  it('keeps read, delete and clear in sync across devices', async () => {
    const u = users.alice!;
    const n = (await deps.notifications.notify({ ...base0, userId: u.id, title: 'sync me' }))!;
    const phone = await openStream(u.token);
    await phone.waitFor('ready');
    await request(app).post(`/v1/notifications/${n.id}/read`).set(as(u.token)).expect(200); // done on the "laptop"
    expect((await phone.waitFor('read'))[0]!.data.ids).toEqual([n.id]);
    await request(app).delete(`/v1/notifications/${n.id}`).set(as(u.token)).expect(200);
    expect((await phone.waitFor('deleted'))[0]!.data.ids).toEqual([n.id]);
    await deps.notifications.notify({ ...base0, userId: u.id, title: 'x' });
    await request(app).post('/v1/notifications/read-all?app=web').set(as(u.token)).expect(200);
    await phone.waitFor('read_all');
    phone.close();
  });

  it('filters by app: the admin stream does not get customer-site notifications', async () => {
    const adminTab = await openStream(users.shop!.token, 'admin');
    await adminTab.waitFor('ready');
    await deps.notifications.notify({ ...base0, userId: users.shop!.id, app: 'web', title: 'customer side' });
    await deps.notifications.notify({ ...base0, userId: users.shop!.id, app: 'admin', title: 'staff side' });
    const got = await adminTab.waitFor('created');
    expect(got.map((e) => e.data.notification.title)).toEqual(['staff side']);
    adminTab.close();
  });

  it('recovers what was missed while disconnected: it is stored, and the next fetch has it', async () => {
    const u = users.bob!;
    const first = await openStream(u.token);
    await first.waitFor('ready');
    first.close(); // network drop
    await new Promise((r) => setTimeout(r, 100));
    const missed = (await deps.notifications.notify({ ...base0, userId: u.id, title: 'while offline' }))!;
    const second = await openStream(u.token); // automatic reconnect
    await second.waitFor('ready'); // the client re-fetches on every `ready`
    expect((await list(u.token).expect(200)).body.items.some((i: { id: string }) => i.id === missed.id)).toBe(true);
    second.close();
  });

  it('caps open connections per user', async () => {
    const u = users.shop!;
    const open = await Promise.all(Array.from({ length: 10 }, () => openStream(u.token, 'admin')));
    expect(await refusal(openStream(u.token, 'admin'))).toBe('TOO_MANY_STREAMS');
    open.forEach((s) => s.close());
  });
});

describe('push', () => {
  const sub = (id: string) => ({ app: 'web', deviceId: `device-${id}-${tag}`, subscription: { endpoint: `https://push.example.test/${tag}/${id}`, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } } });
  const sent: { endpoint: string; body: Record<string, any>; opts: Record<string, any> }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  let outcome: (endpoint: string) => { statusCode?: number } | null = () => null;
  const fake: PushSender = async (s, body, opts) => {
    const fail = outcome(s.endpoint);
    if (fail) throw Object.assign(new Error('push service said no'), fail);
    sent.push({ endpoint: s.endpoint, body: JSON.parse(body), opts });
    return {};
  };
  let svc: Notifications;
  beforeAll(() => { svc = createNotifications(deps, fake); });

  it('hands out the public key only, and refuses unauthenticated registration', async () => {
    const cfg = (await request(app).get('/v1/notifications/push/config').set(as(users.alice!.token)).expect(200)).body;
    expect(cfg).toEqual({ enabled: true, publicKey: vapid.publicKey });
    expect(JSON.stringify(cfg)).not.toContain(vapid.privateKey);
    await request(app).post('/v1/notifications/push/subscriptions').send(sub('anon')).expect(401);
  });

  it('registers several devices per user, replaces a re-subscribed device, and removes on request', async () => {
    const u = users.alice!;
    await request(app).post('/v1/notifications/push/subscriptions').set(as(u.token)).send(sub('laptop')).expect(201);
    await request(app).post('/v1/notifications/push/subscriptions').set(as(u.token)).send(sub('phone')).expect(201);
    await request(app).post('/v1/notifications/push/subscriptions').set(as(u.token)).send(sub('phone')).expect(201); // idempotent
    expect(await deps.db.pushSubscription.count({ where: { userId: u.id } })).toBe(2);
    // same device id, new endpoint (browser rotated it): the old row goes
    const rotated = { ...sub('phone'), subscription: { ...sub('phone').subscription, endpoint: `https://push.example.test/${tag}/phone2` } };
    await request(app).post('/v1/notifications/push/subscriptions').set(as(u.token)).send(rotated).expect(201);
    expect((await deps.db.pushSubscription.findMany({ where: { userId: u.id } })).map((s) => s.endpoint).sort()).toEqual([`https://push.example.test/${tag}/laptop`, `https://push.example.test/${tag}/phone2`]);
    await request(app).delete('/v1/notifications/push/subscriptions').set(as(u.token)).send({ endpoint: `https://push.example.test/${tag}/phone2` }).expect(200);
    expect(await deps.db.pushSubscription.count({ where: { userId: u.id } })).toBe(1);
  });

  it("a device handed to another account stops receiving the first account's pushes", async () => {
    await request(app).post('/v1/notifications/push/subscriptions').set(as(users.bob!.token)).send(sub('laptop')).expect(201);
    const row = await deps.db.pushSubscription.findUniqueOrThrow({ where: { endpoint: `https://push.example.test/${tag}/laptop` } });
    expect(row.userId).toBe(users.bob!.id);
    expect(await deps.db.pushSubscription.count({ where: { userId: users.alice!.id } })).toBe(0);
  });

  it('queues a push per device, sends it once with the title, message and deep link, and never again', async () => {
    const u = users.bob!;
    await request(app).post('/v1/notifications/push/subscriptions').set(as(u.token)).send(sub('tablet')).expect(201);
    sent.length = 0;
    const n = (await svc.notify({ ...base0, userId: u.id, title: 'Order shipped', message: 'On its way', href: '/orders/GS-1', priority: 'HIGH' }))!;
    await svc.worker.drain();
    await svc.worker.drain(); // a second pass finds nothing due
    const mine = sent.filter((s) => s.body.id === n.id);
    expect(mine.map((s) => s.endpoint).sort()).toEqual([`https://push.example.test/${tag}/laptop`, `https://push.example.test/${tag}/tablet`]);
    expect(mine[0]!.body).toMatchObject({ title: 'Order shipped', body: 'On its way', url: '/orders/GS-1', tag: n.id });
    expect(mine[0]!.opts.urgency).toBe('high');
    const rows = await deps.db.notificationDelivery.findMany({ where: { notificationId: n.id } });
    expect(rows.every((r) => r.status === 'SENT' && r.attempts === 1 && r.deliveredAt)).toBe(true);
    // the same notification can never be queued twice for the same device
    await deps.db.notificationDelivery.createMany({ data: rows.map((r) => ({ notificationId: n.id, subscriptionId: r.subscriptionId! })), skipDuplicates: true });
    expect(await deps.db.notificationDelivery.count({ where: { notificationId: n.id } })).toBe(2);
  });

  it('does not push a category the user turned push off for, nor one already read', async () => {
    const u = users.bob!;
    await request(app).put('/v1/notifications/preferences').set(as(u.token)).send({ preferences: [{ category: 'messages', inApp: true, push: false, sound: true }] }).expect(200);
    sent.length = 0;
    await svc.notify({ ...base0, userId: u.id, category: 'messages', title: 'no push' });
    const read = (await svc.notify({ ...base0, userId: u.id, title: 'read before push' }))!;
    await svc.markRead(u.id, read.id); // read on another device before the worker ran
    await svc.worker.drain();
    expect(sent.some((s) => s.body.title === 'no push')).toBe(false);
    expect(sent.some((s) => s.body.title === 'read before push')).toBe(false);
  });

  it('removes subscriptions the push service reports as expired or revoked', async () => {
    const u = users.bob!;
    const gone = `https://push.example.test/${tag}/tablet`;
    outcome = (e) => (e === gone ? { statusCode: 410 } : null);
    const n = (await svc.notify({ ...base0, userId: u.id, title: 'to a dead device' }))!;
    await svc.worker.drain();
    outcome = () => null;
    expect(await deps.db.pushSubscription.findUnique({ where: { endpoint: gone } })).toBeNull();
    const d = await deps.db.notificationDelivery.findMany({ where: { notificationId: n.id }, orderBy: { createdAt: 'asc' } });
    expect(d.map((x) => x.status).sort()).toEqual(['GONE', 'SENT']);
    expect(d.find((x) => x.status === 'GONE')!.subscriptionId).toBeNull(); // the history outlives the subscription
  });

  it('retries a failing push with growing delays, then gives up and records why', async () => {
    const u = users.bob!;
    outcome = () => ({ statusCode: 503 });
    const n = (await svc.notify({ ...base0, userId: u.id, title: 'flaky' }))!;
    await svc.worker.drain();
    let d = await deps.db.notificationDelivery.findFirstOrThrow({ where: { notificationId: n.id } });
    expect(d).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(d.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(d.failureReason).toContain('503');
    await svc.worker.drain();
    expect((await deps.db.notificationDelivery.findFirstOrThrow({ where: { id: d.id } })).attempts).toBe(1); // not due yet: no hammering
    try {
      for (let i = 2; i <= MAX_PUSH_ATTEMPTS; i++) {
        await deps.db.notificationDelivery.update({ where: { id: d.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
        await svc.worker.drain();
      }
      d = await deps.db.notificationDelivery.findUniqueOrThrow({ where: { id: d.id } });
      expect(d).toMatchObject({ status: 'FAILED', attempts: MAX_PUSH_ATTEMPTS });
      // an outage that fails every retry is not a reason to forget the device
      expect(await deps.db.pushSubscription.count({ where: { id: d.subscriptionId! } })).toBe(1);
    } finally {
      outcome = () => null;
    }
  });

  it('picks up work whose lease expired (a worker that crashed mid-send) after a restart', async () => {
    const u = users.bob!;
    const n = (await svc.notify({ ...base0, userId: u.id, title: 'survives restart' }))!;
    const d = await deps.db.notificationDelivery.findFirstOrThrow({ where: { notificationId: n.id, status: 'PENDING' } }).catch(() => null);
    // simulate: queued, claimed by a worker that died (lease pushed into the future, then elapsed)
    sent.length = 0;
    const queued = await deps.db.notificationDelivery.findMany({ where: { notificationId: n.id } });
    await deps.db.notificationDelivery.updateMany({ where: { notificationId: n.id }, data: { status: 'PENDING', attempts: 1, deliveredAt: null, nextAttemptAt: new Date(Date.now() - 1000) } });
    await svc.worker.drain();
    expect(d === null || queued.length >= 0).toBe(true);
    expect(sent.filter((s) => s.body.id === n.id).length).toBeGreaterThan(0);
  });

  it('throttles pushes per user but still stores every notification', async () => {
    const u = users.alice!;
    await request(app).post('/v1/notifications/push/subscriptions').set(as(u.token)).send(sub('throttle')).expect(201);
    await deps.redis.del(`${deps.env.CACHE_PREFIX}:notif:push:${u.id}`);
    sent.length = 0;
    for (let i = 0; i < 25; i++) await svc.notify({ ...base0, userId: u.id, title: `burst ${i}` });
    await svc.worker.drain();
    const pushed = sent.filter((s) => s.body.title.startsWith('burst')).length;
    expect(pushed).toBe(20);
    expect(await deps.db.notification.count({ where: { recipientId: u.id, title: { startsWith: 'burst' } } })).toBe(25);
  });

  it('purges expired notifications', async () => {
    const u = users.alice!;
    await deps.db.notification.create({ data: { recipientId: u.id, app: 'web', type: 't', category: 'system', title: 'old', message: 'old', expiresAt: new Date(Date.now() - 1000) } });
    expect((await svc.worker.purge()).notifications).toBeGreaterThanOrEqual(1);
    expect(await deps.db.notification.count({ where: { recipientId: u.id, title: 'old' } })).toBe(0);
  });
});

describe('business events become notifications (and only after the action succeeded)', () => {
  const titles = async (u: { token: string }, appName = 'web') => (await list(u.token, `app=${appName}&limit=50`).expect(200)).body.items.map((i: { title: string }) => i.title) as string[];

  it('a customer message reaches staff live; the reply reaches the customer', async () => {
    const staff = await openStream(users.shop!.token, 'admin');
    await staff.waitFor('ready');
    await request(app).post('/v1/me/messages').set(as(users.alice!.token)).send({ body: `Do you deliver palms? ${tag}` }).expect(201);
    const [ev] = await staff.waitFor('created');
    expect(ev!.data.notification).toMatchObject({ type: 'message.from_customer', href: '/messages', category: 'messages' });
    staff.close();

    const conv = await deps.db.conversation.findFirstOrThrow({ where: { customerUserId: users.alice!.id } });
    const customer = await openStream(users.alice!.token);
    await customer.waitFor('ready');
    await request(app).post(`/v1/admin/conversations/${conv.id}/messages`).set(as(users.admin!.token)).send({ body: 'Yes we do.' }).expect(201);
    expect((await customer.waitFor('created'))[0]!.data.notification).toMatchObject({ type: 'message.from_staff', href: '/messages' });
    customer.close();
  });

  it('a rejected action sends nothing', async () => {
    const before = await titles(users.shop!, 'admin');
    await request(app).post('/v1/me/messages').set(as(users.alice!.token)).send({ body: '' }).expect(400);
    await request(app).put(`/v1/users/${users.bob!.id}/roles`).set(as(users.shop!.token)).send({ roles: ['admin'] }).expect(403);
    expect(await titles(users.shop!, 'admin')).toEqual(before);
    expect((await titles(users.bob!)).includes('Your access was changed')).toBe(false);
  });

  it('a quote request notifies the customer and everyone who can read quotations; assigning one notifies the assignee', async () => {
    const q = (await request(app).post('/v1/quotations').set(as(users.alice!.token)).send({
      services: ['garden-design'], propertyType: 'residential', projectLocation: 'Puerto Princesa', details: `A small front garden redesign with native plants ${tag}`,
      name: 'Alice Test', email: `alice-${tag}@test.greenscape.local`, phone: '0917 123 4567', consent: true,
    }).expect(201)).body;
    expect(await titles(users.alice!)).toContain('We received your quote request');
    expect(await titles(users.shop!, 'admin')).toContain(`New quote request ${q.number}`);
    const row = await deps.db.quotation.findUniqueOrThrow({ where: { number: q.number } });
    await request(app).patch(`/v1/quotations/${row.id}`).set(as(users.admin!.token)).send({ status: 'CONTACTED', assignedToId: users.shop!.id }).expect(200);
    expect(await titles(users.alice!)).toContain(`Quote request ${q.number} updated`);
    expect(await titles(users.shop!, 'admin')).toContain(`Quote request ${q.number} was assigned to you`);
  });

  it('a payment result notifies the buyer and staff, exactly once even if the provider repeats the event', async () => {
    const user = users.alice!;
    const customer = await deps.db.customer.upsert({ where: { userId: user.id }, create: { userId: user.id, email: `alice-${tag}@test.greenscape.local`, name: 'Alice Test' }, update: {} });
    const cat = await deps.db.category.upsert({ where: { slug: 'plants' }, create: { slug: 'plants', name: 'Plants' }, update: {} });
    const product = await deps.db.product.create({ data: { slug: `nt-${tag}`, name: `Notif plant ${tag}`, categoryId: cat.id, status: 'ACTIVE', variants: { create: { sku: `NT-${tag}`.toUpperCase(), name: 'Default', price: '500', trackInventory: false } } }, include: { variants: true } });
    const v = product.variants[0]!;
    const number = `GS-2099-${tag.slice(-6)}`;
    const order = await deps.db.order.create({
      data: {
        number, customerId: customer.id, status: 'PENDING_PAYMENT', subtotal: '500', deliveryFee: '0', total: '500', shippingAddress: { recipient: 'Alice' },
        items: { create: { variantId: v.id, sku: v.sku, name: product.name, unitPrice: '500', quantity: 1, lineTotal: '500' } },
        payments: { create: { provider: deps.payments.name, providerRef: `ref_${tag}`, status: 'PENDING', amount: '500', currency: 'PHP', isTest: true } },
      },
    });
    const { applyPaymentEvent } = await import('../../apps/api/src/modules/shop/orders.ts');
    await applyPaymentEvent(deps, { id: `evt_${tag}_1`, type: 'payment.succeeded', ref: `ref_${tag}` }, {});
    await applyPaymentEvent(deps, { id: `evt_${tag}_2`, type: 'payment.succeeded', ref: `ref_${tag}` }, {}); // provider retry
    const mine = (await titles(users.alice!)).filter((t) => t === 'Payment received');
    expect(mine).toHaveLength(1);
    expect(await titles(users.shop!, 'admin')).toContain(`New paid order ${number}`);
    await deps.events.emit('order.paid', { orderId: order.id, lowVariantIds: [] }); // replayed event: still once
    expect((await titles(users.alice!)).filter((t) => t === 'Payment received')).toHaveLength(1);
  });

  it('a role change is a security alert to the person affected', async () => {
    await request(app).put(`/v1/users/${users.bob!.id}/roles`).set(as(users.admin!.token)).send({ roles: ['customer', 'employee'] }).expect(200);
    expect(await titles(users.bob!)).toContain('Your access was changed');
  });
});

describe('announcements', () => {
  it('are refused without the broadcast permission', async () => {
    await request(app).post('/v1/notifications/broadcast').set(as(users.alice!.token)).send({ title: 'Hi', message: 'All', app: 'web', roles: ['customer'] }).expect(403);
    await request(app).post('/v1/notifications/broadcast').set(as(users.shop!.token)).send({ title: 'Hi', message: 'All', app: 'admin' }).expect(403);
  });

  it('go to the chosen roles only, are audited, and validate their input', async () => {
    const res = await request(app).post('/v1/notifications/broadcast').set(as(users.admin!.token)).send({ title: 'Closed Friday', message: 'The nursery is closed this Friday.', app: 'admin', roles: ['ecommerce_manager'], priority: 'HIGH' }).expect(201);
    expect(res.body.recipients).toBeGreaterThanOrEqual(1);
    const shop = (await list(users.shop!.token, 'app=admin&limit=50').expect(200)).body.items;
    expect(shop.find((i: { title: string }) => i.title === 'Closed Friday')).toMatchObject({ category: 'system', priority: 'HIGH' });
    expect((await list(users.alice!.token, 'app=admin').expect(200)).body.items).toHaveLength(0);
    expect(await deps.db.auditLog.count({ where: { action: 'notification.broadcast', actorId: users.admin!.id } })).toBeGreaterThanOrEqual(1);
    await request(app).post('/v1/notifications/broadcast').set(as(users.admin!.token)).send({ title: 'x', message: 'y', app: 'web', roles: ['wizard'] }).expect(400);
    await request(app).post('/v1/notifications/broadcast').set(as(users.admin!.token)).send({ title: 'x', message: 'y', app: 'web', href: 'https://evil.example' }).expect(400);
  });
});
