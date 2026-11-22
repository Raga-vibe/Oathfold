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

git -C "$tmp/repo" add -A
git -C "$tmp/repo" -c user.name="bayoabefe03-ai" \
  -c user.email="347606287+bayoabefe03-ai@users.noreply.github.com" \
  commit --quiet -m "Deploy Oathfold static build"
git -C "$tmp/repo" push --quiet origin gh-pages

echo "==> Pushed gh-pages"
echo "Site (once Pages is enabled): https://raga-vibe.github.io/Oathfold/"
