# Security audit: Greenscape platform

Branch `security/application-hardening`, started from Phase 12 (`07c3f43`). Scope: the whole repository (API, website, admin, shared packages, Supabase config, Docker, CI). Method: code review of every middleware, route module and integration; configuration review; checks against the running local stack. **No production system was touched**, and no destructive test ran anywhere but the local Docker and Supabase services.

Severity follows impact × ease of exploitation for this business: a small shop with an owner, a few staff and public customers.

## Summary

| ID | Finding | Severity | Status |
|---|---|---|---|
| H-1 | Rate limits treat every website visitor as one client for server-side calls: anyone can lock all customers out of checkout for an hour | High | Fixed |
| H-2 | No multi-factor authentication for staff accounts with admin access | High | Fixed |
| M-1 | Account relinking by email trusts a Supabase project setting instead of checking verification | Medium | Fixed |
| M-2 | Form rate limits fail open when Redis is unavailable | Medium | Fixed |
| M-3 | Suspending a user doesn't end their Supabase sessions | Medium | Fixed |
| M-4 | No security event log for refused requests | Medium | Fixed |
| M-5 | CI has no dependency, secret, static-analysis or container scanning | Medium | Fixed (workflow written; every tool run locally, results in `vulnerability-report.md`; not yet run on GitHub) |
| M-6 | No production container images; backing services have no authentication outside the dev loopback setup | Medium | Fixed (images built and verified locally; production compose validated; not deployed) |
| M-7 | Attendance access is organisation-wide for HR; no line-manager scope | Medium | Accepted, needs stakeholder sign-off (see below) |
| L-1 | Preview and revalidation secrets compared with `===` | Low | Fixed |
| L-2 | Unique-constraint errors return database field metadata | Low | Fixed |
| L-3 | CMS links accept protocol-relative `//host` URLs | Low | Fixed |
| L-4 | Gallery and FAQ edits aren't in the audit log | Low | Fixed |
| L-5 | API docs (`/v1/docs`, CSP off) are served in production | Low | Fixed |
| L-6 | Quote attachments are not malware-scanned | Low | Accepted (documented compensating controls) |
| L-7 | Sign-in throttling is Supabase's per-IP limit only; no per-account lockout or CAPTCHA | Low | Accepted for now; CAPTCHA recommended before launch |

Every Fixed status is backed by the tests named under each finding (`security-testing.md` lists them; `vulnerability-report.md` has the scan results). Additional supply-chain fixes found by the scans: `uuid` override, GitHub Actions pinned to SHAs plus Dependabot, pnpm release-age/trust/exotic-dependency guards, npm and corepack removed from runtime images.

---

## H-1: Server-side calls share one rate-limit identity
- **Where**: `apps/api/src/middleware/rate-limit.ts`, `form-limit.ts`. They're applied to `POST /v1/checkout` (30/hour), `POST /v1/me/messages` (30/hour), and the general `/v1` limiter (300/min).
- **Root cause**: limits are keyed by `req.ip`. Cart, checkout, customer messages, staff clock-in and the whole admin console call the API from the Next.js server (server actions), so the API sees the web server's address for every visitor.
- **Impact**: the 31st checkout in an hour, from anyone, gets "Too many submissions". One person (or a script) submitting 30 checkouts through the website blocks every customer for an hour. Normal admin and website traffic together can hit 300/min and start refusing staff actions.
- **Fix**: the Next servers forward the visitor's address in `x-client-ip` together with `x-internal-key`, a server-only shared secret (`INTERNAL_API_KEY`). The API uses the forwarded address only when the key matches (constant-time compare); otherwise it uses the socket/proxy address, so the header can't be spoofed from outside. Form limits key signed-in requests by user id (so a shared office IP doesn't throttle everyone) and anonymous ones by address (IPv6 grouped per /56). Keys are hashed (HMAC), so no raw IP or user id is written to Redis.
- **Verification**: `tests/integration/rate-limit.test.ts`: two forwarded clients get separate budgets; a forged `x-client-ip` without the key is ignored; 429 carries `RateLimit`/`Retry-After` headers.

## H-2: No MFA for privileged accounts
- **Where**: `supabase/config.toml` (`[auth.mfa.totp]` disabled), `apps/api/src/middleware/auth.ts` (records `aal` but never checks it).
- **Impact**: a phished or reused staff password gives full access to orders, refunds, customer data, employee records and roles.
- **Fix**: TOTP enabled. The API refuses any permission beyond customer/employee self-service (`admin.access` and every staff permission) unless the session is `aal2`, when `REQUIRE_STAFF_MFA` is on. It's on by default; only the business-logic integration suites turn it off (`tests/integration/helpers.ts`), and `mfa.test.ts` turns it back on. The admin app sends signed-in staff without `aal2` to `/mfa`, where they enrol an authenticator (QR code) or enter their code. Enrolment is self-service on first sign-in.
- **Verification**: `tests/integration/mfa.test.ts` (aal1 staff token → 403 `MFA_REQUIRED` on staff routes and allowed on self-service routes; aal2 → allowed); e2e `tests/e2e/mfa.spec.ts` (enrol with a generated TOTP code, sign out, sign in, challenge, reach the dashboard).

## M-1: Email relinking trusts configuration
- **Where**: `apps/api/src/middleware/auth.ts` `resolveUser`.
- **Root cause**: a new Supabase identity whose email matches an existing user is linked to that user, including the user's roles. This is safe only while Supabase refuses sessions before email confirmation; that is a project setting outside this repository's control in production.
- **Fix**: before relinking, the API asks Supabase (service role, server side) whether that identity's email is confirmed; unconfirmed → 403 and no link. Every relink is written to the audit log.
- **Verification**: `tests/integration/security.test.ts` (an unconfirmed identity with an existing account's email is refused and stays unlinked; a confirmed relink is audited).

## M-2: Form limits fail open
- **Where**: `form-limit.ts` (`passOnStoreError: true`).
- **Impact**: during a Redis outage, contact, quote, checkout and message endpoints have no throttle (spam, email flooding).
- **Fix**: form, upload and checkout limits now fail **closed** (503 "temporarily unavailable, please call…"). The general read limiter still fails open, so browsing keeps working.
- **Verification**: `tests/integration/rate-limit.test.ts` with Redis pointed at a dead port: `POST /v1/contact` → 503, reads → 200.

## M-3: Suspension leaves Supabase sessions alive
- **Fix**: suspending a user bans the identity at Supabase (no refresh, no new sign-in); reactivating lifts the ban. Already-issued access tokens are refused by the API at once (existing check).
- **Verification**: `tests/integration/security.test.ts`: after suspension the API refuses the old token and a password sign-in fails as banned; after reactivation sign-in works.

## M-4: No security event log
- **Fix**: `security` log channel (pino, structured). Records 401/403/429 responses (event, path, method, request id, user id when known, hashed IP), role changes, MFA failures, relinks and webhook signature failures. Never logs tokens, passwords, emails or bodies. Repeated refusals from one source within 5 minutes raise a single `security.alert` event, which Sentry captures.
- **Verification**: `tests/unit/security-log.test.ts` (no token, email, query string or raw IP; consistent hashing); `tests/integration/security.test.ts` (one event per refusal; one alert at 20; bad webhook signature logged).

## M-5: No security scanning in CI
- **Fix**: `.github/workflows/security.yml`: `pnpm audit --prod` (fails on high/critical), OSV-Scanner on the lockfile, Gitleaks (full history), Semgrep (`p/typescript`, `p/nodejs`, `p/owasp-top-ten`, plus local rules), Trivy on the built images. Reports are uploaded as artifacts. The main CI now also runs the security-focused e2e specs.
- **Verification**: the same tools run locally where available (results in `security-testing.md`); the workflow can't run on GitHub here (no remote, D9).

## M-6: No production images; services unauthenticated
- **Fix**: multi-stage Dockerfiles for api, web and admin (`docker/api.Dockerfile`, `docker/next.Dockerfile`): `node:24-alpine`, npm and corepack removed, production dependencies only, non-root user, read-only root filesystem, health checks, no secrets baked in. `docker/compose.prod.yml` has an internal network for Postgres/Mongo/Redis (no host ports), Redis password + ACL with dangerous commands disabled, Mongo auth with a least-privilege app user, Postgres app role without DDL (migrations use a separate role), memory limits, and `cap_drop: ALL`.
- **Verification**: all three images built, ran locked down (read-only, no capabilities) and reported healthy; Trivy found 0 fixable HIGH/CRITICAL. `docker compose -f docker/compose.prod.yml config` validates and refuses missing secrets. A production deploy is Phase 13 and needs approval.

## M-7: Attendance scope is organisation-wide
- **What**: `hr_manager` sees and approves every employee's attendance and leave. There is no "team lead" role limited to direct reports, although `Employee.managerId` exists.
- **Why accepted for now**: Greenscape has one HR function and a small staff; a team-lead role would be new business process, not a fix. **Needs the owner's sign-off.** If team leads are wanted, the change is a `team_lead` role whose queries are filtered by `managerId`. That is designed in `authorization-matrix.md`.

## L-1 … L-7
- **L-1**: `x-preview-secret` (API) and `x-revalidate-secret` (web) now use `timingSafeEqual`.
- **L-2**: P2002 responses no longer include Prisma `meta` (field and constraint names).
- **L-3**: `Href` rejects `//` and `/\` prefixes (they leave the site while looking internal).
- **L-4**: create, update and delete in the gallery and FAQ collections write `AuditLog`.
- **L-5**: `/v1/docs` and `/v1/openapi.json` are only served when `API_DOCS=true` (default on outside production).
- **L-6**: quote attachments go to a private bucket, are type-checked by magic bytes, are ≤ 10 MB, are only reachable through 5-minute signed URLs by staff with `quotations.read`, and are never rendered inline by the admin. A ClamAV scan step is recommended if the business starts receiving attachments at volume.
- **L-7**: Supabase limits sign-ins to 30 per 5 minutes per IP, and passwords need upper case, lower case and a digit, length 8+. Recommended before launch: Turnstile CAPTCHA (`[auth.captcha]`), which hosted Supabase supports. Password reset already answers the same for unknown emails.

## Checked and found sound (no change)
- **JWT verification**: JWKS signature (ES256/RS256 only), issuer, audience and expiry; roles never read from the token (`packages/auth/src/verify.ts`).
- **Every staff route** has `requirePermission`; customer routes check ownership (orders by owner or hashed link key, quotes `/mine`, conversations by user id, carts by user or hashed token). The 8-role e2e matrix covers the admin.
- **Privilege escalation**: nobody changes their own roles or status; `super_admin` changes need `roles.manage_super`; role lists are validated against the catalogue.
- **Injection**: no string-built SQL. Raw queries are Prisma tagged templates; sort keys come from fixed maps; LIKE patterns are escaped. Mongo filters are built server-side from Zod-validated scalars; bodies are parsed by strict schemas (unknown keys stripped, so no `$` operators reach `$set`).
- **XSS**: rich text is stored as ProseMirror JSON and rendered as React elements; link schemes are allow-listed; the only `dangerouslySetInnerHTML` uses are JSON-LD with `<` escaped and the one-line JS flag. CSP is on both apps (Phase 12).
- **CSRF**: the API uses bearer tokens, not cookies, so a cross-site request carries no credentials. Cookie-authenticated mutations on the website and admin are Next server actions, which reject a foreign `Origin` (negative test added, `tests/e2e/csrf.spec.ts`). Cookies are SameSite=Lax and httpOnly where the server owns them.
- **SSRF**: the only server-side fetches of user-influenced URLs are next/image, restricted to configured remote patterns with private IPs refused outside local dev. The migration scripts are operator-run against fixed hosts.
- **Payments**: server-side prices and totals, signed webhooks over the raw body, replay-safe event table, idempotency keys, live keys refused without explicit approval, stock row locks (load-tested: 300 shoppers for 40 units → 40 orders).
- **Secrets**: no secret in either client bundle (scanned after build); `.env` is gitignored; `.env.example` holds placeholders only; the service role key is used only in the API and server-only modules (`import 'server-only'`).
- **Redis** holds caches, rate-limit counters and job state only; stock, payments, attendance and permissions are read from Postgres (permission cache ≤ 60 s, invalidated on change).

## Verification (final run, 2026-11-10/11)
- Typecheck and lint: clean.
- Unit: **49 passed**. Integration: **109 passed** (14 files, including `security`, `rate-limit` and `mfa`).
- e2e full suite: **134 passed**, 27 skipped (mobile-only/desktop-only duplicates), 3 failed:
  - Two attendance tests failed because the run crossed midnight and a "yesterday" row appeared. That exposed a real bug, now fixed: the per-day "Correct" button's accessible name didn't contain its visible text (WCAG 2.5.3). It also exposed an ambiguous test locator, also fixed.
  - The staff-MFA sign-in test exceeded its wait for the 60-second permission cache under load; its budget was raised.
  - Re-run of `attendance.spec.ts` and `auth.spec.ts`: **22 passed**.
- Scanners: see `vulnerability-report.md`. pnpm audit 0; OSV 0 with 7 documented dev-only exceptions; Gitleaks 0 with a narrow allowlist; Semgrep 0 code findings; Trivy 0 fixable HIGH/CRITICAL in all three images.
- Not run: OWASP ZAP (needs staging); GitHub Actions (no remote, D9).
