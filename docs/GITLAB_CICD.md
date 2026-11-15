# GitLab CI/CD

GitLab runs every pipeline ([`.gitlab-ci.yml`](../.gitlab-ci.yml)); GitHub Actions is retired (see
[Migration from GitHub Actions](#migration-from-github-actions)). Repository layout: [DUAL_REMOTE_SETUP.md](DUAL_REMOTE_SETUP.md).

## Stages

| Stage | Jobs | Replaces | Runs |
|---|---|---|---|
| `validate` | `typecheck` | ci.yml typecheck | every pipeline |
| `lint` | `lint` | ci.yml lint | every pipeline |
| `test` | `unit`; `verify` (integration tests, production build of web/admin/employee, Playwright e2e, web image + Trivy) | ci.yml | every pipeline |
| `security` | `dependencies` (pnpm audit, OSV), `secrets` (Gitleaks, full history), `static-analysis` (Semgrep) | security.yml | every pipeline |
| `build` | `images` for api, employee, admin (multi-stage Dockerfiles) + Trivy | security.yml | after `test` |
| `package` | `snapshot` (production snapshot + Gitleaks), `staging` (snapshot images built and run in production mode, smoke test) | production-pipeline.yml | `main` |
| `deploy` | `publish` (snapshot to `production`, fast-forward), `deploy` (Dokploy) | production-pipeline.yml, deploy-production.yml | `main`, switches below |
| `verify-deploy` | `post-deploy-check` (health URLs answer 200) | new | after `deploy` |
| `sync` | `sync-remotes` (GitLab to GitHub) | new | after a green `main`, and the schedule |

A stage starts only when the previous one passed, so a failing test blocks the build, package and deploy stages, and
`publish`/`deploy` run only from `main`. The `security` jobs start at once (`needs: []`) and run in the runner's queue.

### Triggers

- Push to `main`, `develop`, `feature/*`, `fix/*`, `hotfix/*`, `rebuild/*`, `security/*`.
- A merge request (its pipeline replaces the branch pipeline: no duplicate for the same commit).
- Schedule, Run pipeline. A pipeline with variable `SYNC_ONLY=true` runs only `sync-remotes`.
- The weekly security schedule (Mondays 01:00, as before on GitHub) runs the `security` and `build` stages.

Other branches (`claude/*`, `docs/*`, ...) run nothing until a merge request exists.

## Runner

One self-hosted runner, `greenscape-local` (tag `greenscape`), a **privileged Docker executor** in the
`gitlab-runner` container next to GitLab (`C:\Users\Coderegtech\Desktop\docker-containers\gitlab\docker-compose.yml`):

```toml
concurrent = 1                       # one job at a time; the machine has ~7 GB for Docker
[[runners]]
  url = "http://gitlab:8929"
  clone_url = "http://gitlab:8929"
  executor = "docker"
  [runners.docker]
    image = "greenscape-ci:1"        # docker/ci.Dockerfile: Node 24, Docker engine, Supabase CLI
    privileged = true                # each job starts its own dockerd and never touches the developer's containers
    volumes = ["/cache", "greenscape-ci-docker:/var/lib/docker", "greenscape-ci-pnpm:/pnpm-store"]
    network_mode = "gitlab_default"
    pull_policy = ["if-not-present"]
```

Install it again:

```bash
docker compose -f docker-compose.yml up -d gitlab gitlab-runner
```

```bash
docker build -t greenscape-ci:1 -f docker/ci.Dockerfile docker
```

Create a runner in GitLab (Admin > CI/CD > Runners > New instance runner, tag `greenscape`, run untagged jobs off), then
register it with the token GitLab shows once (it is not stored in the repository):

```bash
docker exec -it gitlab-runner gitlab-runner register --non-interactive --url http://gitlab:8929 \
  --token <runner authentication token> --executor docker --docker-image greenscape-ci:1 --docker-privileged \
  --docker-network-mode gitlab_default --docker-pull-policy if-not-present \
  --docker-volumes /cache --docker-volumes greenscape-ci-docker:/var/lib/docker --docker-volumes greenscape-ci-pnpm:/pnpm-store
```

Then set `concurrent = 1` and `clone_url = "http://gitlab:8929"` in `/etc/gitlab-runner/config.toml` inside the container.
Caching: the pnpm store (`greenscape-ci-pnpm`) and the job Docker daemon's image cache (`greenscape-ci-docker`) are
runner volumes shared by jobs, so installs and image layers are reused; reusable files between jobs are job artifacts.

## Secrets and variables (Settings > CI/CD > Variables)

Credentials are CI/CD variables, masked and protected (exposed only to pipelines on protected branches: `main`);
no job echoes them (`set -x` is never used and the scripts pass tokens as headers).

| Variable | Used by | Needed for |
|---|---|---|
| `GITHUB_SYNC_TOKEN`, `GITLAB_SYNC_TOKEN` | `sync-remotes` | the sync ([DUAL_REMOTE_SETUP.md](DUAL_REMOTE_SETUP.md#authentication-nothing-is-stored-in-the-repository)) |
| `GITHUB_STATUS_TOKEN` | every job's `after_script` | pull request statuses (optional) |
| `PRODUCTION_PUBLISH_ENABLED=true` | `publish` | automatic publish of `production` after a green `main` (off: manual only) |
| `PRODUCTION_PUSH_TOKEN` | `publish` | project access token, `write_repository` |
| `DOKPLOY_AUTO_DEPLOY=true` | `deploy`, `post-deploy-check` | automatic deploy after a publish (off: manual job) |
| `DOKPLOY_URL`, `DOKPLOY_API_KEY`, `DOKPLOY_APPLICATION_IDS` | `deploy` | the Dokploy API |
| `POST_DEPLOY_URLS` | `post-deploy-check` | health URLs separated by spaces |

GitLab CE has no *protected environments* (Premium). The same effect comes from protected branches plus protected
variables: production jobs run only on `main`, and only a protected ref sees the deploy credentials. Deployments are
still recorded under the `production` environment.

## Pull request status on GitHub

GitLab's built-in GitHub integration is Premium. Instead every job's `after_script` runs
[`scripts/ci/report-github-status.sh`](../scripts/ci/report-github-status.sh), which posts `gitlab-ci/<job>` as a commit
status on GitHub when `GITHUB_STATUS_TOKEN` is set. They show on the pull request for the same commit; the job link opens
the GitLab log. Without the variable nothing is posted and nothing fails.

## Migration from GitHub Actions

| GitHub workflow | GitLab | Status |
|---|---|---|
| `ci.yml` | `typecheck`, `lint`, `unit`, `verify` | ported |
| `security.yml` | `dependencies`, `secrets`, `static-analysis`, `images` (+ web scan in `verify`) | ported; green on the runner |
| `production-pipeline.yml` | `snapshot`, `staging`, `publish` | ported |
| `deploy-production.yml` | `deploy` | ported |
| `dependabot.yml` | stays on GitHub (it opens pull requests there; its action-version bumps are moot) | unchanged |

The workflow files stay in `.github/workflows/` for reference. They are disabled on GitHub, not deleted
(`gh workflow disable`; `gh workflow enable <name>` re-enables one). Do the disabling only after a green `main` pipeline
on GitLab. See [deployment.md](deployment.md) for the status of that check.

## Rollback of the pipeline itself

`git revert` the change to `.gitlab-ci.yml` on `main`; pipelines use the file of the commit they run on.
Application rollback: [deployment/rollback.md](deployment/rollback.md).
