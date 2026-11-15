#!/usr/bin/env bash
# Posts this GitLab job's result as a commit status on GitHub, so it shows on the pull request (docs/GITLAB_CICD.md).
# Runs in every job's after_script. Needs the masked CI/CD variable GITHUB_STATUS_TOKEN (GitHub token with the
# "Commit statuses: write" permission); without it, or outside GitLab, it does nothing. It never fails the job.
[ -n "${GITHUB_STATUS_TOKEN:-}" ] && [ -n "${CI_JOB_STATUS:-}" ] || exit 0

repo=${GITHUB_REPOSITORY:-coderegtech/greenscape-landscaping-ph}
case $CI_JOB_STATUS in success) state=success ;; canceled) state=error ;; *) state=failure ;; esac
context="gitlab-ci/${CI_JOB_NAME%%:*}${APP:+/$APP}"

# The token goes in a header read from stdin-fed config, not on the command line.
curl -sS --max-time 20 -o /dev/null -w "github status $context=$state: HTTP %{http_code}\n" \
  -K <(printf 'header = "Authorization: Bearer %s"\n' "$GITHUB_STATUS_TOKEN") \
  -H 'Accept: application/vnd.github+json' \
  -d "{\"state\":\"$state\",\"context\":\"$context\",\"target_url\":\"$CI_JOB_URL\",\"description\":\"GitLab job $CI_JOB_ID\"}" \
  "https://api.github.com/repos/$repo/statuses/$CI_COMMIT_SHA" || true
exit 0
