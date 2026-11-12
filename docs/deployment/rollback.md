# Rollback

Application and data rollback (previous image, database restore, payments during an incident) is in
[`docs/deployment.md`](../deployment.md), "Rollback runbook". This page covers the `production` branch.

Pick the first option that fits.

## 1. Redeploy the previous deployment in Dokploy

Fastest, and the branch does not change. Dokploy keeps a "Rollback" button per deployment when registry rollbacks are
enabled for the application (Deployments > Rollback Settings; needs a Docker registry). Without that, use option 3.

Afterwards `production` is ahead of what is running: fix `main` (option 2) before the next deployment.

## 2. Fix forward on `main` (the normal way)

```bash
git revert <bad commit on main>
```

Open the pull request and merge it. CI and Security run, the pipeline publishes a new snapshot, Dokploy deploys it.
History on both branches stays linear and truthful. Use this whenever you can wait for CI (about 45 minutes).

## 3. Emergency: revert the snapshot commit on `production`

The one case where a person pushes to `production`. It restores the previous snapshot exactly, including
`PRODUCTION.json`, as a new commit. Nothing is force-pushed.

```bash
git fetch origin production
```

```bash
git switch --detach origin/production
```

```bash
git revert --no-edit HEAD
```

```bash
git push origin HEAD:production
```

Then deploy `production` in Dokploy (automatic when Auto Deploy is on) and revert or fix the bad commit on `main`
(option 2). Until `main` is fixed, set `PRODUCTION_PUBLISH_ENABLED` to `false` so the next unrelated merge does not
publish the bad code again:

```bash
gh variable set PRODUCTION_PUBLISH_ENABLED --body false
```

The next publish works without any cleanup: the reverted branch records the older source commit, which is an ancestor
of the new one.

## Database migrations

A snapshot rollback does not undo a migration. Migrations must be additive (`docs/deployment.md`, release runbook
step 4), so the previous snapshot runs against the newer schema. If a migration damaged data, follow "A migration
broke data" in `docs/deployment.md`.

## When the pipeline itself fails

| Symptom | Meaning | Do |
|---|---|---|
| gate ends with "not publishing" | CI or Security is not green on that commit, or `main` moved on | Fix or re-run the failing workflow; its completion starts the pipeline again |
| snapshot fails | A file is missing, not allowed, or looks like a secret | Read the list in the job log; fix the manifest or remove the file on `main` |
| staging fails | The snapshot does not build or run | Usually a new top-level file an image needs: add it to `include` |
| publish fails with "not an ancestor" | `production` holds a snapshot of a commit that is not in this commit's history (for example `main` was rewritten) | Decide by hand which is right; never force-push `production` |
| publish fails on the push | A rule or permission refuses the workflow's push | See "Branch protection" in [production-branch.md](production-branch.md) |

A failed run publishes nothing: `production` stays at the last good snapshot.
