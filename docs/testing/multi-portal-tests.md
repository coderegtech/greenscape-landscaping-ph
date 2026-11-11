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
| Optional MFA (runs only with `REQUIRE_STAFF_MFA=true`) | `integration/mfa.test.ts`, `e2e/mfa.spec.ts` |

## Not covered

- Real Google OAuth (needs a Google client; simulated in integration tests by an `oauth` session).
- Website traffic analytics (not collected; `docs/admin/analytics-dashboard.md`).
