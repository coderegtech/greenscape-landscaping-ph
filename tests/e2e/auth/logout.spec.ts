import { expect, test, type Page } from '@playwright/test';
import { ADMIN, EMPLOYEE, WEB, signIn } from '../helpers';
import { call, cleanupEmployees, employeeUser, userWithRoles } from '../fixtures/test-users';

// Signing out on each portal: the session ends, protected pages and Back show nothing private, and a copy of the
// access token taken before signing out no longer works against the API.
test.afterAll(() => cleanupEmployees('logout'));

/** The access token the page's session cookie holds (read in the test only; never logged). */
async function cookieToken(page: Page) {
  const parts = (await page.context().cookies()).filter((c) => c.name.includes('auth-token')).sort((a, b) => a.name.localeCompare(b.name));
  let raw = parts.map((c) => c.value).join('');
  if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64url').toString('utf8');
  return (JSON.parse(raw) as { access_token: string }).access_token;
}

test('customer: sign out ends the session; Back shows no account data; the old token is refused', async ({ page }) => {
  const c = await userWithRoles('logoutcust', []);
  await page.goto(`${WEB}/auth/login?next=/account`);
  await signIn(page, c.email);
  await expect(page.getByTestId('account-email')).toHaveText(c.email, { timeout: 30_000 });
  const token = await cookieToken(page);
  expect((await call('/v1/me/profile', token)).status).toBe(200);
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page).not.toHaveURL(/\/account/);
  await page.goBack(); // a cached copy may flash; the server must not serve the account again
  await page.goto(`${WEB}/account`);
  await expect(page.getByTestId('account-email')).toHaveCount(0);
  await expect(page).toHaveURL(/\/auth\/login/);
  expect((await call('/v1/me/profile', token)).status).toBe(401);
});

test('employee: sign out ends the session and the old token is refused', async ({ browser }) => {
  const e = await employeeUser('logoutemp');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${EMPLOYEE}/login`);
  await signIn(page, e.email);
  await expect(page.getByRole('button', { name: 'Clock in' })).toBeVisible();
  const token = await cookieToken(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(`${EMPLOYEE}/login`);
  await page.goBack();
  await page.goto(`${EMPLOYEE}/`);
  await expect(page.getByRole('button', { name: 'Clock in' })).toHaveCount(0);
  expect((await call('/v1/me/attendance/today', token)).status).toBe(401);
  await ctx.close();
});

test('admin: sign out ends the session and the old token is refused', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop tool');
  const a = await userWithRoles('logoutadmin', ['admin']);
  await page.goto(`${ADMIN}/login`);
  await signIn(page, a.email);
  await expect(page.getByTestId('staff-identity')).toBeVisible();
  const token = await cookieToken(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(`${ADMIN}/login`);
  await page.goBack();
  await page.goto(`${ADMIN}/users`);
  await expect(page.getByTestId('staff-identity')).toHaveCount(0);
  expect((await call('/v1/users', token)).status).toBe(401);
});
