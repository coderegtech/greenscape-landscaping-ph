import { expect, test } from '@playwright/test';
import { ADMIN, email, signIn, signOut } from '../helpers';
import { call, userWithRoles } from '../fixtures/test-users';

// Super admin: full console, provisioning of administrators, and protection of the super admin from other admins.
test.skip(({ isMobile }) => isMobile, 'the admin is a desktop tool; one pass is enough');

test('a super admin reaches every area, creates an administrator, and signs out', async ({ page }) => {
  test.setTimeout(150_000);
  const s = await userWithRoles('superlogin', ['super_admin']);
  await page.goto(`${ADMIN}/login`);
  await signIn(page, s.email);
  await expect(page.getByTestId('staff-identity')).toContainText('super_admin');
  const nav = page.getByRole('navigation', { name: 'Admin' });
  for (const area of ['Users and roles', 'Employees', 'Pages', 'Analytics', 'System monitoring', 'Audit logs', 'Settings']) await expect(nav.getByRole('link', { name: area, exact: true })).toBeVisible();

  await page.goto(`${ADMIN}/users`);
  await page.getByRole('button', { name: 'Create staff account' }).click();
  const dialog = page.getByRole('dialog');
  const address = email('newadmin');
  await dialog.getByLabel('Work email').fill(address);
  await dialog.getByLabel('Name').fill('New Administrator');
  await dialog.getByLabel('Administrator', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(dialog.getByTestId('temporary-password')).toContainText(address);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden(); // its closing hands focus back to its trigger, which would close a menu opened meanwhile
  await signOut(page);
  await expect(page).toHaveURL(`${ADMIN}/login`);
  await page.goto(`${ADMIN}/users`);
  await expect(page).toHaveURL(/\/login/);
});

test('an administrator cannot change, suspend, sign out or out-rank a super admin', async () => {
  const s = await userWithRoles('protected', ['super_admin']);
  const a = await userWithRoles('pusher', ['admin']);
  const target = await userWithRoles('plain', []);
  expect((await call(`/v1/users/${s.userId}/roles`, a.token, { method: 'PUT', body: JSON.stringify({ roles: ['customer'] }) })).status).toBe(403);
  expect((await call(`/v1/users/${s.userId}/status`, a.token, { method: 'PATCH', body: JSON.stringify({ status: 'SUSPENDED' }) })).status).toBe(403);
  expect((await call(`/v1/users/${s.userId}/sessions/revoke`, a.token, { method: 'POST' })).status).toBe(403);
  expect((await call(`/v1/users/${target.userId}/roles`, a.token, { method: 'PUT', body: JSON.stringify({ roles: ['admin'] }) })).status).toBe(403);
  expect((await call('/v1/users', a.token, { method: 'POST', body: JSON.stringify({ email: email('sneaky'), displayName: 'Sneaky', roles: ['super_admin'] }) })).status).toBe(403);
  expect((await call(`/v1/users/${a.userId}/roles`, a.token, { method: 'PUT', body: JSON.stringify({ roles: ['super_admin'] }) })).status).toBe(403); // not even yourself
  const me = await (await call('/v1/auth/me', a.token)).json();
  expect(me.roles).toEqual(['admin']);
});
