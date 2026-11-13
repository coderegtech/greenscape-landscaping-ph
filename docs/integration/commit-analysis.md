# Commit analysis

`origin/main` had 94 commits at `f3d464f`. Every branch except two was already contained in it, so
`git log main..BRANCH` is empty for them; what each one brought is read from the merge that landed it
(`git diff MERGE^1...MERGE^2`).

## What each landed branch brought into `main`

| Landed as | Branch | Commits | Size | Lockfile | Prisma migration | Env / config touched |
| --- | --- | --- | --- | --- | --- | --- |
| first-parent line, `39ed0ca` … `7cc118d` | `rebuild/platform` phases 1–12 with `security/application-hardening` | 13 | the platform itself | yes | `init`, `reference_number_sequences`, `quotation_property_details`, `media_blur_placeholder`, `shop`, `admin`, `legacy_ids` | everything, first version |
| `0e7ee4b` | `redesign/white-botanical` | 1 | 53 files, +1026 −252 | no | — | — |
| `29565eb` | `feature/auth-chatbot` | 12 | 82 files, +3110 −156 | yes | `auth_assistant` | `.env.example`, `apps/web/next.config.ts` |
| `c2801db` | `claude/hero-carousel-cursor` | 5 | 29 files, +869 −70 | no | — | — |
| first-parent line, `7dee5f1` … `1f431fc` | home redesign, CI fixes, provisioned accounts, employee portal (includes the two merges above) | 13 | — | yes | `provisioned_accounts` | `.env.example`, `docker/prod.env.example`, `ci.yml`, `security.yml` |
| `113dc7d` | the old `origin/main` line: notifications (`fe18a18`), the `interesting-leakey` redesign draft, four Dependabot bumps, hero without dots, contact-page map | 16 | 59 files, +3015 −54 | yes | `notifications` | `.env.example`, `ci.yml`, `security.yml`, `apps/web/next.config.ts` (CSP `frame-src`) |
| first-parent line, `dd22509` … `deaf345` | analytics, audit log, sign out everywhere, selfies, employee calendar, QA | 15 | — | no | `analytics`, `session_revocation`, `correction_attachments` | `ci.yml` |
| `99274a6` | `claude/greenscape-scroll-reveal-0aca71` | 4 | 19 files, +389 −72 | no | — | — |
| `0bb36c0` | `claude/focused-antonelli-c2e78c` | 2 | 3 files, +250 −1 | no | — | `package.json` script `staff:seed` |
| `e1418ce` | `refactor/dokploy-services` (PR #7) | 1 | 20 files, +183 −33 | no | — | four `apps/*/Dockerfile`, three `next.config.ts`, `ci.yml`, `security.yml`, `dependabot.yml` |
| `52d412b` | `test/auth-playwright` | 4 | 28 files, +959 −12 | no | — | — |
| `f3d464f` | direct commit | 1 | `playwright.config.ts` | no | — | test-only rate limit |
| `a7829db` | `claude/vibrant-hugle-10207c` | 2 | 2 files, +7 −1 | no | — | — |

Thirteen Prisma migrations exist, `20261109121123_init` to `20261117090000_correction_attachments`. Two share the
prefix `20261113090000` (`auth_assistant`, `notifications`); they touch different tables and both apply
(`pnpm db:deploy` on the local database reports nothing pending).

## Commits this integration adds to `main`

| Commit | From | What | Risk |
| --- | --- | --- | --- |
| `1bfa59e` | `ci/production-branch` | `config/production-files.json`, snapshot generator and validator, unit test | none at runtime; scripts only |
| `fb6357d` | same | `scripts/publish-production-snapshot.sh`: one fast-forward commit, never forced | runs only in the pipeline's `publish` job |
| `858f359` | same | `playwright.smoke.config.ts`, `tests/e2e/smoke/production.smoke.ts` (read-only) | not part of `pnpm test:e2e` (file is `*.smoke.ts`, own config) |
| `56b85d5` | same | `.github/actions/local-stack`; `ci.yml` uses it and drops to a read-only token | changes how CI sets up its stack; proven only by a CI run |
| `e8ad7f4` | same | `production-pipeline.yml`, `deploy-production.yml` | start running on `main` after the merge; publish and deploy stay off until variables are set |
| `2bd2172` | same | pipeline follows `apps/*/Dockerfile` | — |
| `5b9b476` | same | `docs/deployment/` pages | — |
| `9427c9a` | this integration | the pipeline passes `DOKPLOY_URL` and `DOKPLOY_API_KEY` by name instead of `secrets: inherit` | fixes the Semgrep finding that failed PR #8 |
| `e8c544e` | this integration | pnpm override `basic-ftp` to `^6.2.4` (resolves 6.2.6); stale OSV exception removed | dev-only dependency of `scripts/audit`; lockfile changes 9 lines |
| `c9df53b` | GitHub | merge commit of PR #9; its tree is identical to `e8c544e` | — |

Not in PR #9, on `docs/integration-reports` for a pull request of their own: `docs/integration/` (eleven reports)
and one added step in `production-pipeline.yml` that frees runner disk before the staging job (see
`conflict-report.md`).

Three merge commits on the branch are bookkeeping: `415cfcf` (this branch's merge of `claude/vibrant-hugle-10207c`,
made about three minutes after `main` had merged the same two commits as `a7829db`, before this session refetched), `3966165` (merge of `ci/production-branch`),
`949bf85` (merge of the moved `main`).

## Not added

`d457d93` (`supabase/setup-cli` 1.7.3 to 3.2.0): see `branch-inventory.md`.
