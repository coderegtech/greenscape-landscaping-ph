# Branching strategy

| Branch | Purpose | Created from | Merged into | Written by |
|---|---|---|---|---|
| `main` | Stable integration branch. The source of everything. | | | pull requests |
| `develop` | Optional shared branch for work that must be integrated before it reaches `main`. **Not created yet**: create it from `main` when the team needs it. Synced and validated like `main` (no deployment). | `main` | `main` | pull requests |
| `production` | What gets deployed: a deployment-only **snapshot** of `main`, one fast-forward commit per release ([production-branch.md](deployment/production-branch.md)). | | | the GitLab pipeline only |
| `feature/*` | New work | `main` (or `develop`) | same | the author |
| `fix/*` | Bug fixes | `main` | `main` | the author |
| `hotfix/*` | Urgent production fixes | `main` | `main`, then the normal pipeline publishes a new snapshot | the author |

Other prefixes in use (`feat/`, `ci/`, `docs/`, `test/`, `refactor/`, `claude/`, ...) are synced too (list in
[DUAL_REMOTE_SETUP.md](DUAL_REMOTE_SETUP.md)) but get no pipeline until a pull request or merge request exists.

## Flow

```
feature/x ──push──> GitHub ── pull request (review) ──> main ──green GitLab pipeline──> production ──> Dokploy
     └──────── sync (fast-forward only) ──> GitLab: validation pipeline for the branch
```

1. Branch from `main`: `git switch -c feature/<topic> origin/main`.
2. Push to GitHub and open the **pull request there**; that is the review.
3. The sync copies the branch to GitLab (within the schedule interval), which runs the validation pipeline
   (typecheck, lint, unit tests, integration and e2e tests, build, security scans, image scans). Push to GitLab directly
   (`git push gitlab feature/<topic>`) for an immediate run. With the optional `GITHUB_STATUS_TOKEN` the results appear
   on the pull request as `gitlab-ci/*` statuses.
4. Merge on GitHub only when the review is approved and the GitLab checks are green. A conflict is resolved by hand by
   merging `main` into the branch; never by discarding either side's changes.
5. The merge reaches GitLab through the sync. The `main` pipeline then runs everything again plus the package stage
   (snapshot, staging, smoke test), publishes `production` and deploys ([deployment.md](deployment.md)).

## Protection

- **GitLab**: `main` (and `production`): force-push and deletion refused. Maintainers can push, because the sync and the
  production publish job push as a Maintainer token.
- **GitHub**: `main`: force-push and deletion refused. Required reviews and required status checks are the next step once
  the GitLab statuses are reported to GitHub (they cannot be required before that; the sync pushes GitLab-side commits
  to `main` directly).
- Nobody pushes to `production` by hand, except the emergency revert in [rollback.md](deployment/rollback.md).
- Production deployments only run from `main` on GitLab, after every earlier stage passed.

## Rules

- Never force-push, never delete a remote branch, without the repository owner's explicit decision. A branch deleted on
  one remote is recreated by the sync; delete it on both.
- Keep branch names lowercase with `/` prefixes as above.
- Do not commit to `main` directly when a pull request is possible.
