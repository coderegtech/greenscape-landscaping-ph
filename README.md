# Greenscape Landscaping PH — Platform Rebuild

Rebuild of https://greenscapelandscapingph.com into a public site, shop, CMS, attendance system and admin, as one platform.
Branch: `rebuild/platform`. Status: **Phase 3 (Foundation) complete** — see `docs/progress.md`.

## Stack (as installed)
Next.js 16 · React 19 · Tailwind 4 · Express 5 · Prisma 7.10 (PostgreSQL 17) · MongoDB 8 driver 7 · ioredis 6 (Redis 7) · Zod 4 · Vitest 5 · Playwright 1.65 · TypeScript 5.9 · pnpm 10 · Node 24.

TypeScript is pinned to 5.9 (not 7.0, the native rewrite) until Next.js's type-checking supports it.

## Layout
```
apps/web      Next.js public site            :3000
apps/admin    Next.js admin                  :3001
apps/api      Express API (runs TS via tsx)  :4000  → /v1/health, /v1/openapi.json, /v1/docs
packages/config      tsconfig bases + Zod env loader
packages/database    Prisma schema, migrations, client (driver adapter)
packages/content     MongoDB CMS Zod schemas, client, indexes
packages/cache       Redis cache-aside + stampede lock + tag invalidation
packages/validation  Shared request/response contracts
tests/{unit,integration,e2e}
docker/compose.dev.yml   Postgres :55433, Mongo :57017 (replica set), Redis :56379
```
`ui`, `auth`, `storage`, `payments` packages are created in the phases that need them (5, 4, 7, 8).

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
pnpm db:deploy
```
```bash
pnpm content:indexes
```
```bash
pnpm dev
```
Then open http://localhost:3000 (site), http://localhost:3001 (admin, shows dependency status) and http://localhost:4000/v1/docs (API docs).

## Checks
| Command | What |
|---|---|
| `pnpm typecheck` | every workspace + tests |
| `pnpm test` | unit tests (no services needed) |
| `pnpm test:integration` | API, cache, DB constraints against the Docker services |
| `pnpm build && pnpm test:e2e` | Playwright, desktop 1440 + mobile 390 |

CI (`.github/workflows/ci.yml`) runs all of the above on every push to `main`/`rebuild/**` and on PRs.

## Docs
`docs/audit/` (what exists today) · `docs/architecture.md` · `docs/database-schema.md` · `docs/implementation-plan.md` · `docs/migration-plan.md` · `docs/testing.md` · `docs/progress.md`

## Re-run the site audit
```bash
cd scripts/audit && node crawl.mjs 80 && node lighthouse.mjs && node report.mjs
```
Read-only: never submits forms or signs in; blocks the site's visitor tracker, Google Analytics and Firestore writes.
