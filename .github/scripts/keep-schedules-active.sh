#!/usr/bin/env bash
set -euo pipefail

git fetch origin main
git rebase FETCH_HEAD

if (( $(date +%s) - $(git log -1 --format=%ct) < 30 * 24 * 60 * 60 )); then
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit --allow-empty -m "[CF-Pages-Skip] chore: keep scheduled publishing active"
git push origin HEAD:main
