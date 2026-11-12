// Synthetic test identities for the auth suites. Every account is created fresh in the local/CI Supabase with an
// @e2e.greenscape.local address (removed by the global teardown), so no real or shared account is ever touched.
// Tokens and passwords stay in memory: never print them.
import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '@greenscape/database';
import { API, apiToken, confirmedUser, staffUser } from '../helpers';

export type RoleKey = 'customer' | 'employee' | 'admin' | 'super_admin' | 'content_manager' | 'hr_manager' | 'ecommerce_manager' | 'inventory_staff';
export interface TestUser { email: string; authUserId: string; token: string; userId: string }

/** Calls the API like a portal's server would (bearer token), without logging anything. */
export function call(path: string, token?: string, init: RequestInit = {}) {
  return fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
}

/** A signed-in synthetic account with exactly these roles (none = a plain customer created on first sight). */
export async function userWithRoles(label: string, roles: RoleKey[]): Promise<TestUser> {
  const u = roles.length && !(roles.length === 1 && roles[0] === 'customer') ? await staffUser(label, roles) : await confirmedUser(label);
  const token = await apiToken(u.email);
  const me = await call('/v1/auth/me', token); // creates the user row for customers
  if (!me.ok) throw new Error(`could not load ${label}: ${me.status}`);
  return { ...u, token, userId: (await me.json()).user.id };
}

/** An employee: employee role plus an HR record linked to the account (what HR's "Create login" produces). */
export async function employeeUser(label: string, extraRoles: RoleKey[] = []) {
  const u = await userWithRoles(label, ['employee', ...extraRoles]);
  const db = createPrismaClient(process.env.DATABASE_URL!);
  try {
    const e = await db.employee.create({ data: { employeeNo: `E2E-${randomUUID().slice(0, 6).toUpperCase()}`, firstName: 'Auth', lastName: `Tester ${label}`, email: u.email, userId: u.userId } });
    return { ...u, employeeId: e.id };
  } finally {
    await db.$disconnect();
  }
}

/** Removes the HR records and attendance the fixtures created (accounts go in the global teardown). */
export async function cleanupEmployees(lastNameContains: string) {
  const db = createPrismaClient(process.env.DATABASE_URL!);
  try {
    const emps = await db.employee.findMany({ where: { lastName: { contains: lastNameContains } }, select: { id: true } });
    const ids = emps.map((e) => e.id);
    await db.attendanceCorrection.deleteMany({ where: { record: { employeeId: { in: ids } } } });
    await db.attendanceRecord.deleteMany({ where: { employeeId: { in: ids } } });
    await db.employee.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await db.$disconnect();
  }
}
