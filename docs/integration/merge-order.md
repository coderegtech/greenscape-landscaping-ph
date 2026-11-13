# Merge order

Derived from `dependency-graph.md`. Base: `origin/main`.

| Step | What | How | Result |
| --- | --- | --- | --- |
| 0 | base | `integration/greenscape-complete` cut from `origin/main` at `f3d464f` | — |
| 1 | `claude/vibrant-hugle-10207c` (e2e checks measure settled reveals) | `git merge --no-ff` | `415cfcf`, no conflicts. `pnpm typecheck` passed; the two specs lint clean. |
| 2 | `ci/production-branch` (PR #8) | `git merge --no-ff origin/ci/production-branch` | `3966165`, no conflicts. |
| 3 | `origin/main`, which had moved to `a7829db` (its own merge of step 1's branch) | `git merge --no-ff origin/main` | `949bf85`, no conflicts; the tree did not change. `pnpm typecheck` passed; `pnpm test` 114 passed. |
| 4 | fix: named secrets for the deploy workflow call | commit `9427c9a` | Semgrep finding gone (see `integration-test-results.md`). |
| 5 | fix: `basic-ftp` override | commit `e8c544e` | OSV-Scanner exits 0. |
| 6 | PR #9 into `main` | merge commit on GitHub | `c9df53b`. |
| 7 | `docs/integration/` and the staging disk fix | branch `docs/integration-reports`, its own pull request | see `final-merge-report.md`. |

The reports were kept out of PR #9 on purpose: a push to its branch would have cancelled and restarted the
40-minute `verify` run.

Step 1 comes first because nothing can be shown green without it. Step 2 is the only feature merge left. Steps 4
and 5 come after step 2 because step 4 edits files step 2 adds, and both are needed before the Security check can
pass on the integration pull request.

## Left out

| Branch | Why |
| --- | --- |
| `dependabot/github_actions/supabase/setup-cli-3.2.0` (PR #6) | Never tested (its `verify` run was cancelled), a major version, and it edits a line that step 2 moves to another file. It should be regenerated on top of the new `main` and judged by its own CI run. Dependabot has since closed it. |

No branch was left out for being incomplete, blocked or actively modified. The one branch that was actively
modified at discovery (`claude/vibrant-hugle-10207c`) was not touched until its session had committed and stopped.
