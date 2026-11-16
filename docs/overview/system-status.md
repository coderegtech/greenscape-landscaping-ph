# System status

What is built on `main`, checked against the code and the running application on 2026-11-16. "Verified" means a
documentation screenshot of the feature was captured from the running app
([route coverage](route-coverage.md)) and/or an automated test covers it (`tests/`). History of each phase:
[progress.md](../progress.md).

## Status by portal

| Area | Status | Evidence |
|---|---|---|
| Customer website: home, about, services, projects, gallery (masonry + lightbox), stories, testimonials, FAQ, contact, quote, legal pages | Implemented and verified | screenshots, `tests/e2e/public-site.spec.ts`, `redesign.spec.ts` |
| Shop: catalogue, product page, cart, checkout, mock test payment, order page | Implemented and verified | screenshots, `tests/e2e/shop.spec.ts` |
| Customer accounts: email + password, verification, reset, account, notifications, messages | Implemented and verified | screenshots, `tests/e2e/auth.spec.ts` |
| Customer Google sign-in | Implemented, environment-gated (`NEXT_PUBLIC_AUTH_GOOGLE`) | `tests/e2e/auth/customer-google.spec.ts`; needs a Google OAuth client in Supabase per environment ([google-oauth.md](../auth/google-oauth.md)) |
| Employee portal: login, first-login password, dashboard + clock card, attendance + month calendar, schedule, requests (corrections, leave), notifications, profile | Implemented and verified | screenshots, `tests/e2e/attendance.spec.ts` |
| Clock-in selfies | Implemented (HR setting, off by default) | `attendance.spec.ts` (selfie case) |
| Admin: dashboard, analytics, orders, products, inventory, customers, quotations, messages, sales report | Implemented and verified | screenshots, `tests/e2e/admin.spec.ts`, `analytics.spec.ts` |
| Admin: CMS (pages, services, projects, stories, gallery, testimonials, FAQs, site settings), drafts, preview, scheduled publishing, revisions | Implemented and verified | screenshots, `tests/e2e/cms.spec.ts` |
| Admin: employees, schedules, attendance board, corrections, leave queue, balances, leave settings, attendance report | Implemented and verified | screenshots, `attendance.spec.ts` |
| Admin: users, built-in + custom roles, settings, delivery areas, system monitoring, audit log | Implemented and verified | screenshots, `permissions.spec.ts`, `system.spec.ts` |
| Admin: AI assistant settings, knowledge, conversation review | Implemented and verified | screenshots, `assistant.spec.ts` |
| Staff MFA (TOTP) | Implemented, optional (`REQUIRE_STAFF_MFA`, default false) | `mfa.spec.ts` |
| Real-time updates (Socket.IO + Redis adapter) | Implemented and verified | `realtime.spec.ts`, `notifications.spec.ts` |
| Web Push | Implemented, needs VAPID keys per environment | `notifications.spec.ts` (skips without keys) |
| **Installable PWA (web app manifest)** | **Not on `main`** | No `apps/*/app/manifest.ts` on `main`; manifests are on the unmerged branches `claude/greenscape-pwa-branding-09917e` and `claude/pwa-push-gaps` |
| **Offline support** | **Partial**: an offline banner only | The service worker handles push and notification clicks; it has no `fetch` handler and caches nothing |
| Real payments | **Not built by decision** (D2, D8) | `PAYMENT_PROVIDER=mock` locally; Stripe test-mode adapter exists; live keys refused; PH provider deferred |
| Payroll | **Excluded by decision** (D5) | No pay, allowance or government-ID fields in the schema |

## Stack discrepancies

The brief listed an expected stack. What the code actually uses:

| Layer | Expected | Verified on `main` | Note |
|---|---|---|---|
| Frontend | Next.js App Router | Next.js 16.4, React 19, three apps | ✓ |
| Language | TypeScript | TypeScript 5.9 (pinned, not 7) | ✓ |
| Backend | Express.js | Express 5, runs TypeScript via `tsx` | ✓ |
| Database | PostgreSQL + Prisma | PostgreSQL 17, Prisma 7.10.1 (driver adapter) | ✓ |
| Auth | Supabase Auth | Supabase Auth, JWKS verification in the API | ✓ |
| Storage | Supabase Storage | Supabase Storage, signed uploads | ✓ |
| CMS | MongoDB JSON | MongoDB 8 documents, Zod-validated (`packages/content`) | ✓ |
| Cache | Redis | Redis 7 via ioredis: cache-aside, tags, locks, rate limits | ✓ |
| Real-time | Socket.IO | Socket.IO 4 + `@socket.io/redis-adapter` | ✓ (replaced an earlier SSE stream) |
| Push | Web Push API | `web-push` + push-only service worker | ✓ |
| Payments | Stripe test or configured provider | Mock provider by default; Stripe test adapter | ✓, mock is the local default |
| Styling | Tailwind CSS | Tailwind 4 | ✓ |
| UI | shadcn/ui | shadcn/Radix components in `packages/ui` | ✓ |
| Animation | Motion for React | `motion` in `packages/ui` for portal widgets; **public pages use CSS scroll-driven animation, no motion library** | Differs on public pages, on purpose (performance) |
| Testing | Playwright / Vitest | Playwright 1.65, Vitest 5, axe-core | ✓ |
| Deployment | Docker / Dokploy | One Dockerfile per app, Dokploy | ✓ |
| CI/CD | GitHub Actions | GitHub Actions (CI, Security, Production pipeline, Deploy); GitLab mirror runs CI only | ✓ |
| AI | (not listed) | AI assistant (`@anthropic-ai/sdk`, OpenAI-compatible provider option) | Extra |

## Known limitations

- Lighthouse performance on home (79), project list (81) and shop (89) is below the 90 target
  ([core-web-vitals.md](../performance/core-web-vitals.md)).
- The old site has no prices or stock: products show "Price on request" until staff add a priced size; delivery
  zones are seeded inactive with no fee.
- Private business data (customers, employees, time logs) was never migrated: no authorised export (D3).
- Live socket signals are emitted after commit without an outbox: a crash between commit and emit loses that signal,
  never the record ([realtime/README.md](../realtime/README.md)).
- Video demonstrations are planned but not recorded ([video/README.md](../video/README.md)).
- **Dokploy** settings follow its documentation but have not been run against a live Dokploy instance yet ([dokploy.md](../deployment/dokploy.md)).
