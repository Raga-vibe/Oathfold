#!/usr/bin/env bash
#
# Publish app/dist to the gh-pages branch of Raga-vibe/Oathfold.
#
# Use this when the repo's Pages source is "Deploy from a branch" (Settings >
# Pages > Build and deployment > Source: Deploy from a branch, branch gh-pages,
# folder /). When the source is "GitHub Actions", .github/workflows/deploy.yml
# publishes automatically on every push to main and this script is not needed.
#
# Safe to re-run: it rebuilds dist, clones into a temp dir, and force-updates
# the gh-pages branch. It never touches main or any other branch.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

echo "==> Building app/dist"
( cd app && npm run build )

tmp="$(mktemp -d)"
# Native Windows tools (git) cannot resolve MSYS /tmp paths, so hand them a
# real Windows path instead.
tmp="$(cygpath -w "$tmp")"
trap 'rm -rf "$tmp"' EXIT

echo "==> Cloning publishing branch"
git clone --quiet --no-checkout https://github.com/Raga-vibe/Oathfold.git "$tmp/repo"
if git -C "$tmp/repo" rev-parse --verify --quiet origin/gh-pages >/dev/null; then
  git -C "$tmp/repo" checkout --quiet -B gh-pages origin/gh-pages
else
  git -C "$tmp/repo" checkout --quiet --orphan gh-pages
fi

find "$tmp/repo" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r app/dist/. "$tmp/repo"/

author_name="${DEPLOY_GIT_NAME:-$(git config user.name || true)}"
author_email="${DEPLOY_GIT_EMAIL:-$(git config user.email || true)}"
if [[ -z "$author_name" || -z "$author_email" ]]; then
  echo "No git identity found. Set one with 'git config --global user.name \"Your Name\"' and 'git config --global user.email \"you@example.com\"', or set DEPLOY_GIT_NAME and DEPLOY_GIT_EMAIL." >&2
  exit 1
fi

git -C "$tmp/repo" add -A
git -C "$tmp/repo" -c user.name="$author_name" \
  -c user.email="$author_email" \
  commit --quiet -m "Deploy Oathfold static build"
git -C "$tmp/repo" push --quiet origin gh-pages

echo "==> Pushed gh-pages"
echo "Site (once Pages is enabled): https://raga-vibe.github.io/Oathfold/"
