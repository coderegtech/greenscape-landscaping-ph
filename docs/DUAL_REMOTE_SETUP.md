# Dual remote setup: GitHub and GitLab

| Platform | Role | Where |
|---|---|---|
| GitHub | **Primary** source of truth: pull requests, reviews, releases | https://github.com/coderegtech/greenscape-landscaping-ph |
| GitLab (self-hosted CE 19.5) | **Secondary** copy and the CI/CD runner ([GITLAB_CICD.md](GITLAB_CICD.md)) | http://localhost:8929/root/greenscape-landscaping-ph |

Two remotes do not synchronize anything by themselves. The sync is [`scripts/sync-remotes.sh`](../scripts/sync-remotes.sh).

## Remotes

```bash
git remote -v
```

```
origin  https://github.com/coderegtech/greenscape-landscaping-ph.git   (GitHub: what editors and `git push` use)
github  https://github.com/coderegtech/greenscape-landscaping-ph.git   (the same, under an explicit name)
gitlab  http://localhost:8929/root/greenscape-landscaping-ph.git
```

Set up on a fresh clone:

```bash
git remote add github https://github.com/coderegtech/greenscape-landscaping-ph.git
git remote add gitlab http://localhost:8929/root/greenscape-landscaping-ph.git
```

Before 2026-11-15 `origin` was GitLab. Local branches that tracked it now track `gitlab/<branch>`; `main` tracks
`origin/main`. Use `git branch -vv` to see each branch's upstream and `git branch -u origin/<branch>` to change it.

## Authentication (nothing is stored in the repository)

- **On a developer machine**: Git Credential Manager keeps the GitHub login and the GitLab login (it prompts once).
  `gh auth login` is enough for GitHub over HTTPS.
- **In GitLab CI** (the `sync-remotes` job): two masked, protected CI/CD variables, never printed. The script sends them
  as an HTTP header through git's environment, not in a URL, and not on a command line.

  | Variable | Value | Create it at |
  |---|---|---|
  | `GITHUB_SYNC_TOKEN` | fine-grained token, only this repository, **Contents: read and write** | GitHub > Settings > Developer settings |
  | `GITLAB_SYNC_TOKEN` | project access token, role Maintainer, scope `write_repository` | GitLab > project > Settings > Access tokens |
  | `GITHUB_STATUS_TOKEN` | fine-grained token, only this repository, **Commit statuses: write** | same as the first (optional, [GITLAB_CICD.md](GITLAB_CICD.md#pull-request-status-on-github)) |

  Set them under Settings > CI/CD > Variables with *Mask variable* and *Protect variable* on. Rotate by creating a new
  token and replacing the variable; tokens that expire stop the sync with a clear error, nothing else.

## What is synchronized

`scripts/sync-remotes.sh` fetches both repositories into a throwaway bare repository and compares every branch and tag:

| Situation | What happens |
|---|---|
| Same commit on both | nothing |
| Branch only on one side | created on the other |
| One side is an ancestor of the other | the older side is fast-forwarded |
| Both have commits the other lacks | **`DIVERGED`: reported, nothing pushed**, exit code 1 |
| Tag only on one side | pushed |
| Same tag name, different objects | `CONFLICT`: reported, never overwritten |

Guarantees: no force-push (the refspec has no `+`, and the servers reject non-fast-forwards), no deletion, no rewrite of
either side. Because it compares commits instead of reacting to events, running it twice, or from two places, is
harmless and cannot loop. Failed fetches and pushes are retried 3 times (`SYNC_RETRIES`, `SYNC_RETRY_DELAY`). Exit
codes: 0 in sync, 1 diverged or conflicting or a push failed, 2 a remote cannot be read.

Branches synced (`SYNC_BRANCHES`): `main develop production rebuild/* security/* feature/* feat/* fix/* hotfix/* ci/*
docs/* test/* refactor/* redesign/* integration/* claude/*`. Not synced: `dependabot/*` (GitHub only) and
`production-<name>` rehearsal branches. Add a pattern in the script's `SYNC_BRANCHES` default or set the variable.

A branch deleted on one side is **recreated** by the next sync. Delete it on both remotes (explicit decision, see
[BRANCHING_STRATEGY.md](BRANCHING_STRATEGY.md)).

### How it runs

GitLab runs on a machine GitHub cannot reach, so webhooks from GitHub are not possible, and GitLab CE has no pull
mirroring (Premium only). Three triggers instead:

1. **By hand**, from any clone that can reach both: `bash scripts/sync-remotes.sh` (`--dry-run` to see the plan).
2. **After every green pipeline on `main`**: the `sync-remotes` job (GitLab to GitHub; this is how the `production`
   snapshot reaches GitHub).
3. **On a schedule** for GitHub to GitLab: Build > Pipeline schedules > New schedule, every 5 minutes
   (`*/5 * * * *`), variable `SYNC_ONLY` = `true`. That pipeline runs only the sync job.

Optional, GitLab to GitHub instantly: Settings > Repository > Mirroring repositories > *Push* to
`https://<user>@github.com/coderegtech/greenscape-landscaping-ph.git` with a GitHub token, **Keep divergent refs** on,
*Only mirror protected branches* off. With *Keep divergent refs* on it never overwrites a diverged branch.

## Pushing by hand

```bash
git push origin <branch>          # GitHub (the normal way; pull requests are opened here)
```

```bash
git push gitlab <branch>          # GitLab directly (starts a pipeline for the branches listed in GITLAB_CICD.md)
```

```bash
bash scripts/sync-remotes.sh      # bring both in step afterwards
```

Never `--force` to either; `git push --force-with-lease` is also a force-push and needs the owner's explicit OK.

## Recovering from a failed or diverged sync

1. Read the output: `ERROR: cannot read github|gitlab` is connectivity or a token (check `curl -I` on the URL, renew the
   token); `ERROR: push of <ref> to <side> failed` is a rejection (protected branch, expired token) or a race, run it again.
2. `DIVERGED  <branch>: github has N commit(s) gitlab lacks, gitlab has M ...`: someone pushed to both. GitHub wins as
   the reviewed copy, but nothing is discarded automatically:

   ```bash
   git fetch github && git fetch gitlab
   git switch <branch> && git merge github/<branch> gitlab/<branch>   # resolve conflicts by hand, keep both sides' work
   git push origin <branch>
   bash scripts/sync-remotes.sh
   ```

3. `CONFLICT  tag <name>`: decide which tag is right, delete the wrong one on its remote (explicit decision), sync again.
4. A pipeline or the schedule stuck failing: run the script by hand with `--dry-run` from your machine to see the
   same message the job printed.

## Verified behaviour

`bash scripts/sync-remotes.test.sh` runs the script against two throwaway local repositories: fast-forward, new branch,
excluded branch, tag, divergence (nothing pushed, exit 1), conflicting tag (not overwritten), dry run, unreachable remote
(exit 2).
