# Environment variables

Where each value lives. The lists of record are the code, so this page points at them instead of copying defaults:

- API: `EnvSchema` in [`apps/api/src/config/env.ts`](../../apps/api/src/config/env.ts) (validated at start; the API
  refuses to boot on a bad value).
- Production stack: the `environment:` blocks in [`docker/compose.prod.yml`](../../docker/compose.prod.yml) and the
  template [`docker/prod.env.example`](../../docker/prod.env.example).
- Local development: [`.env.example`](../../.env.example).

No real value is ever committed. `.env`, `.env.*` (except `.env.example`), `*.pem` and `*.key` are ignored by git,
kept out of Docker build contexts by `.dockerignore`, and rejected by the snapshot validator.

## Build time (public, baked into the image)

Set as **Build Time Arguments** in Dokploy for `web`, `admin` and `employee`. They ship to browsers, so they are not
secrets. Changing one needs a rebuild.

| Variable | Example |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.greenscapelandscapingph.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
| `NEXT_PUBLIC_AUTH_GOOGLE` | `true` only when the Google provider is configured in Supabase |

Never pass a secret as a build argument: it stays in the image layers.

## Run time

Set in Dokploy's **Environment** tab of each service (or the platform's secret store).

| Variable | api | web | admin | employee | Secret | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `NODE_ENV=production` | x | image | image | image | | The Next images set it themselves |
| `API_PORT` | x | | | | | 4000 |
| `DATABASE_URL` | x | | | | yes | App role. The `migrate` job gets the migration role's URL instead |
| `MONGODB_URL`, `MONGODB_DB` | x | | | | yes | |
| `REDIS_URL`, `CACHE_PREFIX` | x | | | | yes | `CACHE_PREFIX=gs:prod` |
| `SUPABASE_URL` | x | | | | | |
| `SUPABASE_SECRET_KEY` | x | | | | yes | Service role. API only, never a Next app |
| `INTERNAL_API_KEY` | x | x | x | x | yes | Same random value (32+ characters) on all four |
| `REVALIDATE_SECRET` | x | x | | | yes | |
| `PREVIEW_SECRET` | x | x | x | | yes | |
| `WEB_URL` | x | x | x | x | | `https://greenscapelandscapingph.com` |
| `ADMIN_URL` | x | x | x | | | `https://admin.greenscapelandscapingph.com` |
| `EMPLOYEE_URL` | x | x | | | | `https://employee.greenscapelandscapingph.com` |
| `API_PUBLIC_URL` | x | | | | | `https://api.greenscapelandscapingph.com` |
| `CORS_ORIGINS` | x | | | | | The three portal origins, comma-separated |
| `TRUSTED_PROXY_HOPS` | | x | x | x | | Proxies in front of the app; 1 behind Dokploy's Traefik |
| `PAYMENT_PROVIDER` | x | | | | | `stripe_test` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | x | | | | yes | Test keys (`sk_test_…`) only |
| `PAYMENTS_LIVE_APPROVED` | x | | | | | `false` until the owner approves live payments in writing |
| `REQUIRE_STAFF_MFA` | x | | | | | `true` |
| `SMTP_URL`, `MAIL_FROM` | x | | | | yes | |
| `QUOTE_NOTIFY_TO`, `ORDER_NOTIFY_TO` | x | | | | | Comma-separated addresses |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | x | | | | private key | Optional (web push) |
| `SENTRY_DSN` | x | | | | | Optional |
| `ANTHROPIC_API_KEY`, `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY` | x | | | | yes | Optional (AI assistant) |

Do not set `ENABLE_DESIGN_GALLERY` or `MOCK_PAYMENT_SECRET` in production.

Self-hosted databases (when not managed) also need the passwords listed in `docker/prod.env.example`
(`POSTGRES_OWNER_PASSWORD`, `POSTGRES_MIGRATE_PASSWORD`, `POSTGRES_APP_PASSWORD`, `MONGO_ROOT_PASSWORD`,
`MONGO_APP_PASSWORD`, `REDIS_APP_PASSWORD`). The databases stay on the internal network: no published ports.

Generate each secret separately:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## GitHub Actions

Settings > Secrets and variables > Actions. The pipeline needs **no application secret**: tests and the staging
check use local, throwaway services.

| Name | Kind | Used by | Purpose |
|---|---|---|---|
| `PRODUCTION_PUBLISH_ENABLED` | variable | production pipeline | `true` lets green pushes publish to `production` |
| `DOKPLOY_AUTO_DEPLOY` | variable | production pipeline | `true` calls the deploy workflow after a publish |
| `DOKPLOY_APPLICATION_IDS` | variable | deploy workflow | Application ids, space-separated, in deploy order |
| `DOKPLOY_URL` | secret | deploy workflow | `https://<dokploy host>`, no trailing slash |
| `DOKPLOY_API_KEY` | secret | deploy workflow | API key from Dokploy (Settings > Profile > API/CLI) |

## Checking a configuration

```bash
docker compose -f docker/compose.prod.yml --env-file <your env file> config
```

It fails and names the variable when a required one is missing. After a deployment, `GET /v1/health` on the API
reports Postgres, MongoDB and Redis.
