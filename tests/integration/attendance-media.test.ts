import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { PRIVATE, purgeOldSelfies } from '../../apps/api/src/modules/attendance/uploads.ts';
import { keepSelfieSetting, testDeps } from './helpers.ts';
import { deleteAuthUsers, signedInUser } from './supabase.ts';

// Clock-in selfies (decision D6: HR switches them on) and correction attachments, uploaded straight to private storage.
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const tag = `med${Date.now()}`;
const NO = `M-${tag.slice(-8)}`;
// 1×1 PNG: real bytes, so the storage magic-byte check passes.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64');
let deps: Deps;
let restoreSelfie: (() => Promise<void>) | undefined;
let app: ReturnType<typeof createApp>;
const authIds: string[] = [];
const t = { hr: '', worker: '', other: '' };
let employeeId = '';

async function withRoles(label: string, roles: string[]) {
  const u = await signedInUser(`${label}-${tag}`);
  authIds.push(u.authUserId);
  await request(app).get('/v1/auth/me').set(as(u.token)).expect(200);
  const user = await deps.db.user.findUniqueOrThrow({ where: { authUserId: u.authUserId } });
  const rows = await deps.db.role.findMany({ where: { key: { in: roles } } });
  await deps.db.userRole.createMany({ data: rows.map((r) => ({ userId: user.id, roleId: r.id })), skipDuplicates: true });
  await deps.cache.invalidateTags([`authz:user:${user.id}`]);
  return u;
}
async function upload(token: string, bytes = PNG, contentType = 'image/png') {
  const slot = await request(app).post('/v1/me/attendance/attachments').set(as(token)).send({ contentType, size: bytes.length }).expect(201);
  const put = await fetch(slot.body.uploadUrl, { method: 'PUT', headers: { 'content-type': contentType, 'x-upsert': 'false' }, body: bytes });
  expect(put.ok).toBe(true);
  return slot.body.id as string;
}
const setSelfie = (mode: string, retentionDays = 90) => request(app).put('/v1/hr/settings/selfie').set(as(t.hr)).send({ mode, retentionDays });

beforeAll(async () => {
  deps = await testDeps({ CACHE_PREFIX: `gs:test:${tag}` });
  app = createApp(deps);
  restoreSelfie = await keepSelfieSetting(deps.db);
  const [hr, worker, other] = await Promise.all([withRoles('hr', ['hr_manager']), withRoles('worker', []), withRoles('other', [])]);
  Object.assign(t, { hr: hr.token, worker: worker.token, other: other.token });
  for (const [u, n] of [[worker, '1'], [other, '2']] as const) {
    const e = await request(app).post('/v1/hr/employees').set(as(t.hr)).send({ employeeNo: `${NO}-${n}`, firstName: 'Media', lastName: `Test ${tag}`, email: u.email, employmentStatus: 'ACTIVE' }).expect(201);
    if (n === '1') employeeId = e.body.id;
  }
}, 60_000);

afterAll(async () => {
  await restoreSelfie?.(); // the local site's own setting, not just 'off'
  const emps = await deps.db.employee.findMany({ where: { lastName: { contains: tag } }, select: { id: true } });
  await deps.db.attendanceRecord.deleteMany({ where: { employeeId: { in: emps.map((e) => e.id) } } });
  await deps.db.employee.deleteMany({ where: { id: { in: emps.map((e) => e.id) } } });
  const users = await deps.db.user.findMany({ where: { authUserId: { in: authIds } }, select: { id: true } });
  const media = await deps.db.mediaAsset.findMany({ where: { uploadedById: { in: users.map((u) => u.id) } }, select: { id: true, path: true } });
  if (media.length) await deps.storage.remove(PRIVATE, media.map((m) => m.path)).catch(() => undefined);
  await deps.db.mediaAsset.deleteMany({ where: { id: { in: media.map((m) => m.id) } } });
  await deps.db.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
  await deps.db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await deleteAuthUsers(authIds);
  await closeDeps(deps);
});

describe('selfie setting', () => {
  it('is off by default for employees, and only HR (employees.manage) can change it; changes are audited', async () => {
    await setSelfie('off');
    expect((await request(app).get('/v1/me/attendance/today').set(as(t.worker)).expect(200)).body.selfie.mode).toBe('off');
    await request(app).put('/v1/hr/settings/selfie').set(as(t.worker)).send({ mode: 'required' }).expect(403);
    await setSelfie('bogus').expect(400);
    await setSelfie('required', 30).expect(200);
    expect((await request(app).get('/v1/me/attendance/today').set(as(t.worker)).expect(200)).body.selfie).toEqual({ mode: 'required', retentionDays: 30 });
    expect(await deps.db.auditLog.findFirst({ where: { action: 'attendance.selfie.set', after: { path: ['mode'], equals: 'required' } } })).toBeTruthy();
  });
});

describe('clock in with a selfie', () => {
  it('requires one when HR says so, refuses someone else’s or a reused photo, and shows HR a private link', async () => {
    await setSelfie('required');
    expect((await request(app).post('/v1/me/attendance/punch').set(as(t.worker)).send({ type: 'IN' }).expect(400)).body.error.code).toBe('SELFIE_REQUIRED');
    const others = await upload(t.other);
    await request(app).post('/v1/me/attendance/punch').set(as(t.worker)).send({ type: 'IN', photoId: others }).expect(400);
    const notImage = await upload(t.worker, Buffer.from('%PDF-1.4\n%%EOF\n'), 'application/pdf');
    await request(app).post('/v1/me/attendance/punch').set(as(t.worker)).send({ type: 'IN', photoId: notImage }).expect(400);

    const mine = await upload(t.worker);
    await request(app).post('/v1/me/attendance/punch').set(as(t.worker)).send({ type: 'IN', photoId: mine }).expect(201);
    const punch = await deps.db.timePunch.findFirstOrThrow({ where: { record: { employeeId } }, orderBy: { at: 'desc' } });
    expect(punch.photoMediaId).toBe(mine);
    expect((await deps.db.mediaAsset.findUniqueOrThrow({ where: { id: mine } })).refCount).toBe(1);

    const day = punch.at.toISOString().slice(0, 10);
    const hrView = await request(app).get(`/v1/hr/attendance/records?employeeId=${employeeId}&from=2026-01-01&to=${day > '2026-12-31' ? day : '2026-12-31'}`).set(as(t.hr)).expect(200);
    const url = hrView.body.flatMap((r: { punches: { photoUrl: string | null }[] }) => r.punches).find((p: { photoUrl: string | null }) => p.photoUrl)?.photoUrl;
    expect(url).toMatch(/^https?:\/\//);
    expect((await fetch(url)).ok).toBe(true);
    const own = await request(app).get('/v1/me/attendance').set(as(t.worker)).expect(200);
    expect(JSON.stringify(own.body)).not.toContain('photoUrl'); // employees do not get links back
  });

  it('keeps nothing when selfies are off, even if a photo is sent', async () => {
    await setSelfie('off');
    await deps.db.timePunch.updateMany({ where: { record: { employeeId } }, data: { at: new Date(Date.now() - 5 * 60_000) } }); // past the 1-minute double-tap guard
    const photo = await upload(t.worker);
    await request(app).post('/v1/me/attendance/punch').set(as(t.worker)).send({ type: 'OUT', photoId: photo }).expect(201);
    const out = await deps.db.timePunch.findFirstOrThrow({ where: { record: { employeeId }, type: 'OUT' } });
    expect(out.photoMediaId).toBeNull();
  });

  it('deletes selfies after the retention period', async () => {
    await setSelfie('optional', 7);
    const withPhoto = await deps.db.timePunch.findFirstOrThrow({ where: { record: { employeeId }, photoMediaId: { not: null } } });
    const asset = await deps.db.mediaAsset.findUniqueOrThrow({ where: { id: withPhoto.photoMediaId! } });
    expect(await purgeOldSelfies(deps)).toBe(0); // still within 7 days
    expect(await purgeOldSelfies(deps, new Date(Date.now() + 8 * 86_400_000))).toBeGreaterThanOrEqual(1);
    expect((await deps.db.timePunch.findUniqueOrThrow({ where: { id: withPhoto.id } })).photoMediaId).toBeNull();
    expect(await deps.db.mediaAsset.findUnique({ where: { id: asset.id } })).toBeNull();
    expect(await deps.storage.inspect(PRIVATE, asset.path)).toBeNull();
  });
});

describe('correction attachments', () => {
  it('are verified, attached once, and shown to HR through a short private link', async () => {
    const day = new Date(Date.now() + 8 * 3600_000 - 2 * 86_400_000).toISOString().slice(0, 10);
    const file = await upload(t.worker);
    const body = { workDate: day, punches: [{ type: 'IN', time: '08:00' }, { type: 'OUT', time: '17:00' }], reason: 'Phone died at the resort site', attachmentId: file };
    await request(app).post('/v1/me/attendance/corrections').set(as(t.other)).send(body).expect(400); // not theirs
    await request(app).post('/v1/me/attendance/corrections').set(as(t.worker)).send(body).expect(201);
    const queue = await request(app).get('/v1/hr/corrections').set(as(t.hr)).expect(200);
    const mine = queue.body.find((c: { reason: string; employeeId: string }) => c.employeeId === employeeId && c.reason === body.reason);
    expect(mine.attachment.mimeType).toBe('image/png');
    expect((await fetch(mine.attachment.url)).ok).toBe(true);
  });
});

describe('employee portal notifications', () => {
  it('HR decisions reach the employee portal (not the website) and link to the attendance page', async () => {
    const queue = await request(app).get('/v1/hr/corrections').set(as(t.hr)).expect(200);
    const c = queue.body.find((x: { employeeId: string }) => x.employeeId === employeeId);
    await request(app).post(`/v1/hr/corrections/${c.id}/decision`).set(as(t.hr)).send({ decision: 'REJECTED' }).expect(200);
    const workerUser = await deps.db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { userId: true } });
    await expect.poll(async () => (await deps.db.notification.findFirst({ where: { recipientId: workerUser.userId!, type: 'correction.rejected' } }))?.app).toBe('employee');
    const n = await deps.db.notification.findFirstOrThrow({ where: { recipientId: workerUser.userId!, type: 'correction.rejected' } });
    expect((n.payload as { href?: string } | null)?.href).toBe('/attendance');
    const feed = await request(app).get('/v1/notifications?app=employee').set(as(t.worker)).expect(200);
    expect(JSON.stringify(feed.body)).toContain('Your time correction was declined');
  });
});
