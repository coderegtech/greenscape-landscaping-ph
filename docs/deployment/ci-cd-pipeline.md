# CI/CD pipeline

```
feature branch -> pull request -> main
                                   |
                     CI + Security (on the push)
                                   |
                 both green on the same commit?  -- no --> stop
                                   | yes
                         Production pipeline
              gate -> snapshot + staging -> publish -> deploy
                                              |           |
                                     `production`      Dokploy
```

## Workflows

| Workflow | Runs on | Does |
|---|---|---|
| [`ci.yml`](../../.github/workflows/ci.yml) (CI) | every pull request, pushes to `main` | frozen-lockfile install, typecheck, lint, unit and integration tests, production builds, full e2e suite, web image build and Trivy scan |
| [`security.yml`](../../.github/workflows/security.yml) (Security) | every pull request, pushes to `main`, weekly | `pnpm audit`, OSV-Scanner, Gitleaks (full history), Semgrep, image builds and Trivy scans (api, admin, employee) |
| [`production-pipeline.yml`](../../.github/workflows/production-pipeline.yml) | when CI or Security finishes on `main`; manual | makes, checks and publishes the snapshot ([production-branch.md](production-branch.md)) |
| [`deploy-production.yml`](../../.github/workflows/deploy-production.yml) | manual; called by the pipeline when enabled | asks Dokploy to deploy `production` ([dokploy.md](dokploy.md)) |

CI and the staging job share [`.github/actions/local-stack`](../../.github/actions/local-stack/action.yml): install,
databases, local Supabase, migrations and seeds.

## Production pipeline, job by job

1. **gate.** Continues only when all of these hold; otherwise it ends green with the reason in the run summary:
   - the finished run was a push to this repository's `main` (not a pull request, not a fork, not the weekly scan);
   - the latest CI run **and** the latest Security run for that exact commit both succeeded;
   - that commit is still the head of `main`.

   CI and Security each trigger the pipeline when they finish. The first one to finish finds the other still running
   and stops; the second one goes through.
2. **snapshot.** Generates and validates the snapshot from the commit, then runs Gitleaks over the snapshot files.
3. **staging.** On the runner, with throwaway data and no secrets: starts the local stack, generates the snapshot,
   builds the four images **from the snapshot**, runs the snapshot's migration image, starts API, website, admin and
   employee portal in production mode, waits for their health checks and runs the smoke test
   ([`tests/e2e/smoke/production.smoke.ts`](../../tests/e2e/smoke/production.smoke.ts)): API health with Postgres,
   MongoDB and Redis, each portal's health, home page with CMS content and no broken assets, navigation, shop, and
   the three sign-in pages.
4. **publish.** Only when gate, snapshot and staging succeeded. Generates the snapshot again (same commit, same
   tree) and pushes it as a fast-forward commit. This is the only job with a write token (`contents: write`).
5. **deploy.** Calls `deploy-production.yml`, only for the real `production` branch and only when enabled.

Runs are serialized (`concurrency: production-pipeline`); a waiting run is replaced by a newer one.

## Switches

Repository variables (Settings > Secrets and variables > Actions > Variables). Both are unset at first.

| Variable | Effect when `true` |
|---|---|
| `PRODUCTION_PUBLISH_ENABLED` | A green push to `main` publishes to `production`. Unset: the pipeline still runs gate, snapshot and staging and publishes nothing. |
| `DOKPLOY_AUTO_DEPLOY` | After a publish, the pipeline calls the deploy workflow. |

```bash
gh variable set PRODUCTION_PUBLISH_ENABLED --body true
```

## Rehearsal and manual runs

Actions > Production pipeline > Run workflow, on `main`. The target defaults to `production-test`; any
`production-<name>` is accepted, and `production` itself publishes for real. A manual run needs the same green CI and
Security on the head of `main` and does not need `PRODUCTION_PUBLISH_ENABLED`.

```bash
gh workflow run production-pipeline.yml --ref main -f target_branch=production-test
```

Delete a rehearsal branch afterwards with `git push origin --delete production-test`.

## Security of the pipeline

- Pull requests run CI and Security with a read-only token and no secrets.
- `production-pipeline.yml` is triggered by `workflow_run`, which always uses the workflow file and code of `main`.
  A pull request cannot change what it runs or reach its write token.
- The gate takes the commit from the finished run and checks event, branch and repository before anything else.
- Every job states its own permissions; the default is none.
- Actions are pinned to commit SHAs; Dependabot updates them.
- The staging job uses local, throwaway services only. No workflow has production database credentials.
- Deploy credentials (`DOKPLOY_URL`, `DOKPLOY_API_KEY`) are read only by `deploy-production.yml`.

## What was tested, and what was not

Tested locally on 2026-11-13 from a clean commit:

- snapshot generation and validation (about 425 of 770 tracked files; unit test `tests/unit/production-snapshot.test.ts`);
- API, migration, admin and employee images built from a snapshot; the admin image started read-only as the `node`
  user and answered its health check;
- the website image from a snapshot: installed, compiled and type-checked, then stopped at "collecting page data"
  because the build container could not reach the API on the Windows host (not a snapshot problem; on GitHub the
  build uses the host network, as CI already does);
- publishing to a throwaway local remote: first publish, repeat (no change), an update that adds, changes and
  removes files (one fast-forward commit), a late older run (not published), a non-ancestor snapshot (refused), a
  snapshot that does not match the commit (refused); the published tree was byte-identical to the commit's
  approved files;
- the smoke test against the local development stack (8 passed);
- the workflows with actionlint.

Not yet run: the pipeline and deploy workflows on GitHub (they start working once this is on `main`), which includes
the staging job (the four snapshot images running together, the migration image, the website's pre-rendering), the
push-rejected retry path, and anything against a real Dokploy server.
