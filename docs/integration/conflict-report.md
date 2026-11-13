# Conflict report

## Textual conflicts

None. All three merges on `integration/greenscape-complete` were made by git's `ort` strategy without a conflict
marker, and no `ours` / `theirs` option was used.

| Merge | Into | Overlap checked | Result |
| --- | --- | --- | --- |
| `claude/vibrant-hugle-10207c` | `f3d464f` | `main` had changed only `playwright.config.ts` since the branch point; the branch changed two spec files | clean |
| `origin/ci/production-branch` | `415cfcf` | `main` had 6 commits since the branch point `e1418ce` (auth e2e suites, `playwright.config.ts`, two spec files). The branch edits `.github/workflows/ci.yml` and `docs/deployment/`; `main` had touched neither since `e1418ce` | clean |
| `origin/main` (`a7829db`) | `3966165` | `a7829db` merges the same two commits as `415cfcf` | clean; `git diff` between before and after is empty |

Files the brief asked to watch, and what the integration does to them:

| File | Changed by the integration? |
| --- | --- |
| `package.json` | yes: one line, the `basic-ftp` override |
| `pnpm-lock.yaml` | yes: 9 lines, `basic-ftp` 5.3.1 to 6.2.6 and the override entry |
| `next.config.ts` (three apps), shared layouts | no |
| Express routes, auth middleware | no |
| `packages/database/prisma` | no |
| `.env.example`, `docker/prod.env.example` | no |
| `docker/compose.*.yml`, `apps/*/Dockerfile` | no |
| `.github/workflows/ci.yml` | yes, by PR #8: stack setup moved to `.github/actions/local-stack`, `permissions: contents: read` added |

## Conflicts that were not textual

| Problem | Where | Resolution |
| --- | --- | --- |
| **`main` moved during the integration.** The e2e-fix branch was merged into `main` from the main checkout at 07:18, and merged here at about 07:21 before a refetch. | history | `origin/main` was merged in (`949bf85`). Nothing was reset or rewritten, so the branch carries one redundant merge commit (`415cfcf`). |
| **PR #8 could not pass its own checks.** Its pipeline requires green CI and green Security; `main` had neither. | `ci/production-branch` against `main` | Merged after the e2e fixes; the two Security causes fixed on this branch. |
| **`secrets: inherit`** fails the project's Semgrep rules (least privilege for reusable workflows). | `.github/workflows/production-pipeline.yml`, `deploy-production.yml` | `deploy-production.yml` declares `DOKPLOY_URL` and `DOKPLOY_API_KEY` as `workflow_call` secrets; the pipeline passes exactly those two (`9427c9a`). Behaviour is the same: those were the only two secrets the deploy job read. |
| **Two new advisories on `basic-ftp` 5.3.1.** The Security workflow's OSV step failed on `main`. | `pnpm-lock.yaml` | Overridden to `^6.2.4` (`e8c544e`) rather than adding two more scanner exceptions. The newest `get-uri` (8.0.1) still asks for `^5.3.1`, so there is no upstream version to move to. Checked that `get-uri` still loads with 6.2.6 and exposes its `ftp` protocol. The existing exception for the same package (GHSA-c475-qrg2-pj4r) stopped matching and was removed. |
| **The Dependabot bump (PR #6) edits a line PR #8 moves.** | `.github/workflows/ci.yml` to `.github/actions/local-stack/action.yml` | Not merged. See `remaining-work.md`. |
| **The pipeline's staging job runs out of disk on a GitHub runner.** Found only after the merge, because the workflow starts only from `main`. The local stack, the API image and the `migrate` image fit; the runner died with "No space left on device" about two minutes into building the three Next images. CI's `verify` job builds one image and fits. | `.github/workflows/production-pipeline.yml`, job `staging` | A first step removes preinstalled toolchains the job does not use (`/usr/share/dotnet`, `/usr/local/lib/android`, `/opt/ghc`, CodeQL) and prints `df -h /`. It is on `docs/integration-reports`, **not yet proven**: only a pipeline run on `main` can show it is enough. Publishing and deploying were never at risk; both are switched off and both need staging to pass. |
