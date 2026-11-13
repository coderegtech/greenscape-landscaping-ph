# Final merge report

Integration of 2026-11-13. Repository `coderegtech/greenscape-landscaping-ph`, target `main`.

## Outcome

- **Merged.** [PR #9](https://github.com/coderegtech/greenscape-landscaping-ph/pull/9),
  `integration/greenscape-complete` into `main`, merge commit **`c9df53b`**, 12 Nov 23:52:09 UTC
  (13 Nov 07:52 +08:00). Final integration commit: **`e8c544e`**.
- **`main` is green on CI and Security** at `c9df53b`. Before the integration it was red on both.
- **One thing is red:** the new production pipeline's `staging` job, which ran for the first time on `main` and ran
  out of disk. It publishes and deploys nothing (both are switched off). A fix is proposed in
  [PR #10](https://github.com/coderegtech/greenscape-landscaping-ph/pull/10), with these reports.

## How the merge happened

The session that built the integration did not press merge. PR #9 was merged from the owner's account while its
`verify` check was still running; the six Security checks had passed, GitHub showed no conflicts, and the repository
has no branch protection that could have required the check. `verify` finished 32 minutes later with success, and
the same tree then passed CI and Security again as a push to `main`. So the condition set for the merge (no
conflicts, checks passing) was met, but after the fact.

## Sessions inspected

Twelve, listed in `claude-session-audit.md`: eleven earlier sessions and this one. Each was inspected through its
worktree, its commits and the tail of its transcript only. Not inspected: transcript bodies, sessions run outside
the desktop app, scheduled tasks, cloud sessions. One session was running at discovery (the e2e fix); its worktree
was not touched until it had committed and stopped. A new piece of work, `feat/portal-redesign`, started in the
main checkout four hours after the merge and was left alone.

## Branches

| | Branch | How |
| --- | --- | --- |
| Merged by this integration | `ci/production-branch` (PR #8, 7 commits) | merge `3966165`, inside PR #9 |
| Merged by this integration | two fixes made on the integration branch | `9427c9a` (named secrets), `e8c544e` (`basic-ftp` override) |
| Merged while this ran, by someone else | `claude/vibrant-hugle-10207c` (e2e fixes) | `a7829db`, from the main checkout at 07:18 |
| Already in `main` at the start | `rebuild/platform`, `security/application-hardening`, `redesign/white-botanical`, `feature/auth-chatbot`, `test/auth-playwright`, `refactor/dokploy-services`, all other `claude/*`, four merged Dependabot branches | nothing to do |
| Excluded | `dependabot/github_actions/supabase/setup-cli-3.2.0` (PR #6) | Never tested (its `verify` run was cancelled), a major version, and PR #8 moves the line it edits. Dependabot closed it itself after the merge. |
| Not this integration's | `feat/portal-redesign` | Created after the merge; uncommitted work in progress. |

No branch, worktree or process was deleted or reset by this integration. Nothing was force-pushed.

## Conflicts

No textual conflict in any of the three merges. Six problems that were not textual are in `conflict-report.md`:
`main` moving mid-integration (resolved by merging it in, at the cost of one redundant merge commit, `415cfcf`),
PR #8 blocked by `main`'s own red checks, `secrets: inherit` failing Semgrep, two new advisories on `basic-ftp`,
the Dependabot bump editing a line PR #8 moves, and the staging job's disk.

## Pull requests

| PR | State |
| --- | --- |
| [#9](https://github.com/coderegtech/greenscape-landscaping-ph/pull/9) integration | merged, `c9df53b` |
| [#8](https://github.com/coderegtech/greenscape-landscaping-ph/pull/8) production pipeline | merged through #9 |
| [#6](https://github.com/coderegtech/greenscape-landscaping-ph/pull/6) `supabase/setup-cli` | closed by Dependabot, not merged |
| [#10](https://github.com/coderegtech/greenscape-landscaping-ph/pull/10) reports and staging disk fix | open when this was written; to be merged once its CI and Security checks pass |

`claude/vibrant-hugle-10207c` was the one completed branch with no pull request. One could not be opened: `main`
already contained it ("No commits between main and claude/vibrant-hugle-10207c").

## Test evidence

Full detail and raw output in `integration-test-results.md`.

| | Result |
| --- | --- |
| CI on `main`, `c9df53b` | success: typecheck, lint, 114 unit tests, 190 integration tests, build, Playwright 279 passed / 3 flaky / 62 skipped / 0 failed, web image, Trivy |
| Security on `main`, `c9df53b` | success: dependencies, secrets, static-analysis, three image scans |
| CI and Security on PR #9, `e8c544e` | success; Playwright 280 passed / 2 flaky / 62 skipped / 0 failed |
| Local, same tree | install, migrations (13, none pending), typecheck, lint, unit, build: pass. Integration 189 of 190, the one failure a missing local key file, its file rerun 12 of 12. |
| Local Playwright | **not valid**: 198 passed, 82 failed, against dev servers that were restarted during the run. Not rerun. |
| After the merge | `main` fetched, `c9df53b` confirmed as its head, `pnpm build` exit 0, smoke test 8 of 8 against the local servers |
| Production pipeline on `main` | gate and snapshot passed; staging failed, "No space left on device"; publish and deploy skipped |

## State of `main`

`c9df53b`, 16 commits ahead of where it was at discovery (`f3d464f`): the two e2e fixes, PR #8's seven commits,
the two fixes, and five merge commits. No application code, migration or environment file changed;
`package.json` gained one override and `pnpm-lock.yaml` nine lines. No `production` branch exists, no repository
variable or secret is set, nothing was deployed, and no hosted or production database was touched.

What is still open is in `remaining-work.md`.
