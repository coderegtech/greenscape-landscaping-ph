#!/usr/bin/env bash
# Publishes a generated snapshot folder as one new commit on the production branch (docs/deployment/production-branch.md).
#   bash scripts/publish-production-snapshot.sh <snapshot dir> <source commit sha> [target branch] [remote]
# The new commit's tree is exactly the snapshot (files added, changed and removed in one step) and its parent is the
# branch's current head, so the push is an ordinary fast-forward: never forced, history never rewritten.
# Refuses to publish when main has moved on (a newer run will publish) or when the branch already holds a snapshot of
# a commit that is not an ancestor of this one (an older run can't replace a newer snapshot).
set -euo pipefail

snapshot=$(cd "$1" && pwd)
sha=$2
target=${3:-production}
remote=${4:-origin}

recorded=$(sed -n 's/.*"sourceCommit": "\([0-9a-f]\{40\}\)".*/\1/p' "$snapshot/PRODUCTION.json")
[ "$recorded" = "$sha" ] || { echo "::error::the snapshot was generated from '$recorded', not $sha"; exit 1; }

for attempt in 1 2 3; do
  git fetch --quiet "$remote" "+refs/heads/main:refs/remotes/$remote/main"
  if [ "$(git rev-parse "$remote/main")" != "$sha" ]; then
    echo "::notice::main has moved past $sha; the run for the newer commit publishes instead"
    exit 0
  fi

  parent=""
  if git fetch --quiet "$remote" "+refs/heads/$target:refs/remotes/$remote/$target" 2>/dev/null; then
    parent=$(git rev-parse "$remote/$target")
    previous=$(git show "$parent:PRODUCTION.json" | sed -n 's/.*"sourceCommit": "\([0-9a-f]\{40\}\)".*/\1/p')
    if [ -z "$previous" ] || ! git merge-base --is-ancestor "$previous" "$sha"; then
      echo "::error::$target holds a snapshot of '${previous:-unknown}', which is not an ancestor of $sha; not publishing"
      exit 1
    fi
  fi

  # Build the commit from the snapshot folder with a throwaway index: the checkout this runs in is not touched.
  index=$(mktemp -u)
  tree=$(GIT_INDEX_FILE=$index GIT_WORK_TREE=$snapshot git add --all --force . && GIT_INDEX_FILE=$index git write-tree)
  rm -f "$index"
  if [ -n "$parent" ] && [ "$(git rev-parse "$parent^{tree}")" = "$tree" ]; then
    echo "$target already holds the snapshot of $sha ($parent)"
    echo "published=$parent" >> "${GITHUB_OUTPUT:-/dev/null}"
    exit 0
  fi
  commit=$(git commit-tree "$tree" ${parent:+-p "$parent"} -m "production: snapshot of main@${sha:0:7}" -m "Source-Commit: $sha")

  if git push "$remote" "$commit:refs/heads/$target"; then
    echo "published $commit to $target (snapshot of $sha)"
    echo "published=$commit" >> "${GITHUB_OUTPUT:-/dev/null}"
    exit 0
  fi
  echo "push was rejected (attempt $attempt): $target changed meanwhile; checking the order again"
done
echo "::error::could not publish to $target after 3 attempts"
exit 1
