# Cross-portal access

| Who | Website | Employee portal | Admin |
|---|---|---|---|
| Visitor | Browse everything public | Login page only | Login page only |
| Customer (Google or password) | Account, cart, checkout, quotes, reviews, messages | Refused ("for employees") | "No access" |
| Employee (password) | Customer features | Own attendance and leave | "No access" (no `admin.access`) |
| Employee or staff signed in with **Google** | Customer features | Refused ("sign in with your password") | Sent back to login |
| Staff with a **temporary password** | Customer features | Sent to Set your password | Sent to Set your password |
| Staff (password) | Customer features | Refused unless they also hold `employee` | Modules their permissions allow |

## How it is enforced

- **The API decides.** Every staff or employee route has `requirePermission`; the portals only mirror `/v1/auth/me`.
  Calling the API directly with any token gets the same answer as the UI.
- **Google never grants internal access.** A session without a `password` sign-in method keeps customer permissions
  only, whatever roles the account holds (Supabase may link a Google identity to the same email).
- **No self-registration** into the employee portal or admin; no public super admin route.
- **No privilege escalation:** nobody changes their own roles or status; `admin` and `super_admin` need
  `roles.manage_super`; employees cannot approve their own records or leave.
- **No IDOR:** `/v1/me/*` routes resolve the employee or customer from the session; order and quotation reads check
  ownership; admin object routes need the matching permission.
- **Separate sessions:** host-only cookies per portal; signing in on one portal does not sign you in on another.
- **Disabled accounts:** suspension is refused by the API at once and banned at Supabase.

Tests: `tests/integration/portals.test.ts`, `tests/integration/auth.test.ts`, `tests/integration/security.test.ts`,
`tests/e2e/permissions.spec.ts`, `tests/e2e/attendance.spec.ts`.
