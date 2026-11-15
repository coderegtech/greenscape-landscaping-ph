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
| Clock-in selfies (off by default, required/optional, owner and type checks, HR link, nothing kept when off, deletion after retention), correction attachments, HR decisions reaching the employee portal | `integration/attendance-media.test.ts`, `e2e/attendance.spec.ts` |
| Analytics CSV (permission, layout, formula-safe) | `integration/analytics.test.ts` |
| Optional MFA (runs only with `REQUIRE_STAFF_MFA=true`) | `integration/mfa.test.ts`, `e2e/mfa.spec.ts` |

## Authentication suites (`tests/e2e/auth`, `employee`, `admin`)

| Spec | Covers |
|---|---|
| `auth/invalid-credentials` | All three login screens: wrong password and unknown account give the same message, validation before any request, no session or internal detail |
| `auth/customer-google` | Google button follows config and never appears on staff portals; callback refuses bogus codes and off-site `next`; the real Google round trip is **blocked** (no OAuth client or test identity) |
| `auth/employee-login` | HR provisions in the admin, temporary-password sign-in, forced change, dashboard, DB linkage and audit; own-password sign-in; disabled employee |
| `auth/admin-login` | Admin sign-in without an authenticator step, admin vs super-admin permissions, customer and employee refused (page and API), disabled admin |
| `auth/superadmin-login` | Every console area, creating an administrator, sign-out; admins cannot change, suspend, sign out or out-rank a super admin |
| `auth/session-persistence` | Navigation and reloads on each portal, tampered cookie = signed out, host-only Lax cookies, nothing secret in local storage |
| `auth/logout` | Each portal: sign-out ends the session, Back shows nothing private, the old token gets 401 |
| `auth/cross-portal-access` | 12-endpoint × 5-role API matrix (401/403/200), refused writes, bad tokens, other people's quotes and orders, browser portal refusals |
| `employee/attendance-access` | Clocking needs an employee session, server time, identity in the body ignored, duplicates refused, no self-approval |
| `admin/cms-permissions` | CMS API closed to guests, customers and employees; drafts private until published; admin CMS pages by role |

Fixtures: `tests/e2e/fixtures/test-users.ts` (synthetic accounts per role, never logged). Test passwords come from
`E2E_PASSWORD` or are generated per run. Report: `docs/testing/authentication-playwright-report.md`.

## Visual regression

`pnpm test:visual` (own config, `playwright.visual.config.ts`; not part of `pnpm test:e2e` or CI) screenshots 8 pages on
desktop and phone (home, services, projects, shop, contact, and the three sign-in screens) with reduced motion and
compares them with the baselines in `tests/e2e/visual/visual.spec.ts-snapshots/` (2% pixel tolerance). Baselines are
per operating system (`-win32`, `-linux` in the file name). After an intended design change, review the diff and run
`pnpm test:visual --update-snapshots`. Needs production builds (`pnpm build`), like the e2e suite.

## Writing e2e tests here

- Signed-in pages keep a live socket open, so `waitForLoadState('networkidle')` never settles on them; use
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
