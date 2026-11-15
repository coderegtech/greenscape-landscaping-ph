// HR administration: employees, schedules, attendance board, approvals, corrections, leave, holidays, reports.
// Never stores or computes pay. Every change by staff is audited; approvers cannot approve their own records.
import { Prisma } from '@greenscape/database';
import {
  APPROVAL_LABELS, ApproveRecords, AssignSchedule, BalanceInput, DateRange, Decision, EMPLOYMENT_STATUSES, EmployeeInput,
  HolidayInput, LeaveTypeInput, ProvisionedAccount, RecordEdit, ScheduleInput, SelfieSettings, Ymd, z,
} from '@greenscape/validation';
import { BUCKETS } from '@greenscape/storage';
import ExcelJS from 'exceljs';
import { Router, type Response } from 'express';
import { audit } from '../../lib/audit.ts';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { registry } from '../../lib/openapi.ts';
import { authzCacheKey, currentAuth, requirePermission } from '../../middleware/auth.ts';
import { provisionAccount } from '../users/provision.ts';
import { recordView } from './routes.ts';
import { SELFIE_KEY, selfieSettings } from './uploads.ts';
import { assertNotSelf, cancelLeave, decideLeave, ensureBalances, replacePunches, scheduleOn, toDate, toPunches, ymd } from './service.ts';
import { manilaDate, segmentsFor } from './time.ts';

for (const [m, p, s] of [
  ['get', '/v1/hr/employees', 'Employees (employees.read): q, status, departmentId'],
  ['post', '/v1/hr/employees', 'Create an employee; links the account with the same email (employees.manage)'],
  ['put', '/v1/hr/employees/{id}', 'Update an employee (employees.manage)'],
  ['post', '/v1/hr/employees/{id}/account', 'Create the employee-portal login with a one-time temporary password (employees.manage)'],
  ['post', '/v1/hr/employees/{id}/schedule', 'Assign a schedule from a date (employees.manage)'],
  ['get', '/v1/hr/schedules', 'Work schedules with shifts (employees.read)'],
  ['post', '/v1/hr/schedules', 'Create a schedule (employees.manage)'],
  ['put', '/v1/hr/schedules/{id}', 'Replace a schedule (employees.manage)'],
  ['get', '/v1/hr/attendance', 'Daily board for ?date (attendance.read)'],
  ['get', '/v1/hr/settings/selfie', 'Clock-in selfie policy: off | optional | required, retentionDays (attendance.read)'],
  ['put', '/v1/hr/settings/selfie', 'Change the clock-in selfie policy (employees.manage). Audited.'],
  ['get', '/v1/hr/attendance/records', 'Records for ?employeeId&from&to (attendance.read)'],
  ['put', '/v1/hr/attendance/records/{id}', 'Replace the punches of a day with a reason (attendance.manage)'],
  ['post', '/v1/hr/attendance/approve', 'Approve finished days (attendance.approve)'],
  ['get', '/v1/hr/corrections', 'Correction requests (attendance.read)'],
  ['post', '/v1/hr/corrections/{id}/decision', 'Approve or decline a correction (attendance.approve)'],
  ['get', '/v1/hr/leave', 'Leave requests: status, from, to (leave.read)'],
  ['post', '/v1/hr/leave/{id}/decision', 'Approve or decline leave (leave.approve)'],
  ['post', '/v1/hr/leave/{id}/cancel', 'Cancel leave; approved days go back to the balance (leave.approve)'],
  ['get', '/v1/hr/leave/balances', 'Balances for ?year (leave.read)'],
  ['put', '/v1/hr/leave/balances', 'Set an allotment (employees.manage)'],
  ['get', '/v1/hr/leave-types', 'Leave types (leave.read)'],
  ['get', '/v1/hr/holidays', 'Holidays for ?year (attendance.read)'],
  ['get', '/v1/hr/reports/attendance', 'Summary per employee for ?from&to, format=json|csv|xlsx (reports.attendance)'],
] as const) registry.registerPath({ method: m, path: p, tags: ['hr'], auth: true, summary: s, responses: { 200: { description: 'ok' } } });

const Id = z.string().uuid();
const name = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const pgUnique = (msg: string, path: string) => (err: unknown) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new AppError(409, 'CONFLICT', msg, [{ path, message: msg }]);
  throw err;
};

export function hrRoutes(deps: Deps) {
  const { db, cache } = deps;
  const r = Router();
  const actor = (res: Response) => currentAuth(res).userId;

  /** Link the employee to the account with the same email and give it the employee role (employee portal access). */
  async function linkAccount(employeeId: string, email: string | null | undefined) {
    if (!email) return false;
    const user = await db.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (!user) return false;
    const taken = await db.employee.findFirst({ where: { userId: user.id, NOT: { id: employeeId } } });
    if (taken) throw AppError.conflict('That account is already linked to another employee.');
    const role = await db.role.findUniqueOrThrow({ where: { key: 'employee' } });
    await db.$transaction([db.employee.update({ where: { id: employeeId }, data: { userId: user.id } }), db.userRole.createMany({ data: [{ userId: user.id, roleId: role.id }], skipDuplicates: true })]);
    await cache.invalidateTags([authzCacheKey(user.id)]);
    return true;
  }

  // ── departments ──
  r.get('/departments', requirePermission('employees.read'), async (_req, res) => res.json(await db.department.findMany({ orderBy: { name: 'asc' } })));
  r.post('/departments', requirePermission('employees.manage'), async (req, res) => {
    const { name: n } = z.object({ name: z.string().trim().min(2).max(60) }).parse(req.body);
    res.status(201).json(await db.department.create({ data: { name: n } }).catch(pgUnique('That department exists', 'name')));
  });

  // ── employees ──
  const employeeView = async (id: string) => {
    const e = await db.employee.findUnique({ where: { id }, include: { department: true, manager: { select: { id: true, firstName: true, lastName: true } }, user: { select: { email: true } }, scheduleAssignments: { orderBy: { effectiveFrom: 'desc' }, take: 5, include: { schedule: { select: { id: true, name: true } } } } } });
    if (!e) throw AppError.notFound('Employee not found');
    return {
      id: e.id, employeeNo: e.employeeNo, firstName: e.firstName, lastName: e.lastName, email: e.email, mobile: e.mobile, position: e.position,
      departmentId: e.departmentId, department: e.department?.name ?? null, managerId: e.managerId, manager: e.manager ? name(e.manager) : null,
      employmentStatus: e.employmentStatus, statusLabel: EMPLOYMENT_STATUSES[e.employmentStatus], hiredOn: e.hiredOn ? ymd(e.hiredOn) : null,
      account: e.user?.email ?? null,
      schedules: e.scheduleAssignments.map((a) => ({ id: a.id, scheduleId: a.schedule.id, name: a.schedule.name, effectiveFrom: ymd(a.effectiveFrom), effectiveTo: a.effectiveTo ? ymd(a.effectiveTo) : null })),
    };
  };
  r.get('/employees', requirePermission('employees.read'), async (req, res) => {
    const q = z.object({ q: z.string().trim().max(80).optional(), status: z.enum(Object.keys(EMPLOYMENT_STATUSES) as [keyof typeof EMPLOYMENT_STATUSES]).optional(), departmentId: Id.optional() }).parse(req.query);
    const rows = await db.employee.findMany({
      where: {
        ...(q.status ? { employmentStatus: q.status } : { employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } }),
        ...(q.departmentId ? { departmentId: q.departmentId } : {}),
        ...(q.q ? { OR: [{ firstName: { contains: q.q, mode: 'insensitive' } }, { lastName: { contains: q.q, mode: 'insensitive' } }, { employeeNo: { contains: q.q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: { department: { select: { name: true } }, user: { select: { id: true } } },
      take: 500,
    });
    res.json(rows.map((e) => ({ id: e.id, employeeNo: e.employeeNo, name: name(e), position: e.position, department: e.department?.name ?? null, employmentStatus: e.employmentStatus, statusLabel: EMPLOYMENT_STATUSES[e.employmentStatus], linked: !!e.user })));
  });
  r.get('/employees/:id', requirePermission('employees.read'), async (req, res) => res.json(await employeeView(Id.parse(req.params.id))));
  const data = (i: z.infer<typeof EmployeeInput>) => ({ employeeNo: i.employeeNo, firstName: i.firstName, lastName: i.lastName, email: i.email ?? null, mobile: i.mobile ?? null, position: i.position ?? null, departmentId: i.departmentId ?? null, managerId: i.managerId ?? null, employmentStatus: i.employmentStatus, hiredOn: i.hiredOn ? toDate(i.hiredOn) : null });
  r.post('/employees', requirePermission('employees.manage'), async (req, res) => {
    const input = EmployeeInput.parse(req.body);
    const e = await db.employee.create({ data: data(input) }).catch(pgUnique('That employee number is already used', 'employeeNo'));
    await linkAccount(e.id, input.email);
    await audit(db, req, res, { action: 'employee.create', entityType: 'employee', entityId: e.id });
    await deps.events.emit('employee.updated', { employeeId: e.id });
    res.status(201).json(await employeeView(e.id));
  });
  r.put('/employees/:id', requirePermission('employees.manage'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const input = EmployeeInput.parse(req.body);
    if (input.managerId === id) throw new AppError(400, 'VALIDATION_ERROR', 'Some fields need attention', [{ path: 'managerId', message: 'Someone cannot manage themselves' }]);
    const before = await db.employee.findUnique({ where: { id } });
    if (!before) throw AppError.notFound();
    await db.employee.update({ where: { id }, data: data(input) }).catch(pgUnique('That employee number is already used', 'employeeNo'));
    if (!before.userId) await linkAccount(id, input.email);
    // Leaving: the account keeps working for the website but loses the employee portal.
    if (before.userId && (input.employmentStatus === 'RESIGNED' || input.employmentStatus === 'TERMINATED')) {
      const role = await db.role.findUniqueOrThrow({ where: { key: 'employee' } });
      await db.userRole.deleteMany({ where: { userId: before.userId, roleId: role.id } });
      await cache.invalidateTags([authzCacheKey(before.userId)]);
    }
    await deps.events.emit('employee.updated', { employeeId: id });
    await audit(db, req, res, { action: 'employee.update', entityType: 'employee', entityId: id, before: { status: before.employmentStatus, position: before.position }, after: { status: input.employmentStatus, position: input.position } });
    res.json(await employeeView(id));
  });
  r.post('/employees/:id/link', requirePermission('employees.manage'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const e = await db.employee.findUniqueOrThrow({ where: { id } });
    if (!(await linkAccount(id, e.email))) throw AppError.conflict('No account with this email yet. Use "Create login" to make one.');
    await audit(db, req, res, { action: 'employee.link', entityType: 'employee', entityId: id });
    res.json(await employeeView(id));
  });
  // Employees never self-register: HR creates the employee-portal login and hands over the temporary password.
  r.post('/employees/:id/account', requirePermission('employees.manage'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const e = await db.employee.findUniqueOrThrow({ where: { id } });
    if (e.userId) throw AppError.conflict('This employee already has a login.');
    if (!e.email) throw AppError.badRequest('Add a work email to the employee record first.');
    if (e.employmentStatus === 'RESIGNED' || e.employmentStatus === 'TERMINATED') throw AppError.badRequest('This employee has left.');
    const account = await provisionAccount(deps, req, res, { email: e.email, displayName: `${e.firstName} ${e.lastName}`.trim(), roles: ['employee'] }, (tx, userId) => tx.employee.update({ where: { id }, data: { userId } }));
    res.status(201).json(ProvisionedAccount.parse(account));
  });

  // ── schedules ──
  const scheduleView = (s: { id: string; name: string; graceMinutes: number; isFlexible: boolean; shifts: { weekday: number; startTime: string; endTime: string; breakMinutes: number }[]; _count?: { assignments: number } }) => ({
    id: s.id, name: s.name, graceMinutes: s.graceMinutes, isFlexible: s.isFlexible, assigned: s._count?.assignments ?? 0,
    shifts: [...s.shifts].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)).map(({ weekday, startTime, endTime, breakMinutes }) => ({ weekday, startTime, endTime, breakMinutes })),
  });
  r.get('/schedules', requirePermission('employees.read'), async (_req, res) => {
    res.json((await db.workSchedule.findMany({ orderBy: { name: 'asc' }, include: { shifts: true, _count: { select: { assignments: true } } } })).map(scheduleView));
  });
  r.post('/schedules', requirePermission('employees.manage'), async (req, res) => {
    const s = ScheduleInput.parse(req.body);
    const out = await db.workSchedule.create({ data: { name: s.name, graceMinutes: s.graceMinutes, isFlexible: s.isFlexible, shifts: { create: s.shifts } }, include: { shifts: true } });
    await audit(db, req, res, { action: 'schedule.create', entityType: 'schedule', entityId: out.id });
    res.status(201).json(scheduleView(out));
  });
  r.put('/schedules/:id', requirePermission('employees.manage'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const s = ScheduleInput.parse(req.body);
    const out = await db.$transaction(async (tx) => {
      await tx.scheduleShift.deleteMany({ where: { scheduleId: id } });
      return tx.workSchedule.update({ where: { id }, data: { name: s.name, graceMinutes: s.graceMinutes, isFlexible: s.isFlexible, shifts: { create: s.shifts } }, include: { shifts: true } });
    });
    await audit(db, req, res, { action: 'schedule.update', entityType: 'schedule', entityId: id });
    await deps.events.emit('schedule.changed', { scheduleId: id });
    res.json(scheduleView(out));
  });
  r.post('/employees/:id/schedule', requirePermission('employees.manage'), async (req, res) => {
    const employeeId = Id.parse(req.params.id);
    const { scheduleId, effectiveFrom } = AssignSchedule.parse(req.body);
    await db.$transaction(async (tx) => {
      const day = toDate(effectiveFrom);
      const prevDay = new Date(day.getTime() - 86_400_000);
      // Close the assignment running on that date; drop any that only start later.
      await tx.scheduleAssignment.deleteMany({ where: { employeeId, effectiveFrom: { gte: day } } });
      await tx.scheduleAssignment.updateMany({ where: { employeeId, effectiveFrom: { lt: day }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }] }, data: { effectiveTo: prevDay } });
      await tx.scheduleAssignment.create({ data: { employeeId, scheduleId, effectiveFrom: day } });
    });
    await audit(db, req, res, { action: 'schedule.assign', entityType: 'employee', entityId: employeeId, after: { scheduleId, effectiveFrom } });
    await deps.events.emit('schedule.changed', { scheduleId, employeeId, effectiveFrom });
    res.json(await employeeView(employeeId));
  });

  // ── attendance ──
  r.get('/attendance', requirePermission('attendance.read'), async (req, res) => {
    const date = Ymd.parse(req.query.date ?? manilaDate(new Date()));
    const [employees, records, holiday] = await Promise.all([
      db.employee.findMany({ where: { employmentStatus: { in: ['ACTIVE', 'PROBATION', 'ON_LEAVE'] } }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], include: { department: { select: { name: true } } } }),
      db.attendanceRecord.findMany({ where: { workDate: toDate(date) }, include: { punches: true, corrections: { select: { status: true } } } }),
      db.holiday.findUnique({ where: { date: toDate(date) } }),
    ]);
    const rows = await Promise.all(employees.map(async (e) => {
      const sched = await scheduleOn(db, e.id, date);
      const rec = records.find((x) => x.employeeId === e.id);
      return {
        employeeId: e.id, name: name(e), employeeNo: e.employeeNo, department: e.department?.name ?? null,
        scheduled: sched ? segmentsFor(sched.shifts, date).map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })) : [],
        scheduleName: sched?.name ?? null,
        record: rec ? recordView(rec) : null,
      };
    }));
    const counts: Record<string, number> = {};
    for (const x of rows) { const k = x.record?.status ?? (x.scheduled.length ? 'NOT_IN' : 'REST'); counts[k] = (counts[k] ?? 0) + 1; }
    res.set('cache-control', 'no-store').json({ date, holiday: holiday ? { name: holiday.name, type: holiday.type } : null, counts, rows });
  });
  // Clock-in selfie policy (decision D6). Changing it is audited; employees see the current notice on their portal.
  r.get('/settings/selfie', requirePermission('attendance.read'), async (_req, res) => res.json(await selfieSettings(deps)));
  r.put('/settings/selfie', requirePermission('employees.manage'), async (req, res) => {
    const value = SelfieSettings.parse(req.body);
    const before = await selfieSettings(deps);
    await db.$transaction([
      db.appSetting.upsert({ where: { key: SELFIE_KEY }, create: { key: SELFIE_KEY, value, updatedById: actor(res) }, update: { value, updatedById: actor(res) } }),
      audit(db, req, res, { action: 'attendance.selfie.set', entityType: 'setting', entityId: SELFIE_KEY, before, after: value }),
    ]);
    res.json(value);
  });
  r.get('/attendance/records', requirePermission('attendance.read'), async (req, res) => {
    const employeeId = Id.parse(req.query.employeeId);
    const { from, to } = DateRange.parse(req.query);
    const rows = await db.attendanceRecord.findMany({ where: { employeeId, workDate: { gte: toDate(from), lte: toDate(to) } }, orderBy: { workDate: 'desc' }, include: { punches: true, corrections: { select: { status: true } } } });
    // Clock-in selfies: a 5-minute signed link each, only for people who can read attendance.
    const photoIds = rows.flatMap((x) => x.punches.map((p) => p.photoMediaId)).filter((x): x is string => !!x);
    const assets = photoIds.length ? await db.mediaAsset.findMany({ where: { id: { in: photoIds } }, select: { id: true, path: true } }) : [];
    const urls = new Map(await Promise.all(assets.map(async (a) => [a.id, await deps.storage.signedUrl(BUCKETS.employeePrivate.id, a.path, 300)] as const)));
    res.json(rows.map((x) => {
      const v = recordView(x);
      const byTime = [...x.punches].sort((a, b) => a.at.getTime() - b.at.getTime());
      return { ...v, punches: v.punches.map((p, i) => ({ ...p, photoUrl: byTime[i]?.photoMediaId ? urls.get(byTime[i]!.photoMediaId!) ?? null : null })) };
    }));
  });
  r.put('/attendance/records/:id', requirePermission('attendance.manage'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const { punches, reason } = RecordEdit.parse(req.body);
    const rec = await db.attendanceRecord.findUnique({ where: { id }, include: { punches: true } });
    if (!rec) throw AppError.notFound();
    await assertNotSelf(db, actor(res), rec.employeeId);
    const proposed = toPunches(ymd(rec.workDate), punches);
    const out = await db.$transaction((tx) => replacePunches(tx, id, proposed, 'admin_correction'));
    await audit(db, req, res, { action: 'attendance.edit', entityType: 'attendanceRecord', entityId: id, before: { punches: rec.punches.map((p) => `${p.type} ${p.at.toISOString()}`) }, after: { punches: proposed.map((p) => `${p.type} ${p.at.toISOString()}`), reason } });
    await deps.events.emit('attendance.changed', { employeeId: rec.employeeId, kind: 'edited' });
    res.json(recordView({ ...out, punches: await db.timePunch.findMany({ where: { recordId: id } }) }));
  });
  r.post('/attendance/approve', requirePermission('attendance.approve'), async (req, res) => {
    const { recordIds } = ApproveRecords.parse(req.body);
    const me = await db.employee.findUnique({ where: { userId: actor(res) }, select: { id: true } });
    const done = await db.attendanceRecord.updateMany({
      // Finished days only (not still clocked in or missing a time out), never the approver's own.
      where: { id: { in: recordIds }, approvedAt: null, status: { in: ['PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE', 'HOLIDAY'] }, ...(me ? { employeeId: { not: me.id } } : {}) },
      data: { approvedById: actor(res), approvedAt: new Date() },
    });
    await audit(db, req, res, { action: 'attendance.approve', entityType: 'attendanceRecord', entityId: recordIds.length === 1 ? recordIds[0]! : `${recordIds.length} records`, after: { approved: done.count } });
    if (done.count) await deps.events.emit('attendance.changed', { kind: 'approved' });
    res.json({ approved: done.count, skipped: recordIds.length - done.count });
  });

  // ── corrections ──
  r.get('/corrections', requirePermission('attendance.read'), async (req, res) => {
    const status = z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING').parse(req.query.status);
    const rows = await db.attendanceCorrection.findMany({ where: { status }, orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' }, take: 200, include: { record: { include: { employee: true, punches: true } }, attachment: true } });
    // Attachments are private: a 5-minute signed link per page view, only for people who can read attendance.
    const links = new Map(await Promise.all(rows.filter((c) => c.attachment).map(async (c) => [c.id, { url: await deps.storage.signedUrl(BUCKETS.employeePrivate.id, c.attachment!.path, 300), mimeType: c.attachment!.mimeType }] as const)));
    res.json(rows.map((c) => ({
      attachment: links.get(c.id) ?? null,
      id: c.id, status: c.status, statusLabel: APPROVAL_LABELS[c.status], reason: c.reason, createdAt: c.createdAt.toISOString(),
      employeeId: c.record.employeeId, employee: name(c.record.employee), workDate: ymd(c.record.workDate),
      current: c.record.punches.sort((a, b) => a.at.getTime() - b.at.getTime()).map((p) => ({ type: p.type, at: p.at.toISOString() })),
      proposed: c.proposed as { type: string; at: string }[],
    })));
  });
  r.post('/corrections/:id/decision', requirePermission('attendance.approve'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const { decision, note } = Decision.parse(req.body);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "AttendanceCorrection" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const c = await tx.attendanceCorrection.findUnique({ where: { id }, include: { record: true } });
      if (!c) throw AppError.notFound();
      if (c.status !== 'PENDING') throw AppError.conflict('This correction was already decided.');
      await assertNotSelf(tx, actor(res), c.record.employeeId);
      if (decision === 'APPROVED') {
        const proposed = (c.proposed as { type: 'IN' | 'OUT'; at: string }[]).map((p) => ({ type: p.type, at: new Date(p.at) }));
        await replacePunches(tx, c.recordId, proposed, 'admin_correction');
      }
      await tx.attendanceCorrection.update({ where: { id }, data: { status: decision, decidedById: actor(res), decidedAt: new Date() } });
    });
    await audit(db, req, res, { action: `attendance.correction.${decision.toLowerCase()}`, entityType: 'attendanceCorrection', entityId: id, after: note ? { note } : undefined });
    await deps.events.emit('correction.decided', { correctionId: id });
    res.json({ id, status: decision });
  });

  // ── leave ──
  r.get('/leave', requirePermission('leave.read'), async (req, res) => {
    const q = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(), from: Ymd.optional(), to: Ymd.optional() }).parse(req.query);
    const rows = await db.leaveRequest.findMany({
      where: { ...(q.status ? { status: q.status } : {}), ...(q.from ? { endDate: { gte: toDate(q.from) } } : {}), ...(q.to ? { startDate: { lte: toDate(q.to) } } : {}) },
      orderBy: q.status === 'PENDING' ? { createdAt: 'asc' } : { startDate: 'desc' },
      take: 500,
      include: { employee: true, leaveType: { select: { name: true } } },
    });
    res.json(rows.map((x) => ({ id: x.id, employeeId: x.employeeId, employee: name(x.employee), type: x.leaveType.name, startDate: ymd(x.startDate), endDate: ymd(x.endDate), halfDay: x.halfDay, days: Number(x.days), reason: x.reason, status: x.status, statusLabel: APPROVAL_LABELS[x.status], decisionNote: x.decisionNote, createdAt: x.createdAt.toISOString() })));
  });
  r.post('/leave/:id/decision', requirePermission('leave.approve'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const { decision, note } = Decision.parse(req.body);
    await decideLeave(deps, id, decision, actor(res), note);
    await audit(db, req, res, { action: `leave.${decision.toLowerCase()}`, entityType: 'leaveRequest', entityId: id, after: note ? { note } : undefined });
    await deps.events.emit('leave.decided', { leaveId: id });
    res.json({ id, status: decision });
  });
  r.post('/leave/:id/cancel', requirePermission('leave.approve'), async (req, res) => {
    const id = Id.parse(req.params.id);
    await cancelLeave(deps, id, { userId: actor(res), hr: true });
    await audit(db, req, res, { action: 'leave.cancel', entityType: 'leaveRequest', entityId: id });
    await deps.events.emit('leave.decided', { leaveId: id });
    res.json({ id, status: 'CANCELLED' });
  });
  r.get('/leave/balances', requirePermission('leave.read'), async (req, res) => {
    const year = z.coerce.number().int().min(2000).max(2100).parse(req.query.year ?? manilaDate(new Date()).slice(0, 4));
    const employees = await db.employee.findMany({ where: { employmentStatus: { in: ['ACTIVE', 'PROBATION', 'ON_LEAVE'] } }, orderBy: [{ lastName: 'asc' }], select: { id: true, firstName: true, lastName: true } });
    for (const e of employees) await ensureBalances(db, e.id, year);
    const [types, balances] = await Promise.all([db.leaveType.findMany({ orderBy: { name: 'asc' } }), db.leaveBalance.findMany({ where: { year, employeeId: { in: employees.map((e) => e.id) } } })]);
    res.json({
      year, types: types.map((t) => ({ id: t.id, name: t.name })),
      rows: employees.map((e) => ({ employeeId: e.id, name: name(e), balances: types.map((t) => { const b = balances.find((x) => x.employeeId === e.id && x.leaveTypeId === t.id); return { leaveTypeId: t.id, allotted: Number(b?.allotted ?? 0), used: Number(b?.used ?? 0) }; }) })),
    });
  });
  r.put('/leave/balances', requirePermission('employees.manage'), async (req, res) => {
    const b = BalanceInput.parse(req.body);
    const before = await db.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId: b.employeeId, leaveTypeId: b.leaveTypeId, year: b.year } } });
    if (before && b.allotted < Number(before.used)) throw new AppError(400, 'VALIDATION_ERROR', `${Number(before.used)} days are already used`, [{ path: 'allotted', message: 'Cannot be below days already used' }]);
    const out = await db.leaveBalance.upsert({ where: { employeeId_leaveTypeId_year: { employeeId: b.employeeId, leaveTypeId: b.leaveTypeId, year: b.year } }, create: b, update: { allotted: b.allotted } });
    await audit(db, req, res, { action: 'leave.balance', entityType: 'leaveBalance', entityId: out.id, before: { allotted: before ? Number(before.allotted) : null }, after: { allotted: b.allotted } });
    res.json({ allotted: Number(out.allotted), used: Number(out.used) });
  });
  r.get('/leave-types', requirePermission('leave.read'), async (_req, res) => res.json((await db.leaveType.findMany({ orderBy: { name: 'asc' } })).map((t) => ({ id: t.id, key: t.key, name: t.name, defaultDaysPerYear: Number(t.defaultDaysPerYear) }))));
  r.post('/leave-types', requirePermission('employees.manage'), async (req, res) => {
    const t = LeaveTypeInput.parse(req.body);
    const out = await db.leaveType.create({ data: t }).catch(pgUnique('That key is already used', 'key'));
    await audit(db, req, res, { action: 'leave.type.create', entityType: 'leaveType', entityId: out.id });
    res.status(201).json({ id: out.id, key: out.key, name: out.name, defaultDaysPerYear: Number(out.defaultDaysPerYear) });
  });
  r.put('/leave-types/:id', requirePermission('employees.manage'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const t = LeaveTypeInput.parse(req.body);
    const out = await db.leaveType.update({ where: { id }, data: { name: t.name, defaultDaysPerYear: t.defaultDaysPerYear } });
    await audit(db, req, res, { action: 'leave.type.update', entityType: 'leaveType', entityId: id, after: { name: t.name, defaultDaysPerYear: t.defaultDaysPerYear } });
    res.json({ id: out.id, key: out.key, name: out.name, defaultDaysPerYear: Number(out.defaultDaysPerYear) });
  });

  // ── holidays ──
  r.get('/holidays', requirePermission('attendance.read'), async (req, res) => {
    const year = z.coerce.number().int().min(2000).max(2100).parse(req.query.year ?? manilaDate(new Date()).slice(0, 4));
    res.json((await db.holiday.findMany({ where: { date: { gte: toDate(`${year}-01-01`), lte: toDate(`${year}-12-31`) } }, orderBy: { date: 'asc' } })).map((h) => ({ id: h.id, date: ymd(h.date), name: h.name, type: h.type })));
  });
  r.post('/holidays', requirePermission('employees.manage'), async (req, res) => {
    const h = HolidayInput.parse(req.body);
    const out = await db.holiday.create({ data: { date: toDate(h.date), name: h.name, type: h.type } }).catch(pgUnique('There is already a holiday on that date', 'date'));
    await audit(db, req, res, { action: 'holiday.create', entityType: 'holiday', entityId: out.id, after: h });
    res.status(201).json({ id: out.id, ...h });
  });
  r.delete('/holidays/:id', requirePermission('employees.manage'), async (req, res) => {
    const id = Id.parse(req.params.id);
    await db.holiday.delete({ where: { id } });
    await audit(db, req, res, { action: 'holiday.delete', entityType: 'holiday', entityId: id });
    res.status(204).end();
  });

  // ── reports ──
  r.get('/reports/attendance', requirePermission('reports.attendance'), async (req, res) => {
    const { from, to } = DateRange.parse(req.query);
    const format = z.enum(['json', 'csv', 'xlsx']).default('json').parse(req.query.format);
    const [employees, records] = await Promise.all([
      db.employee.findMany({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], include: { department: { select: { name: true } } } }),
      db.attendanceRecord.findMany({ where: { workDate: { gte: toDate(from), lte: toDate(to) } }, include: { _count: { select: { punches: true } } } }),
    ]);
    const rows = employees
      .map((e) => {
        const mine = records.filter((r) => r.employeeId === e.id);
        const worked = mine.filter((r) => r._count.punches > 0);
        return {
          employeeNo: e.employeeNo, name: name(e), department: e.department?.name ?? '',
          daysWorked: worked.length,
          lateDays: worked.filter((r) => r.lateMinutes > 0).length,
          lateMinutes: mine.reduce((n, r) => n + r.lateMinutes, 0),
          undertimeMinutes: mine.reduce((n, r) => n + r.undertimeMinutes, 0),
          overtimeMinutes: mine.reduce((n, r) => n + r.overtimeMinutes, 0),
          absences: mine.filter((r) => r.status === 'ABSENT').length,
          missingTimeOut: mine.filter((r) => r.status === 'INCOMPLETE').length,
          leaveDays: mine.filter((r) => r.status === 'ON_LEAVE').length,
          workedHours: Math.round(mine.reduce((n, r) => n + r.workedMinutes, 0) / 6) / 10,
          active: e.employmentStatus !== 'RESIGNED' && e.employmentStatus !== 'TERMINATED',
        };
      })
      .filter((x) => x.active || x.daysWorked > 0)
      .map(({ active: _a, ...x }) => x);
    const head = { employeeNo: 'Employee no.', name: 'Name', department: 'Department', daysWorked: 'Days worked', lateDays: 'Days late', lateMinutes: 'Late (min)', undertimeMinutes: 'Undertime (min)', overtimeMinutes: 'Overtime (min, recorded only)', absences: 'Absences', missingTimeOut: 'Missing time out', leaveDays: 'Leave days', workedHours: 'Hours worked' };
    const file = `attendance-${from}-to-${to}`;
    if (format === 'json') return res.json({ from, to, rows });
    if (format === 'csv') {
      const lines = [Object.values(head).map(csvCell).join(','), ...rows.map((x) => Object.keys(head).map((k) => csvCell(x[k as keyof typeof x])).join(','))];
      return res.set('content-type', 'text/csv; charset=utf-8').set('content-disposition', `attachment; filename="${file}.csv"`).send(lines.join('\r\n'));
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Attendance');
    ws.columns = Object.entries(head).map(([key, header]) => ({ key, header, width: Math.max(12, header.length + 2) }));
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    res.set('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').set('content-disposition', `attachment; filename="${file}.xlsx"`);
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  });

  return r;
}

