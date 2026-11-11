# Supabase authentication

Supabase Auth is the only identity provider. Local development uses the Supabase CLI (`pnpm supabase:start`,
`pnpm supabase:env`); settings are in `supabase/config.toml` (8+ characters with upper, lower and digit; email
confirmation; `secure_password_change`; Supabase's own auth rate limits).

## Token verification (API)

`packages/auth/src/verify.ts` checks each bearer token against the project's JWKS (ES256/RS256), issuer
`<SUPABASE_URL>/auth/v1`, audience `authenticated` and expiry. It reads `sub`, `email`, `aal`, `session_id` and the `amr`
methods. Role or permission claims inside the token are **ignored**: roles come from Postgres only.

Errors: no header means anonymous (public routes only); malformed header or bad signature is 401 `INVALID_TOKEN`;
expired is 401 `TOKEN_EXPIRED`; a suspended user is 403 `ACCOUNT_SUSPENDED`.

## Session rules (`apps/api/src/middleware/auth.ts`)

| Session | Effective permissions | `/v1/auth/me` flag | Code on a staff route |
|---|---|---|---|
| Password sign-in, own password | All granted by the user's roles | none | none |
| Google / magic link / recovery (no `password` in `amr`) | Customer only | `passwordSignInRequired` | `PASSWORD_SIGN_IN_REQUIRED` |
| Temporary password not yet changed | Customer only | `passwordChangeRequired` | `PASSWORD_CHANGE_REQUIRED` |
| `REQUIRE_STAFF_MFA=true` and aal1 (optional, off by default) | Customer + employee self-service | `mfaRequired` | `MFA_REQUIRED` |

No authenticator app or TOTP enrolment is required. The MFA switch is kept only as optional hardening.

## Portal sessions

Each Next app uses `@supabase/ssr` cookies with no `Domain` attribute, so the website, employee portal and admin keep
independent sessions even under one parent domain. Sign-out is a server-side POST to `/auth/signout` in each app.

## Account controls

- **Suspend / reactivate** (`PATCH /v1/users/:id/status`, `users.manage`): the API refuses the user at once and the
  identity is banned at Supabase, which stops sign-in and session refresh.
- **Password recovery:** "Forgot password?" on every login page uses the website's reset flow
  (`/auth/forgot-password`, email link, `/auth/reset-password`). The recovery session itself never opens staff tools;
  the person signs in again with the new password.
- **Login throttling:** Supabase rate-limits sign-in and email sends per IP; the API adds per-client rate limits and a
  security alert on repeated refusals (`docs/security/rate-limiting.md`).
- **Show/hide password** on every sign-in and set-password form.

## Not implemented

- "Sign out everywhere" for a single user from the admin (suspension ends access; a per-device session list is not built).
- Username login: logins are work email addresses.
