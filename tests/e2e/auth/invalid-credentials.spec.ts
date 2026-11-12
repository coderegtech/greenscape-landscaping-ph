import { expect, test, type Page } from '@playwright/test';
import { ADMIN, EMPLOYEE, WEB, email } from '../helpers';
import { userWithRoles } from '../fixtures/test-users';

// Wrong, unknown, empty and malformed credentials on all three sign-in screens: the same safe message for wrong and
// unknown (no account enumeration), validation before any request, no internal detail, and no session created.
const PORTALS = [
  ['customer website', `${WEB}/auth/login`],
  ['employee portal', `${EMPLOYEE}/login`],
  ['admin', `${ADMIN}/login`],
] as const;

async function submit(page: Page, address: string, password: string) {
  await page.getByLabel('Email').fill(address);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

for (const [portal, url] of PORTALS) {
  test.describe(portal, () => {
    test('wrong password and unknown account get the same message; nothing is signed in', async ({ page }) => {
      const u = await userWithRoles(`badpw-${portal.split(' ')[0]}`, ['employee']);
      await page.goto(url);
      const authCalls: number[] = [];
      page.on('response', (r) => { if (r.url().includes('/auth/v1/token')) authCalls.push(r.status()); });
      await submit(page, u.email, 'Not-The-Password-1');
      const wrong = page.getByText('Email or password is incorrect.');
      await expect(wrong).toBeVisible();
      await page.reload();
      await submit(page, email('nobody'), 'Not-The-Password-1');
      await expect(wrong).toBeVisible(); // identical wording: an attacker learns nothing about which accounts exist
      expect(authCalls.every((s) => s === 400)).toBe(true); // the identity provider refused; no 5xx anywhere
      await expect(page).toHaveURL(new RegExp(url.replace(/[?]/g, '\\?')));
      expect((await page.context().cookies()).some((c) => c.name.includes('auth-token'))).toBe(false);
      await expect(page.getByText(/stack|exception|prisma|supabase|sql/i)).toHaveCount(0);
    });

    test('empty and malformed input is explained before anything is sent', async ({ page }) => {
      await page.goto(url);
      let sent = 0;
      page.on('request', (r) => { if (r.url().includes('/auth/v1/token')) sent++; });
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByText('Enter a valid email address')).toBeVisible();
      await expect(page.getByText('Enter your password')).toBeVisible();
      await page.getByLabel('Email').fill('not-an-email');
      await page.getByLabel('Password', { exact: true }).fill('x');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByText('Enter a valid email address')).toBeVisible();
      expect(sent).toBe(0);
    });
  });
}
