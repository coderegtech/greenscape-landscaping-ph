import { expect, test } from '@playwright/test';
import { ADMIN, PASSWORD, signIn } from '../helpers';
import { call, userWithRoles } from '../fixtures/test-users';

// Administrator sign-in, the permissions it carries, no authenticator enrolment, and who is turned away.
test.skip(({ isMobile }) => isMobile, 'the admin is a desktop tool; one pass is enough');

test('an administrator signs in straight to the dashboard (no authenticator step) with admin permissions', async ({ page }) => {
  const a = await userWithRoles('adminlogin', ['admin']);
  const visited: string[] = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) visited.push(new URL(f.url()).pathname); });
  await page.goto(`${ADMIN}/login`);
  await signIn(page, a.email);
  await expect(page.getByTestId('staff-identity')).toContainText('admin');
  expect(visited).not.toContain('/mfa');
  await expect(page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Users & roles' })).toBeVisible();
  // Admin is not super admin: the administrator roles are locked in the account form, and the API agrees.
  await page.goto(`${ADMIN}/users`);
  await page.getByRole('button', { name: 'Create staff account' }).click();
  await expect(page.getByRole('dialog').getByText('Administrator', { exact: true })).toHaveCount(0);
  const me = await (await call('/v1/auth/me', a.token)).json();
  expect(me.permissions).not.toContain('roles.manage_super');
  expect(me.permissions).not.toContain('settings.secrets');
});

for (const [who, roles] of [['customer', []], ['employee', ['employee']]] as const) {
  test(`a ${who} account is refused by the admin, in the page and in the API`, async ({ page }) => {
    const u = await userWithRoles(`noadmin-${who}`, [...roles]);
    await page.goto(`${ADMIN}/login`);
    await signIn(page, u.email);
    await expect(page.getByTestId('no-access')).toBeVisible();
    for (const path of ['/orders', '/users', '/cms/pages', '/employees']) {
      await page.goto(`${ADMIN}${path}`);
      await expect(page.getByTestId('no-access')).toBeVisible();
    }
    for (const path of ['/v1/users', '/v1/hr/employees', '/v1/admin/overview', '/v1/cms-admin/pages']) expect((await call(path, u.token)).status, path).toBe(403);
  });
}

test('a disabled administrator is refused', async ({ page }) => {
  const a = await userWithRoles('disabledadmin', ['ecommerce_manager']);
  const sup = await userWithRoles('suspender', ['super_admin']);
  expect((await call(`/v1/users/${a.userId}/status`, sup.token, { method: 'PATCH', body: JSON.stringify({ status: 'SUSPENDED' }) })).status).toBe(200);
  expect((await call('/v1/auth/me', a.token)).status).toBeGreaterThanOrEqual(401); // existing token: refused
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel('Email').fill(a.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByTestId('staff-identity')).toHaveCount(0);
});
