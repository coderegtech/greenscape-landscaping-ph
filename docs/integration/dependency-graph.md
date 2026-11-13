# Dependency graph

Which work depends on which, by what it needs to exist first, not by commit date. Everything above the dashed line
was already in `main` before this integration; it is shown because the two remaining pieces sit on top of it.

```mermaid
graph TD
  F["Foundation: monorepo, API, app shells, CI<br/>rebuild/platform phase 3"] --> DB["Database and config<br/>Prisma, Mongo, env"]
  DB --> AUTH["Auth and RBAC<br/>phase 4, feature/auth-chatbot, provisioned accounts"]
  F --> UI["UI system<br/>phase 5 design tokens, redesign/white-botanical"]
  AUTH --> WEB["Customer site and shop<br/>phases 6, 8"]
  AUTH --> CMS["CMS and admin<br/>phases 7, 10"]
  AUTH --> EMP["Employee attendance portal<br/>phase 9, employee app"]
  UI --> WEB
  UI --> CMS
  UI --> EMP
  WEB --> ANIM["Animations<br/>hero-carousel-cursor, scroll-reveal"]
  UI --> ANIM
  AUTH --> NOTIF["Notifications<br/>realtime-push-notifications"]
  WEB --> SEC["Security hardening<br/>security/application-hardening"]
  CMS --> SEC
  EMP --> SEC
  SEC --> DOCKER["Docker per service<br/>refactor/dokploy-services, PR 7"]
  AUTH --> E2EAUTH["Auth e2e suites<br/>test/auth-playwright"]
  ANIM --> E2EFIX["e2e checks measure settled reveals<br/>claude/vibrant-hugle-10207c"]
  E2EAUTH --> GREEN["Green CI on main"]
  E2EFIX --> GREEN
  OSV["basic-ftp override<br/>this integration"] --> GREENSEC["Green Security on main"]
  DOCKER -.-> PIPE["Production pipeline<br/>ci/production-branch, PR 8"]
  GREEN -.-> PIPE
  GREENSEC -.-> PIPE
  PIPE --> SEMG["Named secrets for the deploy call<br/>this integration"]
  PIPE -.-> DEPB["supabase/setup-cli 3.2.0<br/>PR 6, left out"]
```

## The dependencies that decided the order

| Needs | Before | Why |
| --- | --- | --- |
| `refactor/dokploy-services` (in `main`) | `ci/production-branch` | The pipeline builds `apps/*/Dockerfile`; commit `2bd2172` was written against that layout. |
| `claude/vibrant-hugle-10207c` | `ci/production-branch` | The pipeline's gate requires a green CI run on the same commit. CI could not go green until the three e2e failures were fixed, so PR #8's own `verify` check failed for a reason that was not its own. |
| `basic-ftp` override | `ci/production-branch` being useful | The gate also requires a green Security run. Two advisories published against `basic-ftp` 5.3.1 turned `dependencies` red on `main` (`f3d464f`, `a7829db`). |
| `ci/production-branch` | named-secrets fix | The fix edits files that branch adds. |
| `ci/production-branch` | `supabase/setup-cli` bump | That branch moves the `supabase/setup-cli` line out of `ci.yml` into `.github/actions/local-stack/action.yml`. Bumping first would be undone by the move. |

## What does not depend on anything here

`ci/production-branch` touches no application code, no migration, no lockfile. Nothing in `apps/` or `packages/`
differs between `main` and the integration branch (`git diff --stat origin/main HEAD -- apps packages docker` is
empty).
