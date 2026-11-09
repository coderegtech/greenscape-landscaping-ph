// Test helpers for the local Supabase started by `pnpm supabase:start`.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = () => process.env.SUPABASE_URL!;
export const adminClient = () => createClient(url(), process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

export const TEST_PASSWORD = 'Greenscape-Test-2026';
export const testEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@test.greenscape.local`;

/** Creates a confirmed user and returns a real access token from a password sign-in. */
export async function signedInUser(label: string) {
  const email = testEmail(label);
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true });
  if (error) throw error;
  const anon = createClient(url(), process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error: e2 } = await anon.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (e2) throw e2;
  return { email, authUserId: data.user.id, token: s.session!.access_token };
}

export async function deleteAuthUsers(ids: string[]) {
  const admin = adminClient();
  await Promise.all(ids.map((id) => admin.auth.admin.deleteUser(id)));
}
