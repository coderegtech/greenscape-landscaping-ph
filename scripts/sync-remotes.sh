#!/usr/bin/env bash
# Two-way, fast-forward-only sync of branches and tags between GitHub (primary) and GitLab (secondary).
#   bash scripts/sync-remotes.sh [--dry-run]       (docs/DUAL_REMOTE_SETUP.md)
# Env: GITHUB_URL, GITLAB_URL      default: the URLs of the `github` / `gitlab` remotes of the current repo
#      GITHUB_SYNC_TOKEN, GITLAB_SYNC_TOKEN   optional; sent as an HTTP header (never in a URL, never logged). Without
#                                  them git uses its own credentials (Git Credential Manager on a developer machine).
#      SYNC_BRANCHES               space-separated globs of the branches to sync (default below)
#      SYNC_RETRIES, SYNC_RETRY_DELAY   attempts per fetch/push (3) and seconds between them, times the attempt (5)
# Per branch: equal -> nothing; missing on one side -> created there; one side an ancestor of the other -> the older
# side is fast-forwarded; otherwise DIVERGED: reported and left alone. Nothing is forced, nothing is deleted (a branch
# deleted on one side comes back on the next run: delete it on both). Tags are immutable: a missing tag is pushed, a
# tag that points at different objects on the two sides is reported.
# Exit: 0 in sync, 1 diverged / conflicting tag / push failed, 2 a remote could not be read.
set -euo pipefail

dry=0; [ "${1:-}" = "--dry-run" ] && dry=1
SYNC_BRANCHES=${SYNC_BRANCHES:-"main develop production rebuild/* security/* feature/* feat/* fix/* hotfix/* ci/* docs/* test/* refactor/* redesign/* integration/* claude/*"}
tries=${SYNC_RETRIES:-3}; delay=${SYNC_RETRY_DELAY:-5}

GITHUB_URL=${GITHUB_URL:-$(git remote get-url github)}
GITLAB_URL=${GITLAB_URL:-$(git remote get-url gitlab)}

# Tokens travel as a per-URL Authorization header through git's environment config: not in argv, URLs or output.
n=0
header() { # url token user
  export "GIT_CONFIG_KEY_$n=http.$1.extraHeader" "GIT_CONFIG_VALUE_$n=Authorization: Basic $(printf '%s:%s' "$3" "$2" | base64 | tr -d '\n')"
  n=$((n + 1))
}
[ -n "${GITHUB_SYNC_TOKEN:-}" ] && header "$GITHUB_URL" "$GITHUB_SYNC_TOKEN" x-access-token
[ -n "${GITLAB_SYNC_TOKEN:-}" ] && header "$GITLAB_URL" "$GITLAB_SYNC_TOKEN" oauth2
export GIT_CONFIG_COUNT=$n GIT_TERMINAL_PROMPT=0

# A throwaway bare repository holds both histories, so no working copy or remote-tracking ref is touched.
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
git init -q --bare "$work"; export GIT_DIR=$work

retry() {
  local i=1
  until "$@"; do
    [ "$i" -ge "$tries" ] && return 1
    echo "  attempt $i/$tries failed, retrying in $((i * delay))s" >&2; sleep $((i * delay)); i=$((i + 1))
  done
}

for side in github gitlab; do
  url=GITHUB_URL; [ $side = gitlab ] && url=GITLAB_URL
  retry git fetch -q --no-tags "${!url}" "+refs/heads/*:refs/sync/$side/heads/*" "+refs/tags/*:refs/sync/$side/tags/*" \
    || { echo "ERROR: cannot read $side (${!url}); check that it is reachable and the credentials are valid" >&2; exit 2; }
done

pushed=0 diverged=0 failed=0
push() { # target-side sha ref
  local url=GITHUB_URL; [ "$1" = gitlab ] && url=GITLAB_URL
  if [ $dry = 1 ]; then echo "  would push $2 to $1 $3"; return 0; fi
  # Plain refspec, no '+': the server rejects anything that is not a fast-forward.
  if retry git push -q "${!url}" "$2:$3"; then pushed=$((pushed + 1)); else
    echo "ERROR: push of $3 to $1 failed (rejected as non-fast-forward, protected, or unreachable)" >&2; failed=$((failed + 1))
  fi
}
sha() { git rev-parse -q --verify "refs/sync/$1/$2" 2>/dev/null || true; }
wanted() { local p; for p in $SYNC_BRANCHES; do [[ $1 == $p ]] && return 0; done; return 1; }

while read -r b; do
  wanted "$b" || continue
  gh=$(sha github "heads/$b"); gl=$(sha gitlab "heads/$b")
  if [ "$gh" = "$gl" ]; then echo "ok        $b"
  elif [ -z "$gl" ]; then echo "create    gitlab <- github  $b"; push gitlab "$gh" "refs/heads/$b"
  elif [ -z "$gh" ]; then echo "create    github <- gitlab  $b"; push github "$gl" "refs/heads/$b"
  elif git merge-base --is-ancestor "$gh" "$gl"; then echo "ff        github <- gitlab  $b (${gh:0:7}..${gl:0:7})"; push github "$gl" "refs/heads/$b"
  elif git merge-base --is-ancestor "$gl" "$gh"; then echo "ff        gitlab <- github  $b (${gl:0:7}..${gh:0:7})"; push gitlab "$gh" "refs/heads/$b"
  else
    read -r only_gh only_gl < <(git rev-list --left-right --count "$gh...$gl")
    echo "DIVERGED  $b: github has $only_gh commit(s) gitlab lacks, gitlab has $only_gl that github lacks; merge them by hand, then sync again" >&2
    diverged=$((diverged + 1))
  fi
done < <(git for-each-ref --format='%(refname)' refs/sync/github/heads refs/sync/gitlab/heads | sed -E 's#^refs/sync/[a-z]+/heads/##' | sort -u)

while read -r t; do
  gh=$(sha github "tags/$t"); gl=$(sha gitlab "tags/$t")
  if [ "$gh" = "$gl" ]; then continue
  elif [ -z "$gl" ]; then echo "tag       gitlab <- github  $t"; push gitlab "$gh" "refs/tags/$t"
  elif [ -z "$gh" ]; then echo "tag       github <- gitlab  $t"; push github "$gl" "refs/tags/$t"
  else echo "CONFLICT  tag $t points at different objects on github and gitlab; tags are never overwritten" >&2; diverged=$((diverged + 1)); fi
done < <(git for-each-ref --format='%(refname)' refs/sync/github/tags refs/sync/gitlab/tags | sed -E 's#^refs/sync/[a-z]+/tags/##' | sort -u)

echo "sync done: $pushed pushed, $diverged diverged/conflicting, $failed failed$([ $dry = 1 ] && echo ' (dry run: nothing pushed)')"
[ $((diverged + failed)) -eq 0 ]
