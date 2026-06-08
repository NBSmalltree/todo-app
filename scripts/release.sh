#!/bin/bash
# Release script: commit, push, tag, push tag (triggers CI build)
# Usage: npm run release        (uses version from package.json)
#        npm run release -- 1.2.0  (uses specified version)

set -e

# Get version from argument or package.json
if [ -n "$1" ]; then
  VERSION="$1"
else
  VERSION=$(node -p "require('./package.json').version")
fi

TAG="v${VERSION}"

echo "📦 Releasing ${TAG}..."

# 1. Commit all changes
echo "1️⃣  Committing changes..."
git add -A
git commit -m "release: ${TAG}" || echo "   No changes to commit"

# 2. Push commits
echo "2️⃣  Pushing to remote..."
git push origin main

# 3. Delete old tag if exists
echo "3️⃣  Cleaning old tag ${TAG}..."
git tag -d "${TAG}" 2>/dev/null && echo "   Deleted local tag" || true
git push origin ":refs/tags/${TAG}" 2>/dev/null && echo "   Deleted remote tag" || true

# 4. Create and push new tag
echo "4️⃣  Creating tag ${TAG}..."
git tag "${TAG}"
git push origin "${TAG}"

echo ""
echo "✅ ${TAG} released! GitHub Actions will build the installers."
echo "   Check: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
