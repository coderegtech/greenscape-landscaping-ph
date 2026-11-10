# Database security

## PostgreSQL (authoritative: users, roles, orders, payments, stock, attendance, leave, audit log)
| Control | Implementation |
|---|---|
| Queries | Prisma only; raw SQL only as tagged templates (parameterised); `*Unsafe` banned by Semgrep |
| Least privilege (production) | Three roles (`docker/init/postgres-roles.sh`): `greenscape_owner` (owns the database; nobody uses it day to day), `greenscape_migrate` (DDL; only the one-off migrate job), `greenscape_app` (the API: SELECT/INSERT/UPDATE/DELETE on tables, no DDL, no role management). `CREATE` on `public` is revoked from PUBLIC |
| Migrations | `prisma migrate deploy` in a separate image target (`docker/api.Dockerfile --target migrate`) with the migrate role; never run by the API at start-up |
| Integrity | CHECK constraints (`reserved <= onHand`, non-negative stock and money), unique idempotency keys, row locks for stock, balances and order state; advisory locks per employee for punches |
| Network | Production: internal Docker network only, no host port (`docker/compose.prod.yml`). Dev: bound to `127.0.0.1:55433` |
| Authentication | SCRAM-SHA-256 (`POSTGRES_INITDB_ARGS`); passwords from the secret env file, required at start |
| Encryption in transit | Inside one private network the connection is plain; for a managed Postgres (recommended), set `sslmode=require` (or `verify-full` with the provider CA) in `DATABASE_URL` |
| Backups | Managed Postgres point-in-time recovery, or nightly `pg_dump -Fc` with the owner role, encrypted at rest, 30-day retention, **restore tested monthly** into a scratch database (`incident-response.md`) |
| Monitoring | `pg_stat_statements` on managed Postgres; the API logs slow requests (pino) and 5xx to Sentry |
| Audit log | `AuditLog` rows written in the same transaction as the change. The app role can INSERT; making it append-only at the database level (revoke UPDATE/DELETE on `AuditLog` from `greenscape_app`) is the next step, see the checklist |

## MongoDB (CMS content, testimonials, navigation)
| Control | Implementation |
|---|---|
| Authentication | `--auth`; root for operators only; the API uses `greenscape_app` with `readWrite` on `greenscape` only (`docker/init/mongo-user.js`) |
| Query safety | Filters built on the server from Zod-validated scalars; no client-supplied filter objects; strict schemas strip `$` keys from bodies; ObjectIds validated by regex |
| Document validation | Every write is parsed by the content schemas (`packages/content/src/schemas.ts`); old revisions are re-validated on rollback; links allow-listed |
| Audit | Publish, schedule, unpublish/archive, site settings, navigation, testimonial moderation, gallery and FAQ create/update/delete (L-4), plus revision snapshots with authors |
| Network | Internal network only in production; dev bound to `127.0.0.1:57017` |
| TLS | For a managed MongoDB (Atlas), use the `mongodb+srv://` URL (TLS by default) |

## Redis (caches, rate-limit counters, job state, mock payment sessions)
| Control | Implementation |
|---|---|
| Not authoritative | Stock, payment state, attendance approvals and permissions are always read from Postgres; the permission cache lives ≤ 60 s and is invalidated on change |
| Authentication and ACL | Production: default user off; `greenscape_app` limited to `gs:prod:*` keys with `-@admin -@dangerous` (no KEYS, FLUSHALL, CONFIG, DEBUG, MONITOR); Lua allowed for the rate limiter |
| Memory | `maxmemory 256mb`, `volatile-lru` (only keys with a TTL are evicted) |
| Data | No tokens, passwords or personal data; rate-limit keys are HMAC-hashed; values are JSON |
| Network | Internal network only; dev bound to `127.0.0.1:56379`. For managed Redis, use `rediss://` (TLS) |
| Failure | Reads fail open, forms fail closed (503), and the app keeps serving from the databases |

## Verification
- Integration tests: concurrency (8 checkouts for 1 item → 1 order; 5 simultaneous punches → 1), stock never below reserved, Redis-down behaviour.
- `docker compose -f docker/compose.prod.yml --env-file … config` validates and refuses to start with a missing secret.
- The role scripts run only on an empty data directory and **have not been exercised against a deployed database**. Run them on staging first.
