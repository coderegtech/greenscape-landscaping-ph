import { describe, expect, it } from 'vitest';
import { addDays, computeDay, leaveDays, manilaDate, manilaInstant, pairPunches, segmentsFor, weekdayOf, workDateFor, type Punch, type Shift } from '../../apps/api/src/modules/attendance/time.ts';

const at = (date: string, hhmm: string) => manilaInstant(date, hhmm);
const p = (type: 'IN' | 'OUT', date: string, hhmm: string): Punch => ({ type, at: at(date, hhmm) });
const MON = '2026-11-09'; // a Monday
const weekdays = (startTime: string, endTime: string, breakMinutes = 0): Shift[] => [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime, endTime, breakMinutes }));
const split: Shift[] = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [{ weekday, startTime: '08:00', endTime: '12:00', breakMinutes: 0 }, { weekday, startTime: '13:00', endTime: '17:00', breakMinutes: 0 }]);
const night = weekdays('22:00', '06:00', 60);

describe('Manila dates (UTC+8, no DST)', () => {
  it('converts wall clock and dates', () => {
    expect(at(MON, '08:00').toISOString()).toBe('2026-11-09T00:00:00.000Z');
    expect(manilaDate(new Date('2026-11-09T16:30:00Z'))).toBe('2026-11-10'); // 00:30 Tuesday in Manila
    expect(manilaDate(new Date('2026-11-09T15:59:00Z'))).toBe('2026-11-09');
    expect(weekdayOf(MON)).toBe(1);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29'); // leap year
  });
  it('builds overnight segments that end the next day', () => {
    const [s] = segmentsFor(night, MON);
    expect(s!.start.toISOString()).toBe('2026-11-09T14:00:00.000Z');
    expect(s!.end.toISOString()).toBe('2026-11-09T22:00:00.000Z'); // 06:00 Tuesday Manila
    expect(segmentsFor(night, '2026-11-08')).toEqual([]); // Sunday
  });
});

describe('work date of a punch', () => {
  it('a 01:00 punch belongs to the overnight shift that started the evening before', () => {
    expect(workDateFor(at('2026-11-10', '01:00'), night)).toBe(MON);
    expect(workDateFor(at('2026-11-10', '05:50'), night)).toBe(MON);
    expect(workDateFor(at(MON, '21:40'), night)).toBe(MON);
  });
  it('day shifts and unscheduled days use the Manila calendar date', () => {
    expect(workDateFor(at(MON, '07:55'), split)).toBe(MON);
    expect(workDateFor(at('2026-11-08', '10:00'), split)).toBe('2026-11-08'); // Sunday, no shift
    expect(workDateFor(at(MON, '23:59'), [])).toBe(MON);
  });
});

describe('daily computation', () => {
  const day = split.filter((s) => s.weekday === 1);
  it('on time for a split shift: no late, no undertime', () => {
    const r = computeDay(segmentsFor(day, MON), [p('IN', MON, '07:55'), p('OUT', MON, '12:01'), p('IN', MON, '12:58'), p('OUT', MON, '17:03')], 10, false);
    expect(r).toEqual({ workedMinutes: 491, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 3, open: false });
  });
  it('grace period: 10 minutes late is on time, 11 minutes late counts in full', () => {
    const segs = segmentsFor(day, MON);
    expect(computeDay(segs, [p('IN', MON, '08:10'), p('OUT', MON, '12:00'), p('IN', MON, '13:00'), p('OUT', MON, '17:00')], 10, false).lateMinutes).toBe(0);
    expect(computeDay(segs, [p('IN', MON, '08:11'), p('OUT', MON, '12:00'), p('IN', MON, '13:20'), p('OUT', MON, '17:00')], 10, false).lateMinutes).toBe(31); // 11 + 20
  });
  it('leaving early and skipping the afternoon is undertime', () => {
    const r = computeDay(segmentsFor(day, MON), [p('IN', MON, '08:00'), p('OUT', MON, '11:30')], 10, false);
    expect(r).toMatchObject({ workedMinutes: 210, undertimeMinutes: 30 + 240, lateMinutes: 0 });
  });
  it('overnight shift with a one-hour break and overtime past 06:00', () => {
    const r = computeDay(segmentsFor(night, MON), [p('IN', MON, '21:58'), p('OUT', '2026-11-10', '07:15')], 10, false);
    expect(r).toEqual({ workedMinutes: 9 * 60 + 17 - 60, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 75, open: false });
  });
  it('an open punch is reported as open and is not judged for undertime yet', () => {
    const r = computeDay(segmentsFor(day, MON), [p('IN', MON, '08:20')], 10, false);
    expect(r).toMatchObject({ open: true, lateMinutes: 20, undertimeMinutes: 0, workedMinutes: 0 });
  });
  it('flexible schedules only count worked time', () => {
    expect(computeDay(segmentsFor(day, MON), [p('IN', MON, '10:00'), p('OUT', MON, '15:00')], 10, true)).toEqual({ workedMinutes: 300, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0, open: false });
  });
  it('break is capped at the time actually spent in the segment', () => {
    const one = weekdays('08:00', '17:00', 60).filter((s) => s.weekday === 1);
    expect(computeDay(segmentsFor(one, MON), [p('IN', MON, '16:30'), p('OUT', MON, '17:00')], 10, false).workedMinutes).toBe(0);
  });
  it('stray and duplicate punches are ignored when pairing', () => {
    expect(pairPunches([p('OUT', MON, '07:00'), p('IN', MON, '08:00'), p('IN', MON, '08:05'), p('OUT', MON, '12:00'), p('OUT', MON, '12:10')])).toEqual([{ in: at(MON, '08:00'), out: at(MON, '12:00') }]);
  });
});

describe('leave days', () => {
  const monSat = new Set([1, 2, 3, 4, 5, 6]);
  it('counts scheduled working days, skipping Sundays and holidays', () => {
    expect(leaveDays('2026-11-09', '2026-11-15', monSat, new Set())).toBe(6);
    expect(leaveDays('2026-11-27', '2026-12-01', monSat, new Set(['2026-11-30']))).toBe(3); // Fri, Sat, Tue (Sunday rest, Monday holiday)
    expect(leaveDays('2026-11-09', '2026-11-09', monSat, new Set(), true)).toBe(0.5);
    expect(leaveDays('2026-11-08', '2026-11-08', monSat, new Set(), true)).toBe(0); // half day on a rest day
    expect(leaveDays('2026-11-10', '2026-11-09', monSat, new Set())).toBe(0);
  });
});
