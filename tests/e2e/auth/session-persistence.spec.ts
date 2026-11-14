import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ADMIN, EMPLOYEE, WEB, signIn } from '../helpers';
import { cleanupEmployees, employeeUser, userWithRoles } from '../fixtures/test-users';

// A valid session survives navigation and reloads on every portal; a damaged session cookie is treated as signed out;
// session cookies are host-only (so the three portals never share one in production) and not readable cross-site.
// Parallel workers each run afterAll: a shared label would let one worker delete employees another still uses.
const tag = `session${randomUUID().slice(0, 6)}`;
test.afterAll(() => cleanupEmployees(tag));

test('customer: the session survives navigation and reloads', async ({ page }) => {
  const c = await userWithRoles('sesscust', []);
  await page.goto(`${WEB}/auth/login?next=/account`);
  await signIn(page, c.email);
  await expect(page.getByTestId('account-email')).toHaveText(c.email, { timeout: 30_000 });
  await page.goto(`${WEB}/shop`);
  await page.goto(`${WEB}/account`);
  await page.reload();
  await expect(page.getByTestId('account-email')).toHaveText(c.email);
  // The long synthetic address stays on screen on a phone (it used to run off the right edge).
  expect(await page.getByTestId('account-email').evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
});

test('employee: the session survives navigation and reloads', async ({ browser }) => {
  const e = await employeeUser(`${tag}emp`);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${EMPLOYEE}/login`);
  await signIn(page, e.email);
  await expect(page).toHaveURL(`${EMPLOYEE}/`); // signed in before navigating on
  await page.goto(`${EMPLOYEE}/notifications`);
  await page.goto(`${EMPLOYEE}/`);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hello, Auth' })).toBeVisible();
  await ctx.close();
});

test('admin: the session survives navigation and reloads', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop tool');
  const a = await userWithRoles('sessadmin', ['admin']);
  await page.goto(`${ADMIN}/login`);
  await signIn(page, a.email);
  for (const p of ['/orders', '/users', '/']) await page.goto(`${ADMIN}${p}`);
  await page.reload();
  await expect(page.getByTestId('staff-identity')).toContainText('admin');
});

test('a damaged session cookie counts as signed out, never as someone', async ({ page, context }) => {
  const c = await userWithRoles('tamper', []);
  await page.goto(`${WEB}/auth/login?next=/account`);
  await signIn(page, c.email);
  await expect(page.getByTestId('account-email')).toBeVisible({ timeout: 30_000 });
  const auth = (await context.cookies()).filter((x) => x.name.includes('auth-token'));
  expect(auth.length).toBeGreaterThan(0);
  await context.clearCookies();
  await context.addCookies(auth.map((x) => ({ ...x, value: `${x.value.slice(0, -12)}tampered1234` })));
  await page.goto(`${WEB}/account`);
  await expect(page).toHaveURL(/\/auth\/login/);
  await page.goto(`${ADMIN}/`);
  await expect(page).toHaveURL(/\/login/);
});

test('session cookies are host-only and same-site; nothing secret is stored in local storage', async ({ page, context }) => {
  const c = await userWithRoles('cookies', []);
  await page.goto(`${WEB}/auth/login?next=/account`);
  await signIn(page, c.email);
  await expect(page.getByTestId('account-email')).toBeVisible({ timeout: 30_000 });
  const auth = (await context.cookies()).filter((x) => x.name.includes('auth-token'));
  for (const x of auth) {
    expect(x.domain, `${x.name} has no Domain attribute (host-only)`).not.toMatch(/^\./);
    expect(x.sameSite).toBe('Lax');
  }
  const stored = await page.evaluate(() => Object.keys(localStorage).join(' '));
  expect(stored).not.toMatch(/auth-token|refresh/i);
});
