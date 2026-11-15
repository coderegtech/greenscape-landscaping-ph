import { LIVE_TOPICS } from '@greenscape/validation';
import { describe, expect, it } from 'vitest';
import { roomsFor, TOPIC_PERMISSION } from '../../apps/api/src/realtime/server.ts';
import { topicsFor } from '../../apps/admin/lib/live-topics.ts';

describe('realtime rooms (server-assigned, never client-chosen)', () => {
  const perms = (...p: string[]) => new Set(p);
  it('a customer gets only their own rooms', () => {
    expect(roomsFor({ userId: 'u1', app: 'web', sessionId: 's1', permissions: perms('profile.self', 'orders.self') })).toEqual(['user:u1', 'inbox:web:u1', 'session:s1']);
  });
  it('an employee gets no staff rooms, even on the admin app with self-service permissions only', () => {
    expect(roomsFor({ userId: 'e1', app: 'employee', permissions: perms('attendance.self', 'leave.self') })).toEqual(['user:e1', 'inbox:employee:e1']);
    expect(roomsFor({ userId: 'e1', app: 'admin', permissions: perms('attendance.self') }).some((r) => r.startsWith('perm:'))).toBe(false);
  });
  it('staff join a topic room only for read permissions they hold, and only on the admin app', () => {
    const hr = perms('admin.access', 'attendance.read', 'leave.read', 'employees.read');
    expect(roomsFor({ userId: 'h1', app: 'admin', permissions: hr }).filter((r) => r.startsWith('perm:')).sort()).toEqual(['perm:attendance.read', 'perm:employees.read', 'perm:leave.read']);
    expect(roomsFor({ userId: 'h1', app: 'employee', permissions: hr }).some((r) => r.startsWith('perm:'))).toBe(false);
  });
  it('every topic is guarded by a read permission', () => {
    for (const t of LIVE_TOPICS) expect(TOPIC_PERMISSION[t]).toMatch(/\.read$/);
  });
});

describe('admin live topics per page', () => {
  it('the dashboard follows attendance and everything the menu badges count', () => {
    expect(topicsFor('/')).toEqual(expect.arrayContaining(['attendance', 'orders', 'leave', 'corrections']));
  });
  it('a page adds its own topics; unrelated pages skip attendance', () => {
    expect(topicsFor('/attendance/corrections')).toContain('attendance');
    expect(topicsFor('/products/abc')).toContain('products');
    expect(topicsFor('/cms')).not.toContain('attendance');
  });
});
