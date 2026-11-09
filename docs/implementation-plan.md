# Implementation Plan

Status: Phase 1 (Discovery) and Phase 2 (Planning) done. Nothing is built yet.

## 1. Decisions needed before Phase 3

| # | Decision | Why it blocks | Default if no answer |
|---|---|---|---|
| D1 | Supabase project (dev) URL + anon key + service-role key, or OK to use local `supabase start` | Auth + Storage | Local Supabase CLI in Docker |
| D2 | Stripe test account available? Else mock adapter only | Checkout | Mock adapter; Stripe adapter built + unit-tested against Stripe's fixtures |
| D3 | Authorized read access to Firestore/Storage export (service account JSON or `gcloud firestore export`) | Migration of products, projects, stories, testimonials, quotations, employees | Migrate public content only, by scraping rendered pages |
| D4 | Admin credentials for the current admin, for a read-only walkthrough | Verify admin workflows | Admin features stay labeled *inferred from public client code* |
| D5 | Employee records contain `dailyRate`, `sss`, `philhealth`, `pagibig`, `foodAllowance`, `uniformBond`. Confirm these are **not** migrated | Payroll exclusion + DPA | Not migrated |
| D6 | Keep clock-in photo verification (exists today)? | Privacy, consent | Off by default, feature-flagged, consent required |
| D7 | Delivery area + fee rules (Palawan only? flat or by municipality?) | Checkout totals | Flat fee by municipality table, admin-editable |
| D8 | Production PH payment provider (PayMongo / Xendit / Maya) | Later swap | Build interface now, decide before go-live |
| D9 | GitHub remote for the rebuild branch + CI | PR workflow | Local git only |

## 2. Roadmap (dependency order)

Each phase ends with: tests green, Playwright screenshots reviewed at 390/768/1024/1440, docs updated, commit, PR.

| Phase | Scope | Exit criteria |
|---|---|---|
| 3 Foundation | pnpm monorepo, `packages/config`, Docker Compose (pg/mongo/redis), Prisma init + first migration, Mongo client + Zod schemas, Redis client, Express skeleton (health, logging, errors, helmet, CORS, rate limit, OpenAPI), Next.js `web` + `admin` shells, Vitest + Playwright wiring, GitHub Actions CI | `docker compose up` → `/v1/health` green for all deps; CI passes |
| 4 Auth | Supabase SSR in both Next apps, Express JWKS verification, `User` upsert, roles/permissions seed, `requirePermission`, admin login, customer sign-up/verify/reset/Google | Integration tests: each role allowed/denied on sample routes; e2e login flows |
| 5 Design system | Tokens, Tailwind preset, `packages/ui` primitives, layout templates, motion primitives, loading/skeleton set, `docs/ui-ux-guidelines.md`, `docs/animation-system.md` | Storybook-free component gallery page in `web` (`/_design`, dev only) screenshot-reviewed |
| 6 Public site | All marketing routes from CMS (seeded from audit content), quotation multi-step form → Postgres + email, contact, redirects from legacy `*.html` URLs | Every legacy URL 301s or renders; Lighthouse ≥ 90 perf / 95 a11y+SEO on home, service, product, story |
| 7 CMS | Admin page/section editor, rich text (Tiptap → JSON), media library + drag-drop upload, drafts, revisions/rollback, scheduled publish worker, preview mode, JSON import/export, cache + ISR invalidation, testimonial moderation | e2e: edit → preview → publish → public page updates; rollback restores |
| 8 E-commerce | Catalog/search/filter, variants, cart (guest + account merge), checkout with reservations, mock + Stripe test, webhooks, orders, fulfillment, cancellations/refunds, stock movements, low-stock alerts, CSV import/export | Concurrency test: N parallel checkouts on stock=1 → exactly one order; webhook replay idempotent |
| 9 Attendance | Employees, departments, schedules (split + overnight), clock-in/out, late/undertime/OT computation, corrections + approvals, leave types/balances/requests/calendar, reports + CSV/XLSX | Unit tests for time math across midnight/DST-free Manila; e2e employee clock-in → manager approve |
| 10 Admin | Overview dashboard, tables (filter/sort/paginate/bulk), customers, quotations inbox, messages, users & roles, settings, reports | Permission matrix e2e per role |
| 11 Migration | Firestore → Postgres/Mongo, Storage → Supabase, Firebase Auth users → Supabase (email match, password users can't be migrated → Google re-link / reset flow) | Dry-run report with record counts + checksums; asset 404 check = 0 |
| 12 Optimization | Bundle analysis, image pipeline, CWV, security headers/CSP, load test on catalog + checkout | Targets in §5 met or documented |
| 13 QA / release | Full e2e + visual regression, staging run, deploy + rollback runbooks | Sign-off checklist in `docs/deployment.md` |

## 3. UI/UX skill selection

Installed skills found in this environment, and where each is used:

| Skill | Use |
|---|---|
| `hallmark` | Primary design direction for the new public site (it is built for *new* pages that must not look generated) |
| `ui-ux-pro-max` | Palette, font pairing, UX guideline lookups; Next.js/shadcn stack guidance |
| `shadcn` | Component install/composition in `packages/ui`, theme from tokens |
| `emil-design-eng` | Component polish, interaction detail |
| `animate` / `animation-performance` | Building each motion pattern; keeping to transform/opacity |
| `apple-design` | Gesture/sheet patterns for mobile menu, cart drawer, gallery lightbox |
| `mobile-native` | 390 px polish: safe areas, tap highlight, 100dvh, input zoom |
| `web-design-guidelines` | Review pass before each public-site PR |
| `review-animations` *(not installed)* → use `improve-animations` for the audit pass |
| `break-ui` | Worst-case data pass on product cards, tables, forms |
| `ask-sonner` | Toasts |

Each skill is read at the start of Phase 5 and its output recorded in `docs/ui-ux-guidelines.md`.

## 4. Design + animation direction (summary; full spec in Phase 5 docs)

- **Identity**: keep the Greenscape wordmark and its brand green (`#163d08`, used 47× in the current CSS; secondary `#2d5a27`) as the anchor, and build a fuller botanical palette around it: moss/sage mid-tones, sand/limestone neutrals instead of the current flat greys (`#666/#ddd/#f5f5f5`), and one warm accent (terracotta) reserved for primary CTAs. The current Playfair Display + Helvetica pairing reads as "template"; candidate replacement is a softer display serif (e.g. Fraunces) + a humanist sans, picked in Phase 5 via `ui-ux-pro-max` font pairing. Large photography, generous whitespace, tropical-Palawan feel rather than generic SaaS.
- **Motion**: Motion for React for reveals/stagger/layout; CSS for hovers/presses; GSAP only for the hero parallax/mask if Motion can't do it cleanly. Durations 150–250 ms UI, 400–700 ms reveals, `prefers-reduced-motion` → opacity-only or none. No scroll hijacking.
- **Loading**: route `loading.tsx` skeletons, `next/image` blur placeholders from stored `blurDataUrl`, button pending states via `useFormStatus`, admin table skeleton rows.

## 5. Targets

Lighthouse (mobile, throttled): Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95. CWV: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Baseline numbers are in `docs/audit/performance.md`.
