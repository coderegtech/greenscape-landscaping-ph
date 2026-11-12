# Multi-portal tests

Run: `pnpm test` (unit), `pnpm test:integration` (API against local Postgres, Mongo, Redis and Supabase),
`pnpm build && pnpm test:e2e` (Playwright starts web 3000, admin 3001, employee 3002 and the API 4000, or reuses
running ones). All tests use generated `@test/e2e.greenscape.local` identities and clean up after themselves; nothing
runs against production.

## Coverage

| Area | Where |
|---|---|
| Google sessions get customer permissions only, even with staff/employee roles | `integration/portals.test.ts` |
| Staff provisioning: permission needed; only super admin creates administrators; temporary password never stored | `integration/portals.test.ts` |
| Temporary password: customer-only until changed; one-time change; old password stops working | `integration/portals.test.ts` |
| HR creates employee logins; employees cannot; employee role never reaches HR/user APIs | `integration/portals.test.ts` |
| Tokens: missing, malformed, forged, expired; suspension; identity relink | `integration/auth.test.ts`, `integration/security.test.ts` |
| Role changes, protected roles, no self-edit | `integration/admin.test.ts`, `integration/auth.test.ts` |
| Attendance rules, own-data only, corrections and leave approval, no self-approval | `integration/attendance.test.ts` |
| Rate limits, CSRF/origin checks, CORS | `integration/rate-limit.test.ts`, `e2e/csrf.spec.ts`, `integration/security.test.ts` |
| Employee portal: clock in (with and without JS), axe; HR creates login, first-login password change, correction, leave | `e2e/attendance.spec.ts` |
| Portal refuses customers; `/staff` redirects to the portal | `e2e/attendance.spec.ts` |
| Admin menu and pages per role (all 8 roles) | `e2e/permissions.spec.ts` |
| Analytics: only the website server may report views; per-day visitor counting; bots and junk ignored; report permissions; revenue only with `reports.sales` | `unit/analytics.test.ts`, `integration/analytics.test.ts` |
| A website visit appears on the admin Analytics page; no tracking cookies | `e2e/analytics.spec.ts` |
| Sign out everywhere (old sessions refused, refresh tokens dead at Supabase, new sign-in works); suspension ends sessions; permissions | `integration/system.test.ts` |
| System status and audit log: permissions, live checks, refusal counters, audit filters | `integration/system.test.ts`, `e2e/system.spec.ts` |
| Optional MFA (runs only with `REQUIRE_STAFF_MFA=true`) | `integration/mfa.test.ts`, `e2e/mfa.spec.ts` |

## Writing e2e tests here

- Signed-in pages keep a live notifications stream open, so `waitForLoadState('networkidle')` never settles on them; use
  `hydrated(page)` from `tests/e2e/helpers.ts` to wait until React has attached its handlers.
- Production builds keep hidden copies of recently visited routes; `getByLabel` also matches hidden inputs, so add
  `.filter({ visible: true })` where a page may be in that state (role queries already skip hidden elements).
- The staff badge in the admin header is hidden on phones: wait for it to be attached, not visible.
- Environment-dependent tests skip themselves: MFA (`REQUIRE_STAFF_MFA=true`) and Web Push alerts (`VAPID_PUBLIC_KEY`).

## Last full run (2026-11-12, production builds)

Unit 110/110, integration 181/181. E2E 256 tests: 206 passed on the first run with 2 workers; the 14 failures were
fixed (MFA-optional expectations, hydration waits, hidden duplicate fields, sign-out redirect) or skip without Web Push
keys, and all re-ran green one at a time.

## Not covered

- Real Google OAuth (needs a Google client; simulated in integration tests by an `oauth` session).
