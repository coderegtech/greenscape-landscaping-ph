# Progress

| Date | Phase | Done | Next |
|---|---|---|---|
| 2026-11-09 | 1 Discovery | Playwright crawl of 31 public pages (desktop + mobile), axe-core, Lighthouse, network/console capture, public admin code inspection → `docs/audit/` | — |
| 2026-11-09 | 2 Planning | `architecture.md`, `database-schema.md`, `migration-plan.md`, `implementation-plan.md` | — |
| 2026-11-09 | 3 Foundation | pnpm monorepo; Docker Compose (Postgres 17, Mongo 8 replica set, Redis 7); Prisma 7 schema (42 tables) + init migration with CHECK constraints; Mongo CMS Zod schemas + indexes; Redis cache package; Express 5 API (health, request ids, pino logging, helmet, CORS allow-list, Redis rate limit, central errors, OpenAPI 3.1 + Swagger UI, Sentry hook); Next.js 16 web + admin shells; Vitest unit (7) + integration (13), Playwright e2e (6); GitHub Actions CI | — |
| 2026-11-09 | 4 Authentication | Local Supabase (ES256 signing keys, email verification, stronger password policy); `packages/auth` (JWKS verification, Next.js session helpers, server API client); RBAC catalog with 8 roles / 42 permissions + idempotent seed + `grant-role` CLI; API: authenticate middleware (user mapping, email relink, suspension), `requirePermission`, `/v1/auth/me`, users list, role and status changes with audit log + immediate permission-cache invalidation; web: sign up, email confirmation, sign in, forgot/reset password, Google button (env-gated), protected account page; admin: session-gated proxy, staff-only access check; `packages/ui` (form primitives, auth forms); tests: unit 18, integration 24, e2e 24 (3 consecutive green runs) | — |
| 2026-11-09 | 5 Design system | Direction via Hallmark (theme *Hedgerow*, greens rotated onto brand #163d08): tokens in `packages/ui/src/styles/theme.css` (site + admin cream theme + cream/deep bands), Prata + Manrope via next/font; 17 shadcn/Radix components installed and normalised to the design floor; Button/Field/Input/Select/Badge/Checkbox/Toaster/Skeleton/Table/Photo rebuilt on tokens; motion primitives (CSS Reveal rise/fade/mask with stagger, Motion Parallax/Counter/SwapNumber), all reduced-motion and no-JS safe; layout templates (SiteHeader with keyboard menus + mobile sheet, SiteFooter, Section/Band/SectionHeading/FactList, PageHero, FieldIndex, AdminShell with permission-filtered nav); `/design` gallery; auth screens restyled; ESLint (TS, hooks, Next, jsx-a11y) + lint in CI; e2e: axe on 6 pages × 2 viewports, no-JS, reduced motion, keyboard nav, overflow at 4 widths, fold check (57 passing, 3 green runs); screenshots `docs/screenshots/phase-5/` | Phase 6: public website |

## Decisions (D1–D9) — defaults accepted 2026-11-09
| # | Decision | In effect |
|---|---|---|
| D1 | Supabase | Local Supabase CLI (`supabase start`) — set up in Phase 4 |
| D2 | Payments | Mock adapter; Stripe test adapter built and unit-tested |
| D3 | Firestore source data | Public content only, from rendered pages |
| D4 | Admin walkthrough | Admin features remain *inferred, unverified* |
| D5 | Payroll/gov't-ID fields | Not migrated, not modeled |
| D6 | Clock-in photos | Off by default, feature-flagged, consent required |
| D7 | Delivery fees | Flat fee per municipality, admin-editable table |
| D8 | Production PH payment provider | Deferred; interface built now |
| D9 | Git remote | Local git only; CI workflow written but not yet run on GitHub |

## Deviations from the original plan
- **OpenAPI** is built with Zod 4's native `z.toJSONSchema` instead of `@asteasolutions/zod-to-openapi` (its prototype patching doesn't attach to Zod 4.6 schemas).
- **API runs TypeScript via `tsx` in production** instead of a tsup bundle: bundling inlined CJS deps of workspace packages and broke under ESM; running source removes that build step.
- **TypeScript 5.9**, not 7.0 (native rewrite), for Next.js type-check compatibility.
- **Prisma 7.10.1** pinned: npm's `latest` tag currently points at an 8.0 release candidate.
- After sign-in/out the forms do a full page load instead of client routing: `router.replace()` + `router.refresh()` intermittently failed to commit the navigation in Next 16.
- ESLint added in Phase 5 (flat config; `transition-all` is a lint error).
- **Design-system bugs caught by the new tests and fixed:** named `--spacing-*` tokens overrode `max-w-md/lg` in Tailwind v4 (removed; numeric scale used); a route-level `loading.tsx` hid all content from no-JS visitors (removed from web); wordmark accessible name didn't contain its visible text; `aria-label` on a span; wide table not keyboard-scrollable; narrow columns overridden by the container's max-width; Select rendered 36px instead of 48px.
- shadcn CLI resolved our `cn` alias to an unrelated npm package named `cn`; replaced with our own `lib/utils` and the package removed.
- Local service ports are offset (55433/57017/56379) because the defaults are used by other projects on this machine.

## Not yet done
- CI has not run on GitHub (no remote). Every CI step was run locally and passes.
- Google sign-in is wired but needs a Google OAuth client configured in Supabase (`[auth.external.google]`) and `NEXT_PUBLIC_AUTH_GOOGLE=true`; untested end-to-end.
- `/privacy` (linked from the sign-up consent) and the header/footer destinations (`/services`, `/shop`, `/quote`, `/cart` …) don't exist until Phase 6; their prefetches log 404s. The home-page e2e console check filters 404s until Phase 6 adds a link check.
- The design gallery uses Greenscape's own photos straight from the current Firebase Storage; they move to Supabase Storage in migration (Phase 11).
- Admin MFA enforcement and "sign out everywhere" — see `security.md` limitations.
