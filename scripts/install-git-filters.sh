#!/usr/bin/env bash
# Install git clean/smudge filters for docs/FINAL-RELEASE-RESULT.json.
# Invoked from package.json "prepare" so clones and CI always get the filter.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Only configure when inside a git work tree
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

SMUDGE="python3 scripts/site/smudge_release_result.py"
CLEAN="python3 scripts/site/clean_release_result.py"

git config filter.release-sha.smudge "$SMUDGE"
git config filter.release-sha.clean "$CLEAN"
git config filter.release-sha.required false

# Ensure .gitattributes maps the file (idempotent)
ATTR_LINE="docs/FINAL-RELEASE-RESULT.json filter=release-sha"
if [[ -f .gitattributes ]]; then
  if ! grep -qxF "$ATTR_LINE" .gitattributes; then
    printf '%s\n' "$ATTR_LINE" >> .gitattributes
  fi
else
  printf '%s\n' "$ATTR_LINE" > .gitattributes
fi

echo "install-git-filters: release-sha clean/smudge configured"
