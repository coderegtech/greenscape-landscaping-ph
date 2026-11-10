# Infrastructure and secrets

Nothing here is deployed: deployment needs the owner's approval (Phase 13). The repository contains production-ready, locally verified building blocks.

## Container images (`docker/`)
| | API (`api.Dockerfile`) | Website / admin (`next.Dockerfile`, `APP=web|admin`) |
|---|---|---|
| Build | Multi-stage; the Prisma client is generated in the build stage; a **clean production-only install** in a separate stage | Multi-stage; `next build` with `output: 'standalone'` (only in image builds) |
| Runtime base | `node:24-alpine` + `tini`; **npm and corepack removed** | same |
| User | `node` (uid 1000); app files owned by root, so they are read-only to the app | same |
| Filesystem | runs with `--read-only` and a tmpfs `/tmp` | same, plus a tmpfs for `.next/cache` |
| Health check | `GET /v1/health` | `GET /api/health` |
| Secrets | none in the image; all runtime env | only public `NEXT_PUBLIC_*` build args; secrets at runtime |
| Size (local build) | 661 MB (the Prisma 7 client pulls in its CLI and Studio as peers) | admin 220 MB, website 225 MB |
| Trivy (HIGH/CRITICAL, fixable) | **0** | admin **0**, website **0** |

Verified locally on 2026-11-10:
- Both containers ran with `--read-only --cap-drop ALL --security-opt no-new-privileges`, and both reported **healthy** as user `node`.
- The API in production mode: health OK against Postgres, Mongo and Redis; CMS served; API docs 404.
- The admin served `/login` with nonce CSP, HSTS and `X-Frame-Options: DENY`.
- The website (built against the API, 54 pages pre-rendered) served the CMS home page with CSP, COOP and HSTS.

Before the npm removal, the first scan of the API image found 6 High CVEs (`undici`, `brace-expansion`), all inside the base image's bundled npm; none were in the application.

## Production compose (`docker/compose.prod.yml`)
- **Networks**: `data` is internal (Postgres, Mongo, Redis, the API, the migrate job): no host ports, no internet. `edge` carries web, admin and the API to the TLS proxy.
- **Secrets**: from an env file kept outside the repository (template: `docker/prod.env.example`) or the platform's secret store. Every secret is required (`${VAR:?…}`), so compose refuses to start without it.
- **Hardening** on every app container: `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, CPU and memory limits, health checks, `restart: unless-stopped`.
- **Data services**: Postgres with three roles (see `database-security.md`), Mongo with `--auth` and an app user, Redis with an ACL and a memory cap.
- **Migrations**: `docker compose --profile migrate run --rm migrate`, the only job with DDL rights.
- **HTTPS**: a TLS-terminating proxy or CDN (Caddy, nginx, Cloudflare, or the platform's load balancer) is environment-specific and not defined here. HSTS is already sent by all three apps in production. Set `TRUSTED_PROXY_HOPS` to the number of proxies.
- **Environments**: separate Supabase projects, databases, secrets and payment accounts for development, staging and production. Never reuse a key across them.

## Secrets management
| Secret | Lives in | Never in |
|---|---|---|
| `SUPABASE_SECRET_KEY` (service role) | API environment | Next apps, browsers, `NEXT_PUBLIC_*`, images, git |
| `DATABASE_URL`, `MONGODB_URL`, `REDIS_URL` | API environment (migrate job: migration URL) | anything else |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MOCK_PAYMENT_SECRET` | API environment | — |
| `INTERNAL_API_KEY` | API, web and admin environments | browsers |
| `REVALIDATE_SECRET`, `PREVIEW_SECRET` | API, web and admin | browsers |
| OAuth client secrets | Supabase project settings | the repository |

Controls:
- `.env` is gitignored; `.env.example` holds placeholders only; `docker/prod.env.example` lists the production variables with no values.
- Every app validates its environment at start (Zod) and refuses weak or missing values. Live payment keys are refused.
- Logs redact `authorization`, `cookie`, `*.password` and `*.token`; the security log channel holds ids and hashed client keys only.
- **Secret scanning**: Gitleaks on the full history in CI (`.gitleaks.toml`); the 2026-11-10 run found no secrets. The allow-listed items are public Firebase image URLs and two local test values (`vulnerability-report.md`).
- **Bundle check**: after a build, both apps' client bundles were searched for the service key and secret names; none were found.
- **Rotation**: generate a new value, update the secret store, restart the dependent services, revoke the old value. Per-secret steps are in `incident-response.md`. Rate-limit keys are HMACed with `INTERNAL_API_KEY`, so rotating it resets the counters, which is harmless.

## CI/CD (`.github/workflows/`)
- **`ci.yml`**: install, typecheck, lint, unit, integration, build, and e2e, including the security specs (`mfa`, `csrf`, `security-headers`, `permissions`).
- **`security.yml`**: on push, pull request and weekly.
  - Steps: `pnpm audit --prod` (fails on high), OSV-Scanner (with expiring exceptions), Gitleaks, Semgrep (community packs plus `.semgrep.yml` project rules), image builds plus Trivy (fails on fixable HIGH/CRITICAL).
  - All reports are uploaded as artifacts.
- **Supply chain**:
  - Every GitHub Action is pinned to a commit SHA, and Dependabot proposes updates weekly.
  - pnpm refuses releases younger than a day (`minimumReleaseAge`), provenance downgrades (`trustPolicy`) and git/tarball sub-dependencies (`blockExoticSubdeps`).
- **Deployment gate**: a deploy job (Phase 13) must depend on both workflows succeeding; exceptions follow `security-checklist.md`.
- These workflows **have not run on GitHub** (no remote, D9). Each tool was run locally; results are in `vulnerability-report.md`.
