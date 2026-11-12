import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '@greenscape/database';
import { expect, test } from '@playwright/test';
import { ADMIN, EMPLOYEE, WEB, email, signIn } from '../helpers';
import { call, cleanupEmployees, employeeUser, userWithRoles } from '../fixtures/test-users';

// Employee accounts exist only through HR: provisioning in the admin, first sign-in with the temporary password,
// the forced password change, the dashboard, and what happens to a disabled account.
const tag = `emp${randomUUID().slice(0, 6)}`;
test.afterAll(() => cleanupEmployees(tag));

test('HR provisions an employee; they sign in with the temporary password, must replace it, and reach their dashboard', async ({ page, browser, isMobile }) => {
  test.skip(isMobile, 'the admin side is a desktop tool');
  test.setTimeout(150_000);
  const hr = await userWithRoles('hrprov', ['hr_manager']);
  const work = email('newhire');
  const db = createPrismaClient(process.env.DATABASE_URL!);
  try {
    await page.goto(`${ADMIN}/login?next=%2Femployees%2Fnew`);
    await signIn(page, hr.email);
    await expect(page).not.toHaveURL(/\/mfa/); // no authenticator enrolment
    await page.getByLabel('First name').filter({ visible: true }).fill('Nora');
    await page.getByLabel('Last name').filter({ visible: true }).fill(`Reyes ${tag}`);
    await page.getByLabel('Employee number').filter({ visible: true }).fill(`E2E-${randomUUID().slice(0, 6).toUpperCase()}`);
    await page.getByLabel(/^Work email/).filter({ visible: true }).fill(work);
    await page.getByRole('button', { name: 'Add employee' }).click();
    await page.getByRole('button', { name: 'Create login' }).click();
    const temporary = (await page.getByTestId('temporary-password').locator('code').textContent())!.trim();
    expect(temporary.length).toBeGreaterThanOrEqual(16);

    // The backend made a confirmed Supabase identity, the user row with the employee role, and linked the HR record.
    const user = await db.user.findUniqueOrThrow({ where: { email: work }, include: { roles: { include: { role: true } }, employee: true } });
    expect(user.roles.map((r) => r.role.key)).toEqual(['employee']);
    expect(user.mustChangePassword).toBe(true);
    expect(user.employee?.lastName).toBe(`Reyes ${tag}`);
    expect(await db.auditLog.count({ where: { action: 'user.provision', entityId: user.id } })).toBe(1);

    const ctx = await browser.newContext();
    const portal = await ctx.newPage();
    await portal.goto(`${EMPLOYEE}/login`);
    await signIn(portal, work, temporary);
    await expect(portal).toHaveURL(`${EMPLOYEE}/password`);
    await portal.goto(`${EMPLOYEE}/`); // cannot skip the step
    await expect(portal).toHaveURL(`${EMPLOYEE}/password`);
    const chosen = `Nr-${randomUUID()}-Aa1`;
    await portal.getByLabel('New password', { exact: true }).fill(chosen);
    await portal.getByLabel('Confirm new password').fill(chosen);
    await portal.getByRole('button', { name: 'Save password' }).click();
    await expect(portal.getByRole('heading', { name: 'Hello, Nora' })).toBeVisible();
    await expect(portal.getByRole('button', { name: 'Clock in' })).toBeVisible();
    expect((await db.user.findUniqueOrThrow({ where: { email: work } })).mustChangePassword).toBe(false);
    await ctx.close();
  } finally {
    await db.$disconnect();
  }
});

test('an employee signs in with their own password; the API sees the employee role only', async ({ browser }) => {
  const e = await employeeUser(`login-${tag}`);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${EMPLOYEE}/login`);
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', `${WEB}/auth/forgot-password`);
  await signIn(page, e.email);
  await expect(page).toHaveURL(`${EMPLOYEE}/`);
  await expect(page.getByRole('heading', { name: 'Hello, Auth' })).toBeVisible();
  const me = await (await call('/v1/auth/me', e.token)).json();
  expect(me.roles).toEqual(['employee']);
  expect(me.permissions).not.toContain('admin.access');
  await ctx.close();
});

test('a disabled employee loses access at once and cannot sign in again', async ({ browser }) => {
  const e = await employeeUser(`disabled-${tag}`);
  const admin = await userWithRoles('disabler', ['admin']);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${EMPLOYEE}/login`);
  await signIn(page, e.email);
  await expect(page.getByRole('button', { name: 'Clock in' })).toBeVisible();
  await page.waitForTimeout(1100); // sign-in times are whole seconds; the suspension cut-off must come after

  expect((await call(`/v1/users/${e.userId}/status`, admin.token, { method: 'PATCH', body: JSON.stringify({ status: 'SUSPENDED' }) })).status).toBe(200);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Clock in' })).toHaveCount(0); // no attendance data or actions
  expect((await call('/v1/me/attendance/today', e.token)).status).toBeGreaterThanOrEqual(401);

  await ctx.clearCookies();
  await page.goto(`${EMPLOYEE}/login`);
  await signIn(page, e.email);
  await expect(page.getByRole('alert').or(page.getByText(/banned|suspended|incorrect/i)).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await ctx.close();
});
