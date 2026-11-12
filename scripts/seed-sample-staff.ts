// Sample staff for local development: employee-portal logins, an HR manager and an administrator, plus three weeks of
// attendance, leave in every state, a late arrival, time corrections and the notifications those produce.
// Usage: pnpm staff:seed   (needs pnpm db:seed and pnpm admin:create first; the super admin is the acting provisioner)
//
// Accounts are created with the API's own provisionAccount (Supabase identity + user row + roles + employee link,
// mustChangePassword) and leave/corrections go through the API's attendance service and event handlers, so the data
// looks exactly like what HR would produce in the admin. Safe to rerun: existing rows are kept, missing ones are added,
// and every sample account gets a fresh temporary password (written to .local/sample-staff-credentials.txt, gitignored).
// Refuses anything but a local Supabase and database.
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import { readEnv } from '../apps/api/src/config/env.ts';
import { closeDeps, createDeps } from '../apps/api/src/lib/deps.ts';
import { createLogger } from '../apps/api/src/lib/logger.ts';
import { authzCacheKey } from '../apps/api/src/middleware/auth.ts';
import { cancelLeave, decideLeave, recompute, replacePunches, requestLeave, scheduleOn, toDate } from '../apps/api/src/modules/attendance/service.ts';
import { addDays, manilaDate, manilaInstant, segmentsFor } from '../apps/api/src/modules/attendance/time.ts';
import { provisionAccount, temporaryPassword } from '../apps/api/src/modules/users/provision.ts';

try { process.loadEnvFile(path.resolve(import.meta.dirname, '../.env')); } catch { /* env provided */ }
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(process.env.SUPABASE_URL ?? '')) {
  console.error(`Refusing: SUPABASE_URL is not a local Supabase (${process.env.SUPABASE_URL || 'unset'}).`);
  process.exit(1);
}
for (const key of ['DATABASE_URL', 'REDIS_URL', 'MONGODB_URL']) {
  const v = process.env[key];
  if (v && !/@?(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(v)) { console.error(`Refusing: ${key} is not local.`); process.exit(1); }
}

const DOMAIN = 'sample.greenscape.local';
const SCHEDULES = {
  field: { name: 'Field crew (Mon–Sat 7:00–16:00)', graceMinutes: 10, days: [1, 2, 3, 4, 5, 6], start: '07:00', end: '16:00' },
  nursery: { name: 'Nursery (Tue–Sun 7:30–16:30)', graceMinutes: 10, days: [0, 2, 3, 4, 5, 6], start: '07:30', end: '16:30' },
  office: { name: 'Office (Mon–Fri 8:00–17:00)', graceMinutes: 15, days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00' },
} as const;
type Sched = keyof typeof SCHEDULES;
const STAFF: { no: string; first: string; last: string; position: string; dept: string; sched: Sched; status?: 'ACTIVE' | 'PROBATION'; hired: string; manager?: string; roles?: string[] }[] = [
  { no: 'GS-0101', first: 'Maria', last: 'Santos', position: 'HR & Admin Officer', dept: 'Administration', sched: 'office', hired: '2021-03-15', roles: ['employee', 'hr_manager'] },
  { no: 'GS-0102', first: 'Juan', last: 'Dela Cruz', position: 'Crew Lead', dept: 'Landscaping Crew', sched: 'field', hired: '2019-06-01' },
  { no: 'GS-0103', first: 'Andres', last: 'Bautista', position: 'Landscaper', dept: 'Landscaping Crew', sched: 'field', hired: '2022-01-10', manager: 'GS-0102' },
  { no: 'GS-0104', first: 'Carlo', last: 'Villanueva', position: 'Landscaper', dept: 'Landscaping Crew', sched: 'field', status: 'PROBATION', hired: '2026-08-17', manager: 'GS-0102' },
  { no: 'GS-0105', first: 'Rosa', last: 'Mendoza', position: 'Nursery Attendant', dept: 'Nursery & Garden Center', sched: 'nursery', hired: '2020-11-02' },
  { no: 'GS-0106', first: 'Liza', last: 'Garcia', position: 'Garden Designer', dept: 'Sales & Design', sched: 'office', hired: '2023-04-03' },
  { no: 'GS-0107', first: 'Ramon', last: 'Aquino', position: 'Delivery Driver', dept: 'Nursery & Garden Center', sched: 'field', hired: '2024-02-12' },
];
const ADMIN = { first: 'Paolo', last: 'Reyes', roles: ['admin'] };
const ALLOTTED: Record<string, number> = { service_incentive: 5, vacation: 10, sick: 7 };
const HOLIDAYS = [['11-30', 'Bonifacio Day'], ['12-25', 'Christmas Day'], ['12-30', 'Rizal Day']] as const;
const emailOf = (first: string, last: string) => `${first}.${last}`.toLowerCase().replace(/\s+/g, '') + `@${DOMAIN}`;
/** Deterministic 0..1 from a string, so a day's punches are the same whichever run creates them. */
const rand = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 10_000) / 10_000; };
const shiftMin = (hhmm: string, min: number) => { const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + Math.round(min); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

const env = readEnv({ ...process.env, LOG_LEVEL: 'silent' });
const deps = await createDeps(env, createLogger('silent', false));
const { db } = deps;
const fakeReq = { ip: '127.0.0.1', get: () => 'scripts/seed-sample-staff' } as unknown as Request;
const asActor = (userId: string) => ({ locals: { auth: { userId, permissions: new Set(['roles.manage_super']) } } }) as unknown as Response;
const credentials: string[] = [];

try {
  const superAdmin = await db.user.findFirst({ where: { roles: { some: { role: { key: 'super_admin' } } }, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  if (!superAdmin) throw new Error('No super admin yet. Run pnpm admin:create first (it acts as the provisioning administrator).');
  const leaveTypes = new Map((await db.leaveType.findMany()).map((t) => [t.key, t]));
  if (!leaveTypes.has('vacation')) throw new Error('Leave types missing. Run pnpm db:seed first.');

  /** Creates the login like the admin does, or (rerun) issues a new temporary password and makes sure the roles are there. */
  async function account(first: string, last: string, roles: string[], label: string, url: string, link?: string) {
    const email = emailOf(first, last);
    const existing = await db.user.findUnique({ where: { email } });
    let userId: string, password: string;
    if (!existing) {
      const out = await provisionAccount(deps, fakeReq, asActor(superAdmin!.id), { email, displayName: `${first} ${last}`, roles },
        link ? (tx, uid) => tx.employee.update({ where: { id: link }, data: { userId: uid } }) : undefined);
      ({ userId, temporaryPassword: password } = out);
    } else {
      userId = existing.id;
      password = temporaryPassword();
      await deps.identities.setPassword(existing.authUserId, password);
      const roleRows = await db.role.findMany({ where: { key: { in: roles } } });
      await db.$transaction([
        db.user.update({ where: { id: userId }, data: { mustChangePassword: true, status: 'ACTIVE' } }),
        db.userRole.createMany({ data: roleRows.map((r) => ({ userId, roleId: r.id, grantedBy: superAdmin!.id })), skipDuplicates: true }),
        ...(link ? [db.employee.update({ where: { id: link }, data: { userId } })] : []),
      ]);
      await deps.cache.invalidateTags([authzCacheKey(userId)]);
    }
    credentials.push(`${label.padEnd(28)} ${url}/login\n  Email:    ${email}\n  Password: ${password}`);
    return userId;
  }

  // ── org structure ──
  const depts = new Map<string, string>();
  for (const name of new Set(STAFF.map((s) => s.dept))) depts.set(name, (await db.department.upsert({ where: { name }, create: { name }, update: {} })).id);
  const schedIds = {} as Record<Sched, string>;
  for (const [key, s] of Object.entries(SCHEDULES) as [Sched, (typeof SCHEDULES)[Sched]][]) {
    const found = await db.workSchedule.findFirst({ where: { name: s.name } });
    schedIds[key] = found?.id ?? (await db.workSchedule.create({
      data: { name: s.name, graceMinutes: s.graceMinutes, shifts: { create: s.days.map((weekday) => ({ weekday, startTime: s.start, endTime: s.end, breakMinutes: 60 })) } },
    })).id;
  }
  const today = manilaDate(new Date());
  const year = Number(today.slice(0, 4));
  for (const [md, name] of HOLIDAYS) await db.holiday.upsert({ where: { date: toDate(`${year}-${md}`) }, create: { date: toDate(`${year}-${md}`), name, type: 'regular' }, update: {} });

  // ── employees, logins, schedules, balances ──
  const emp = new Map<string, { id: string; userId: string }>();
  for (const s of STAFF) {
    const email = emailOf(s.first, s.last);
    const data = { firstName: s.first, lastName: s.last, email, position: s.position, departmentId: depts.get(s.dept)!, employmentStatus: s.status ?? 'ACTIVE', hiredOn: toDate(s.hired), managerId: s.manager ? emp.get(s.manager)?.id ?? null : null };
    const e = await db.employee.upsert({ where: { employeeNo: s.no }, create: { employeeNo: s.no, ...data }, update: {} });
    const roles = s.roles ?? ['employee'];
    const label = roles.includes('hr_manager') ? 'HR manager (admin + portal)' : `Employee (${s.position})`;
    const userId = await account(s.first, s.last, roles, label, roles.includes('hr_manager') ? env.ADMIN_URL : env.EMPLOYEE_URL, e.id);
    emp.set(s.no, { id: e.id, userId });
    if (!(await db.scheduleAssignment.findFirst({ where: { employeeId: e.id } }))) {
      await db.scheduleAssignment.create({ data: { employeeId: e.id, scheduleId: schedIds[s.sched], effectiveFrom: toDate(addDays(today, -60)) } });
    }
    for (const [key, allotted] of Object.entries(ALLOTTED)) {
      const t = leaveTypes.get(key);
      if (t) await db.leaveBalance.upsert({ where: { employeeId_leaveTypeId_year: { employeeId: e.id, leaveTypeId: t.id, year } }, create: { employeeId: e.id, leaveTypeId: t.id, year, allotted: s.status === 'PROBATION' && key === 'vacation' ? 3 : allotted }, update: {} });
    }
  }
  await account(ADMIN.first, ADMIN.last, ADMIN.roles, 'Administrator', env.ADMIN_URL);
  const hr = emp.get('GS-0101')!.userId;

  /** Scheduled workdays of an employee from `from` going `step` days at a time (holidays skipped). */
  const holidays = new Set((await db.holiday.findMany()).map((h) => h.date.toISOString().slice(0, 10)));
  async function workdays(no: string, from: string, step: 1 | -1, count: number) {
    const out: string[] = [];
    for (let d = from; out.length < count; d = addDays(d, step)) {
      const sched = await scheduleOn(db, emp.get(no)!.id, d);
      if (sched && segmentsFor(sched.shifts, d).length && !holidays.has(d)) out.push(d);
    }
    return out;
  }

  // ── leave in every state (before attendance, so approved days become ON_LEAVE records) ──
  type LeavePlan = { no: string; type: string; days: string[]; reason: string; then?: 'APPROVED' | 'REJECTED' | 'CANCELLED'; note?: string };
  const past = async (no: string, n: number, len = 1) => (await workdays(no, addDays(today, -1), -1, n + len)).slice(n, n + len).reverse();
  const future = async (no: string, n: number, len = 1) => (await workdays(no, addDays(today, 1), 1, n + len)).slice(n, n + len);
  const leavePlans: LeavePlan[] = [
    { no: 'GS-0102', type: 'vacation', days: await past('GS-0102', 8, 2), reason: 'Family reunion in Coron', then: 'APPROVED' },
    { no: 'GS-0105', type: 'sick', days: await past('GS-0105', 5), reason: 'Fever, clinic visit', then: 'APPROVED' },
    { no: 'GS-0103', type: 'vacation', days: await future('GS-0103', 6, 3), reason: 'Sister\'s wedding in Roxas' },
    { no: 'GS-0106', type: 'service_incentive', days: await future('GS-0106', 10, 2), reason: 'Year-end trip home to Iloilo' },
    { no: 'GS-0104', type: 'vacation', days: await future('GS-0104', 2), reason: 'Personal errand at the LTO', then: 'REJECTED', note: 'Peak week for the Puerto Princesa resort project; please pick another day.' },
    { no: 'GS-0107', type: 'sick', days: await future('GS-0107', 1), reason: 'Dental appointment', then: 'CANCELLED' },
    { no: 'GS-0101', type: 'vacation', days: await future('GS-0101', 4), reason: 'Enrollment day for my son' },
  ];
  let leaveAdded = 0;
  for (const p of leavePlans) {
    const e = emp.get(p.no)!;
    const leaveTypeId = leaveTypes.get(p.type)!.id;
    if (await db.leaveRequest.findFirst({ where: { employeeId: e.id, leaveTypeId, reason: p.reason } })) continue;
    const l = await requestLeave(deps, e.id, { leaveTypeId, startDate: p.days[0]!, endDate: p.days.at(-1)!, halfDay: false, reason: p.reason });
    await deps.events.emit('leave.requested', { leaveId: l.id });
    if (p.then === 'APPROVED' || p.then === 'REJECTED') await decideLeave(deps, l.id, p.then, hr, p.note);
    if (p.then === 'CANCELLED') await cancelLeave(deps, l.id, { userId: e.userId, employeeId: e.id, hr: false });
    if (p.then) await deps.events.emit('leave.decided', { leaveId: l.id });
    leaveAdded++;
  }

  // ── attendance: the last three weeks plus this morning; days that already have a record are left alone ──
  let daysAdded = 0, corrections = 0;
  const now = new Date();
  for (const s of STAFF) {
    const e = emp.get(s.no)!;
    const sc = SCHEDULES[s.sched];
    const days = await workdays(s.no, addDays(today, -1), -1, 18);
    const todayRows = (await workdays(s.no, today, 1, 1))[0] === today && now >= manilaInstant(today, shiftMin(sc.start, -10)) ? [today] : [];
    for (const [i, d] of [...todayRows.map((t) => [-1, t] as const), ...days.map((t, n) => [n, t] as const)]) {
      if (d < addDays(today, -30)) break;
      if (await db.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: e.id, workDate: toDate(d) } } })) continue;
      const r = rand(`${s.no}:${d}`);
      const script = `${s.no}:${i}`;
      if (script === 'GS-0107:4') { // no-show: a record without punches is ABSENT
        await recompute(db, (await db.attendanceRecord.create({ data: { employeeId: e.id, workDate: toDate(d), status: 'ABSENT' } })).id);
        daysAdded++; continue;
      }
      // Late: Andres's 38-minute late arrival is the scripted one; ~1 in 12 other days run 12–30 minutes late.
      const lateBy = script === 'GS-0103:2' ? 38 : r < 0.08 ? 12 + r * 225 : 0;
      const inAt = manilaInstant(d, shiftMin(sc.start, lateBy ? lateBy : -2 - r * 12));
      const outAt = manilaInstant(d, shiftMin(sc.end, 1 + rand(`${d}:${s.no}`) * 25));
      const forgotOut = script === 'GS-0105:1' || script === 'GS-0104:6'; // forgot to clock out → INCOMPLETE, then a correction
      if (inAt > now) continue; // today, not in yet
      // Today: still clocked in until the shift's end has passed.
      const punches = forgotOut || outAt > now ? [{ type: 'IN' as const, at: inAt }] : [{ type: 'IN' as const, at: inAt }, { type: 'OUT' as const, at: outAt }];
      const rec = await db.attendanceRecord.create({ data: { employeeId: e.id, workDate: toDate(d), punches: { create: punches.map((p) => ({ ...p, source: 'web' })) } } });
      await recompute(db, rec.id);
      daysAdded++;
      if (forgotOut) {
        const proposed = [{ type: 'IN', at: inAt.toISOString() }, { type: 'OUT', at: manilaInstant(d, shiftMin(sc.end, 5)).toISOString() }];
        const c = await db.attendanceCorrection.create({ data: { recordId: rec.id, requestedById: e.userId, reason: s.no === 'GS-0105' ? 'Forgot to clock out; I closed the nursery at 4:35 with Ma\'am Maria.' : 'Phone battery died before clock-out; crew lead can confirm I left at 4:05.', proposed } });
        await deps.events.emit('correction.requested', { correctionId: c.id });
        if (s.no === 'GS-0104') { // the older one was already approved by HR, like the admin's decision route does it
          await db.$transaction(async (tx) => {
            await replacePunches(tx, rec.id, proposed.map((p) => ({ type: p.type as 'IN' | 'OUT', at: new Date(p.at) })), 'admin_correction');
            await tx.attendanceCorrection.update({ where: { id: c.id }, data: { status: 'APPROVED', decidedById: hr, decidedAt: new Date() } });
          });
          await deps.events.emit('correction.decided', { correctionId: c.id });
        }
        corrections++;
      }
    }
  }
  // Finished days older than a week are approved (HR approves the others; Maria's own by the administrator).
  const weekAgo = toDate(addDays(today, -7));
  const finished = { approvedAt: null, workDate: { lt: weekAgo }, status: { in: ['PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE'] as ('PRESENT' | 'LATE' | 'ABSENT' | 'ON_LEAVE')[] } };
  const hrEmp = emp.get('GS-0101')!.id;
  const others = [...emp.values()].map((x) => x.id).filter((id) => id !== hrEmp);
  const admin = await db.user.findUniqueOrThrow({ where: { email: emailOf(ADMIN.first, ADMIN.last) } });
  await db.attendanceRecord.updateMany({ where: { ...finished, employeeId: { in: others } }, data: { approvedById: hr, approvedAt: new Date() } });
  await db.attendanceRecord.updateMany({ where: { ...finished, employeeId: hrEmp }, data: { approvedById: admin.id, approvedAt: new Date() } });

  // ── credentials ──
  const dir = path.resolve(import.meta.dirname, '../.local');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'sample-staff-credentials.txt');
  fs.writeFileSync(file, [
    `Sample staff accounts (generated ${new Date().toISOString()} by pnpm staff:seed). Local only.`,
    'Every password is temporary: the first sign-in asks for a new one (until then the account has customer access only).',
    'Rerunning pnpm staff:seed issues new temporary passwords.',
    '', ...credentials, '',
  ].join('\n'), { mode: 0o600 });
  console.log(`Sample staff ready: ${STAFF.length} employees (${STAFF.length} portal logins incl. 1 HR manager) + 1 administrator.`);
  console.log(`Added ${leaveAdded} leave requests, ${daysAdded} attendance days, ${corrections} time corrections. Passwords in ${path.relative(process.cwd(), file)} (gitignored).`);
} finally {
  await closeDeps(deps);
}
