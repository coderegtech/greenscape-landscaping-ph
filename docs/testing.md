# Testing

| Layer | Tool | Location | Needs services | Runs in CI |
|---|---|---|---|---|
| Unit | Vitest (`unit` project) | `tests/unit/` | no | yes |
| Integration | Vitest (`integration` project) + supertest | `tests/integration/` | Postgres, Mongo, Redis (`pnpm services:up`) | yes |
| End-to-end | Playwright (desktop 1440, mobile 390) | `tests/e2e/` | all services + built apps | yes |

## Rules
- Tests never touch production or the live Firebase site. Integration tests use the local Docker databases with unique, per-run keys/slugs and clean up after themselves.
- Integration files run serially (`fileParallelism: false`) because they share databases.
- The app factory (`createApp(deps)`) takes injected dependencies, so tests can run the API in-process with different configurations (e.g. Redis pointed at a dead port).
- Every new business rule gets a unit or integration test in the same PR; every user flow gets a Playwright spec.

## What is covered today (Phase 3)
- Env loading: coercion, comma lists, one error listing every invalid key.
- CMS schemas: valid page, unknown section types, unsafe `javascript:` links, slug format, **prices refused in product marketing content**.
- Cache: falls through to the source when Redis is down; one load under a 20-request stampede across two instances; tag invalidation leaves other keys; loader errors aren't cached.
- API: health (ok / degraded with Redis down), standard error body with caller's request id, malformed JSON → 400, CORS allow-list, security + rate-limit headers, OpenAPI 3.1 document, rate limiter passes when its store is down.
- Database: inventory CHECK (reserved ≤ on hand, no negatives), negative price rejected, duplicate SKU → P2002.
- E2E: public shell renders with correct title/H1/lang, no console errors, no horizontal overflow at 390 px; web security headers; admin reaches the API and is `noindex`.
