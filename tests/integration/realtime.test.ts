// Socket.IO end to end against the real stack (Postgres, Redis, local Supabase): authentication, server-assigned rooms,
// live attendance, revocation, and delivery across two API instances through the Redis adapter.
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { keepSelfieSetting, testDeps } from './helpers.ts';
import { openSocket, refusal } from './realtime-client.ts';
import { deleteAuthUsers, signedInUser } from './supabase.ts';

const tag = `rt${Date.now()}`;
const TAG = tag.toUpperCase().slice(-8);
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const quiet = (ms = 250) => new Promise((r) => setTimeout(r, ms)); // long enough for a stray event to have arrived

type Instance = { deps: Deps; app: ReturnType<typeof createApp>; server: Server; base: string };
async function instance(overrides: Record<string, string> = {}): Promise<Instance> {
  const deps = await testDeps({ REVALIDATE_SECRET: '', ...overrides });
  const app = createApp(deps);
  const server = app.listen(0);
  deps.realtime.attach(server);
  return { deps, app, server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

let A: Instance; // the API instance that handles the requests
let B: Instance; // a second instance sharing Redis (cross-instance delivery)
let restoreSelfie: (() => Promise<void>) | undefined;
const authIds: string[] = [];
const u: Record<string, { token: string; id: string; email: string; employeeId?: string }> = {};
let scheduleId = '';
const shifts = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '00:00', endTime: '23:59' }));

async function user(label: string, role?: string) {
  const s = await signedInUser(`${label}-${tag}`);
  authIds.push(s.authUserId);
  await request(A.app).get('/v1/auth/me').set(as(s.token)).expect(200); // creates the User row
  const row = await A.deps.db.user.findUniqueOrThrow({ where: { authUserId: s.authUserId } });
  if (role) {
    await A.deps.db.userRole.create({ data: { userId: row.id, roleId: (await A.deps.db.role.findUniqueOrThrow({ where: { key: role } })).id } });
    await A.deps.cache.invalidateTags([`authz:user:${row.id}`]);
  }
  return { token: s.token, id: row.id, email: s.email };
}
async function employee(label: string) {
  const p = await user(label);
  const e = (await request(A.app).post('/v1/hr/employees').set(as(u.hr!.token)).send({ employeeNo: `R-${TAG}-${label.slice(0, 3).toUpperCase()}`, firstName: 'Live', lastName: `${label} ${tag}`, email: p.email, employmentStatus: 'ACTIVE' }).expect(201)).body as { id: string };
  await request(A.app).post(`/v1/hr/employees/${e.id}/schedule`).set(as(u.hr!.token)).send({ scheduleId, effectiveFrom: '2026-01-01' }).expect(200);
  return { ...p, employeeId: e.id };
}

beforeAll(async () => {
  [A, B] = await Promise.all([instance(), instance()]);
  restoreSelfie = await keepSelfieSetting(A.deps.db);
  u.hr = await user('hr', 'hr_manager');
  u.shop = await user('shop', 'ecommerce_manager');
  u.customer = await user('customer');
  scheduleId = (await request(A.app).post('/v1/hr/schedules').set(as(u.hr.token)).send({ name: `Live crew ${tag}`, graceMinutes: 10, shifts }).expect(201)).body.id;
  u.worker = await employee('worker');
  u.other = await employee('other');
});

afterAll(async () => {
  await restoreSelfie?.();
  const db = A.deps.db;
  const emps = await db.employee.findMany({ where: { lastName: { contains: tag } }, select: { id: true } });
  await db.attendanceRecord.deleteMany({ where: { employeeId: { in: emps.map((e) => e.id) } } });
  await db.employee.deleteMany({ where: { id: { in: emps.map((e) => e.id) } } });
  await db.workSchedule.deleteMany({ where: { name: { contains: tag } } });
  const ids = Object.values(u).map((x) => x.id);
  await db.notification.deleteMany({ where: { recipientId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await deleteAuthUsers(authIds);
  for (const x of [A, B]) { x.server.close(); await closeDeps(x.deps); }
});

describe('handshake', () => {
  it('refuses a missing or forged token, an unknown portal, and a portal the account may not use', async () => {
    expect(await refusal(openSocket(A.base, undefined, 'admin'))).toBe('UNAUTHORIZED');
    expect(await refusal(openSocket(A.base, 'not.a.jwt', 'admin'))).toBe('INVALID_TOKEN');
    expect(await refusal(openSocket(A.base, u.customer!.token, 'nope'))).toBe('BAD_REQUEST');
    expect(await refusal(openSocket(A.base, u.customer!.token, 'admin'))).toBe('FORBIDDEN');
    expect(await refusal(openSocket(A.base, u.customer!.token, 'employee'))).toBe('FORBIDDEN');
    expect(await refusal(openSocket(A.base, u.worker!.token, 'admin'))).toBe('FORBIDDEN');
    expect(await refusal(openSocket(A.base, u.worker!.token, 'employee'))).toBe('CONNECTED');
  });

  it('refuses a browser origin that is not one of ours', async () => {
    const { io } = await import('socket.io-client');
    const s = io(A.base, { path: '/v1/realtime', transports: ['polling'], extraHeaders: { origin: 'https://evil.example' }, auth: { token: u.hr!.token, app: 'admin' }, reconnection: false, forceNew: true });
    const err = await new Promise<Error>((resolve) => s.once('connect_error', resolve));
    s.close();
    expect(err).toBeInstanceOf(Error);
  });

  it('is server → client only: a client that emits anything is disconnected', async () => {
    const s = await openSocket(A.base, u.customer!.token, 'web');
    (s.socket as unknown as { emit(event: string, data: unknown): void }).emit('attendance:clocked-in', { employeeId: u.other!.employeeId });
    expect(await s.waitDisconnect()).toEqual(['io server disconnect']);
  });
});

describe('live attendance', () => {
  it('a clock-in and clock-out reach HR and the employee’s other devices at once, and nobody else', async () => {
    const [hr, phone, other, shop, customer] = await Promise.all([
      openSocket(A.base, u.hr!.token, 'admin'),
      openSocket(A.base, u.worker!.token, 'employee'),
      openSocket(A.base, u.other!.token, 'employee'),
      openSocket(A.base, u.shop!.token, 'admin'), // staff, but cannot read attendance
      openSocket(A.base, u.customer!.token, 'web'),
    ]);
    await request(A.app).post('/v1/me/attendance/punch').set(as(u.worker!.token)).send({ type: 'IN' }).expect(201);
    const [signal] = await hr.waitLive('attendance', 'clocked_in');
    expect(signal).toMatchObject({ v: 1, topic: 'attendance', kind: 'clocked_in', ref: u.worker!.employeeId });
    expect(Object.keys(signal!).sort()).toEqual(['at', 'id', 'kind', 'ref', 'topic', 'v']); // ids only: no names or times of the person
    await phone.waitLive('attendance', 'clocked_in');

    // A second tap is refused and announces nothing.
    await request(A.app).post('/v1/me/attendance/punch').set(as(u.worker!.token)).send({ type: 'IN' }).expect(409);
    // Clock-outs within a minute of the clock-in are refused as double taps: move the clock-in back.
    await A.deps.db.timePunch.updateMany({ where: { record: { employeeId: u.worker!.employeeId } }, data: { at: new Date(Date.now() - 5 * 60_000) } });
    await request(A.app).post('/v1/me/attendance/punch').set(as(u.worker!.token)).send({ type: 'OUT' }).expect(201);
    await hr.waitLive('attendance', 'clocked_out');
    await phone.waitLive('attendance', 'clocked_out');
    await quiet();
    expect(hr.live.filter((s) => s.kind === 'clocked_in')).toHaveLength(1);
    expect([other.live, shop.live, customer.live]).toEqual([[], [], []]);
    // And the employee's own view, re-fetched on the signal, has the confirmed punches.
    const today = (await request(A.app).get('/v1/me/attendance/today').set(as(u.worker!.token)).expect(200)).body;
    expect(today.record.punches.map((p: { type: string }) => p.type)).toEqual(['IN', 'OUT']);
    [hr, phone, other, shop, customer].forEach((s) => s.close());
  });

  it('a schedule edit reaches the people on it and HR', async () => {
    const [hr, worker] = await Promise.all([openSocket(A.base, u.hr!.token, 'admin'), openSocket(A.base, u.worker!.token, 'employee')]);
    await request(A.app).put(`/v1/hr/schedules/${scheduleId}`).set(as(u.hr!.token)).send({ name: `Live crew ${tag}`, graceMinutes: 15, shifts }).expect(200);
    await hr.waitLive('schedule', 'updated');
    await worker.waitLive('schedule', 'updated');
    [hr, worker].forEach((s) => s.close());
  });
});

describe('access changes close sockets', () => {
  it('a role change closes the socket; the reconnect gets only what the new roles allow', async () => {
    const p = await user('demoted', 'hr_manager');
    u.demoted = p;
    const s = await openSocket(A.base, p.token, 'admin');
    await A.deps.db.userRole.deleteMany({ where: { userId: p.id } });
    await A.deps.cache.invalidateTags([`authz:user:${p.id}`]);
    await A.deps.events.emit('user.roles_changed', { userId: p.id, roles: [] });
    expect(await s.waitDisconnect()).toEqual(['io server disconnect']);
    expect(await refusal(openSocket(A.base, p.token, 'admin'))).toBe('FORBIDDEN');
  });

  it('suspension closes every socket of the person and refuses the reconnect', async () => {
    const p = await user('suspended');
    u.suspended = p;
    const [tab1, tab2] = await Promise.all([openSocket(A.base, p.token, 'web'), openSocket(B.base, p.token, 'web')]); // two instances
    await A.deps.db.user.update({ where: { id: p.id }, data: { status: 'SUSPENDED' } });
    await A.deps.events.emit('user.access_changed', { userId: p.id });
    await tab1.waitDisconnect();
    await tab2.waitDisconnect(); // held by the other instance: closed through the Redis adapter
    expect(await refusal(openSocket(A.base, p.token, 'web'))).toBe('ACCOUNT_SUSPENDED');
  });

  it('signing out closes that session’s sockets and the token cannot reconnect', async () => {
    const p = await user('leaver');
    u.leaver = p;
    const s = await openSocket(A.base, p.token, 'web');
    await request(A.app).post('/v1/auth/logout').set(as(p.token)).expect(204);
    await s.waitDisconnect();
    expect(await refusal(openSocket(A.base, p.token, 'web'))).toBe('SESSION_ENDED');
  });
});

describe('two API instances (Redis adapter)', () => {
  it('a notification stored by instance A reaches a tab connected to instance B, and only its recipient', async () => {
    const [mine, theirs] = await Promise.all([openSocket(B.base, u.customer!.token, 'web'), openSocket(B.base, u.shop!.token, 'web')]);
    const n = await A.deps.notifications.notify({ userId: u.customer!.id, app: 'web', type: 'test.cross', category: 'orders', title: 'across instances', message: 'hi' });
    const [ev] = await mine.waitFor('created');
    expect(ev!.data.notification).toMatchObject({ id: n!.id, title: 'across instances' });
    await quiet();
    expect(theirs.events.filter((e) => e.event === 'created')).toHaveLength(0);
    [mine, theirs].forEach((s) => s.close());
  });

  it('a live signal from instance A reaches HR on instance B', async () => {
    const hr = await openSocket(B.base, u.hr!.token, 'admin');
    await A.deps.events.emit('attendance.changed', { employeeId: u.other!.employeeId, kind: 'edited' });
    expect((await hr.waitLive('attendance', 'edited'))[0]!.ref).toBe(u.other!.employeeId);
    hr.close();
  });
});

describe('connection rate limit', () => {
  it('refuses an address that opens connections too fast', async () => {
    const C = await instance({ RATE_LIMIT_PER_MIN: '3', CACHE_PREFIX: `gs:test:rt:${Date.now()}` });
    try {
      const open = [];
      for (let i = 0; i < 3; i++) open.push(await openSocket(C.base, u.customer!.token, 'web'));
      expect(await refusal(openSocket(C.base, u.customer!.token, 'web'))).toBe('TOO_MANY_CONNECTIONS');
      open.forEach((s) => s.close());
    } finally {
      C.server.close();
      await closeDeps(C.deps);
    }
  });
});
