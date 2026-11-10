# Authentication and sessions

Identity provider: **Supabase Auth**. Website and admin use `@supabase/ssr` (server-managed cookies); the API accepts only bearer access tokens, verified with Supabase's public keys.

| Control | Implementation | Config | Tests |
|---|---|---|---|
| Registration | Email + password; **confirmation required** before any session exists | `supabase/config.toml` `[auth.email] enable_confirmations = true` | e2e `auth.spec.ts` sign-up → email → account |
| Password policy | ≥ 8 characters with upper case, lower case and a digit, enforced by Supabase and mirrored in the form | `password_requirements = "lower_upper_letters_digits"` | e2e client-side validation |
| Login / logout | Password sign-in through Supabase; sign-out is a form POST to `/auth/signout` (server `signOut`, cookies cleared) | — | e2e "sign out ends the session" |
| Password reset | Same answer whether or not the account exists (no enumeration); recovery link through `/auth/callback` (PKCE) | — | e2e reset flow |
| OAuth | Google via Supabase (optional per environment); redirect targets only via `safeNext` (same-site relative paths); the callback never echoes provider text | `additional_redirect_urls` | unit `safeNext` cases |
| **MFA for staff** | TOTP enrolment and challenge at `/mfa` in the admin. The API withholds every staff permission from sessions that aren't `aal2` (`403 MFA_REQUIRED`); self-service stays available | `[auth.mfa.totp] enroll_enabled/verify_enabled = true`; API `REQUIRE_STAFF_MFA` (default `true`) | integration `mfa.test.ts`; e2e `mfa.spec.ts` (enrol, wrong code refused, challenge on next sign-in) |
| Token verification (API) | JWKS signature, `iss`, `aud=authenticated`, `exp`, algorithms ES256/RS256 only; `sub` and `email` required; role/permission claims ignored | `packages/auth/src/verify.ts` | integration `auth.test.ts`: HS256 token signed with the local legacy secret refused (expiry is checked by `jwtVerify`; no dedicated expired-token test) |
| Header handling | No `Authorization` → anonymous; present but invalid → 401, never silently anonymous | `middleware/auth.ts` | integration |
| Session cookies | httpOnly, SameSite=Lax, Secure in production (set by `@supabase/ssr`); tokens never in localStorage; the guest cart cookie is httpOnly too | — | e2e |
| Session lifetime | Access token 1 h; refresh tokens rotate; reuse detection | `jwt_expiry = 3600`, `enable_refresh_token_rotation = true` | — |
| Session revocation | Suspension: API refuses at once (`ACCOUNT_SUSPENDED`), **and the identity is banned at Supabase** (no new sign-in or refresh); reactivation lifts the ban (M-3) | `identities.setBanned` | integration `security.test.ts` |
| Account relinking | A new identity with an existing account's email takes the account over only if Supabase confirms that identity's email (M-1); audited | `middleware/auth.ts` `resolveUser` | integration `security.test.ts` |
| Session fixation | Supabase issues a new session on every sign-in and on MFA verification (aal2); the server never adopts a client-chosen session id | — | — |
| Failed sign-ins | Throttled by Supabase per IP (30 per 5 minutes); API refusals (401/403/429) go to the security log, with an alert on repeats | `[auth.rate_limit]`; `lib/security-log.ts` | integration M-4 |
| Service-role key | API process only (`packages/auth/src/admin.ts`, storage); never in a Next app or `NEXT_PUBLIC_*` | Semgrep `greenscape-service-key-outside-api`; bundle scan | CI |

## Known limitations
- No per-account lockout: Supabase throttles per IP. Recommended before launch: Turnstile CAPTCHA on sign-in, sign-up and reset (`[auth.captcha]`), audit finding L-7.
- MFA recovery: a staff member who loses their authenticator needs an administrator to remove the factor in Supabase (dashboard or admin API). The procedure is in `incident-response.md`.
- Locally, web (:3000) and admin (:3001) share cookies (same host). Production uses separate subdomains.
