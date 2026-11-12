import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createPrismaClient } from '@greenscape/database';
import { totp } from '../totp';

// Point at other ports when the default dev servers are busy: E2E_WEB=http://localhost:3100 pnpm test:e2e
export const WEB = process.env.E2E_WEB ?? 'http://localhost:3000';
export const ADMIN = process.env.E2E_ADMIN ?? 'http://localhost:3001';
export const EMPLOYEE = process.env.E2E_EMPLOYEE ?? 'http://localhost:3002';
export const API = process.env.E2E_API ?? 'http://localhost:4000';
/** Synthetic accounts' password: from E2E_PASSWORD, else generated per run (never hardcoded, never logged). */
export const PASSWORD = process.env.E2E_PASSWORD ?? `Gs-${randomUUID()}-Aa1`;
export const email = (label: string) => `${label}-${randomUUID().slice(0, 8)}@e2e.greenscape.local`;

const mailpit = () => process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

/** Polls the local Mailpit inbox and returns the first link in the newest mail to `to` matching `pattern`. */
export async function linkFromEmail(to: string, pattern = /https?:\/\/[^"'\s<>]+\/auth\/v1\/verify[^"'\s<>]+/): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(async () => {
      const search = await fetch(`${mailpit()}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`).then((r) => r.json());
      const id = search.messages?.[0]?.ID;
      if (!id) return undefined;
      const msg = await fetch(`${mailpit()}/api/v1/message/${id}`).then((r) => r.json());
      link = (msg.HTML as string).match(pattern)?.[0]?.replaceAll('&amp;', '&');
      return link;
    }, { timeout: 15_000, message: `email to ${to}` })
    .toBeTruthy();
  return link!;
}

export function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A confirmed account created directly (skips the email step for tests that aren't about sign-up). */
export async function confirmedUser(label: string) {
  const e = email(label);
  const { data, error } = await supabaseAdmin().auth.admin.createUser({ email: e, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  return { email: e, authUserId: data.user.id };
}

/** Grants roles in Postgres. The user row must exist (it does after their first signed-in API call). */
export async function grantRoles(userEmail: string, roles: string[]) {
  const db = createPrismaClient(process.env.DATABASE_URL!);
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: userEmail } });
    const rows = await db.role.findMany({ where: { key: { in: roles } } });
    await db.userRole.createMany({ data: rows.map((r) => ({ userId: user.id, roleId: r.id })), skipDuplicates: true });
  } finally {
    await db.$disconnect();
  }
}

/** A confirmed staff account whose roles exist before the first sign-in (no permission-cache wait). */
export async function staffUser(label: string, roles: string[]) {
  const u = await confirmedUser(label);
  const db = createPrismaClient(process.env.DATABASE_URL!);
  try {
    const rows = await db.role.findMany({ where: { key: { in: roles } } });
    await db.user.create({ data: { authUserId: u.authUserId, email: u.email, roles: { create: rows.map((r) => ({ roleId: r.id })) } } });
  } finally {
    await db.$disconnect();
  }
  return u;
}

// Authenticator keys of test users that enrolled MFA in this worker, so a later sign-in can answer the challenge.
const mfaSecrets = new Map<string, string>();

/**
 * Staff MFA step in the admin (security H-2), done like a person with an authenticator app: on first use read the key
 * shown for manual entry and enrol; afterwards enter the current code. Codes can't be reused within their 30 s window,
 * so a retry waits for the next one.
 */
export async function completeMfa(page: import('@playwright/test').Page, userEmail: string) {
  const step = page.locator('[data-testid=mfa-enrol], [data-testid=mfa-verify]');
  await expect(step).toBeVisible();
  if (await page.getByTestId('mfa-enrol').isVisible()) mfaSecrets.set(userEmail, (await page.getByTestId('mfa-secret').textContent())!.trim());
  const secret = mfaSecrets.get(userEmail);
  if (!secret) throw new Error(`no authenticator key recorded for ${userEmail}`);
  const from = page.url();
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByLabel('Code').fill(totp(secret));
    await page.getByRole('button', { name: /^(Turn on and continue|Continue)$/ }).click();
    try {
      await page.waitForURL((u) => u.href !== from, { timeout: 10_000 });
      return;
    } catch {
      await page.waitForTimeout(31_000 - (Date.now() % 30_000)); // next code window
    }
  }
  throw new Error('MFA code was not accepted');
}

/**
 * React has hydrated the page (event handlers attached). Signed-in pages keep a live notifications stream open, so
 * waitForLoadState('networkidle') never settles there.
 */
export async function hydrated(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => Object.keys(document).some((k) => k.startsWith('_reactListening')));
}

export async function signIn(page: import('@playwright/test').Page, userEmail: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(userEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (!page.url().startsWith(ADMIN)) return;
  // Admin: staff land on the MFA step, others on the console (or its "no access" notice).
  const landed = page.locator('[data-testid=mfa-enrol], [data-testid=mfa-verify], [data-testid=staff-identity], [data-testid=no-access]');
  await landed.first().waitFor({ state: 'attached', timeout: 30_000 }); // the staff badge is hidden on phones
  if (await page.locator('[data-testid=mfa-enrol], [data-testid=mfa-verify]').count()) await expect(page.locator('[data-testid=mfa-enrol], [data-testid=mfa-verify]').first()).toBeVisible();
  if (await page.locator('[data-testid=mfa-enrol], [data-testid=mfa-verify]').count()) await completeMfa(page, userEmail);
}

/** A confirmed customer signed in on the public site (most actions need an account). Returns their email. */
export async function signedInCustomer(page: import('@playwright/test').Page, label: string, next = '/account') {
  const u = await confirmedUser(label);
  await page.goto(`${WEB}/auth/login?next=${encodeURIComponent(next)}`);
  await signIn(page, u.email);
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[?]/g, '\\?')}$`), { timeout: 20_000 });
  return u.email;
}

/** An access token for direct API calls in tests (password grant against local Supabase). */
export async function apiToken(userEmail: string, password = PASSWORD) {
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: userEmail, password });
  if (error) throw error;
  return data.session!.access_token;
}
