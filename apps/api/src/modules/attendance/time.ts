// Attendance time math. Pure functions, no I/O: every rule lives here and is unit-tested.
// Asia/Manila is UTC+8 all year (no daylight saving), so wall-clock ↔ instant is a fixed 8-hour shift.
// Dates are 'YYYY-MM-DD' strings in Manila; instants are Date objects (UTC inside).

const OFFSET_MS = 8 * 3_600_000;
const MIN = 60_000;
/** A punch this close to a shift (before its start or after its end) belongs to that shift's work date. */
export const SHIFT_WINDOW_MS = 4 * 3_600_000;

export interface Shift { weekday: number; startTime: string; endTime: string; breakMinutes: number }
export interface Segment { start: Date; end: Date; breakMinutes: number }
export interface Punch { type: 'IN' | 'OUT'; at: Date }

/** Manila calendar date of an instant. */
export const manilaDate = (at: Date) => new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10);
/** The instant of a Manila wall-clock time ("HH:mm") on a Manila date. */
export const manilaInstant = (date: string, hhmm: string) => new Date(Date.parse(`${date}T${hhmm}:00Z`) - OFFSET_MS);
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const minutes = (a: Date, b: Date) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / MIN));

/** The scheduled segments of a work date. A segment whose end is not after its start runs overnight into the next day. */
export function segmentsFor(shifts: Shift[], workDate: string): Segment[] {
  const wd = weekdayOf(workDate);
  return shifts
    .filter((s) => s.weekday === wd)
    .map((s) => {
      const start = manilaInstant(workDate, s.startTime);
      let end = manilaInstant(workDate, s.endTime);
      if (end <= start) end = new Date(end.getTime() + 86_400_000);
      return { start, end, breakMinutes: s.breakMinutes };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Which work date a clock-in belongs to: a shift whose window (start − 4 h … end + 4 h) contains it wins, preferring
 * yesterday's overnight shift (so 01:00 on Tuesday is part of Monday's 22:00–06:00 shift). Otherwise the Manila date.
 */
export function workDateFor(at: Date, shifts: Shift[]): string {
  const today = manilaDate(at);
  for (const d of [addDays(today, -1), today, addDays(today, 1)]) {
    if (segmentsFor(shifts, d).some((s) => at.getTime() >= s.start.getTime() - SHIFT_WINDOW_MS && at.getTime() <= s.end.getTime() + SHIFT_WINDOW_MS)) return d;
  }
  return today;
}

/** IN/OUT pairs in time order. An IN without an OUT is open; an OUT without an IN is ignored. */
export function pairPunches(punches: Punch[]) {
  const pairs: { in: Date; out: Date | null }[] = [];
  for (const p of [...punches].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const last = pairs.at(-1);
    if (p.type === 'IN') {
      if (!last || last.out) pairs.push({ in: p.at, out: null });
    } else if (last && !last.out) last.out = p.at;
  }
  return pairs;
}

export interface DayResult { workedMinutes: number; lateMinutes: number; undertimeMinutes: number; overtimeMinutes: number; open: boolean }

/**
 * Rules (per scheduled segment, so a split morning/afternoon shift is judged twice):
 *  • late: first time in after start + grace counts in full from the start (11 min late with 10 min grace = 11);
 *  • undertime: last time out before the segment's end; a segment with no time at all counts in full (less its break);
 *  • overtime: time out after the last segment's end. Recorded only; this system never computes pay;
 *  • worked: paired time, less each attended segment's break (capped at the time spent in that segment).
 * Flexible or unscheduled days only count worked time.
 */
export function computeDay(segments: Segment[], punches: Punch[], graceMinutes: number, flexible: boolean): DayResult {
  const pairs = pairPunches(punches);
  const open = pairs.some((p) => !p.out);
  const closed = pairs.filter((p): p is { in: Date; out: Date } => !!p.out);
  const overlap = (p: { in: Date; out: Date }, s: Segment) => minutes(new Date(Math.max(p.in.getTime(), s.start.getTime())), new Date(Math.min(p.out.getTime(), s.end.getTime())));

  let worked = closed.reduce((n, p) => n + minutes(p.in, p.out), 0);
  for (const s of segments) {
    const inSeg = closed.reduce((n, p) => n + overlap(p, s), 0);
    if (inSeg > 0) worked -= Math.min(s.breakMinutes, inSeg);
  }
  const result: DayResult = { workedMinutes: Math.max(0, worked), lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0, open };
  if (flexible || !segments.length) return result;

  for (const s of segments) {
    const touching = pairs.filter((p) => p.in < s.end && (p.out ?? new Date(8.64e15)) > s.start);
    if (!touching.length) {
      if (!open) result.undertimeMinutes += Math.max(0, minutes(s.start, s.end) - s.breakMinutes);
      continue;
    }
    const firstIn = touching[0]!.in;
    if (firstIn.getTime() > s.start.getTime() + graceMinutes * MIN) result.lateMinutes += minutes(s.start, firstIn);
    const last = touching.at(-1)!;
    if (last.out && last.out < s.end) result.undertimeMinutes += minutes(last.out, s.end);
  }
  const lastOut = closed.at(-1)?.out;
  const lastEnd = segments.at(-1)!.end;
  if (lastOut && lastOut > lastEnd) result.overtimeMinutes = minutes(lastEnd, lastOut);
  return result;
}

/** Leave days between two dates inclusive: only days the employee is scheduled to work, minus holidays. Half day = 0.5. */
export function leaveDays(start: string, end: string, workWeekdays: Set<number>, holidays: Set<string>, halfDay = false): number {
  if (end < start) return 0;
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (workWeekdays.has(weekdayOf(d)) && !holidays.has(d)) n++;
  return halfDay ? Math.min(n, 1) / 2 : n;
}
