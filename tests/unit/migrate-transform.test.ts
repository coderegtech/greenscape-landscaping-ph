// Synthetic records only (no real export exists in this repository): shapes follow the old admin's public code.
import { describe, expect, it } from 'vitest';
import { authUser, employee, leave, message, parseWhen, quotation, testimonial, timeLog, timeOn } from '../../scripts/migrate/lib/transform.ts';

describe('migration transforms', () => {
  it('reads every Firestore timestamp shape', () => {
    const iso = '2025-11-20T01:00:00.000Z';
    expect(parseWhen(iso)?.toISOString()).toBe(iso);
    expect(parseWhen({ seconds: 1763600400, nanoseconds: 0 })?.toISOString()).toBe(iso);
    expect(parseWhen({ _seconds: 1763600400 })?.toISOString()).toBe(iso);
    expect(parseWhen(1763600400000)?.toISOString()).toBe(iso);
    expect(parseWhen('not a date')).toBeNull();
  });

  it('reads wall-clock times as Manila time', () => {
    expect(timeOn('2025-11-20', '08:05')?.toISOString()).toBe('2025-11-20T00:05:00.000Z');
    expect(timeOn('2025-11-20', '4:30 PM')?.toISOString()).toBe('2025-11-20T08:30:00.000Z');
    expect(timeOn('2025-11-20', '12:10 am')?.toISOString()).toBe('2025-11-19T16:10:00.000Z');
    expect(timeOn('2025-11-20', '25:00')).toBeNull();
  });

  it('employees: pay and government-ID fields are dropped by name, never copied', () => {
    const r = employee({ id: 'emp1', name: 'Juan Dela Cruz', designation: 'Gardener', status: 'Active', dailyRate: 999, sss: '00-0000000-0', pagibig: 'x', foodAllowance: 1 });
    expect(r.ok && r.value).toMatchObject({ firstName: 'Juan Dela', lastName: 'Cruz', position: 'Gardener', employmentStatus: 'ACTIVE', employeeNo: 'LEG-EMP1' });
    expect(r.ok && r.dropped.sort()).toEqual(['dailyRate', 'foodAllowance', 'pagibig', 'sss']);
    expect(JSON.stringify(r)).not.toMatch(/999|00-0000000-0/);
  });

  it('time logs: four daily times become ordered punches; photos are dropped', () => {
    const r = timeLog({ id: 't1', employeeId: 'emp1', date: '2025-11-20', morningIn: '7:58 AM', morningOut: '12:01 PM', afternoonIn: '12:59 PM', afternoonOut: '5:03 PM', timeInPhoto: 'https://x/photo.jpg' });
    expect(r.ok && r.value.punches.map((p) => p.type)).toEqual(['IN', 'OUT', 'IN', 'OUT']);
    expect(r.ok && r.dropped).toEqual(['timeInPhoto']);
    expect(timeLog({ id: 't2', employeeId: 'emp1', date: '2025-11-20' })).toEqual({ ok: false, reason: 'no times' });
    expect(timeLog({ id: 't3', date: '2025-11-20', morningIn: '8:00' })).toEqual({ ok: false, reason: 'no employee' });
  });

  it('quotations: statuses and services mapped, unknown services kept as "other" and reported', () => {
    const r = quotation({ id: 'q1', name: 'Maria Santos', email: 'Maria@Example.com', phone: '09171234567', service: 'Pond building', status: 'completed', message: 'Koi pond please', submittedAt: { seconds: 1763600400 } });
    expect(r.ok && r.value).toMatchObject({ email: 'maria@example.com', services: ['other'], unmappedService: 'pond building', status: 'WON', details: 'Koi pond please' });
    expect(quotation({ id: 'q2', name: 'x', email: 'nope' })).toEqual({ ok: false, reason: 'no valid email' });
  });

  it('leave: dates, type and status; a request crossing the year is rejected for a person to split', () => {
    const r = leave({ id: 'l1', employeeId: 'emp1', leaveType: 'Sick', startDate: '2025-11-20T00:00:00+08:00', endDate: '2025-11-21T00:00:00+08:00', status: 'approved', paid: true });
    expect(r.ok && r.value).toMatchObject({ startDate: '2025-11-20', endDate: '2025-11-21', leaveType: 'Sick', status: 'APPROVED' });
    expect(r.ok && r.dropped).toEqual(['paid']);
    expect(leave({ id: 'l2', employeeId: 'e', startDate: '2025-12-30T00:00:00+08:00', endDate: '2026-01-02T00:00:00+08:00' })).toEqual({ ok: false, reason: 'crosses a year (split it by hand)' });
  });

  it('users, feedback and messages', () => {
    const u = authUser({ localId: 'uid1', email: 'A@B.co', emailVerified: true, providerUserInfo: [{ providerId: 'google.com' }], passwordHash: 'h', createdAt: '1700000000000' });
    expect(u.ok && u.value).toMatchObject({ uid: 'uid1', email: 'a@b.co', emailVerified: true, providers: ['google.com'] });
    expect(u.ok && u.dropped).toEqual(['passwordHash']);
    const t = testimonial({ id: 'f1', name: 'Ana', text: 'Great team', rating: 9, status: 'pending', userPhoto: 'https://lh3/x', email: 'a@b.co' });
    expect(t.ok && t.value).toMatchObject({ rating: 5, status: 'pending' });
    expect(t.ok && t.dropped.sort()).toEqual(['email', 'userPhoto']);
    expect(message({ id: 'm1', conversationId: 'c1', text: 'Hi', isAdmin: true, timestamp: 1763600400000 })).toMatchObject({ ok: true, value: { fromStaff: true } });
    expect(message({ id: 'm2', conversationId: 'c1', text: '  ' })).toEqual({ ok: false, reason: 'empty message' });
  });
});
