import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { closeDays, punch, toDate } from '../../apps/api/src/modules/attendance/service.ts';
import { addDays, manilaDate, manilaInstant, weekdayOf } from '../../apps/api/src/modules/attendance/time.ts';
import { keepSelfieSetting, testDeps } from './helpers.ts';
import { deleteAuthUsers, signedInUser } from './supabase.ts';

const tag = `it${Date.now()}`;
const TAG = tag.toUpperCase().slice(-8);
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
let deps: Deps;
let restoreSelfie: (() => Promise<void>) | undefined;
let app: ReturnType<typeof createApp>;
const authIds: string[] = [];
let hr = '';
let hrEmail = '';
let worker = { token: '', email: '', employeeId: '' }; // uses the real clock through the API
let past = { token: '', email: '', employeeId: '' }; // time-travel scenarios through the service
let scheduleId = '';
let silId = '';
const holidayDates: string[] = [];
const at = manilaInstant;
// Scenario week: the Monday two to three weeks back (corrections only reach 31 days, so dates must stay recent).
const MON = (() => { let d = addDays(manilaDate(new Date()), -14); while (weekdayOf(d) !== 1) d = addDays(d, -1); return d; })();
const TUE = addDays(MON, 1), WED = addDays(MON, 2), THU = addDays(MON, 3), FRI = addDays(MON, 4), SUN = addDays(MON, 6);

async function user(label: string) {
  const u = await signedInUser(`${label}-${tag}`);
  authIds.push(u.authUserId);
  await request(app).get('/v1/auth/me').set(as(u.token)).expect(200); // creates the User row
  return u;
}
async function employee(email: string, no: string) {
  const res = await request(app).post('/v1/hr/employees').set(as(hr)).send({ employeeNo: `T-${TAG}-${no}`, firstName: 'Test', lastName: `${no} ${tag}`, email, employmentStatus: 'ACTIVE' }).expect(201);
  await request(app).post(`/v1/hr/employees/${res.body.id}/schedule`).set(as(hr)).send({ scheduleId, effectiveFrom: '2026-01-01' }).expect(200);
  return res.body as { id: string; account: string | null };
}

beforeAll(async () => {
  deps = await testDeps({ REVALIDATE_SECRET: '' });
  app = createApp(deps);
  restoreSelfie = await keepSelfieSetting(deps.db); // these punches carry no selfie
  const h = await user('hr');
  const row = await deps.db.user.findUniqueOrThrow({ where: { authUserId: h.authUserId } });
  const role = await deps.db.role.findUniqueOrThrow({ where: { key: 'hr_manager' } });
  await deps.db.userRole.create({ data: { userId: row.id, roleId: role.id } });
  await deps.cache.invalidateTags([`authz:user:${row.id}`]);
  hr = h.token;
  hrEmail = h.email;

  // Split shift, Monday to Saturday, like the old site's morning and afternoon blocks.
  const shifts = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [{ weekday, startTime: '08:00', endTime: '12:00' }, { weekday, startTime: '13:00', endTime: '17:00' }]);
  scheduleId = (await request(app).post('/v1/hr/schedules').set(as(hr)).send({ name: `Field crew ${tag}`, graceMinutes: 10, shifts }).expect(201)).body.id;
  silId = (await deps.db.leaveType.findUniqueOrThrow({ where: { key: 'service_incentive' } })).id;

  for (const [label, target] of [['worker', 'w'], ['past', 'p']] as const) {
    const u = await user(label);
    const e = await employee(u.email, label.toUpperCase());
    expect(e.account).toBe(u.email); // linked by email, employee role granted
    if (target === 'w') worker = { token: u.token, email: u.email, employeeId: e.id };
    else past = { token: u.token, email: u.email, employeeId: e.id };
  }
});

afterAll(async () => {
  await restoreSelfie?.();
  const emps = await deps.db.employee.findMany({ where: { lastName: { contains: tag } }, select: { id: true } });
  const ids = emps.map((e) => e.id);
  await deps.db.attendanceRecord.deleteMany({ where: { employeeId: { in: ids } } });
  await deps.db.leaveRequest.deleteMany({ where: { employeeId: { in: ids } } });
  await deps.db.employee.deleteMany({ where: { id: { in: ids } } });
  await deps.db.workSchedule.deleteMany({ where: { name: { contains: tag } } });
  await deps.db.holiday.deleteMany({ where: { date: { in: holidayDates.map(toDate) } } });
  const users = await deps.db.user.findMany({ where: { email: { contains: tag } }, select: { id: true } });
  await deps.db.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
  await deps.db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await deleteAuthUsers(authIds);
  await closeDeps(deps);
});

describe('access', () => {
  it('only linked employees use the portal; only HR uses the HR API', async () => {
    const outsider = await user('outsider');
    await request(app).get('/v1/me/attendance/today').set(as(outsider.token)).expect(403);
    await request(app).get('/v1/hr/employees').set(as(worker.token)).expect(403);
    await request(app).get('/v1/hr/attendance').set(as(outsider.token)).expect(403);
  });
});

describe('clock in and out (server time)', () => {
  it('five simultaneous taps on "Clock in" make one punch', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => request(app).post('/v1/me/attendance/punch').set(as(worker.token)).send({ type: 'IN' })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    const t = await request(app).get('/v1/me/attendance/today').set(as(worker.token)).expect(200);
    expect(t.body).toMatchObject({ clockedIn: true, record: { punches: [{ type: 'IN' }] } });
    await request(app).post('/v1/me/attendance/punch').set(as(worker.token)).send({ type: 'OUT' }).expect(409); // within a minute
  });

  it('a day on a split shift: late in the morning, overtime after five', async () => {
    const d = MON;
    for (const [type, time] of [['IN', '08:25'], ['OUT', '12:00'], ['IN', '12:58'], ['OUT', '17:30']] as const) await punch(deps, past.employeeId, type, '127.0.0.1', at(d, time));
    const rec = await deps.db.attendanceRecord.findUniqueOrThrow({ where: { employeeId_workDate: { employeeId: past.employeeId, workDate: toDate(d) } } });
    expect(rec).toMatchObject({ status: 'LATE', lateMinutes: 25, undertimeMinutes: 0, overtimeMinutes: 30, workedMinutes: 215 + 272 });
  });

  it('refuses out-of-order punches', async () => {
    await expect(punch(deps, past.employeeId, 'OUT', undefined, at(TUE, '12:00'))).rejects.toThrow(/not clocked in/);
  });
});

describe('closing days', () => {
  it('an absent scheduled day becomes ABSENT, a forgotten time out becomes INCOMPLETE, a holiday is a holiday', async () => {
    await punch(deps, past.employeeId, 'IN', undefined, at(WED, '08:00')); // never clocks out
    holidayDates.push(THU);
    await deps.db.holiday.create({ data: { date: toDate(THU), name: `Test holiday ${tag}`, type: 'regular' } });
    await closeDays(deps, at(FRI, '12:00')); // looks at Wednesday and Thursday
    const recs = await deps.db.attendanceRecord.findMany({ where: { employeeId: past.employeeId, workDate: { in: [toDate(WED), toDate(THU)] } }, orderBy: { workDate: 'asc' } });
    expect(recs.map((r) => r.status)).toEqual(['INCOMPLETE', 'HOLIDAY']);
    await closeDays(deps, at(THU, '12:00')); // Tuesday: nothing at all
    expect((await deps.db.attendanceRecord.findUniqueOrThrow({ where: { employeeId_workDate: { employeeId: past.employeeId, workDate: toDate(TUE) } } })).status).toBe('ABSENT');
  });

  it('closing is idempotent', async () => {
    const before = await deps.db.attendanceRecord.count({ where: { employeeId: past.employeeId } });
    await closeDays(deps, at(FRI, '12:00'));
    expect(await deps.db.attendanceRecord.count({ where: { employeeId: past.employeeId } })).toBe(before);
  });
});

describe('corrections', () => {
  it('employee asks, HR approves, the day is recomputed; a second request for the same day waits its turn', async () => {
    const body = { workDate: WED, punches: [{ type: 'IN', time: '08:00' }, { type: 'OUT', time: '17:05' }], reason: 'Forgot to clock out after the site visit' };
    await request(app).post('/v1/me/attendance/corrections').set(as(past.token)).send({ ...body, punches: [{ type: 'OUT', time: '08:00' }] }).expect(400);
    const c = await request(app).post('/v1/me/attendance/corrections').set(as(past.token)).send(body).expect(201);
    await request(app).post('/v1/me/attendance/corrections').set(as(past.token)).send(body).expect(409);
    const list = await request(app).get('/v1/hr/corrections').set(as(hr)).expect(200);
    expect(list.body.find((x: { id: string }) => x.id === c.body.id)).toMatchObject({ workDate: WED, current: [{ type: 'IN' }] });
    await request(app).post(`/v1/hr/corrections/${c.body.id}/decision`).set(as(hr)).send({ decision: 'APPROVED' }).expect(200);
    await request(app).post(`/v1/hr/corrections/${c.body.id}/decision`).set(as(hr)).send({ decision: 'APPROVED' }).expect(409);
    const rec = await deps.db.attendanceRecord.findUniqueOrThrow({ where: { employeeId_workDate: { employeeId: past.employeeId, workDate: toDate(WED) } }, include: { punches: true } });
    expect(rec).toMatchObject({ status: 'PRESENT', undertimeMinutes: 0, overtimeMinutes: 5 });
    expect(rec.punches.every((p) => p.source === 'admin_correction')).toBe(true);
  });

  it('approving finished days stamps them without losing what happened; open days are skipped', async () => {
    const recs = await request(app).get(`/v1/hr/attendance/records?employeeId=${past.employeeId}&from=${MON}&to=${SUN}`).set(as(hr)).expect(200);
    const res = await request(app).post('/v1/hr/attendance/approve').set(as(hr)).send({ recordIds: recs.body.map((r: { id: string }) => r.id) }).expect(200);
    expect(res.body.approved).toBe(recs.body.length);
    const after = await request(app).get(`/v1/hr/attendance/records?employeeId=${past.employeeId}&from=${MON}&to=${SUN}`).set(as(hr)).expect(200);
    expect(after.body.map((r: { status: string; approved: boolean }) => [r.status, r.approved])).toEqual(expect.arrayContaining([['LATE', true], ['ABSENT', true], ['HOLIDAY', true]]));
  });
});

describe('leave', () => {
  const next = (wd: number) => { // the next given weekday at least two weeks ahead
    const d = new Date(Date.now() + 14 * 86_400_000);
    while (d.getUTCDay() !== wd) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  it('balances are checked (including waiting requests), overlaps refused, approval uses days, cancellation returns them', async () => {
    let mon = next(1);
    // A holiday in the week (Bonifacio Day, Nov 30) shortens the leave and breaks the day counts: use the week after.
    while (await deps.db.holiday.count({ where: { date: { gte: toDate(mon), lte: toDate(addDays(mon, 5)) } } })) mon = addDays(mon, 7);
    const wed = new Date(Date.parse(mon) + 2 * 86_400_000).toISOString().slice(0, 10);
    if (mon.slice(0, 4) !== wed.slice(0, 4)) return; // year boundary: covered by validation
    const r1 = await request(app).post('/v1/me/leave').set(as(past.token)).send({ leaveTypeId: silId, startDate: mon, endDate: wed, reason: 'Family event' }).expect(201);
    expect(r1.body.days).toBe(3);
    await request(app).post('/v1/me/leave').set(as(past.token)).send({ leaveTypeId: silId, startDate: wed, endDate: wed }).expect(409); // overlap
    const thu = new Date(Date.parse(wed) + 86_400_000).toISOString().slice(0, 10);
    const sat = new Date(Date.parse(wed) + 3 * 86_400_000).toISOString().slice(0, 10);
    if (sat.slice(0, 4) === mon.slice(0, 4)) {
      const over = await request(app).post('/v1/me/leave').set(as(past.token)).send({ leaveTypeId: silId, startDate: thu, endDate: sat }).expect(400); // 3 more, only 2 left
      expect(over.body.error.message).toMatch(/2 days/);
    }
    await request(app).post(`/v1/hr/leave/${r1.body.id}/decision`).set(as(hr)).send({ decision: 'APPROVED' }).expect(200);
    const mine = await request(app).get('/v1/me/leave').set(as(past.token)).expect(200);
    expect(mine.body.balances.find((b: { leaveTypeId: string }) => b.leaveTypeId === silId)).toMatchObject({ allotted: 5, used: 3, left: 2 });
    expect(await deps.db.attendanceRecord.count({ where: { employeeId: past.employeeId, status: 'ON_LEAVE', workDate: { gte: toDate(mon), lte: toDate(wed) } } })).toBe(3);
    await request(app).post(`/v1/me/leave/${r1.body.id}/cancel`).set(as(past.token)).expect(409); // approved: HR cancels
    await request(app).post(`/v1/hr/leave/${r1.body.id}/cancel`).set(as(hr)).expect(200);
    expect((await request(app).get('/v1/me/leave').set(as(past.token))).body.balances.find((b: { leaveTypeId: string }) => b.leaveTypeId === silId).used).toBe(0);
    expect(await deps.db.attendanceRecord.count({ where: { employeeId: past.employeeId, status: 'ON_LEAVE' } })).toBe(0);
  });

  it('nobody approves their own leave', async () => {
    const e = await employee(hrEmail, 'HR');
    expect(e.account).toBe(hrEmail);
    const mon = next(2);
    const req = await deps.db.leaveRequest.create({ data: { employeeId: e.id, leaveTypeId: silId, startDate: toDate(mon), endDate: toDate(mon), days: 1 } });
    await request(app).post(`/v1/hr/leave/${req.id}/decision`).set(as(hr)).send({ decision: 'APPROVED' }).expect(403);
  });
});

describe('reports', () => {
  it('per-employee summary as JSON, CSV and XLSX', async () => {
    const json = await request(app).get(`/v1/hr/reports/attendance?from=${MON}&to=${SUN}`).set(as(hr)).expect(200);
    expect(json.body.rows.find((r: { employeeNo: string }) => r.employeeNo === `T-${TAG}-PAST`)).toMatchObject({ daysWorked: 2, lateDays: 1, lateMinutes: 25, absences: 1, overtimeMinutes: 35 });
    const csv = await request(app).get(`/v1/hr/reports/attendance?from=${MON}&to=${SUN}&format=csv`).set(as(hr)).expect(200);
    expect(csv.text).toContain(`T-${TAG}-PAST`);
    expect(csv.text).not.toMatch(/salary|rate|pay/i);
    const xlsx = await request(app).get(`/v1/hr/reports/attendance?from=${MON}&to=${SUN}&format=xlsx`).set(as(hr)).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); }).expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK'); // zip container
    await request(app).get(`/v1/hr/reports/attendance?from=${MON}&to=${SUN}`).set(as(worker.token)).expect(403);
  });
});
