# The `production` branch

Two branches, two jobs:

| Branch | Holds | Who writes to it |
|---|---|---|
| `main` | Everything: source, tests, docs, audits, tooling | People, through pull requests |
| `production` | Only what is needed to build, configure and deploy | The `Production pipeline` workflow, nobody else |

`production` is **source, not build output**: Dokploy (or `docker build`) still compiles it. It is smaller than `main`
(about 425 of 770 files) because tests, audits, screenshots, design notes, migration tooling and CI configuration are
left out. Nothing is ever deleted from `main`.

Never commit to `production` by hand. The only exception is the emergency revert in [rollback.md](rollback.md).

## What goes in: the manifest

[`config/production-files.json`](../../config/production-files.json) is the whole rule:

- `include`: paths that belong in the snapshot (`apps/**`, `packages/**`, `docker/**`, the lockfile and workspace
  files, the deployment docs, the three operational scripts).
- `exclude`: taken out again even when included (`docker/compose.dev.yml`, test files, build output, env files, keys).
- `required`: paths that must exist in the result, or the snapshot is rejected (Dockerfiles, Prisma schema and
  migrations, compose file, database init scripts, lockfile).

Patterns are repository-relative. `**` crosses folders, `*` stays in one folder, dotfiles are matched like any other
file. A pattern that is absolute or contains `..` is refused.

To ship a new top-level file or folder, add it to `include` in the same pull request. A file under `apps/`,
`packages/` or `docker/` is included automatically.

What is deliberately left out and why:

| Left out | Why |
|---|---|
| `tests/`, Playwright and Vitest config | Not used by any image build |
| `docs/` except `docs/deployment*` | Development documentation, audits, screenshots |
| `scripts/migrate`, `scripts/audit`, other scripts | One-off migration and audit tooling; run them from `main` |
| `supabase/` | Local Supabase CLI configuration; production uses the hosted project |
| `.github/` | Workflows run from `main`; the pipeline's token may not write workflow files anyway |
| `docker/compose.dev.yml` | Local databases only |
| `apps/web/app/design/` | Design-system showcase page (`/design`); only the e2e suite on `main` uses it |
| `eslint.config.mjs` and other lint/scan config | Not part of `next build` or the API image |

The root `package.json` and `pnpm-lock.yaml` are copied unchanged, so `pnpm install --frozen-lockfile` works. The
lockfile still lists `scripts/audit`; pnpm ignores a workspace folder that is not there.

## How a snapshot is made

[`scripts/generate-production-snapshot.ts`](../../scripts/generate-production-snapshot.ts) (Node built-ins only, no
install needed):

```bash
node scripts/generate-production-snapshot.ts --commit origin/main --out ../greenscape-snapshot
```

1. Resolves the commit and refuses one that is not on `origin/main` (`--allow-unmerged` lets you try a branch).
2. Reads the manifest **from that commit** and the file list from the commit's tree. The working directory is never
   read: uncommitted changes, untracked files and your `.env` cannot get in.
3. Refuses symbolic links and submodules among the selected files.
4. Writes the files into a new, empty folder and adds `PRODUCTION.json`:

   ```json
   {
     "sourceBranch": "main",
     "sourceCommit": "<full sha>",
     "generatedBy": "github-actions",
     "deploymentTarget": "dokploy",
     "fileCount": 422
   }
   ```

   There is no timestamp in the file, so the same commit always gives the same tree. The time is on the publish
   commit and the workflow run.
5. Validates the result ([`scripts/validate-production-snapshot.ts`](../../scripts/validate-production-snapshot.ts)):
   every file is allowed by the manifest, no symlinks, no credential file names (`.env`, `*.pem`, `*.key`, …), no
   credential-shaped text (private keys, Stripe, Supabase secret, JWT, Anthropic, AWS), required paths present,
   every `workspace:` dependency resolves, every file a Dockerfile copies or the compose file mounts is present.

Check any folder or a checkout of `production` again with:

```bash
node scripts/validate-production-snapshot.ts ../greenscape-snapshot
```

## How it is published

[`scripts/publish-production-snapshot.sh`](../../scripts/publish-production-snapshot.sh) makes one commit whose tree
is exactly the snapshot and whose parent is the current head of `production`, then pushes it normally.

- Added, changed and removed files all land in that one commit.
- The push is a fast-forward. Nothing is force-pushed and history is never rewritten.
- It stops without publishing when `main` has moved past the commit (the newer run publishes).
- It fails when `production` already holds a snapshot of a commit that is not an ancestor of this one, so an old run
  cannot replace a newer snapshot.
- If someone else pushed in between, it fetches, checks the order again and retries (three attempts).
- Publishing the same commit twice changes nothing.

Each publish commit is named `production: snapshot of main@<short sha>` and carries `Source-Commit: <full sha>`.

## Branch protection

This repository is private on a plan without branch protection or rulesets (GitHub answers "Upgrade to GitHub Pro"),
so the rules above are enforced by the pipeline, not by GitHub. If the plan changes, add a ruleset on `production`:
block force pushes, block deletion, restrict updates. The pipeline needs no bypass for the first two. If updates are
restricted so that the workflow's push is refused, the publish job fails and nothing is published; publishing through
a pull request into `production` would have to be added then (it is not built).
