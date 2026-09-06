#!/usr/bin/env bash
set -euo pipefail

root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
script=$(cd "$(dirname "$0")/.." && pwd)/.github/scripts/keep-schedules-active.sh

seed_remote() {
  local name=$1
  local date=$2
  git init --bare --quiet "$root/$name.git"
  git init --quiet -b main "$root/$name-seed"
  git -C "$root/$name-seed" config user.name test
  git -C "$root/$name-seed" config user.email test@example.com
  if [ "$date" = now ]; then
    git -C "$root/$name-seed" commit --allow-empty --quiet -m seed
  else
    GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" git -C "$root/$name-seed" commit --allow-empty --quiet -m seed
  fi
  git -C "$root/$name-seed" remote add origin "$root/$name.git"
  git -C "$root/$name-seed" push --quiet -u origin main
}

seed_remote fresh now
git clone --quiet -b main "$root/fresh.git" "$root/fresh"
fresh_before=$(git -C "$root/fresh" rev-list --count HEAD)
(cd "$root/fresh" && bash "$script")
test "$(git -C "$root/fresh" rev-list --count HEAD)" = "$fresh_before"
test "$(git --git-dir="$root/fresh.git" rev-list --count main)" = 1

seed_remote expired "2000-01-01T00:00:00Z"
git clone --quiet -b main "$root/expired.git" "$root/expired"
(cd "$root/expired" && bash "$script")
test "$(git -C "$root/expired" rev-list --count HEAD)" = 2
test "$(git -C "$root/expired" log -1 --format=%s)" = "[CF-Pages-Skip] chore: keep scheduled publishing active"
git -C "$root/expired" diff-tree --quiet HEAD^ HEAD
test "$(git --git-dir="$root/expired.git" rev-list --count main)" = 2
(cd "$root/expired" && bash "$script")
test "$(git --git-dir="$root/expired.git" rev-list --count main)" = 2

echo "keep-schedules-active: ok"
