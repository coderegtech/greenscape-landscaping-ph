// Express-side verification of Supabase access tokens. Signature via the project's JWKS (asymmetric keys),
// plus issuer, audience and expiry. Role/permission claims in the token are ignored on purpose.
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';

export interface VerifiedToken {
  authUserId: string;
  email: string;
  /** Authenticator assurance level: aal2 = MFA completed this session. */
  aal: 'aal1' | 'aal2';
  sessionId?: string;
  /** How the session was authenticated (Supabase `amr` methods: password, oauth, totp, recovery, otp…). */
  methods: string[];
  /** When the person signed in (seconds): the latest amr timestamp, which survives refreshes; falls back to iat. */
  authTime: number;
  /** From sign-up metadata or the OAuth profile; display only, never used for authorization. */
  name?: string;
  /** Profile picture URL from the OAuth profile (Google): https only; display only. */
  avatarUrl?: string;
}

export class TokenError extends Error {
  constructor(public reason: 'expired' | 'invalid' | 'missing_claims') { super(`token ${reason}`); }
}

function displayName(meta: unknown) {
  const m = (meta ?? {}) as Record<string, unknown>;
  const v = [m.display_name, m.full_name, m.name].find((x): x is string => typeof x === 'string' && x.trim().length > 0);
  return v?.trim().slice(0, 80);
}

function avatar(meta: unknown) {
  const m = (meta ?? {}) as Record<string, unknown>;
  const v = [m.avatar_url, m.picture].find((x): x is string => typeof x === 'string');
  return v && /^https:\/\/[^\s"'<>]{1,500}$/.test(v) ? v : undefined;
}

export function createTokenVerifier(supabaseUrl: string) {
  const base = supabaseUrl.replace(/\/$/, '');
  const issuer = `${base}/auth/v1`;
  // jose caches keys and refetches on unknown `kid` (key rotation) with a cooldown.
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 });

  return async function verify(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated', algorithms: ['ES256', 'RS256'] });
      if (typeof payload.sub !== 'string' || typeof payload.email !== 'string' || !payload.email) throw new TokenError('missing_claims');
      const methods = (Array.isArray(payload.amr) ? payload.amr : []).map((a) => (a as { method?: unknown } | null)?.method).filter((m): m is string => typeof m === 'string');
      const stamps = (Array.isArray(payload.amr) ? payload.amr : []).map((a) => Number((a as { timestamp?: unknown } | null)?.timestamp)).filter(Number.isFinite);
      const authTime = stamps.length ? Math.max(...stamps) : (payload.iat ?? 0);
      return { methods, authTime, authUserId: payload.sub, email: payload.email.toLowerCase(), aal: payload.aal === 'aal2' ? 'aal2' : 'aal1', sessionId: typeof payload.session_id === 'string' ? payload.session_id : undefined, name: displayName(payload.user_metadata), avatarUrl: avatar(payload.user_metadata) };
    } catch (err) {
      if (err instanceof TokenError) throw err;
      throw new TokenError(err instanceof errors.JWTExpired ? 'expired' : 'invalid');
    }
  };
}

export type TokenVerifier = ReturnType<typeof createTokenVerifier>;
