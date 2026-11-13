// Employee self-service: clock in/out, own records, corrections, leave. Requires a linked Employee record.
import { APPROVAL_LABELS, ATTENDANCE_STATUS_LABELS, CorrectionRequest, EmployeeUploadRequest, DateRange, LeaveRequestInput, PunchInput, z } from '@greenscape/validation';
import { Router, type Response } from 'express';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { registry } from '../../lib/openapi.ts';
import { currentAuth, requirePermission } from '../../middleware/auth.ts';
import { formLimit } from '../../middleware/form-limit.ts';
import { cancelLeave, ensureBalances, punch, requestLeave, toDate, toPunches, today, upcoming, ymd } from './service.ts';
import { addDays, manilaDate } from './time.ts';
import { ATTACHMENT_TYPES, PHOTO_TYPES, reserveUpload, selfieSettings, verifyUpload } from './uploads.ts';

for (const [m, p, s] of [
  ['get', '/v1/me/attendance/today', "Today's schedule, record and whether you are clocked in (attendance.self)"],
  ['post', '/v1/me/attendance/punch', 'Clock in or out with the server time (attendance.self)'],
  ['get', '/v1/me/attendance', 'Own records for ?from&to (attendance.self)'],
  ['post', '/v1/me/attendance/attachments', 'Reserve an upload slot (photo or PDF ≤ 10 MB) for a correction attachment (attachmentId) or a clock-in selfie (photoId)'],
  ['post', '/v1/me/attendance/corrections', 'Ask for a correction of a past day (attendance.self)'],
  ['get', '/v1/me/leave', 'Own leave balances and requests (leave.self)'],
  ['post', '/v1/me/leave', 'Request leave (leave.self)'],
  ['post', '/v1/me/leave/{id}/cancel', 'Withdraw a waiting request (leave.self)'],
] as const) registry.registerPath({ method: m, path: p, tags: ['attendance'], auth: true, summary: s, responses: { 200: { description: 'ok' } } });

export const recordView = (r: { id: string; workDate: Date; status: keyof typeof ATTENDANCE_STATUS_LABELS; approvedAt: Date | null; workedMinutes: number; lateMinutes: number; undertimeMinutes: number; overtimeMinutes: number; punches: { type: string; at: Date; source: string; photoMediaId?: string | null }[]; corrections?: { status: string }[] }) => ({
  id: r.id, workDate: ymd(r.workDate), status: r.status, statusLabel: ATTENDANCE_STATUS_LABELS[r.status], approved: !!r.approvedAt,
  workedMinutes: r.workedMinutes, lateMinutes: r.lateMinutes, undertimeMinutes: r.undertimeMinutes, overtimeMinutes: r.overtimeMinutes,
  punches: [...r.punches].sort((a, b) => a.at.getTime() - b.at.getTime()).map((p) => ({ type: p.type, at: p.at.toISOString(), corrected: p.source !== 'web', photo: !!p.photoMediaId })),
  correctionPending: !!r.corrections?.some((c) => c.status === 'PENDING'),
});

export function attendanceSelfRoutes(deps: Deps) {
  const { db } = deps;
  const r = Router();
  const me = async (res: Response) => {
    const e = await db.employee.findUnique({ where: { userId: currentAuth(res).userId } });
    if (!e) throw new AppError(403, 'NOT_AN_EMPLOYEE', 'Your account is not linked to an employee record. Ask HR to link it.');
    if (e.employmentStatus === 'RESIGNED' || e.employmentStatus === 'TERMINATED') throw new AppError(403, 'NOT_AN_EMPLOYEE', 'Your employment has ended.');
    return e;
  };

  r.get('/me/attendance/today', requirePermission('attendance.self'), async (_req, res) => {
    const e = await me(res);
    const { mode, retentionDays } = await selfieSettings(deps);
    res.set('cache-control', 'no-store').json({ employee: { name: `${e.firstName} ${e.lastName}`, employeeNo: e.employeeNo }, selfie: { mode, retentionDays }, ...(await today(deps, e.id)) });
  });
  // The signed-in employee's own next two weeks (shifts, holidays, approved leave). Nobody else's schedule is reachable here.
  r.get('/me/schedule', requirePermission('attendance.self'), async (_req, res) => {
    const e = await me(res);
    res.set('cache-control', 'no-store').json({ days: await upcoming(deps, e.id) });
  });
  r.post('/me/attendance/punch', requirePermission('attendance.self'), async (req, res) => {
    const e = await me(res);
    const { type, photoId } = PunchInput.parse(req.body);
    const { mode } = await selfieSettings(deps);
    if (mode === 'required' && !photoId) throw new AppError(400, 'SELFIE_REQUIRED', 'Take a selfie to clock in or out.');
    // With selfies off, a photo sent anyway is not kept (nothing is collected that the notice does not mention).
    const photo = mode !== 'off' && photoId ? await verifyUpload(deps, photoId, currentAuth(res).userId, PHOTO_TYPES, 'selfie') : null;
    await punch(deps, e.id, type, req.ip, new Date(), photo?.id);
    res.status(201).json(await today(deps, e.id));
  });
  r.get('/me/attendance', requirePermission('attendance.self'), async (req, res) => {
    const e = await me(res);
    const t = manilaDate(new Date());
    const { from, to } = DateRange.parse({ from: req.query.from ?? addDays(t, -30), to: req.query.to ?? t });
    const rows = await db.attendanceRecord.findMany({ where: { employeeId: e.id, workDate: { gte: toDate(from), lte: toDate(to) } }, orderBy: { workDate: 'desc' }, include: { punches: true, corrections: { select: { status: true } } } });
    res.json(rows.map(recordView));
  });
  // A correction attachment or a clock-in selfie: reserve a slot, upload straight to private storage, then pass the id.
  r.post('/me/attendance/attachments', requirePermission('attendance.self'), formLimit(deps, 'attendance-upload', Math.max(30, deps.env.FORM_RATE_LIMIT_PER_HOUR)), async (req, res) => {
    await me(res);
    const { contentType, size } = EmployeeUploadRequest.parse(req.body);
    res.status(201).json(await reserveUpload(deps, currentAuth(res).userId, contentType, size));
  });
  r.post('/me/attendance/corrections', requirePermission('attendance.self'), async (req, res) => {
    const e = await me(res);
    const input = CorrectionRequest.parse(req.body);
    if (input.attachmentId) await verifyUpload(deps, input.attachmentId, currentAuth(res).userId, ATTACHMENT_TYPES, 'attachment');
    const t = manilaDate(new Date());
    if (input.workDate > t || input.workDate < addDays(t, -31)) throw AppError.badRequest('Corrections are for the last 31 days.');
    const proposed = toPunches(input.workDate, input.punches);
    if (proposed.some((p) => p.at > new Date())) throw AppError.badRequest('A proposed time is in the future.');
    const out = await db.$transaction(async (tx) => {
      const rec = await tx.attendanceRecord.upsert({ where: { employeeId_workDate: { employeeId: e.id, workDate: toDate(input.workDate) } }, create: { employeeId: e.id, workDate: toDate(input.workDate), status: 'ABSENT' }, update: {} });
      if (await tx.attendanceCorrection.findFirst({ where: { recordId: rec.id, status: 'PENDING' } })) throw AppError.conflict('A correction for this day is already waiting.');
      if (input.attachmentId) await tx.mediaAsset.update({ where: { id: input.attachmentId, refCount: 0 }, data: { refCount: 1 } }); // claimed once
      return tx.attendanceCorrection.create({ data: { recordId: rec.id, requestedById: currentAuth(res).userId, reason: input.reason, attachmentId: input.attachmentId, proposed: proposed.map((p) => ({ type: p.type, at: p.at.toISOString() })) } });
    });
    await deps.events.emit('correction.requested', { correctionId: out.id });
    res.status(201).json({ id: out.id, status: out.status });
  });

  r.get('/me/leave', requirePermission('leave.self'), async (_req, res) => {
    const e = await me(res);
    const year = Number(manilaDate(new Date()).slice(0, 4));
    await ensureBalances(db, e.id, year);
    const [balances, requests, types] = await Promise.all([
      db.leaveBalance.findMany({ where: { employeeId: e.id, year }, include: { leaveType: true }, orderBy: { leaveType: { name: 'asc' } } }),
      db.leaveRequest.findMany({ where: { employeeId: e.id }, orderBy: { startDate: 'desc' }, take: 50, include: { leaveType: { select: { name: true } } } }),
      db.leaveType.findMany({ orderBy: { name: 'asc' } }),
    ]);
    res.set('cache-control', 'no-store').json({
      year,
      types: types.map((t) => ({ id: t.id, name: t.name })),
      balances: balances.map((b) => ({ leaveTypeId: b.leaveTypeId, name: b.leaveType.name, allotted: Number(b.allotted), used: Number(b.used), left: Number(b.allotted) - Number(b.used) })),
      requests: requests.map((q) => ({ id: q.id, type: q.leaveType.name, startDate: ymd(q.startDate), endDate: ymd(q.endDate), halfDay: q.halfDay, days: Number(q.days), reason: q.reason, status: q.status, statusLabel: APPROVAL_LABELS[q.status], decisionNote: q.decisionNote })),
    });
  });
  r.post('/me/leave', requirePermission('leave.self'), async (req, res) => {
    const e = await me(res);
    const q = await requestLeave(deps, e.id, LeaveRequestInput.parse(req.body));
    await deps.events.emit('leave.requested', { leaveId: q.id });
    res.status(201).json({ id: q.id, days: Number(q.days), status: q.status });
  });
  r.post('/me/leave/:id/cancel', requirePermission('leave.self'), async (req, res) => {
    const e = await me(res);
    await cancelLeave(deps, z.string().uuid().parse(req.params.id), { userId: currentAuth(res).userId, employeeId: e.id, hr: false });
    res.json({ ok: true });
  });
  return r;
}
