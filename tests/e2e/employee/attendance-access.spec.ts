import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { call, cleanupEmployees, employeeUser, userWithRoles } from '../fixtures/test-users';

// Attendance through authentication: only a signed-in employee clocks, always as themselves, with the server's time,
// once; nobody approves their own correction; only people with attendance.approve approve anyone's.
test.skip(({ isMobile }) => isMobile, 'API checks: one pass is enough');
// Parallel workers each run afterAll: a shared label would let one worker delete employees another still uses.
const tag = `attacc${randomUUID().slice(0, 6)}`;
test.afterAll(() => cleanupEmployees(tag));

const day = (offset: number) => new Date(Date.now() + 8 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);

test('clocking needs a signed-in employee, uses the server clock, ignores any identity sent, and refuses duplicates', async () => {
  const [a, b] = await Promise.all([employeeUser(`${tag}-a`), employeeUser(`${tag}-b`)]);
  expect((await call('/v1/me/attendance/punch', undefined, { method: 'POST', body: JSON.stringify({ type: 'IN' }) })).status).toBe(401);

  const before = Date.now();
  // Extra fields (another employee, a time) are not part of the contract and change nothing.
  const res = await call('/v1/me/attendance/punch', a.token, { method: 'POST', body: JSON.stringify({ type: 'IN', employeeId: b.employeeId, at: '2000-01-01T00:00:00Z' }) });
  expect(res.status).toBe(201);
  const since = Date.parse((await res.json()).since);
  expect(Math.abs(since - before)).toBeLessThan(60_000); // the server's time, not the one sent
  expect((await (await call('/v1/me/attendance/today', b.token)).json()).clockedIn).toBe(false); // B untouched

  const dup = await call('/v1/me/attendance/punch', a.token, { method: 'POST', body: JSON.stringify({ type: 'IN' }) });
  expect(dup.status).toBe(409);
  expect((await call(`/v1/hr/attendance/records?employeeId=${a.employeeId}&from=${day(-1)}&to=${day(0)}`, b.token)).status).toBe(403); // no one else's records
});

test('nobody approves their own correction; employees approve nothing; HR approves others', async () => {
  const worker = await employeeUser(`${tag}-worker`);
  const hrEmployee = await employeeUser(`${tag}-hr`, ['hr_manager']); // HR who is also an employee
  const yesterday = day(-1);
  const ask = (token: string) => call('/v1/me/attendance/corrections', token, { method: 'POST', body: JSON.stringify({ workDate: yesterday, punches: [{ type: 'IN', time: '08:00' }, { type: 'OUT', time: '17:00' }], reason: 'Forgot to clock in at the site' }) });
  expect((await ask(worker.token)).status).toBe(201);
  expect((await ask(hrEmployee.token)).status).toBe(201);
  const queue = await (await call('/v1/hr/corrections', hrEmployee.token)).json() as { id: string; employeeId: string }[];
  const own = queue.find((c) => c.employeeId === hrEmployee.employeeId)!;
  const theirs = queue.find((c) => c.employeeId === worker.employeeId)!;

  expect((await call(`/v1/hr/corrections/${theirs.id}/decision`, worker.token, { method: 'POST', body: JSON.stringify({ decision: 'APPROVED' }) })).status).toBe(403);
  expect((await call(`/v1/hr/corrections/${own.id}/decision`, hrEmployee.token, { method: 'POST', body: JSON.stringify({ decision: 'APPROVED' }) })).status).toBe(403);
  expect((await call(`/v1/hr/corrections/${theirs.id}/decision`, hrEmployee.token, { method: 'POST', body: JSON.stringify({ decision: 'APPROVED' }) })).status).toBe(200);
  const customer = await userWithRoles('attacc-cust', []);
  expect((await call('/v1/me/attendance/corrections', customer.token, { method: 'POST', body: JSON.stringify({ workDate: yesterday, punches: [{ type: 'IN', time: '08:00' }], reason: 'not an employee at all' }) })).status).toBe(403);
});
