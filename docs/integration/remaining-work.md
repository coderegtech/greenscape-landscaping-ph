# Remaining work

What is still open after the integration of 2026-11-13. `main` (`699a8e7`) is green on CI, Security and the
production pipeline's gate, snapshot and staging jobs. Nothing here blocks `main`.

## Needs a decision from the owner

| Item | Detail |
| --- | --- |
| Turn the production pipeline on | It is merged, off, and its staging job now passes. Rehearse first: `gh workflow run production-pipeline.yml --ref main -f target_branch=production-test` (a manual run does publish, to the rehearsal branch you name). Then `gh variable set PRODUCTION_PUBLISH_ENABLED --body true`. Deploying needs the Dokploy secrets and `DOKPLOY_AUTO_DEPLOY`, described in `docs/deployment/dokploy.md`. |
| `supabase/setup-cli` 1.7.3 to 3.2.0 | Dependabot closed PR #6 once the line left `ci.yml`. The action is still pinned to v1 in `.github/actions/local-stack/action.yml`. Bump it by hand in its own pull request if wanted. |
| Dependabot does not watch the shared action | `.github/dependabot.yml` covers workflow files. Actions pinned inside `.github/actions/local-stack/action.yml` (`pnpm/action-setup`, `actions/setup-node`, `supabase/setup-cli`) will not get update pull requests until that directory is added. PR #6 closing as "no longer a dependency" is consistent with this. |
| `feat/portal-redesign` | Uncommitted work in the main checkout (54 files under `apps/admin` and `apps/api`), started at 11:45 after the merge. Not part of this integration. It needs its own commits, tests and pull request. |
| Dev servers left running | `next dev` on 3000 and 3001 (started 07:52:51 from the main checkout) no longer answer: `/api/health` timed out after 90 seconds at 16:45. 3002 and the API on 4000 were restarted around 12:00 and answer. None was started by this integration, so none was stopped. |
| Stale branches and worktrees | Every `claude/*` branch, `feature/auth-chatbot`, `redesign/white-botanical`, `security/application-hardening`, `test/auth-playwright`, `refactor/dokploy-services`, `rebuild/platform`, `ci/production-branch` and `integration/greenscape-complete` is contained in `main`. Nine session worktrees sit under `.claude/worktrees/`. None was deleted; deleting them is safe once their sessions are closed, except the untracked scratch files in `greenscape-scroll-reveal-0aca71`, which would go with it. |

## Never exercised

| Item | Detail |
| --- | --- |
| Publish and deploy | Gate, snapshot (with its Gitleaks scan) and staging (four images from the snapshot, the `migrate` image, smoke test 8 of 8) passed on `main` in run [43412057142](https://github.com/coderegtech/greenscape-landscaping-ph/actions/runs/43412057142). Publish and deploy have never run; they are switched off. The staging job's disk margin after the clean-up was 33 GB free of 72 GB at its start. |
| Dokploy | Nothing has been deployed. The publish script's retry after a rejected push is untested. |
| A full local Playwright run on a production build | The local run used dev servers that were restarted under it (see `integration-test-results.md`). The full suite's clean result is GitHub's. |
| Contact-page Google map | Added in `86028f8`; never seen rendering (the session's preview blocked google.com). Look at `/contact` in a normal browser. |
| About-page map image | Swapped in the local database only; production needs the same swap through the admin. |
| Reveal travel on unvisited pages | The e2e fix latches reveals before measuring accent overlap. Whether the 20px travel hides a real overlap on pages or widths the spec does not visit was not checked. |

## Housekeeping

| Item | Detail |
| --- | --- |
| Flaky e2e tests | Passed on retry in CI. On `main`: `notifications.spec.ts:26` (desktop), `decorations.spec.ts:118` (mobile), `redesign.spec.ts:109` (mobile). On PR #9: `redesign.spec.ts:109` (desktop and mobile). The gallery filter test is the repeat offender. Not investigated. |
| `supabase/signing_keys.json` in a fresh worktree | Gitignored and per machine. Without it one integration test fails with `ENOENT` (`auth.test.ts`, expired-token case). Copy it from the main checkout or run `supabase gen signing-key`. |
| `docs/security/vulnerability-report.md` | Its OSV row (dated 10 Nov) lists 13 advisories including `basic-ftp`. After the override the scanner filters 12 and `basic-ftp` is no longer among them. The report is a dated record and was not edited. |
| OSV exceptions expire 2027-02-10 | Six entries remain in `osv-scanner.toml`, all for Lighthouse's dependencies in `scripts/audit`. |
| No branch protection | Not available on this plan, so nothing on GitHub stops a direct or forced push to `main` or `production`, or a merge before checks finish (PR #9 was merged while `verify` was still running). The pipeline's own rules (fast-forward only, never out of order) are the only guard. |
