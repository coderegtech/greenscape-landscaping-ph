import { expect, test } from '@playwright/test';
import { ADMIN, WEB, confirmedUser, signIn, staffUser } from './helpers';

// Admin → System status, Audit log, and "Sign out everywhere" ending a real website session.
test.skip(({ isMobile }) => isMobile, 'the admin is a desktop tool; one pass is enough');

test('super admin sees system status, signs a user out everywhere, and finds it in the audit log', async ({ page, browser }) => {
  test.setTimeout(150_000);
  // A customer signed in on the website in their own browser.
  const customer = await confirmedUser('signedout');
  const ctx = await browser.newContext();
  const site = await ctx.newPage();
  await site.goto(`${WEB}/auth/login?next=/account`);
  await signIn(site, customer.email);
  await expect(site).toHaveURL(`${WEB}/account`);
  await site.waitForTimeout(1100); // sign-in times are whole seconds

  const u = await staffUser('sysadmin', ['super_admin']);
  await page.goto(`${ADMIN}/login?next=%2Fsystem`);
  await signIn(page, u.email);
  await expect(page.getByRole('heading', { name: 'System status' })).toBeVisible();
  await expect(page.getByTestId('system-checks')).toContainText('Database (Postgres)');
  await expect(page.getByTestId('system-checks')).toContainText('OK');

  await page.goto(`${ADMIN}/users?q=${encodeURIComponent(customer.email)}`);
  await page.getByRole('button', { name: `Edit ${customer.email}` }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Sign out everywhere' }).click();
  await expect(page.getByText('Signed out everywhere')).toBeVisible();

  // The website session is gone on the customer's next page load.
  await site.goto(`${WEB}/account`);
  await expect(site).toHaveURL(/\/auth\/login/);
  await ctx.close();

  await page.goto(`${ADMIN}/audit?action=user.sessions.revoke`);
  await expect(page.getByTestId('audit-entries')).toContainText('user.sessions.revoke');
  await expect(page.getByTestId('audit-entries')).toContainText(u.email);
});
