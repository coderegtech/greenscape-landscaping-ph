# Pull request status

`gh pr list --state all` on 2026-11-13. Repository: `coderegtech/greenscape-landscaping-ph`.

## Existing pull requests

| PR | Branch | State at discovery | Checks at discovery | What happens to it |
| --- | --- | --- | --- | --- |
| [#1](https://github.com/coderegtech/greenscape-landscaping-ph/pull/1) | `dependabot/github_actions/actions/upload-artifact-7.0.2` | merged 11 Nov | — | nothing |
| [#2](https://github.com/coderegtech/greenscape-landscaping-ph/pull/2) | `dependabot/github_actions/pnpm/action-setup-6.1.1` | merged 11 Nov | — | nothing |
| [#3](https://github.com/coderegtech/greenscape-landscaping-ph/pull/3) | `dependabot/github_actions/actions/checkout-7.0.1` | merged 11 Nov | — | nothing |
| [#4](https://github.com/coderegtech/greenscape-landscaping-ph/pull/4) | `dependabot/github_actions/aquasecurity/trivy-action-0.36.0` | closed, not merged | conflicting | nothing; `a740ff1` made the same bump |
| [#5](https://github.com/coderegtech/greenscape-landscaping-ph/pull/5) | `dependabot/github_actions/actions/setup-node-7.1.0` | merged 11 Nov | — | nothing |
| [#6](https://github.com/coderegtech/greenscape-landscaping-ph/pull/6) | `dependabot/github_actions/supabase/setup-cli-3.2.0` | open | `verify` cancelled; the rest passed | **not included** (see `merge-order.md`). Dependabot closed it at 23:54 UTC, two minutes after #9 merged: "supabase/setup-cli is no longer a dependency, so this is no longer needed" (the line had moved out of `ci.yml`). |
| [#7](https://github.com/coderegtech/greenscape-landscaping-ph/pull/7) | `refactor/dokploy-services` | merged 12 Nov 16:24 UTC | — | nothing |
| [#8](https://github.com/coderegtech/greenscape-landscaping-ph/pull/8) | `ci/production-branch` | open, mergeable | `verify` failed at `pnpm test:e2e` (the three failures `main` had); `static-analysis` failed on one Semgrep finding, `secrets: inherit` at `production-pipeline.yml:191` | **included in #9**; GitHub marked it merged at 23:52:11 UTC, when #9 merged |

## Opened by this integration

| PR | Branch | Purpose | State |
| --- | --- | --- | --- |
| [#9](https://github.com/coderegtech/greenscape-landscaping-ph/pull/9) | `integration/greenscape-complete` | The integration pull request: PR #8's commits and the two Security fixes. | **Merged** as `c9df53b` on 12 Nov 23:52:09 UTC (13 Nov 07:52 +08:00) by `coderegtech`. |
| [#10](https://github.com/coderegtech/greenscape-landscaping-ph/pull/10) | `docs/integration-reports` | These eleven reports, and the staging job's disk fix. | See `final-merge-report.md`. |

How #9 was merged: not by the session that opened it. It was merged from the owner's account while `verify` was
still running (all six Security checks had passed; `verify` finished 32 minutes later, at 00:24:39 UTC, with
success). GitHub reported no conflicts, and no branch protection exists to require the check. The same commit then
passed CI and Security again as a push to `main`.

## Branches with no pull request

| Branch | Why none was opened |
| --- | --- |
| `claude/vibrant-hugle-10207c` | It was the one completed branch without a pull request. It was pushed and `gh pr create` was run, but GitHub refused: "No commits between main and claude/vibrant-hugle-10207c". `main` had merged it as `a7829db` three minutes earlier. |
| every other branch | Already contained in `main`; a pull request would be empty. |

No duplicate pull request was created.
