// Attendance, leave and employee contracts. No pay, salary, allowance or government-ID fields exist here on purpose
// (docs/audit/migration-risks.md R2): this system records time, it never computes pay.
import { z } from 'zod';
import { Email, PhPhone } from './primitives.ts';

export const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'Not a real date');
export const HHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time like 08:00');

export const EMPLOYMENT_STATUSES = { ACTIVE: 'Active', PROBATION: 'Probation', ON_LEAVE: 'On leave', RESIGNED: 'Resigned', TERMINATED: 'Terminated' } as const;
export const ATTENDANCE_STATUS_LABELS = { OPEN: 'Clocked in', PRESENT: 'Present', LATE: 'Late', ABSENT: 'Absent', ON_LEAVE: 'On leave', HOLIDAY: 'Holiday', INCOMPLETE: 'Missing time out', APPROVED: 'Approved' } as const;
export const APPROVAL_LABELS = { PENDING: 'Waiting', APPROVED: 'Approved', REJECTED: 'Declined', CANCELLED: 'Cancelled' } as const;
export const HOLIDAY_TYPES = { regular: 'Regular holiday', special_non_working: 'Special non-working day', special_working: 'Special working day' } as const;
const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const optText = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

export const EmployeeInput = z.object({
  employeeNo: z.string().trim().regex(/^[A-Z0-9-]{2,20}$/, 'Capital letters, numbers and dashes'),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: Email.optional().or(z.literal('').transform(() => undefined)),
  mobile: PhPhone.optional().or(z.literal('').transform(() => undefined)),
  position: optText(80),
  departmentId: z.string().uuid().nullish(),
  managerId: z.string().uuid().nullish(),
  employmentStatus: z.enum(keys(EMPLOYMENT_STATUSES)),
  hiredOn: Ymd.nullish().or(z.literal('').transform(() => null)),
});
export type EmployeeInput = z.infer<typeof EmployeeInput>;

export const ShiftInput = z.object({ weekday: z.number().int().min(0).max(6), startTime: HHmm, endTime: HHmm, breakMinutes: z.coerce.number().int().min(0).max(240).default(0) })
  .refine((s) => s.startTime !== s.endTime, { path: ['endTime'], message: 'End must differ from start' });
export const ScheduleInput = z.object({
  name: z.string().trim().min(2).max(80),
  graceMinutes: z.coerce.number().int().min(0).max(60).default(10),
  isFlexible: z.boolean().default(false),
  shifts: z.array(ShiftInput).max(21),
});
export const AssignSchedule = z.object({ scheduleId: z.string().uuid(), effectiveFrom: Ymd });

export const PunchInput = z.object({ type: z.enum(['IN', 'OUT']), /** Clock-in selfie from the upload slot, when HR turned selfies on. */ photoId: z.string().uuid().optional() });
/** Clock-in selfie policy (decision D6: off unless HR turns it on). Photos are deleted after retentionDays. */
export const SelfieSettings = z.object({ mode: z.enum(['off', 'optional', 'required']).default('off'), retentionDays: z.number().int().min(7).max(365).default(90) });
export type SelfieSettings = z.infer<typeof SelfieSettings>;
/** Proposed punches for one work date, as Manila wall-clock times; nextDay marks times after midnight (overnight shifts). */
export const ProposedPunch = z.object({ type: z.enum(['IN', 'OUT']), time: HHmm, nextDay: z.boolean().default(false) });
export const CorrectionRequest = z.object({
  workDate: Ymd,
  punches: z.array(ProposedPunch).min(1).max(8),
  reason: z.string().trim().min(5, 'Tell your manager what happened').max(500),
  /** Optional supporting photo or PDF, from POST /v1/me/attendance/attachments. */
  attachmentId: z.string().uuid().optional(),
});
/** Photos or a PDF, 10 MB at most (employee-private bucket limits). */
export const CORRECTION_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
/** Upload slot for a correction attachment or a clock-in selfie. */
export const EmployeeUploadRequest = z.object({
  contentType: z.enum(CORRECTION_ATTACHMENT_TYPES, { error: 'A photo (JPG, PNG, WebP) or a PDF' }),
  size: z.number().int().positive().max(10 * 1024 * 1024, 'Files must be 10 MB or smaller'),
});
export const RecordEdit = z.object({ punches: z.array(ProposedPunch).max(8), reason: z.string().trim().min(5).max(500) });
export const Decision = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: optText(500) });
export const ApproveRecords = z.object({ recordIds: z.array(z.string().uuid()).min(1).max(200) });

export const LeaveRequestInput = z
  .object({ leaveTypeId: z.string().uuid('Choose a type of leave'), startDate: Ymd, endDate: Ymd, halfDay: z.boolean().default(false), reason: optText(500) })
  .refine((v) => v.endDate >= v.startDate, { path: ['endDate'], message: 'The last day cannot be before the first' })
  .refine((v) => v.startDate.slice(0, 4) === v.endDate.slice(0, 4), { path: ['endDate'], message: 'Split leave that crosses into a new year into two requests' })
  .refine((v) => !v.halfDay || v.startDate === v.endDate, { path: ['halfDay'], message: 'A half day is a single day' });
export type LeaveRequestInput = z.infer<typeof LeaveRequestInput>;

export const LeaveTypeInput = z.object({ key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/), name: z.string().trim().min(2).max(60), defaultDaysPerYear: z.coerce.number().min(0).max(366) });
export const BalanceInput = z.object({ employeeId: z.string().uuid(), leaveTypeId: z.string().uuid(), year: z.coerce.number().int().min(2000).max(2100), allotted: z.coerce.number().min(0).max(366) });
export const HolidayInput = z.object({ date: Ymd, name: z.string().trim().min(2).max(80), type: z.enum(keys(HOLIDAY_TYPES)) });

export const DateRange = z
  .object({ from: Ymd, to: Ymd })
  .refine((v) => v.to >= v.from, { path: ['to'], message: 'End before start' })
  .refine((v) => Date.parse(v.to) - Date.parse(v.from) <= 366 * 86_400_000, { path: ['to'], message: 'At most one year at a time' });
