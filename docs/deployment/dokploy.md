# Dokploy: one service per app

Each deployable has its own Dockerfile in its own folder, so each one is a separate Dokploy **Application** in the same
project, pointing at this repository. Not yet run against a Dokploy instance: the images build locally and in CI, the
Dokploy settings below follow its documentation. Deployment still needs the owner's approval (`docs/deployment.md`).

## Services

The build context is always the repository root (`.`): every image needs `packages/*` and `pnpm-lock.yaml`.

| Service | Type | Dockerfile Path | Docker Context Path | Docker Build Stage | Container port | Domain |
|---|---|---|---|---|---|---|
| `api` | Application | `apps/api/Dockerfile` | `.` | (empty, = `runtime`) | 4000 | `api.<domain>` |
| `migrate` | Application, deployed by hand | `apps/api/Dockerfile` | `.` | `migrate` | none | none |
| `web` | Application | `apps/web/Dockerfile` | `.` | (empty) | 3000 | `<domain>` |
| `admin` | Application | `apps/admin/Dockerfile` | `.` | (empty) | 3001 | `admin.<domain>` |
| `employee` | Application | `apps/employee/Dockerfile` | `.` | (empty) | 3002 | `employee.<domain>` |
| `postgres` | Database (PostgreSQL 17) | | | | 5432, internal | none |
| `mongo` | Database (MongoDB) | | | | 27017, internal | none |
| `redis` | Database (Redis 7) | | | | 6379, internal | none |

Watch paths (so a push redeploys only the services it touches): the service's own folder plus what it shares, for
example `apps/web/**`, `packages/**`, `pnpm-lock.yaml`.

## Configuration

- **Build Time Arguments** (web, admin, employee): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_AUTH_GOOGLE`. Public values only; they are baked into the image.
- **Environment** (runtime): the `environment:` block of the same-named service in `docker/compose.prod.yml` is the
  list, with the values from `docker/prod.env.example`. Replace the `postgres`, `mongo` and `redis` host names with
  the internal host names Dokploy shows for the database services. Add `EMPLOYEE_URL` on `api` and `web`, and the
  employee origin to `CORS_ORIGINS` (`docs/deployment/subdomains.md`).
- Secrets go in Environment, never in Build Time Arguments.
- Health: the images carry a `HEALTHCHECK` (`/v1/health` on the API, `/api/health` on the Next apps).

## Order

1. Databases. The compose stack creates least-privilege users with `docker/init/postgres-roles.sh` and
   `docker/init/mongo-user.js`; Dokploy's database services do not run them. Run them once by hand, or accept the
   single owner user until you do.
2. `migrate`: deploy it once per release. It runs `prisma migrate deploy` and exits, so set its restart policy to
   not restart on success, and give it the migration role's `DATABASE_URL`.
3. `api`.
4. `web`, `admin`, `employee`. Build `web` only after the API is up and has content: it pre-renders CMS pages from
   `NEXT_PUBLIC_API_URL` at build time, and the build fails ("Failed to collect page data") when the API is unreachable.

## Local equivalents

```bash
docker build -f apps/api/Dockerfile -t greenscape-api .
```

```bash
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example -t greenscape-web .
```

`docker/` now holds only the stacks around the services: `compose.dev.yml` (local databases), `compose.prod.yml`
(the same services as one production-shaped stack) and the database init scripts.

## Deploying from the `production` branch

Point every Application at the branch **`production`**, not `main`. It holds only what the builds need and only
commits that passed CI, Security and the staging check ([production-branch.md](production-branch.md),
[ci-cd-pipeline.md](ci-cd-pipeline.md)). The Dockerfile paths and the build context (`.`) are the same on both
branches. `PRODUCTION.json` at the root of the branch names the `main` commit that is deployed.

Two ways to deploy after a publish. Either way, nothing deploys until you turn it on.

| | How | Set up |
|---|---|---|
| **Dokploy watches the branch** | Provider GitHub, branch `production`, Auto Deploy on. Dokploy deploys on each push to the branch; the pipeline's push counts. | In Dokploy only. No secret in GitHub. |
| **GitHub asks Dokploy** | The `Deploy production` workflow calls `POST <DOKPLOY_URL>/api/application.deploy` with the `x-api-key` header for each application id, in order. | Secrets `DOKPLOY_URL`, `DOKPLOY_API_KEY`; variable `DOKPLOY_APPLICATION_IDS` (`migrate api web admin employee` ids); `DOKPLOY_AUTO_DEPLOY=true` to run it after every publish, or run it by hand. |

Use one, not both, or each publish deploys twice. With the first, a publish **is** a deployment, so keep
`PRODUCTION_PUBLISH_ENABLED` off until the owner has approved deploying (`docs/deployment.md`).

Checklist per Application: HTTPS domain from `subdomains.md` with the container port from the table above;
restart policy on failure for the four services, none for `migrate`; health checks come from the images; runtime
values from [environment-variables.md](environment-variables.md); databases without a public port; volumes for
Postgres, MongoDB and Redis data; deployment logs are under each Application's Deployments tab.

Rollback: [rollback.md](rollback.md).
