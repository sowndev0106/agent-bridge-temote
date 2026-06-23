#!/usr/bin/env bash
# scripts/deploy.sh — build, version bump (patch), and publish to npm.
#
# Usage:  bash scripts/deploy.sh           # patch bump (0.1.7 → 0.1.8)
#         bash scripts/deploy.sh minor     # minor bump (0.1.7 → 0.2.0)
#         bash scripts/deploy.sh major     # major bump (0.1.7 → 1.0.0)
#
# Requires:  npm login already done (or NPM_TOKEN in env for CI).
# Side effects: creates a git tag and pushes origin/main + origin/<tag>.

set -euo pipefail

BUMP="${1:-patch}"

# Sanity: must be on main, working tree clean.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "✗ Must be on main (currently on $BRANCH)" >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "✗ Working tree has uncommitted changes. Commit or stash first." >&2
  exit 1
fi

echo "→ Running tests (vitest)…"
npm test -- --reporter=basic

echo "→ Building (tsup + vite)…"
npm run build

echo "→ Bumping version ($BUMP)…"
npm version "$BUMP" -m "chore(release): v%s"

echo "→ Pushing to origin…"
git push origin main --follow-tags

echo "→ Publishing to npm…"
npm publish --access public

echo "✓ Done. New version: $(node -p "require('./package.json').version")"
