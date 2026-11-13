# Branch inventory

`git fetch --all --prune` on 2026-11-13. Compared against `origin/main`, which was `f3d464f` at the start and moved
to `a7829db` at 07:18 (+08:00) while this was being written. Columns "behind/ahead" are against `f3d464f`.

**Target:** `main` is the right one. It is the repository's default branch (`origin/HEAD`), every pull request so far
targets it, and every feature branch below is already contained in it. `rebuild/platform` was the working trunk
until 12 Nov and is now an ancestor of `main`.

## Classification

| Branch | Tip | Behind / ahead | On GitHub | Class | Reason |
| --- | --- | --- | --- | --- | --- |
| `main` | `a7829db` | — | yes | target | |
| `ci/production-branch` | `5b9b476` | 6 / 7 | yes, PR #8 | **Ready** (with one fix) | Complete per its session. Merges cleanly. Its Semgrep failure is fixed on the integration branch; its e2e failure was `main`'s, since fixed. |
| `claude/vibrant-hugle-10207c` | `601699a` | 1 / 2 at discovery | pushed during this work | **Already Merged** | Was uncommitted work in a running session at discovery. Committed, then merged into `main` as `a7829db` from the main checkout. |
| `dependabot/github_actions/supabase/setup-cli-3.2.0` | `d457d93` | 29 / 1 | yes, PR #6 | **Needs Testing** | Major version bump of a CI action; its only `verify` run was cancelled. After PR #8 the line it edits moves from `ci.yml` to `.github/actions/local-stack/action.yml`, so the bump has to be regenerated anyway. Left out. |
| `rebuild/platform` | `0bb36c0` | 8 / 0 | yes | Already Merged | Former trunk; ancestor of `main`. |
| `security/application-hardening` | `7cc118d` | 80 / 0 | yes | Already Merged | On `main`'s first-parent line. |
| `redesign/white-botanical` | `945c5a0` | 81 / 0 | yes | Already Merged | `0e7ee4b`. |
| `feature/auth-chatbot` | `7910ae9` | 64 / 0 | yes | Already Merged | `29565eb`. |
| `test/auth-playwright` | `b3731ae` | 12 / 0 | yes | Already Merged | `52d412b`. |
| `refactor/dokploy-services` | local `e1418ce`, remote `6032f7e` | 6 / 0 | yes, PR #7 merged | Already Merged | `e1418ce`. The local branch was fast-forwarded to `main` afterwards, which is why it shows "ahead 4" of its remote. |
| `claude/greenscape-scroll-reveal-0aca71` | `47dd781` | 12 / 0 | yes | Already Merged | `99274a6`. |
| `claude/focused-antonelli-c2e78c` | `2d3e9cb` | 9 / 0 | yes | Already Merged | `0bb36c0`. |
| `claude/hero-carousel-cursor` | `f502b74` | 58 / 0 | yes | Already Merged | `c2801db`. |
| `claude/interesting-leakey-b33011` | `72537f1` | 79 / 0 | yes | Already Merged | Through `redesign/white-botanical` work in `rebuild/platform`. |
| `claude/realtime-push-notifications-f7d4d8` | `fe18a18` | 81 / 0 | yes | Already Merged | Through `rebuild/platform` (`113dc7d` side). |
| `claude/localhost-changes-not-reflecting-491756` | `86028f8` | 34 / 0 | local only | Already Merged | Its commits were pushed straight to `main`. |
| `claude/refactor-folder-structure-86cace` | `99274a6` | 11 / 0 | local only | Already Merged | Points at an old `main` commit; no work of its own. |
| `claude/reverent-bartik-97eb4c` | `f3d464f` | 0 / 0 | local only | Already Merged | This session's starting branch; no work of its own. |
| `dependabot/github_actions/actions/checkout-7.0.1` | `07a6266` | 52 / 0 | yes, PR #3 merged | Already Merged | |
| `dependabot/github_actions/actions/setup-node-7.1.0` | `a84651e` | 62 / 0 | yes, PR #5 merged | Already Merged | |
| `dependabot/github_actions/actions/upload-artifact-7.0.2` | `b6d3824` | 52 / 0 | yes, PR #1 merged | Already Merged | |
| `dependabot/github_actions/pnpm/action-setup-6.1.1` | — | — | deleted on GitHub (pruned by this fetch) | Already Merged | PR #2 merged. |
| `dependabot/github_actions/aquasecurity/trivy-action-0.36.0` | — | — | gone | Superseded | PR #4 closed; `a740ff1` made the same bump by hand. |
| `integration/greenscape-complete` | `e8c544e` | | yes, PR #9 merged | Already Merged | `c9df53b`. |
| `docs/integration-reports` | see `final-merge-report.md` | | yes | this work | These reports and the staging disk fix. |

Nothing is **Incomplete**, **Conflicted** or **Blocked**.

Changes after this inventory was taken:

- `main` is `c9df53b` (PR #9), so `ci/production-branch` is now Already Merged too.
- `dependabot/github_actions/supabase/setup-cli-3.2.0` no longer exists on GitHub. Dependabot closed PR #6 at
  23:54 UTC ("supabase/setup-cli is no longer a dependency") and removed its branch. Nobody else deleted it.
- `feat/portal-redesign` appeared in the main checkout at 11:45 (+08:00): local only, no commits beyond `c9df53b`,
  uncommitted work in progress. **Incomplete**, and not this integration's to merge.

## The two branches not in `main` at the start

### `ci/production-branch`

- Merge base `e1418ce` (PR #7). `git log main..` : 7 commits, `1bfa59e` … `5b9b476`.
- `git diff --stat main...`: 17 files, +1142 −36. All under `.github/`, `config/`, `docs/deployment/`, `scripts/`,
  `tests/`, plus `playwright.smoke.config.ts`.
- No change to `package.json`, `pnpm-lock.yaml`, Prisma, `.env.example`, compose files, Dockerfiles, `next.config.ts`
  or anything under `apps/` or `packages/`.
- Configuration it introduces (all unset in the repository today, checked with `gh variable list` and
  `gh secret list`): variables `PRODUCTION_PUBLISH_ENABLED`, `DOKPLOY_AUTO_DEPLOY`, `DOKPLOY_APPLICATION_IDS`;
  secrets `DOKPLOY_URL`, `DOKPLOY_API_KEY`. With none set, merging publishes and deploys nothing.

### `dependabot/github_actions/supabase/setup-cli-3.2.0`

- Merge base `c96a276` (11 Nov). One commit, one line in `.github/workflows/ci.yml`.

## Repository settings that matter here

- Branch protection and rulesets are not available on this plan (the API answers 403 "Upgrade to GitHub Pro").
  So GitHub enforces no required checks and no required reviews on `main`.
