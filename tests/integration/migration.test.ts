// The private-data importer against a SYNTHETIC export (no real export exists here; see docs/migration-plan.md).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collections } from '@greenscape/content';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { reportMarkdown, runImport } from '../../scripts/migrate/lib/load.ts';
import { testDeps } from './helpers.ts';
import { adminClient } from './supabase.ts';

const tag = `mig${Date.now()}`;
const L = (id: string) => `${tag}-${id}`; // legacy ids unique to this run
const newEmail = `newcustomer-${tag}@test.greenscape.local`;
const existingEmail = `existing-${tag}@test.greenscape.local`;
let deps: Deps;
let dir = '';
const supabase = adminClient();
let existingUserId = '';

const files = () => ({
  'auth-users.json': { users: [
    { localId: L('uid-new'), email: newEmail, emailVerified: true, displayName: 'New Customer', providerUserInfo: [{ providerId: 'google.com' }], passwordHash: 'never-copied', createdAt: '1730000000000' },
    { localId: L('uid-old'), email: existingEmail.toUpperCase(), emailVerified: true },
    { localId: L('uid-bad'), email: 'not-an-email' },
  ] },
  'quotations.json': [
    { id: L('q1'), name: 'New Customer', email: newEmail, phone: '09171234567', service: 'Landscaping', status: 'contacted', message: 'Front yard', userId: L('uid-new'), submittedAt: { seconds: 1730000000 } },
    { id: L('q2'), name: 'Walk In', email: `walkin-${tag}@test.greenscape.local`, service: 'Pond building', status: 'pending' },
    { id: L('q3'), name: '', email: 'x@y.z' },
  ],
  'conversations.json': [{ id: L('c1'), userId: L('uid-new'), status: 'open' }, { id: L('c2'), userId: L('uid-ghost') }],
  'conversations.messages.json': [
    { id: 'm1', conversationId: L('c1'), text: 'Hello, do you deliver to Roxas?', senderId: L('uid-new'), timestamp: 1730000000000 },
    { id: 'm2', conversationId: L('c1'), text: 'Yes we do.', isAdmin: true, timestamp: 1730000100000, read: true },
    { id: 'm3', conversationId: L('c1'), text: 'Thank you!', senderId: L('uid-new'), timestamp: 1730000200000 },
  ],
  'employees.json': [
    { id: L('e1'), name: 'Pedro Penduko', designation: 'Gardener', status: 'Active', email: existingEmail, dailyRate: 610, sss: '11-1111111-1', foodAllowance: 100 },
    { id: L('e2'), name: 'Maria Clara', designation: 'Supervisor', status: 'Inactive', dailyRate: 800 },
  ],
  'timeLogs.json': [
    { id: L('t1'), employeeId: L('e1'), date: '2025-11-03', morningIn: '8:20 AM', morningOut: '12:00 PM', afternoonIn: '1:00 PM', afternoonOut: '5:00 PM', timeInPhoto: 'https://x/p.jpg' },
    { id: L('t2'), employeeId: L('e1'), date: '2025-11-04', morningIn: '8:00 AM' },
    { id: L('t3'), employeeId: L('ghost'), date: '2025-11-03', morningIn: '8:00 AM', morningOut: '12:00 PM' },
  ],
  'leaveRequests.json': [
    { id: L('l1'), employeeId: L('e1'), leaveType: `Sick ${tag}`, startDate: '2025-11-05T00:00:00+08:00', endDate: '2025-11-06T00:00:00+08:00', status: 'approved', paid: true },
    { id: L('l2'), employeeId: L('e2'), leaveType: 'Vacation leave', startDate: '2025-12-01T00:00:00+08:00', status: 'pending' },
  ],
  'testimonials.json': [
    { id: L('f1'), name: 'Ana', text: `Lovely garden ${tag}`, rating: 5, status: 'pending', userId: L('uid-new'), userPhoto: 'https://lh3/x', email: 'ana@example.com' },
    { id: L('f2'), name: 'Ben', text: `Already published ${tag}`, rating: 4, status: 'approved' },
  ],
  'announcements.json': [{ id: L('a1'), title: 'Rainy season schedule', message: 'Start at 7 AM from June.' }],
});

beforeAll(async () => {
  deps = await testDeps({ REVALIDATE_SECRET: '' });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-export-'));
  for (const [f, v] of Object.entries(files())) fs.writeFileSync(path.join(dir, f), JSON.stringify(v));
  const auth = await supabase.auth.admin.createUser({ email: existingEmail, email_confirm: true });
  existingUserId = (await deps.db.user.create({ data: { authUserId: auth.data.user!.id, email: existingEmail } })).id;
  // A testimonial the Phase 6 public seed would already hold.
  await deps.mongo.db.collection(collections.testimonials).insertOne({ name: 'Ben', text: `Already published ${tag}`, rating: 4, status: 'approved', createdAt: new Date(), imported: true });
});

afterAll(async () => {
  const emps = await deps.db.employee.findMany({ where: { legacyId: { startsWith: tag } }, select: { id: true } });
  await deps.db.attendanceRecord.deleteMany({ where: { employeeId: { in: emps.map((e) => e.id) } } });
  await deps.db.leaveRequest.deleteMany({ where: { legacyId: { startsWith: tag } } });
  await deps.db.leaveBalance.deleteMany({ where: { employeeId: { in: emps.map((e) => e.id) } } });
  await deps.db.employee.deleteMany({ where: { id: { in: emps.map((e) => e.id) } } });
  await deps.db.leaveType.deleteMany({ where: { name: `Sick ${tag}` } });
  await deps.db.quotation.deleteMany({ where: { legacyId: { startsWith: tag } } });
  await deps.db.conversation.deleteMany({ where: { legacyId: { startsWith: tag } } });
  await deps.db.announcement.deleteMany({ where: { legacyId: { startsWith: tag } } });
  await deps.mongo.db.collection(collections.testimonials).deleteMany({ text: { $regex: tag } });
  const users = await deps.db.user.findMany({ where: { email: { contains: tag } }, select: { id: true, authUserId: true } });
  await deps.db.customer.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await deps.db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await Promise.all(users.map((u) => supabase.auth.admin.deleteUser(u.authUserId)));
  fs.rmSync(dir, { recursive: true, force: true });
  await closeDeps(deps);
});

describe('private-data import (synthetic export)', () => {
  it('dry run: counts, checksums, rejects and dropped fields, and writes nothing', async () => {
    const r = await runImport({ dir, apply: false, db: deps.db, mongo: deps.mongo.db, supabase });
    const s = r.sections;
    expect(s.users).toMatchObject({ input: 3, valid: 2, created: 1, existing: 1, rejected: [{ reason: 'no valid email' }] });
    expect(s.users.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(s.users.excludedFields).toEqual({ passwordHash: 1 });
    expect(s.quotations).toMatchObject({ input: 3, valid: 2, created: 2, rejected: [{ reason: 'no name' }] });
    expect(s.employees.excludedFields).toEqual({ dailyRate: 2, sss: 1, foodAllowance: 1 });
    expect(s.timeLogs).toMatchObject({ created: 2, rejected: [{ reason: 'employee not in the export' }] });
    expect(s.timeLogs.excludedFields).toEqual({ timeInPhoto: 1 });
    expect(s.conversations).toMatchObject({ created: 1, rejected: [{ reason: 'customer not in the users export' }] });
    expect(s.testimonials).toMatchObject({ created: 1, existing: 1 });
    expect(await deps.db.quotation.count({ where: { legacyId: { startsWith: tag } } })).toBe(0);
    expect(await deps.db.user.count({ where: { email: newEmail } })).toBe(0);
    const md = reportMarkdown(r);
    expect(md).toContain('`dailyRate` dropped on 2 records');
    expect(md).not.toMatch(/\b610\b|11-1111111-1|never-copied/); // names of excluded fields only, never their values
  });

  it('apply: writes everything in order and links people', async () => {
    const r = await runImport({ dir, apply: true, db: deps.db, mongo: deps.mongo.db, supabase });
    expect(r.sections.quotations.notes.join()).toMatch(/pond building/);
    const user = await deps.db.user.findUniqueOrThrow({ where: { email: newEmail }, include: { roles: { include: { role: true } } } });
    expect(user).toMatchObject({ legacyUid: L('uid-new'), status: 'ACTIVE' });
    expect(user.roles.map((x) => x.role.key)).toEqual(['customer']);
    expect((await deps.db.user.findUniqueOrThrow({ where: { id: existingUserId } })).legacyUid).toBe(L('uid-old'));

    const q = await deps.db.quotation.findUniqueOrThrow({ where: { legacyId: L('q1') }, include: { customer: true } });
    expect(q).toMatchObject({ status: 'CONTACTED', services: ['landscaping'], details: 'Front yard' });
    expect(q.number).toMatch(/^Q-2024-\d{6}$/);
    expect(q.customer?.userId).toBe(user.id);

    const c = await deps.db.conversation.findUniqueOrThrow({ where: { legacyId: L('c1') }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    expect(c).toMatchObject({ customerUserId: user.id, unreadForStaff: 2 });
    expect(c.messages.map((m) => m.senderUserId === user.id)).toEqual([true, false, true]);

    const e1 = await deps.db.employee.findUniqueOrThrow({ where: { legacyId: L('e1') } });
    expect(e1).toMatchObject({ firstName: 'Pedro', lastName: 'Penduko', position: 'Gardener', userId: existingUserId });
    expect((await deps.db.employee.findUniqueOrThrow({ where: { legacyId: L('e2') } })).employmentStatus).toBe('RESIGNED');
    const day = await deps.db.attendanceRecord.findFirstOrThrow({ where: { employeeId: e1.id, workDate: new Date('2025-11-03T00:00:00Z') }, include: { punches: true } });
    expect(day.punches).toHaveLength(4);
    expect(day.punches.every((p) => p.source === 'import' && !p.photoMediaId)).toBe(true);
    expect((await deps.db.attendanceRecord.findFirstOrThrow({ where: { employeeId: e1.id, workDate: new Date('2025-11-04T00:00:00Z') } })).status).toBe('INCOMPLETE');

    const sick = await deps.db.leaveRequest.findUniqueOrThrow({ where: { legacyId: L('l1') }, include: { leaveType: true } });
    expect(sick).toMatchObject({ status: 'APPROVED', leaveType: { name: `Sick ${tag}`, defaultDaysPerYear: expect.anything() } });
    expect(Number(sick.days)).toBe(2);
    expect(Number((await deps.db.leaveBalance.findFirstOrThrow({ where: { employeeId: e1.id, leaveTypeId: sick.leaveTypeId, year: 2025 } })).used)).toBe(2);

    const tcoll = deps.mongo.db.collection(collections.testimonials);
    expect(await tcoll.findOne({ legacyId: L('f1') })).toMatchObject({ status: 'pending', userId: user.id });
    expect(await tcoll.countDocuments({ text: `Already published ${tag}` })).toBe(1); // matched, not duplicated
    expect(JSON.stringify(await tcoll.findOne({ legacyId: L('f1') }))).not.toMatch(/lh3|ana@example/);
    expect(await deps.db.announcement.count({ where: { legacyId: L('a1') } })).toBe(1);
  });

  it('a second run changes nothing', async () => {
    const r = await runImport({ dir, apply: true, db: deps.db, mongo: deps.mongo.db, supabase });
    for (const [k, s] of Object.entries(r.sections)) if (k !== 'messages') expect(s.created, k).toBe(0);
    expect(await deps.db.quotation.count({ where: { legacyId: { startsWith: tag } } })).toBe(2);
    expect(await deps.db.message.count({ where: { conversation: { legacyId: L('c1') } } })).toBe(3);
  });
});
