#!/usr/bin/env bash
# Intentionally inert: release identity comes from deploy/CI env (COMMIT_REF / GITHUB_SHA)
# via scripts/pseo/build_site.py → /.well-known/build-info.json. No clean/smudge filters.
set -euo pipefail
echo "install-git-filters: no-op (build-info from deploy env)"
exit 0
