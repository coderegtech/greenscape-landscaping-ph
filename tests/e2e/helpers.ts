import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createPrismaClient } from '@greenscape/database';

// Override to run against servers on other ports (e.g. while another checkout's dev servers hold 3000/3001).
export const WEB = process.env.E2E_WEB ?? 'http://localhost:3000';
export const ADMIN = process.env.E2E_ADMIN ?? 'http://localhost:3001';
export const PASSWORD = 'Greenscape-E2e-2026';
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

export async function signIn(page: import('@playwright/test').Page, userEmail: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(userEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
