import { expect, test } from '@playwright/test';
import { ADMIN, EMPLOYEE, WEB } from '../helpers';

// Customer Google sign-in, as far as it can honestly be tested here. The real Google round trip needs a Google OAuth
// client configured in Supabase and an authorised Google test identity; neither exists in this environment, and Google's
// bot protection must not be automated. Server-side, a Google session never carries staff or employee permissions:
// tests/integration/portals.test.ts ("Google (OAuth) sessions") simulates it against the real API.
const googleOn = process.env.NEXT_PUBLIC_AUTH_GOOGLE === 'true';

test('the Google button follows configuration, and the staff portals never offer Google', async ({ page }) => {
  await page.goto(`${WEB}/auth/login`);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(googleOn ? 1 : 0);
  for (const url of [`${ADMIN}/login`, `${EMPLOYEE}/login`]) {
    await page.goto(url);
    await expect(page.getByRole('button', { name: /google/i })).toHaveCount(0);
  }
});

test('the OAuth callback refuses a bogus or missing code with a fixed message, and never redirects off-site', async ({ page }) => {
  for (const q of ['code=bogus-code&next=/account', 'next=/account', 'code=bogus&next=https://evil.example/steal', 'code=bogus&next=//evil.example']) {
    await page.goto(`${WEB}/auth/callback?${q}`);
    await expect(page).toHaveURL(`${WEB}/auth/login?error=link`);
    await expect(page.getByText('That link is invalid or has expired.')).toBeVisible();
  }
});

test('Google provider round trip (Continue with Google → Google → Supabase callback → customer profile)', async () => {
  test.skip(!googleOn || !process.env.E2E_GOOGLE_TEST_IDENTITY, 'BLOCKED: no Google OAuth client in Supabase and no authorised Google test identity; verify manually on staging');
  // Intentionally not automated: Google's sign-in page and its bot protection are out of scope for scripted logins.
});
