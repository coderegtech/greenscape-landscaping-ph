# Unfinished work

Found on 2026-11-13 while auditing sessions and worktrees. Nothing here was deleted, moved or committed on anyone's
behalf.

## Uncommitted changes in worktrees

| Worktree | What | Decision |
| --- | --- | --- |
| `greenscape-scroll-reveal-0aca71` | `tests/e2e/decorations.spec.ts`: two added lines that mark reveals as revealed before the overlap check measures | **Superseded, no recovery branch made.** Commit `8db4151` (now on `main`) adds the same statement with the same selector. Keeping a second copy would only invite a conflict. |
| same | untracked `playwright.local.config.ts` (a four-line throwaway config that says "not committed" in its own comment), `.next-start-3200.log`, `test-results-390/`, `test-results-baseline/`, `test-results-widths/` | Left in place. Scratch output from a test run, reproducible. |
| `interesting-leakey-b33011`, `localhost-changes-not-reflecting-491756` | untracked `.claude/` | Left in place. Tool settings, not project work. |
| main checkout, `feat/portal-redesign` | 54 modified or new files under `apps/admin` and `apps/api`, no commits yet. The branch was created at 11:45, four hours after PR #9 merged. | **Active work, left alone.** Not part of this integration; it starts from the merged `main` (`c9df53b`). |

No recovery branch was needed: the only abandoned tracked change already exists as a commit, and
`feat/portal-redesign` is in use.

## Work a session started and did not close

| Session | Open end | Status now |
| --- | --- | --- |
| Greenscape scroll reveal animations | A production-build check of the hero and decoration failures was "still running"; no result was ever reported. | Answered by the e2e-fix session: the failures were tests measuring unsettled reveals (`8db4151`, `601699a`). |
| Changes not reflecting in localhost | `tests/e2e/hero.spec.ts` was edited but not run. The contact-page Google map was never seen rendering (the preview pane blocks google.com). | The spec is part of `pnpm test:e2e`, which passed on GitHub for the merged commit with no failed test (see `integration-test-results.md`). The map still needs a look in a normal browser. |
| Changes not reflecting in localhost | The about-page map image was swapped in the **local** database only. | Production needs the same swap through the admin after deployment. |
| Greenscape multi-portal authentication system | Last turn interrupted by the user. | Unknown what was cut short; the main checkout is clean and its commits are on `main`. |
| Greenscape CI/CD production branch automation | The pipeline and deploy workflows have never run on GitHub; the retry after a rejected push and anything against a real Dokploy server were not exercised. | The pipeline has run on `main`: its first full run ran out of disk in staging; after the fix in PR #10, gate, snapshot and staging passed. Publish, deploy and Dokploy are still unexercised. See `remaining-work.md`. |
| Application folder structure refactor | The `migrate` image was built and never run. Nothing was deployed to Dokploy. | The `migrate` image has run twice (both pipeline runs that reached staging), against the runner's throwaway database, in the pipeline's staging job (step "Build and start the API from the snapshot (migrations first)": success). Nothing has been deployed. |

## Branches that are not finished

| Branch | Why |
| --- | --- |
| `dependabot/github_actions/supabase/setup-cli-3.2.0` (PR #6) | A major bump (1.7.3 to 3.2.0) of a CI action. Its `verify` job was cancelled, so it has never been tested. Left out; see `branch-inventory.md`. Dependabot closed the pull request and deleted the branch itself two minutes after PR #9 merged. |
