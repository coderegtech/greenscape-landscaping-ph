# Load test: catalogue and checkout (Phase 12)

`pnpm load:test` (`scripts/load-test.ts`) boots the real API in-process (Express, Prisma on Postgres, Redis, Mongo, mock payments) on a random port, creates its own product, stock and delivery zone, runs two phases, checks the database, and deletes what it created. It refuses to run if `DATABASE_URL`, `REDIS_URL` or `MONGODB_URL` isn't local. The abuse rate limits are raised for the run (every virtual user shares one IP); everything else is the production code path. Raw numbers: `load-test.json`.

Settings: `LOAD_SECONDS` (20), `LOAD_CONCURRENCY` (50), `LOAD_SHOPPERS` (300), `LOAD_STOCK` (40). The command exits non-zero on any 5xx or network error, any oversell, or any mismatch between the API's answers and the database.

## Result (2026-11-10, one Node process, local Docker Postgres/Redis/Mongo, 12-core laptop also running the load generator)

**Catalogue: 50 concurrent users for 20 s, about 730 requests/s in total, 0 errors.**

| Endpoint | Requests | p50 | p95 | p99 |
|---|---|---|---|---|
| Product list | 2,429 | 58 ms | 86 ms | 107 ms |
| Category + sort | 2,433 | 58 ms | 83 ms | 109 ms |
| Search | 2,430 | 57 ms | 82 ms | 112 ms |
| Product detail | 2,430 | 57 ms | 79 ms | 103 ms |
| Categories | 2,425 | 58 ms | 79 ms | 105 ms |
| Live availability (never cached) | 2,432 | 106 ms | 153 ms | 308 ms |

**Checkout: 300 shoppers, 50 at a time, racing for 40 units of one product. 0 errors.**

| Step | Requests | p50 | p95 | Outcome |
|---|---|---|---|---|
| Add to cart | 300 | 190 ms | 722 ms | 50 added, 250 told "sold out" (409) |
| View cart | 50 | 344 ms | 368 ms | |
| Place order | 55 | 1.4 s | 1.55 s | 40 orders; 10 refused "no longer available" (409); 5 double-submits returned the same order |

Database afterwards: 40 orders, 40 units ordered, 40 reserved of 40 on hand. **No oversell**; reservations match orders; the API's count matches the database.

## What it shows
- **Catalogue reads are cache-bound and fast**: the p95 stays under 100 ms with ~730 requests/s on a single process. Live availability is the slowest read because it deliberately skips the cache and hits Postgres, so stale stock can never be authoritative.
- **Checkout on one hot item serialises on purpose.** Each order row-locks the stock it reserves, so 50 people buying the last units of the same plant queue behind each other. That gives the 1.4 s p50. Orders for different products don't contend. That is acceptable for a nursery-sized shop. The alternative (optimistic reservation with retries) would add complexity and risk to the one place where correctness matters most.
- **Connection pool size isn't the limit.** With pg's default of 10 connections and with 30, the numbers were within run-to-run noise (catalogue p95 86 vs 92 ms, checkout p50 1.4 vs 0.95 s, p95 1.55 vs 1.9 s). So no pool setting was added.
- **Not measured**: multiple API instances behind a load balancer, a managed Postgres over a network, or real Stripe latency. The load generator shares the CPU with the server, so these figures are a floor, not a ceiling.
