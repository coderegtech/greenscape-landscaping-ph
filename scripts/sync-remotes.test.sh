#!/usr/bin/env bash
# Self-check for sync-remotes.sh against two throwaway local repositories (no network, no real remote is touched).
#   bash scripts/sync-remotes.test.sh
set -uo pipefail
script=$(cd "$(dirname "$0")" && pwd)/sync-remotes.sh
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
export GITHUB_URL=$t/github.git GITLAB_URL=$t/gitlab.git SYNC_RETRIES=1 SYNC_RETRY_DELAY=0
GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t; export GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL
git init -q --bare "$GITHUB_URL"; git init -q --bare "$GITLAB_URL"
git init -q "$t/w"; cd "$t/w"; git config commit.gpgsign false
commit() { git commit -q --allow-empty -m "$1"; }
head_of() { git --git-dir="$1" rev-parse -q --verify "refs/heads/$2" || echo none; }
fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1: expected '$2', got '$3'"; fail=1; fi; }
run() { out=$(bash "$script" "$@" 2>&1); rc=$?; }

git checkout -q -b main; commit c1; git push -q "$GITHUB_URL" main; git push -q "$GITLAB_URL" main
commit c2; git push -q "$GITHUB_URL" main
run; check "github ahead: gitlab main fast-forwards" "$(head_of "$GITHUB_URL" main)" "$(head_of "$GITLAB_URL" main)"; check "  exit 0" 0 $rc

git checkout -q -b feature/x; commit f1; git push -q "$GITLAB_URL" feature/x
git checkout -q -b dependabot/y; commit d1; git push -q "$GITLAB_URL" dependabot/y
run; check "gitlab-only branch is created on github" "$(head_of "$GITLAB_URL" feature/x)" "$(head_of "$GITHUB_URL" feature/x)"
check "branch outside SYNC_BRANCHES is left alone" none "$(head_of "$GITHUB_URL" dependabot/y)"

git tag v1 && git push -q "$GITHUB_URL" v1; run
check "tag reaches gitlab" "$(git rev-parse v1)" "$(git --git-dir="$GITLAB_URL" rev-parse v1)"

git checkout -q main; commit a; git push -q "$GITHUB_URL" main
git checkout -q -B other main~1; commit b; git push -q "$GITLAB_URL" other:main
before=$(head_of "$GITHUB_URL" main).$(head_of "$GITLAB_URL" main)
run; check "diverged main: exit 1" 1 $rc
check "  reported as DIVERGED" 1 "$(grep -c '^DIVERGED  main' <<<"$out")"
check "  neither side changed" "$before" "$(head_of "$GITHUB_URL" main).$(head_of "$GITLAB_URL" main)"

git checkout -q main; git push -q -f "$GITLAB_URL" main # test setup only: put the two mains back in step
orig=$(git rev-parse v1); git tag -f v1 main >/dev/null; git push -q -f "$GITLAB_URL" v1
run; check "conflicting tag: exit 1" 1 $rc
check "  tag not overwritten on github" "$orig" "$(git --git-dir="$GITHUB_URL" rev-parse v1)"

git checkout -q main; commit z; git push -q "$GITHUB_URL" main
gl_before=$(head_of "$GITLAB_URL" main); run --dry-run
check "dry run pushes nothing" "$gl_before" "$(head_of "$GITLAB_URL" main)"

GITLAB_URL=$t/missing.git run; check "unreachable remote: exit 2" 2 $rc
exit $fail
