// API pieces added with the portal redesign: the employee's own schedule, the dashboard's content activity, and the
// notifications for schedule changes, missed clock-outs and reviews to moderate (each reaching only its audience).
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { closeDays, punch, toDate } from '../../apps/api/src/modules/attendance/service.ts';
import { addDays, manilaDate, manilaInstant, weekdayOf } from '../../apps/api/src/modules/attendance/time.ts';
import { keepSelfieSetting, testDeps } from './helpers.ts';
import { deleteAuthUsers, signedInUser } from './supabase.ts';

const tag = `pr${Date.now()}`;
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
let deps: Deps;
let app: ReturnType<typeof createApp>;
let restoreSelfie: (() => Promise<void>) | undefined;
const authIds: string[] = [];
let hr = '';
let moderator = { token: '', userId: '' };
let mine = { token: '', userId: '', employeeId: '' };
let other = { token: '', userId: '', employeeId: '' };
let scheduleId = '';
const reviewTexts: string[] = [];

async function user(label: string, role?: string) {
  const u = await signedInUser(`${label}-${tag}`);
  authIds.push(u.authUserId);
  await request(app).get('/v1/auth/me').set(as(u.token)).expect(200); // creates the User row
  const row = await deps.db.user.findUniqueOrThrow({ where: { authUserId: u.authUserId } });
  if (role) {
    await deps.db.userRole.create({ data: { userId: row.id, roleId: (await deps.db.role.findUniqueOrThrow({ where: { key: role } })).id } });
    await deps.cache.invalidateTags([`authz:user:${row.id}`]);
  }
  return { ...u, userId: row.id };
}
async function employee(label: string) {
  const u = await user(label);
  const res = await request(app).post('/v1/hr/employees').set(as(hr)).send({ employeeNo: `PR-${label.toUpperCase()}-${tag.slice(-6)}`, firstName: 'Test', lastName: `${label} ${tag}`, email: u.email, employmentStatus: 'ACTIVE' }).expect(201);
  return { token: u.token, userId: u.userId, employeeId: res.body.id as string };
}
/** Waits for the event handlers (they run after the response) and returns the person's notifications of a type. */
async function inbox(userId: string, type: string) {
  for (let i = 0; i < 20; i++) {
    const rows = await deps.db.notification.findMany({ where: { recipientId: userId, type } });
    if (rows.length) return rows;
    await new Promise((r) => setTimeout(r, 100));
  }
  return [];
}

beforeAll(async () => {
  deps = await testDeps({ REVALIDATE_SECRET: '' });
  app = createApp(deps);
  restoreSelfie = await keepSelfieSetting(deps.db);
  hr = (await user('hr', 'hr_manager')).token;
  const m = await user('mod', 'content_manager');
  moderator = { token: m.token, userId: m.userId };
  mine = await employee('mine');
  other = await employee('other');
  const shifts = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '08:00', endTime: '17:00', breakMinutes: 60 }));
  scheduleId = (await request(app).post('/v1/hr/schedules').set(as(hr)).send({ name: `Crew ${tag}`, shifts }).expect(201)).body.id;
});

afterAll(async () => {
  await restoreSelfie?.();
  const emps = await deps.db.employee.findMany({ where: { lastName: { contains: tag } }, select: { id: true } });
  const ids = emps.map((e) => e.id);
  await deps.db.attendanceRecord.deleteMany({ where: { employeeId: { in: ids } } });
  await deps.db.scheduleAssignment.deleteMany({ where: { employeeId: { in: ids } } });
  await deps.db.employee.deleteMany({ where: { id: { in: ids } } });
  await deps.db.workSchedule.deleteMany({ where: { name: { contains: tag } } });
  if (reviewTexts.length) await deps.mongo.db.collection('testimonials').deleteMany({ text: { $in: reviewTexts } });
  const users = await deps.db.user.findMany({ where: { email: { contains: tag } }, select: { id: true } });
  await deps.db.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
  await deps.db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await deleteAuthUsers(authIds);
  await closeDeps(deps);
});

describe('schedule', () => {
  it('assigning a schedule tells that employee, links to their schedule, and nobody else hears of it', async () => {
    const today = manilaDate(new Date());
    await request(app).post(`/v1/hr/employees/${mine.employeeId}/schedule`).set(as(hr)).send({ scheduleId, effectiveFrom: today }).expect(200);
    const [n] = await inbox(mine.userId, 'schedule.assigned');
    expect(n).toMatchObject({ app: 'employee', category: 'hr', title: 'Your work schedule changed', payload: { href: '/schedule' } });
    expect(await deps.db.notification.count({ where: { recipientId: other.userId, type: { startsWith: 'schedule.' } } })).toBe(0);
  });

  it('the employee reads their own next two weeks; outsiders and other people cannot', async () => {
    const res = await request(app).get('/v1/me/schedule').set(as(mine.token)).expect(200);
    expect(res.body.days).toHaveLength(14);
    expect(res.body.days[0]).toMatchObject({ date: manilaDate(new Date()), schedule: { name: `Crew ${tag}`, flexible: false }, onLeave: false });
    expect(res.body.days[0].segments).toHaveLength(1);
    const other14 = await request(app).get('/v1/me/schedule').set(as(other.token)).expect(200);
    expect(other14.body.days.every((d: { schedule: unknown }) => d.schedule === null)).toBe(true); // their own (empty) schedule, never someone else's
    await request(app).get('/v1/me/schedule').set(as(moderator.token)).expect(403);
  });

  it('editing the hours tells everyone on that schedule', async () => {
    await request(app).post(`/v1/hr/employees/${other.employeeId}/schedule`).set(as(hr)).send({ scheduleId, effectiveFrom: manilaDate(new Date()) }).expect(200);
    const shifts = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: '07:00', endTime: '16:00', breakMinutes: 60 }));
    await request(app).put(`/v1/hr/schedules/${scheduleId}`).set(as(hr)).send({ name: `Crew ${tag}`, shifts }).expect(200);
    expect(await inbox(mine.userId, 'schedule.updated')).toHaveLength(1);
    expect(await inbox(other.userId, 'schedule.updated')).toHaveLength(1);
    expect(await deps.db.notification.count({ where: { recipientId: moderator.userId, type: { startsWith: 'schedule.' } } })).toBe(0);
  });
});

describe('missed clock-out', () => {
  it('closing a day that has no clock-out marks it incomplete and tells the employee once', async () => {
    const day = addDays(manilaDate(new Date()), -3);
    await punch(deps, mine.employeeId, 'IN', '127.0.0.1', manilaInstant(day, '08:00'));
    await closeDays(deps);
    await closeDays(deps); // the job runs every 15 minutes: no second notice
    const rec = await deps.db.attendanceRecord.findUniqueOrThrow({ where: { employeeId_workDate: { employeeId: mine.employeeId, workDate: toDate(day) } } });
    expect(rec.status).toBe('INCOMPLETE');
    const rows = await inbox(mine.userId, 'attendance.incomplete');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ app: 'employee', priority: 'HIGH', payload: { href: '/attendance' } });
  });
});

describe('late work', () => {
  it('a clock-in after the cut-off stays clocked in for 4 hours before it counts as a missing time out', async () => {
    let day = addDays(manilaDate(new Date()), -6);
    while (weekdayOf(day) === 0 || weekdayOf(day) === 6) day = addDays(day, -1); // a working day on the 07:00 to 16:00 schedule
    await deps.db.scheduleAssignment.create({ data: { employeeId: other.employeeId, scheduleId, effectiveFrom: toDate(day), effectiveTo: toDate(addDays(manilaDate(new Date()), -1)) } });
    await punch(deps, other.employeeId, 'IN', '127.0.0.1', manilaInstant(day, '22:30')); // cut-off is 20:00
    const rec = () => deps.db.attendanceRecord.findUniqueOrThrow({ where: { employeeId_workDate: { employeeId: other.employeeId, workDate: toDate(day) } } });
    expect((await rec()).status).toBe('OPEN');
    await closeDays(deps, manilaInstant(day, '23:59'));
    expect((await rec()).status).toBe('OPEN');
    await closeDays(deps, manilaInstant(addDays(day, 1), '02:31'));
    expect((await rec()).status).toBe('INCOMPLETE');
  });
});

describe('role changes', () => {
  it('a staff member is told in the console as well as on the website', async () => {
    const boss = await user('boss', 'super_admin');
    const staff = await user('staff', 'admin');
    await request(app).put(`/v1/users/${staff.userId}/roles`).set(as(boss.token)).send({ roles: ['admin', 'content_manager'] }).expect(200);
    const rows = await inbox(staff.userId, 'user.roles_changed');
    for (let i = 0; i < 20 && rows.length < 2; i++) { await new Promise((r) => setTimeout(r, 100)); rows.splice(0, rows.length, ...(await inbox(staff.userId, 'user.roles_changed'))); }
    expect(rows.map((n) => n.app).sort()).toEqual(['admin', 'web']);
  });
});

describe('reviews', () => {
  it('a new review reaches moderators without the reviewer\'s name or words, and not employees', async () => {
    const customer = await user('reviewer');
    const text = `Lovely garden work by the team ${tag}`;
    await request(app).post('/v1/testimonials').set(as(customer.token)).send({ rating: 4, text, consent: true }).expect(201);
    reviewTexts.push(text);
    const [n] = await inbox(moderator.userId, 'testimonial.submitted');
    expect(n).toMatchObject({ app: 'admin', title: 'New review to moderate', payload: { href: '/cms/testimonials' } });
    expect(n!.message).not.toContain(text);
    expect(n!.message).not.toContain('reviewer');
    expect(await deps.db.notification.count({ where: { recipientId: mine.userId, type: 'testimonial.submitted' } })).toBe(0);
  });
});

describe('dashboard', () => {
  it('content activity is in the overview only for people who may read content', async () => {
    const withCms = await request(app).get('/v1/admin/overview').set(as(moderator.token)).expect(200);
    expect(Array.isArray(withCms.body.content.recent)).toBe(true);
    for (const c of withCms.body.content.recent) expect(Object.keys(c).sort()).toEqual(['action', 'at', 'by', 'id', 'record', 'type']); // no before/after bodies
    const hrView = await request(app).get('/v1/admin/overview').set(as(hr)).expect(200);
    expect(hrView.body.content).toBeUndefined();
  });
});
