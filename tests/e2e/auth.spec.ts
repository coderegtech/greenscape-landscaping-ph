import { expect, test, type Page } from '@playwright/test';
import { ADMIN, PASSWORD, WEB, completeMfa, confirmedUser, email, grantRoles, linkFromEmail } from './helpers';

async function signIn(page: Page, base: string, userEmail: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(userEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('customer accounts', () => {
  test('sign up → confirm by email → account page', async ({ page }) => {
    const e = email('signup');
    await page.goto(`${WEB}/auth/register`);
    await page.getByLabel('Full name').fill('Juan Dela Cruz');
    await page.getByLabel('Email').fill(e);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText(e);

    await page.goto(await linkFromEmail(e));
    await expect(page).toHaveURL(`${WEB}/account`);
    await expect(page.getByTestId('account-email')).toHaveText(e);
    await expect(page.getByTestId('account-roles')).toHaveText('customer');
  });

  test('client-side validation explains every problem before calling the server', async ({ page }) => {
    await page.goto(`${WEB}/auth/register`);
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Enter your name')).toBeVisible();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await expect(page.getByText('Use at least 8 characters')).toBeVisible();
    await expect(page.getByText('Please accept the Privacy Notice to continue')).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  test('wrong password shows a clear error', async ({ page }) => {
    const u = await confirmedUser('wrongpw');
    await page.goto(`${WEB}/auth/login`);
    await signIn(page, WEB, u.email, 'Not-The-Password-1');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Email or password is incorrect.');
  });

  test('account is protected and returns to it after sign-in; sign out ends the session', async ({ page }) => {
    const u = await confirmedUser('protected');
    await page.goto(`${WEB}/account`);
    await expect(page).toHaveURL(`${WEB}/auth/login?next=%2Faccount`);
    await signIn(page, WEB, u.email);
    await expect(page).toHaveURL(`${WEB}/account`);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(`${WEB}/`);
    await page.goto(`${WEB}/account`);
    await expect(page).toHaveURL(/\/login/);
  });

  test('post-login redirect cannot leave the site', async ({ page }) => {
    const u = await confirmedUser('redirect');
    await page.goto(`${WEB}/auth/login?next=//evil.example/steal`);
    await signIn(page, WEB, u.email);
    await expect(page).toHaveURL(`${WEB}/account`);
  });

  test('forgot password → email link → new password works', async ({ page }) => {
    const u = await confirmedUser('reset');
    const newPassword = 'Greenscape-New-2026';
    await page.goto(`${WEB}/auth/forgot-password`);
    await page.getByLabel('Email').fill(u.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText('reset link is on its way');

    await page.goto(await linkFromEmail(u.email));
    await expect(page).toHaveURL(`${WEB}/auth/reset-password`);
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm new password').fill(newPassword);
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByRole('main').getByRole('status')).toHaveText('Your password has been changed.');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(`${WEB}/`);
    await page.goto(`${WEB}/auth/login`);
    await signIn(page, WEB, u.email, newPassword);
    await expect(page).toHaveURL(`${WEB}/account`);
  });

  test('a used or bogus email link lands on a friendly error', async ({ page }) => {
    await page.goto(`${WEB}/auth/callback?code=not-a-real-code`);
    await expect(page).toHaveURL(`${WEB}/auth/login?error=link`);
    await expect(page.getByRole('main').getByRole('alert')).toContainText('invalid or has expired');
  });
});

test.describe('admin access', () => {
  test('signed-out visitors are sent to admin login', async ({ page }) => {
    await page.goto(ADMIN);
    await expect(page).toHaveURL(`${ADMIN}/login?next=%2F`);
  });

  test('customers are turned away; staff get in', async ({ page }) => {
    test.setTimeout(180_000);
    const u = await confirmedUser('staff');
    await page.goto(`${ADMIN}/login`);
    await signIn(page, ADMIN, u.email);
    await expect(page.getByTestId('no-access')).toBeVisible();

    await grantRoles(u.email, ['content_manager']); // user row exists after the first /me call above
    // Once the role is seen (permission cache TTL is 60 s when changed outside the API), the password-only session is
    // sent to set up an authenticator before any staff page opens (security H-2).
    await expect(async () => {
      await page.reload();
      await expect(page.getByTestId('mfa-enrol')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 100_000 }); // up to the 60 s permission-cache TTL, plus reload time under load
    await expect(page).toHaveURL(/\/mfa\?next=%2F/);
    await completeMfa(page, u.email);
    await expect(page.getByTestId('staff-identity')).toContainText('content_manager');
    await expect(page.getByTestId('api-status')).toHaveText('ok');
  });
});
