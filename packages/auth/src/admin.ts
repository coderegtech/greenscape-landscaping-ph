// Supabase Auth admin calls the API needs, with the service-role (secret) key. API process only: never import from a
// Next.js page or client component (the key must stay on trusted servers).
import { createClient } from '@supabase/supabase-js';

/** Long enough to mean "until lifted"; Supabase takes a Go duration. */
const BAN_FOREVER = '876000h';

export function createIdentityAdmin(supabaseUrl: string, secretKey: string) {
  const client = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    /** True only when Supabase says this identity's email address has been confirmed. */
    async emailConfirmed(authUserId: string) {
      const { data, error } = await client.auth.admin.getUserById(authUserId);
      return !error && !!data.user?.email_confirmed_at;
    },
    /** Banned identities can't sign in or refresh a session at Supabase (security audit M-3). */
    async setBanned(authUserId: string, banned: boolean) {
      const { error } = await client.auth.admin.updateUserById(authUserId, { ban_duration: banned ? BAN_FOREVER : 'none' });
      if (error) throw error;
    },
    /**
     * Creates a confirmed email/password identity (the administrator vouches for the address). Returns null when
     * Supabase already has an identity with this email.
     */
    async createWithPassword(email: string, password: string, fullName?: string) {
      const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: fullName ? { full_name: fullName } : {} });
      if (error && (error.code === 'email_exists' || error.code === 'user_already_exists')) return null;
      if (error) throw error;
      return data.user.id;
    },
    async setPassword(authUserId: string, password: string) {
      const { error } = await client.auth.admin.updateUserById(authUserId, { password });
      if (error) throw error;
    },
    /** Ends every session of the token's user (all devices; refresh tokens revoked). Needs one of the user's own tokens. */
    async signOutEverywhere(accessToken: string) {
      const { error } = await client.auth.admin.signOut(accessToken, 'global');
      if (error) throw error;
    },
    /** Removes the sign-in identity (account deletion). The app's own records are anonymised separately. */
    async deleteIdentity(authUserId: string) {
      const { error } = await client.auth.admin.deleteUser(authUserId);
      if (error && error.status !== 404) throw error;
    },
  };
}

export type IdentityAdmin = ReturnType<typeof createIdentityAdmin>;
