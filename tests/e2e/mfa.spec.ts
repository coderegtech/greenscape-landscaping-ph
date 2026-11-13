import { expect, test } from '@playwright/test';
import { ADMIN, PASSWORD, completeMfa, staffUser, signOut } from './helpers';

// Optional hardening (REQUIRE_STAFF_MFA=true on the API; off by default, no mandatory authenticator enrolment).
// When on: staff need an authenticator app. First sign-in enrols; later sign-ins are challenged; a wrong code
// is refused; until the step is done no staff page opens (the API withholds staff permissions from aal1 sessions).
test.skip(({ isMobile }) => isMobile, 'the admin is a desktop tool; one pass is enough');
test.skip(process.env.REQUIRE_STAFF_MFA !== 'true', 'staff MFA is optional and off in this environment');

test('staff enrol an authenticator, then are challenged at every sign-in', async ({ page }) => {
  test.setTimeout(150_000); // may wait for a fresh 30-second code window
  const u = await staffUser('mfa', ['content_manager']);
  const signInPassword = async () => {
    await page.goto(`${ADMIN}/login?next=%2Fmedia`);
    await page.getByLabel('Email').fill(u.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
  };

  await signInPassword();
  await expect(page).toHaveURL(`${ADMIN}/mfa?next=%2Fmedia`);
  await expect(page.getByTestId('mfa-enrol')).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible();

  // Password-only session: a staff page sends them back to the MFA step instead of opening.
  await page.goto(`${ADMIN}/orders`);
  await expect(page).toHaveURL(`${ADMIN}/mfa?next=%2Forders`);

  // A wrong code is refused with an explanation.
  await page.getByLabel('Code').fill('000000');
  await page.getByRole('button', { name: 'Turn on and continue' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'That code did not work' })).toBeVisible();

  await page.goto(`${ADMIN}/media`);
  await completeMfa(page, u.email);
  await expect(page).toHaveURL(`${ADMIN}/media`);
  await expect(page.getByTestId('staff-identity')).toBeVisible();

  // Sign out and back in: now a challenge, not a new enrolment.
  await signOut(page);
  await signInPassword();
  await expect(page.getByTestId('mfa-verify')).toBeVisible();
  await completeMfa(page, u.email);
  await expect(page).toHaveURL(`${ADMIN}/media`);
});
