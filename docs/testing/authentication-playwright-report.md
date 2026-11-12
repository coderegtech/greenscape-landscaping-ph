# Authentication: Playwright browser test report

Only results that were actually executed and observed are reported as Pass. Blocked means it could not be executed
here; the reason is given.

## Environment

| Item | Value |
|---|---|
| Date | 2026-11-12 |
| Environment | Local development machine (Windows 11), isolated local services: Supabase CLI (Auth, Storage), Postgres 17, MongoDB 8, Redis 7 in Docker |
| Apps under test | Production builds (`pnpm build`, `next start`) of website :3000, admin :3001, employee portal :3002; API :4000 (`tsx`) |
| Browser | Chromium 158.0.8127.18 (Playwright 1.65.0), projects `desktop` (1440×900) and `mobile` (Pixel 7 emulation) |
| Node | 24.13.1 |
| Code | Branch `test/auth-playwright`, based on `main` at `deaf345` |
| Test data | Synthetic `@e2e.greenscape.local` accounts created per test and removed by the global teardown. Password from `E2E_PASSWORD` or generated per run; never hardcoded or logged |
| Evidence | HTML report `playwright-report/` and failure traces, videos, screenshots in `test-results/` (both local, gitignored; failure snapshots can show the synthetic password typed into a field, so keep them local) |

## Results summary

Final full run of every authentication-related suite on one worker (new suites plus the existing `auth`,
`permissions`, `csrf`, `system` and `attendance` suites), against servers Playwright started from this code:

| | Count |
|---|---|
| Test cases | 120 (60 per device project) |
| Passed | 77 |
| Failed in the full run | 9: re-run one at a time, 8 passed; the 9th is the mobile customer sign-out case below |
| Skipped | 34: desktop-only admin tests in the mobile project (32) and the Google round trip (2, Blocked) |
| Blocked scenarios | Google provider round trip; login throttling |

All 9 failures were timeouts. In that hour local Supabase Auth logged 39 `request_timeout` errors (10-second deadline)
on account creation, deletion, sign-in and session checks, while the machine had about 0.4 GB of 15 GB RAM free and
other sessions' builds and servers were running. Every one of the 9 passed in other runs on this branch:
- **Serial re-run:** 8 of the 9 passed.
- **Earlier serial run:** all 17 previously failing tests passed.
- **The 9th (mobile customer sign-out):** its failure screenshot shows the account page loaded and signed in after the
  10-second wait. It now has a 30-second wait for that first page load.

The final confirmation runs after the last fix (see below) could not use the default ports: another session's servers
occupied 3001, 3002 and 4000. That is recorded under Remaining risks.

- **Authentication success paths:** customer, employee (temporary password, then own password), administrator and super
  admin sign-in all passed on desktop. Customer and employee also passed on mobile.
- **Authorization denials:** API matrix (12 endpoints × 5 roles), 6 refused write endpoints × 3 roles, bad tokens,
  other people's quotes and orders, browser refusals per portal: all passed.
- **Session and logout:** persistence on all three portals, tampered cookie, cookie flags, sign-out on all three portals
  including the old-token check: all passed (after fix 1).
- **Google OAuth:** our side passed (button, callback, redirect guard). **The Google round trip itself is Blocked**, not
  passed.
- **Outstanding issues:** none open in the application. Two blocked verifications and the risks below.

## Scenarios

### Phase 1: customer website

| Scenario | Role | Expected | Actual | Status |
|---|---|---|---|---|
| Public pages (home, services, projects, gallery, stories, shop, product, contact) open without sign-in | Guest | 200, no login redirect | Covered by `public-site`, `redesign`, `shop` suites (green in CI run 43152128859) | Pass |
| `/account`, `/checkout`, `/messages` while signed out | Guest | Redirect to `/auth/login?next=…`, no data | `auth.spec` "account is protected…" | Pass |
| Quote, review, cart, checkout actions while signed out | Guest | API 401, sign-in prompt | `/v1/orders/mine` 401 in matrix; quote/cart prompts in `public-site`/`shop` suites | Pass |
| Google button | Customer | Shown only when `NEXT_PUBLIC_AUTH_GOOGLE=true`; never on admin or employee login | Hidden (Google is off here); no Google button on staff portals | Pass |
| OAuth callback with a bogus or missing code | Guest | Fixed error, no provider text echoed | `/auth/login?error=link`, "That link is invalid or has expired." | Pass |
| Callback `next=https://evil.example/…` or `next=//evil.example` | Guest | Stay on the site | Stays on `localhost:3000` | Pass |
| **Google provider round trip** (button → Google → Supabase callback → profile with customer role) | Customer | Profile created, customer role, back to destination | No Google OAuth client in local Supabase and no authorised Google test identity; Google's bot protection is not automated | **Blocked** |
| Google session holding staff/employee roles gets customer permissions only | Customer | `PASSWORD_SIGN_IN_REQUIRED` on staff routes | `tests/integration/portals.test.ts` (simulated `oauth` session against the real API) | Pass (integration) |
| Session persists across navigation and reload | Customer | Still signed in | Pass on desktop and mobile | Pass |
| Sign out, Back, protected page, old token | Customer | No account data; old access token 401 | Before fix: old token **200**. After fix: 401 `SESSION_ENDED` | Pass (after fix 1) |
| Damaged session cookie | Customer | Treated as signed out on web and admin | Redirect to login on both | Pass |
| Cookie flags | Customer | Host-only (no `Domain`), `SameSite=Lax`, nothing secret in localStorage | As expected | Pass |
| Customer opens employee portal / admin | Customer | Refused, no data | "This portal is for Greenscape employees" / "No admin access"; API 403 | Pass |
| Customer reads another customer's quote or order | Customer | 403/404 | Quote detail 403, not in `/mine`; foreign order 403/404 | Pass |

### Phase 2: employee portal

| Scenario | Role | Expected | Actual | Status |
|---|---|---|---|---|
| HR creates employee + login in the admin | HR manager | Supabase identity, user row with `employee` role, `mustChangePassword`, linked HR record, audit entry, one-time password shown | All verified in DB; password shown once | Pass (desktop) |
| First sign-in with temporary password | Employee | Forced to `/password`, cannot skip, then dashboard | As expected; "Hello, Nora" and Clock in visible | Pass |
| Sign-in with own password | Employee | Dashboard; API roles `['employee']`, no `admin.access` | As expected | Pass |
| Wrong password / unknown account | Anyone | Same message, no session, no internals | Identical "Email or password is incorrect."; identity provider 400 both times | Pass |
| Empty / malformed fields | Anyone | Explained before any request | Validation shown; zero requests sent | Pass |
| Disabled employee (suspended while signed in) | Employee | Loses access at once; cannot sign in again | Dashboard data gone on reload; API refuses token; sign-in refused | Pass |
| Session persistence; sign out; Back; old token | Employee | As customer | Pass (old token 401 after fix 1) | Pass |
| Password reset link | Employee | Points to the website's reset flow | `Forgot password?` → `localhost:3000/auth/forgot-password`; reset flow itself covered in `auth.spec` | Pass |
| Employee opens admin / HR / user APIs | Employee | Refused | "No admin access"; API 403 | Pass |
| **Repeated failed sign-ins are throttled** | Anyone | 429 after the configured limit | Local Supabase does not enforce it: 35 consecutive failures all 400, none 429 (`sign_in_sign_ups = 30` is configured) | **Blocked** (verify on the hosted Supabase project) |

### Phase 3: admin and super admin

| Scenario | Role | Expected | Actual | Status |
|---|---|---|---|---|
| Admin sign-in | Admin | Dashboard, **no `/mfa` step**, admin permissions only | No `/mfa` visited; admin roles locked in "Create staff account"; no `roles.manage_super`, `settings.secrets` | Pass |
| Super admin sign-in and areas | Super admin | Users, Employees, Pages, Analytics, System status, Audit log, Settings | All visible | Pass |
| Super admin creates an administrator | Super admin | Account with one-time password | Created; password shown | Pass |
| Admin vs super admin | Admin | Cannot change roles, suspend, sign out, out-rank or self-promote | All 403; roles unchanged | Pass |
| Customer / employee at admin login | Customer, employee | "No admin access" on every page; API 403 | As expected | Pass |
| Disabled admin | E-commerce manager | Existing token refused; sign-in refused | As expected | Pass |
| Per-role menu and pages (8 roles) | All | Menu = permissions; allowed pages open; others bounce | `permissions.spec` | Pass |

### Phase 4: cross-portal (API, status codes guest / customer / employee / admin / super)

| Endpoint | Expected | Actual |
|---|---|---|
| `GET /v1/auth/me` | 401 200 200 200 200 | Same |
| `GET /v1/me/attendance/today` | 401 403 200 403 403 | Same (staff without an HR record are not employees) |
| `GET /v1/orders/mine` | 401 200 200 200 200 (own orders only) | Same |
| `GET /v1/hr/employees`, `/v1/hr/settings/selfie`, `/v1/users`, `/v1/cms-admin/pages`, `/v1/admin/overview`, `/v1/admin/analytics`, `/v1/admin/system`, `/v1/admin/audit`, `/v1/shop-admin/inventory` | 401 403 403 200 200 | Same |
| Writes: create user, create employee, selfie setting, site config, product edit, correction decision | Guest 401, customer 403, employee 403 | Same |
| Garbage, `Basic`, forged HS256, unsigned (`alg: none`), empty bearer | 401, no stack or internals | Same |

All Pass. 401 (no or invalid session) and 403 (no permission) are distinct throughout.

### Phase 5: attendance

| Scenario | Expected | Actual | Status |
|---|---|---|---|
| Clock in without a session | 401 | 401 | Pass |
| Clock in with another employee's id and a fake time in the body | Ignored: own record, server time | Own record; time within a minute of the server's; other employee untouched | Pass |
| Duplicate clock-in | 409 | 409 | Pass |
| Read another employee's records | 403 | 403 | Pass |
| Employee approves a correction | 403 | 403 | Pass |
| HR approves their own correction | 403 | 403 | Pass |
| HR approves someone else's | 200 | 200 | Pass |
| Customer requests a correction | 403 | 403 | Pass |

### Phase 6: CMS

| Scenario | Expected | Actual | Status |
|---|---|---|---|
| Guest / customer / employee list, create, publish | 401 / 403 / 403 | Same | Pass |
| Content manager creates a draft | 201; public API 404 | Same | Pass |
| Publish | Public API serves it | Same | Pass |
| Unpublished edit after publishing | Public API and website still show the published version | Same | Pass |
| Admin CMS pages by role | Content manager in; employee "No admin access" | Same | Pass |

### Phase 7: Supabase Auth and API verification (code review plus tests)

- Tokens are verified with the project JWKS (ES256/RS256), issuer and audience checked, and expiry enforced.
  Roles come from Postgres, never from the token (`packages/auth/src/verify.ts`).
- Account status is checked on every request; suspended accounts are refused and their sessions ended.
- Service-role key is used by the API only; Semgrep rule `greenscape-service-key-outside-api` blocks it in the apps.
- OAuth `next` destinations are limited to same-site paths (`safeNext`); Supabase redirect URLs are allow-listed per
  portal (`supabase/config.toml`).
- Expired and forged tokens: forged and unsigned covered above; expired tokens covered by
  `tests/integration/auth.test.ts`.

## Issues found and fixed

| # | Issue | Severity | Fix | Regression tests |
|---|---|---|---|---|
| 1 | **A copy of the access token kept working against the API after sign-out** (up to an hour). Access tokens are verified locally, and sign-out only cleared cookies and the Supabase refresh token. Reproduced on all three portals: old token → 200. | High | Each portal's `/auth/signout` first calls `POST /v1/auth/logout`. That stores the session id in Redis until the token would have expired, and the API refuses that session's tokens with 401 `SESSION_ENDED`. Other devices' sessions are unaffected. If Redis is down the check is skipped and tokens still expire. | `tests/e2e/auth/logout.spec.ts` (3 portals), `tests/integration/system.test.ts` "sign out" |
| 2 | Long account emails ran off the right edge on phones (account page, any fact list). | Low (UI) | Fact list values wrap anywhere (`packages/ui/src/layout/primitives.tsx`). | On-screen check in `session-persistence.spec.ts` |
| 3 | Test hygiene: the e2e password was hardcoded in the repository. | Low | `E2E_PASSWORD` or a per-run random password. | All suites |

Not application bugs, found while testing:
- **Shared ports.** Playwright reuses any server already on its ports, so a leftover or another session's server gets
  tested instead (it happened twice here).
- **Supabase timeouts under memory pressure** (see Results summary).

## Remaining risks and follow-ups

1. **Google sign-in is unverified end to end.** Configure the Google provider on the staging Supabase project and do
   one manual sign-in with an authorised test account: check the customer profile, the customer role, the return
   destination, and that an employee's Google sign-in gets no internal access.
2. **Login throttling is unverified.** Local Supabase does not enforce it. Check on staging that repeated failures from
   one address get 429.
3. **Sign-out ends the user's refresh tokens on every device** (Supabase default global scope). Other devices' current
   access tokens remain valid until they expire (at most an hour). Acceptable, but worth knowing.
4. **Test isolation on a shared machine.** Run the e2e suites only when no other session holds ports 3000–3002 and 4000,
   or give Playwright its own ports. CI is unaffected.
5. **Final confirmation runs after fix 2 hit another session's API on port 4000.** The UI check for fix 2 passed. The
   sign-out fix itself was confirmed on our own servers in the full run (all three portals' logout tests passed on
   desktop).

## How to reproduce

```bash
pnpm build
npx playwright test tests/e2e/auth tests/e2e/employee tests/e2e/admin --project desktop
npx playwright test tests/e2e/auth --project desktop --headed     # watch it in a browser window
npx playwright show-report
```
