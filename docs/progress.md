# Progress

| Date | Phase | Done | Next |
|---|---|---|---|
| 2026-11-09 | 1 Discovery | Playwright crawl of 31 public pages (desktop + mobile), axe-core, Lighthouse, network/console capture, public admin code inspection → `docs/audit/` | — |
| 2026-11-09 | 2 Planning | `architecture.md`, `database-schema.md`, `migration-plan.md`, `implementation-plan.md` | — |
| 2026-11-09 | 3 Foundation | pnpm monorepo; Docker Compose (Postgres 17, Mongo 8 replica set, Redis 7); Prisma 7 schema (42 tables) + init migration with CHECK constraints; Mongo CMS Zod schemas + indexes; Redis cache package; Express 5 API (health, request ids, pino logging, helmet, CORS allow-list, Redis rate limit, central errors, OpenAPI 3.1 + Swagger UI, Sentry hook); Next.js 16 web + admin shells; Vitest unit (7) + integration (13), Playwright e2e (6); GitHub Actions CI | Phase 4: Supabase Auth |

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
- No ESLint yet; `tsc --strict` + `noUncheckedIndexedAccess` is the static gate. Add a linter when the UI work starts (Phase 5).
- Local service ports are offset (55433/57017/56379) because the defaults are used by other projects on this machine.

## Not yet done
- CI has not run on GitHub (no remote). Every CI step was run locally and passes.
- Supabase, auth, roles/permissions seed — Phase 4.
