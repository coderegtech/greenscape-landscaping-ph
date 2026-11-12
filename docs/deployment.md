# Deployment, rollback and release sign-off

Phase 13. Nothing here has been run against a real staging or production host: **no deployment happens without
the owner's written approval**, and live payments stay off (`PAYMENTS_LIVE_APPROVED=false`) until approved separately.
The commands are for the production-shaped stack in `docker/compose.prod.yml`. On a managed platform, use the
equivalent steps.

The automated path is documented under `docs/deployment/`: the deployment-only `production` branch
(`production-branch.md`), the pipeline that maintains it (`ci-cd-pipeline.md`), Dokploy (`dokploy.md`), variables
(`environment-variables.md`) and branch rollback (`rollback.md`).

## What is deployed

| Piece | Built from | Runs as | Health |
|---|---|---|---|
| API | `apps/api/Dockerfile` (target `runtime`) | `api`, port 4000 | `GET /v1/health/live` (process), `GET /v1/health` (databases) |
| Migrations | `apps/api/Dockerfile` (target `migrate`) | `migrate`, a one-off job with DDL rights | exit code |
| Website | `apps/web/Dockerfile` | `web`, port 3000 | `GET /api/health` |
| Admin | `apps/admin/Dockerfile` | `admin`, port 3001 | `GET /api/health` |
| Employee portal | `apps/employee/Dockerfile` | `employee`, port 3002 | `GET /api/health` |
| Postgres 17, MongoDB, Redis 7 | official images | internal network only | compose health checks |
| Supabase (Auth, Storage) | hosted project | | Supabase status |

`NEXT_PUBLIC_*` values (API URL, Supabase URL and publishable key, `NEXT_PUBLIC_AUTH_GOOGLE`) are baked in at build
time. Build the website **where the API is reachable**, because it pre-renders CMS pages; CI does this with
`--network host`. Secrets are runtime environment only (`docker/prod.env.example`), never build arguments.

**MongoDB and the host kernel.** Current MongoDB 8.x releases refuse to start on Linux kernels 6.19 to 7.0.13
(SERVER-121912, SERVER-125742). Before choosing a host, check `uname -r`:

- below 6.19, or 7.0.14 and later: MongoDB 8 is fine;
- otherwise: use a managed MongoDB (Atlas) or MongoDB 7.0.

CI already runs 7.0 for this reason. The app uses nothing that 7.0 lacks: replica-set transactions and standard
indexes.

## Environments

| | Local | Staging | Production |
|---|---|---|---|
| Hosts | localhost:3000/3001/4000 | `staging.<domain>`, `admin.staging.<domain>`, `api.staging.<domain>` | `<domain>`, `admin.<domain>`, `api.<domain>` |
| Supabase | local CLI | separate project | separate project |
| Payments | mock | `stripe_test` | `stripe_test` until live approval |
| AI assistant | offline mock | Claude with a low-limit key | Claude |
| Data | seeds | migrated copy (Phase 11 dry run) | real |

DNS, TLS and the reverse proxy are covered in `docs/auth/google-oauth.md` (admin subdomain) and
`docs/security/infrastructure-security.md`.

## Release runbook

1. **Freeze:** all work is merged to `main`, and CI (`CI` and `Security`) is green on that commit. Tag it:
   `git tag -a vX.Y.Z -m "…" && git push origin vX.Y.Z`.
2. **Build images** from the tag (API, migrate, web, admin), push them to the registry tagged `vX.Y.Z`, and record
   their digests in the release notes.
3. **Back up** before any migration:
   - Postgres: `pg_dump -Fc` to off-host storage;
   - MongoDB: `mongodump --archive --gzip`;
   - Supabase: confirm its daily backup or PITR window covers now.

   Note the backup names in the release notes.
4. **Migrate:** `TAG=vX.Y.Z docker compose -f docker/compose.prod.yml --env-file <secrets> run --rm migrate`. It
   runs `prisma migrate deploy` only. When the release changes roles or permissions (`packages/database/src/rbac.ts`)
   or content indexes, also run, from a checkout of the tag with the production URLs in the environment,
   `pnpm db:seed` (idempotent RBAC sync) and `pnpm content:indexes`. Migrations must be *additive* (expand first,
   remove columns in a later release), so the previous release still runs against the new schema. That is what
   makes rollback step 1 safe.
5. **Roll out:** `TAG=vX.Y.Z docker compose … up -d api web admin`. Wait until all health checks pass.
6. **Smoke test** (about 10 minutes, a person with the staging checklist):
   - Home, a service, a project and the shop load. The chat button opens the sign-in prompt for a guest.
   - Sign in with Google and with email. `/account` shows the avatar.
   - Send a contact message, add to the cart, and pay a test checkout (test mode). The confirmation email arrives.
   - Admin: sign in with MFA. Dashboard figures load; the order, message and AI chat appear.
   - `GET /v1/health` reports every dependency `ok`. The error tracker shows no new error spike.
7. **Announce,** and keep the previous tag's images and the backups for at least 14 days.

## Rollback runbook

Decide within 15 minutes of a failed smoke test or an error spike. The person on call can roll back without approval;
deploying forward again needs it.

1. **App only:** `TAG=<previous> docker compose … up -d api web admin`. This works because migrations are additive.
   Verify the health checks and repeat the smoke test.
2. **A migration broke data** (rare; additive migrations avoid it):
   1. Stop writes: put `api` in maintenance by scaling it to 0, or return 503 at the proxy.
   2. Restore Postgres from the step-3 backup: `pg_restore --clean --if-exists -d greenscape`.
   3. Restore MongoDB only if CMS data changed: `mongorestore --drop --archive --gzip`.
   4. Start the previous tag.
3. **Payments during an incident:** Stripe webhooks are idempotent and retried by Stripe for up to 3 days. Do not
   replay events by hand. After recovery, check the admin's orders for `PENDING` older than the reservation window.
   The expiry job releases those automatically.
4. **Supabase incident:** sign-in is unavailable, but public pages keep working, because the API verifies tokens
   locally and the JWKS is cached for 10 minutes. Nothing to roll back. Follow `docs/security/incident-response.md`.
5. Write a short incident note: what happened, when it was detected, the rollback time and the follow-up.

## Release sign-off checklist

The owner signs before production. Each line needs evidence: a link to the CI run, a report or a screenshot.

**Quality**
- [ ] CI green on the release commit: typecheck, lint, unit, integration, build, e2e on desktop and mobile, web image scan.
- [ ] Security workflow green: Semgrep, OSV, gitleaks, and the Trivy scans of the API and admin images.
- [ ] Lighthouse on the home, shop and a project page: performance ≥ 90, or the gap accepted in writing
      (`docs/performance/core-web-vitals.md`).
- [ ] The load test passes on staging-sized hardware (`pnpm load:test`; no oversell, invariants true).
- [ ] Accessibility: the axe e2e checks pass, plus a keyboard-only pass of checkout, the chat and the admin login.

**Data and migration**
- [ ] Phase 11 migration dry run on staging: record counts and checksums match, and asset 404s = 0.
- [ ] Backups taken and restore tested once on staging (Postgres, MongoDB).

**Configuration**
- [ ] Production secrets set in the platform's secret store; nothing in the repository or the images.
- [ ] Google OAuth client and Supabase redirect URLs for the production hosts (`docs/auth/google-oauth.md`).
- [ ] `REQUIRE_STAFF_MFA=true`; every staff account enrolled in MFA.
- [ ] Payments: `stripe_test` until the owner approves live, then live keys with `PAYMENTS_LIVE_APPROVED=true`
      in a separate, signed-off change.
- [ ] AI assistant: Claude key with a spend limit, a daily quota per customer, reviewed greeting and knowledge, and
      the privacy notice updated (`docs/auth/ai-assistant.md`).
- [ ] Email: SPF, DKIM and DMARC on the sending domain; staff notification addresses set in Admin → Settings.
- [ ] Monitoring: Sentry DSN set; uptime checks on the three health URLs; alerts reach a person.
- [ ] Host kernel checked against MongoDB (see above), or managed MongoDB in use.

**Approval**
- [ ] Owner approval to deploy (name, date): ______________________
- [ ] Owner approval for live payments (separate, optional at launch): ______________________
