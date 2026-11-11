# Greenscape Landscaping PH — Platform Rebuild

Rebuild of https://greenscapelandscapingph.com into a public site, shop, CMS, attendance system and admin, as one platform.
Branch: `rebuild/platform`. Status: **Phase 6 (Public website) complete** — see `docs/progress.md`.

## Stack (as installed)
Next.js 16 · React 19 · Supabase Auth (local CLI) · Tailwind 4 · Express 5 · Prisma 7.10 (PostgreSQL 17) · MongoDB 8 driver 7 · ioredis 6 (Redis 7) · Zod 4 · Vitest 5 · Playwright 1.65 · TypeScript 5.9 · pnpm 10 · Node 24.

TypeScript is pinned to 5.9 (not 7.0, the native rewrite) until Next.js's type-checking supports it.

## Layout
```
apps/web      Next.js public site            :3000
apps/admin    Next.js admin                  :3001
apps/employee Next.js employee portal        :3002
apps/api      Express API (runs TS via tsx)  :4000  → /v1/health, /v1/openapi.json, /v1/docs
packages/config      tsconfig bases + Zod env loader
packages/database    Prisma schema, migrations, client (driver adapter)
packages/content     MongoDB CMS Zod schemas, client, indexes
packages/cache       Redis cache-aside + stampede lock + tag invalidation
packages/validation  Shared request/response contracts + form schemas
packages/auth        Supabase: API token verification (JWKS), Next.js session helpers, server API client
packages/ui          Design system: tokens (theme.css), fonts, shadcn/Radix components, motion, layout templates, auth forms
tests/{unit,integration,e2e}
docker/compose.dev.yml   Postgres :55433, Mongo :57017 (replica set), Redis :56379
```
`storage` and `payments` packages are created in the phases that need them (7, 8).

## Getting started
```bash
pnpm install
```
```bash
cp .env.example .env
```
```bash
pnpm services:up
```
```bash
echo [] > supabase/signing_keys.json && supabase gen signing-key --algorithm ES256 --append
```
```bash
pnpm supabase:start
```
```bash
pnpm supabase:env
```
```bash
pnpm db:deploy
```
```bash
pnpm db:seed
```
```bash
pnpm content:indexes
```
```bash
pnpm content:seed
```
```bash
pnpm shop:seed
```
```bash
pnpm media:migrate --apply
```
```bash
pnpm storage:setup
```
```bash
pnpm dev
```
Then open http://localhost:3000 (site; sign up at /signup; design gallery at /design), http://localhost:3001 (admin), http://localhost:3002 (employee portal) and http://localhost:4000/v1/docs (API docs). Verification and reset emails land in the local inbox at http://127.0.0.1:54324.

**First administrator:** sign in once, then

```bash
pnpm --filter @greenscape/database grant-role you@example.com super_admin
```

## Checks
| Command | What |
|---|---|
| `pnpm typecheck` | every workspace + tests |
| `pnpm lint` | ESLint (TypeScript, React hooks, Next.js, jsx-a11y) |
| `pnpm test` | unit tests (no services needed) |
| `pnpm test:integration` | API, auth/RBAC, cache, DB constraints against Docker services + local Supabase |
| `pnpm build && pnpm test:e2e` | Playwright, desktop 1440 + mobile 390 (build starts the API if needed: services + Supabase must be up) |

CI (`.github/workflows/ci.yml`) runs all of the above on every push to `main`/`rebuild/**` and on PRs.

## Docs
`docs/audit/` (what exists today) · `docs/architecture.md` · `docs/database-schema.md` · `docs/implementation-plan.md` · `docs/migration-plan.md` · `docs/ui-ux-guidelines.md` · `docs/animation-system.md` · `docs/security.md` · `docs/api-documentation.md` · `docs/testing.md` · `docs/progress.md`

## Re-run the site audit
```bash
cd scripts/audit && node crawl.mjs 80 && node lighthouse.mjs && node report.mjs
```
Read-only: never submits forms or signs in; blocks the site's visitor tracker, Google Analytics and Firestore writes.
