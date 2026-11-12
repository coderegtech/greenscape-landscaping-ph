// Attendance and leave state changes. Times always come from the server clock, never the browser.
// Per-employee changes are serialised with a transaction-scoped advisory lock, so two taps on "Clock in" make one punch.
import { Prisma, type Db } from '@greenscape/database';
import type { z } from '@greenscape/validation';
import type { LeaveRequestInput, ProposedPunch } from '@greenscape/validation';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { addDays, computeDay, leaveDays, manilaDate, manilaInstant, segmentsFor, weekdayOf, workDateFor, type Shift } from './time.ts';
import { purgeOldSelfies } from './uploads.ts';

type Tx = Prisma.TransactionClient | Db;
export const toDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`); // Prisma @db.Date
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
const H = 3_600_000;
/** Without an assigned schedule, leave counts Monday to Saturday (assign a schedule to change it). */
const DEFAULT_WORKWEEK = new Set([1, 2, 3, 4, 5, 6]);
const OPEN_PUNCH_LIMIT_MS = 20 * H;
const lockEmployee = (tx: Prisma.TransactionClient, employeeId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`attendance:${employeeId}`}))`;

export async function scheduleOn(db: Tx, employeeId: string, date: string) {
  const a = await db.scheduleAssignment.findFirst({
    where: { employeeId, effectiveFrom: { lte: toDate(date) }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: toDate(date) } }] },
    orderBy: { effectiveFrom: 'desc' },
    include: { schedule: { include: { shifts: true } } },
  });
  return a?.schedule ?? null;
}

/** When a work date is over: 4 hours after its last scheduled segment, or 04:00 the next morning without a schedule. */
export function dayOverAt(shifts: Shift[], date: string) {
  const segs = segmentsFor(shifts, date);
  return segs.length ? new Date(segs.at(-1)!.end.getTime() + 4 * H) : new Date(manilaInstant(addDays(date, 1), '04:00'));
}

/** Recomputes minutes and status from the punches. Approval is a separate stamp, cleared when `resetApproval` (the punches changed). */
export async function recompute(db: Tx, recordId: string, opts: { now?: Date; resetApproval?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const r = await db.attendanceRecord.findUniqueOrThrow({ where: { id: recordId }, include: { punches: true } });
  const date = ymd(r.workDate);
  const sched = await scheduleOn(db, r.employeeId, date);
  const shifts = sched?.shifts ?? [];
  const res = computeDay(segmentsFor(shifts, date), r.punches.map((p) => ({ type: p.type, at: p.at })), sched?.graceMinutes ?? 0, sched?.isFlexible ?? false);
  const over = now >= dayOverAt(shifts, date);
  let status: typeof r.status;
  if (!r.punches.length) status = r.status === 'ON_LEAVE' || r.status === 'HOLIDAY' ? r.status : 'ABSENT';
  else if (res.open) status = over ? 'INCOMPLETE' : 'OPEN';
  else status = res.lateMinutes > 0 ? 'LATE' : 'PRESENT';
  return db.attendanceRecord.update({
    where: { id: recordId },
    data: {
      workedMinutes: res.workedMinutes, lateMinutes: res.lateMinutes, undertimeMinutes: res.undertimeMinutes, overtimeMinutes: res.overtimeMinutes,
      status,
      ...(opts.resetApproval ? { approvedById: null, approvedAt: null } : {}),
    },
  });
}

// ── clock in / out ──
export async function punch(deps: Pick<Deps, 'db'>, employeeId: string, type: 'IN' | 'OUT', ip: string | undefined, now = new Date(), photoMediaId?: string) {
  return deps.db.$transaction(async (tx) => {
    await lockEmployee(tx, employeeId);
    const last = await tx.timePunch.findFirst({ where: { record: { employeeId } }, orderBy: { at: 'desc' }, include: { record: true } });
    if (last && now.getTime() - last.at.getTime() < 60_000) throw AppError.conflict(`You clocked ${last.type === 'IN' ? 'in' : 'out'} less than a minute ago.`);
    const openIn = last?.type === 'IN' && now.getTime() - last.at.getTime() < OPEN_PUNCH_LIMIT_MS ? last : null;

    let recordId: string;
    if (type === 'OUT') {
      if (!openIn) throw AppError.conflict(last?.type === 'IN' ? 'Your last time in was more than 20 hours ago. Ask for a correction instead.' : 'You are not clocked in.');
      recordId = openIn.recordId;
    } else {
      if (openIn) throw AppError.conflict('You are already clocked in.');
      const sched = await scheduleOn(tx, employeeId, manilaDate(now));
      const date = workDateFor(now, sched?.shifts ?? []);
      const rec = await tx.attendanceRecord.upsert({ where: { employeeId_workDate: { employeeId, workDate: toDate(date) } }, create: { employeeId, workDate: toDate(date), status: 'OPEN' }, update: {} });
      if (rec.approvedAt) throw AppError.conflict('This day is already approved. Ask HR to change it.');
      recordId = rec.id;
    }
    if (photoMediaId) await tx.mediaAsset.update({ where: { id: photoMediaId, refCount: 0 }, data: { refCount: 1 } }); // a selfie is claimed once
    await tx.timePunch.create({ data: { recordId, type, at: now, source: 'web', ip, photoMediaId } });
    return recompute(tx, recordId, { now, resetApproval: false });
  });
}

// ── corrections ──
type Proposed = z.infer<typeof ProposedPunch>;
/** Proposed wall-clock punches → instants, checked to alternate IN, OUT, IN, OUT… and to be in order. */
export function toPunches(workDate: string, proposed: Proposed[]) {
  const out = proposed.map((p) => ({ type: p.type, at: manilaInstant(p.nextDay ? addDays(workDate, 1) : workDate, p.time) }));
  for (let i = 0; i < out.length; i++) {
    if (out[i]!.type !== (i % 2 === 0 ? 'IN' : 'OUT')) throw new AppError(400, 'VALIDATION_ERROR', 'Times must alternate: in, out, in, out.', [{ path: `punches.${i}.type`, message: 'Expected ' + (i % 2 === 0 ? 'time in' : 'time out') }]);
    if (i && out[i]!.at <= out[i - 1]!.at) throw new AppError(400, 'VALIDATION_ERROR', 'Times must be in order.', [{ path: `punches.${i}.time`, message: 'Must be after the time before it' }]);
  }
  return out;
}

export async function replacePunches(tx: Prisma.TransactionClient, recordId: string, punches: { type: 'IN' | 'OUT'; at: Date }[], source: string) {
  await tx.timePunch.deleteMany({ where: { recordId } });
  if (punches.length) await tx.timePunch.createMany({ data: punches.map((p) => ({ recordId, type: p.type, at: p.at, source })) });
  return recompute(tx, recordId, { resetApproval: true });
}

/** Approver must not be deciding their own request. */
export async function assertNotSelf(db: Tx, approverUserId: string, employeeId: string) {
  const e = await db.employee.findUnique({ where: { id: employeeId }, select: { userId: true } });
  if (e?.userId === approverUserId) throw AppError.forbidden('You cannot approve your own request. Ask another approver.');
}

// ── leave ──
export async function ensureBalances(db: Tx, employeeId: string, year: number) {
  const types = await db.leaveType.findMany();
  for (const t of types) {
    await db.leaveBalance.upsert({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: t.id, year } }, create: { employeeId, leaveTypeId: t.id, year, allotted: t.defaultDaysPerYear }, update: {} });
  }
}

export async function workWeekdays(db: Tx, employeeId: string, date: string) {
  const s = await scheduleOn(db, employeeId, date);
  return s?.shifts.length ? new Set(s.shifts.map((x) => x.weekday)) : DEFAULT_WORKWEEK;
}

async function holidaysBetween(db: Tx, from: string, to: string) {
  return new Set((await db.holiday.findMany({ where: { date: { gte: toDate(from), lte: toDate(to) } } })).map((h) => ymd(h.date)));
}

export async function requestLeave(deps: Pick<Deps, 'db'>, employeeId: string, input: LeaveRequestInput) {
  const { db } = deps;
  const type = await db.leaveType.findUnique({ where: { id: input.leaveTypeId } });
  if (!type) throw AppError.badRequest('Unknown type of leave');
  const days = leaveDays(input.startDate, input.endDate, await workWeekdays(db, employeeId, input.startDate), await holidaysBetween(db, input.startDate, input.endDate), input.halfDay);
  if (days === 0) throw new AppError(400, 'VALIDATION_ERROR', 'Those dates are all rest days or holidays.', [{ path: 'startDate', message: 'No working days in this range' }]);
  const year = Number(input.startDate.slice(0, 4));
  return db.$transaction(async (tx) => {
    await lockEmployee(tx, employeeId);
    const overlap = await tx.leaveRequest.findFirst({ where: { employeeId, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: toDate(input.endDate) }, endDate: { gte: toDate(input.startDate) } } });
    if (overlap) throw AppError.conflict('You already have leave on some of those days.');
    await ensureBalances(tx, employeeId, year);
    const bal = await tx.leaveBalance.findUniqueOrThrow({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: type.id, year } } });
    const pending = await tx.leaveRequest.aggregate({ where: { employeeId, leaveTypeId: type.id, status: 'PENDING', startDate: { gte: toDate(`${year}-01-01`), lte: toDate(`${year}-12-31`) } }, _sum: { days: true } });
    const left = Number(bal.allotted) - Number(bal.used) - Number(pending._sum.days ?? 0);
    if (days > left) throw new AppError(400, 'VALIDATION_ERROR', `You have ${left} day${left === 1 ? '' : 's'} of ${type.name.toLowerCase()} left, including requests still waiting.`, [{ path: 'endDate', message: `${days} days requested, ${left} left` }]);
    return tx.leaveRequest.create({ data: { employeeId, leaveTypeId: type.id, startDate: toDate(input.startDate), endDate: toDate(input.endDate), halfDay: input.halfDay, days, reason: input.reason } });
  });
}

/** Approval takes the days from the balance (row-locked) and marks those days as leave in attendance. */
export async function decideLeave(deps: Pick<Deps, 'db'>, id: string, decision: 'APPROVED' | 'REJECTED', approverUserId: string, note?: string) {
  return deps.db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "LeaveRequest" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (!row) throw AppError.notFound('Leave request not found');
    const req = await tx.leaveRequest.findUniqueOrThrow({ where: { id }, include: { leaveType: true } });
    if (req.status !== 'PENDING') throw AppError.conflict('This request was already decided.');
    await assertNotSelf(tx, approverUserId, req.employeeId);
    if (decision === 'APPROVED') {
      const year = req.startDate.getUTCFullYear();
      await ensureBalances(tx, req.employeeId, year);
      await tx.$queryRaw`SELECT 1 FROM "LeaveBalance" WHERE "employeeId" = ${req.employeeId}::uuid AND "leaveTypeId" = ${req.leaveTypeId}::uuid AND "year" = ${year} FOR UPDATE`;
      const bal = await tx.leaveBalance.findUniqueOrThrow({ where: { employeeId_leaveTypeId_year: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, year } } });
      if (Number(bal.allotted) - Number(bal.used) < Number(req.days)) throw AppError.conflict(`Not enough ${req.leaveType.name.toLowerCase()} left (${Number(bal.allotted) - Number(bal.used)} days). Adjust the balance first.`);
      await tx.leaveBalance.update({ where: { id: bal.id }, data: { used: { increment: req.days } } });
      const start = ymd(req.startDate), end = ymd(req.endDate);
      const week = await workWeekdays(tx, req.employeeId, start);
      const hols = await holidaysBetween(tx, start, end);
      for (let d = start; d <= end; d = addDays(d, 1)) {
        if (!week.has(weekdayOf(d)) || hols.has(d)) continue;
        const rec = await tx.attendanceRecord.upsert({ where: { employeeId_workDate: { employeeId: req.employeeId, workDate: toDate(d) } }, create: { employeeId: req.employeeId, workDate: toDate(d), status: 'ON_LEAVE' }, update: {}, include: { _count: { select: { punches: true } } } });
        if (!rec._count.punches && !rec.approvedAt) await tx.attendanceRecord.update({ where: { id: rec.id }, data: { status: 'ON_LEAVE' } });
      }
    }
    return tx.leaveRequest.update({ where: { id }, data: { status: decision, decidedById: approverUserId, decidedAt: new Date(), decisionNote: note } });
  });
}

/** Withdraw a request: pending ones by the employee; approved ones by HR, which gives the days back. */
export async function cancelLeave(deps: Pick<Deps, 'db'>, id: string, by: { userId: string; employeeId?: string; hr: boolean }) {
  return deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "LeaveRequest" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const req = await tx.leaveRequest.findUnique({ where: { id } });
    if (!req || (!by.hr && req.employeeId !== by.employeeId)) throw AppError.notFound('Leave request not found');
    if (req.status === 'APPROVED' && !by.hr) throw AppError.conflict('This leave is already approved. Ask HR to cancel it.');
    if (req.status !== 'PENDING' && req.status !== 'APPROVED') throw AppError.conflict('This request is already closed.');
    if (req.status === 'APPROVED') {
      await tx.leaveBalance.update({ where: { employeeId_leaveTypeId_year: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, year: req.startDate.getUTCFullYear() } }, data: { used: { decrement: req.days } } });
      await tx.attendanceRecord.deleteMany({ where: { employeeId: req.employeeId, status: 'ON_LEAVE', workDate: { gte: req.startDate, lte: req.endDate }, punches: { none: {} } } });
    }
    return tx.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED', decidedById: by.userId, decidedAt: new Date() } });
  });
}

// ── day close ──
/**
 * For the last two days: scheduled employees with no record become ABSENT (or HOLIDAY / ON_LEAVE), and records still
 * clocked in after the day is over become INCOMPLETE. Idempotent; runs every 15 minutes under a Redis lock.
 */
export async function closeDays(deps: Pick<Deps, 'db'>, now = new Date()) {
  const { db } = deps;
  const today = manilaDate(now);
  let changed = 0;
  const stale = await db.attendanceRecord.findMany({ where: { status: 'OPEN', workDate: { lte: toDate(today) } }, select: { id: true } });
  for (const r of stale) {
    const before = await db.attendanceRecord.findUniqueOrThrow({ where: { id: r.id }, select: { status: true } });
    const after = await recompute(db, r.id, { now });
    if (after.status !== before.status) changed++;
  }
  const employees = await db.employee.findMany({ where: { employmentStatus: { in: ['ACTIVE', 'PROBATION'] } }, select: { id: true } });
  for (const d of [addDays(today, -2), addDays(today, -1)]) {
    const holiday = await db.holiday.findUnique({ where: { date: toDate(d) } });
    for (const e of employees) {
      const sched = await scheduleOn(db, e.id, d);
      if (!sched || !segmentsFor(sched.shifts, d).length || now < dayOverAt(sched.shifts, d)) continue;
      const exists = await db.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: e.id, workDate: toDate(d) } }, select: { id: true } });
      if (exists) continue;
      const onLeave = await db.leaveRequest.findFirst({ where: { employeeId: e.id, status: 'APPROVED', startDate: { lte: toDate(d) }, endDate: { gte: toDate(d) } }, select: { id: true } });
      const status = holiday && holiday.type !== 'special_working' ? 'HOLIDAY' : onLeave ? 'ON_LEAVE' : 'ABSENT';
      await db.attendanceRecord.create({ data: { employeeId: e.id, workDate: toDate(d), status } }).then(() => changed++).catch((err) => {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err; // clocked in meanwhile
      });
    }
  }
  return changed;
}

export function startAttendanceJobs(deps: Deps, everyMs = 15 * 60_000) {
  const tick = async () => {
    const got = await deps.redis.set(`${deps.env.CACHE_PREFIX}:lock:attendance-close`, '1', 'PX', everyMs - 1000, 'NX').catch(() => 'OK');
    if (!got) return;
    const n = await closeDays(deps);
    if (n) deps.log.info({ changed: n }, 'attendance days closed');
    const purged = await purgeOldSelfies(deps);
    if (purged) deps.log.info({ purged }, 'clock-in selfies past retention deleted');
  };
  const timer = setInterval(() => void tick().catch((err) => deps.log.error({ err }, 'attendance job failed')), everyMs);
  timer.unref();
  return { stop: () => clearInterval(timer), tick };
}

/** Today's view for an employee: schedule segments, record, and which button to show. */
export async function today(deps: Pick<Deps, 'db'>, employeeId: string, now = new Date()) {
  const { db } = deps;
  const last = await db.timePunch.findFirst({ where: { record: { employeeId } }, orderBy: { at: 'desc' } });
  const clockedIn = last?.type === 'IN' && now.getTime() - last.at.getTime() < OPEN_PUNCH_LIMIT_MS;
  const sched = await scheduleOn(db, employeeId, manilaDate(now));
  const date = clockedIn && last ? ymd((await db.attendanceRecord.findUniqueOrThrow({ where: { id: last.recordId } })).workDate) : workDateFor(now, sched?.shifts ?? []);
  const rec = await db.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId, workDate: toDate(date) } }, include: { punches: { orderBy: { at: 'asc' } } } });
  const daySched = await scheduleOn(db, employeeId, date);
  return {
    workDate: date,
    clockedIn,
    since: clockedIn ? last!.at.toISOString() : null,
    schedule: daySched ? { name: daySched.name, flexible: daySched.isFlexible, segments: segmentsFor(daySched.shifts, date).map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })) } : null,
    record: rec ? { status: rec.status, workedMinutes: rec.workedMinutes, lateMinutes: rec.lateMinutes, undertimeMinutes: rec.undertimeMinutes, overtimeMinutes: rec.overtimeMinutes, punches: rec.punches.map((p) => ({ type: p.type, at: p.at.toISOString() })) } : null,
  };
}
