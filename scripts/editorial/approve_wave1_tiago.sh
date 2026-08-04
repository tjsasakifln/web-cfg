#!/usr/bin/env bash
# Human-only wrapper for one first-cohort approval. It does not approve by itself.
# The canonical current command, hashes and deploy-preview URLs are generated in
# docs/editorial/HUMAN-ACTION-NOW.md; do not copy historical hashes from elsewhere.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ "${GITHUB_ACTIONS:-}" == "true" || "${CI:-}" == "true" || "${EDITORIAL_AUTOMATION:-}" == "true" ]]; then
  echo "ERROR: approval blocked in CI/automation" >&2
  exit 3
fi
if [[ "${ALLOW_HUMAN_APPROVAL:-}" != "1" ]]; then
  echo "ERROR: set ALLOW_HUMAN_APPROVAL=1 only when a named human is operating this shell" >&2
  exit 3
fi

# The wrapper rejects only page-selection bulk flags. Source ids are correctly
# comma-separated and are validated exactly by approve_cli.py.
for arg in "$@"; do
  case "$arg" in
    --approve-all|--page-ids|ALL|approve-all)
      echo "ERROR: bulk_approval_forbidden" >&2
      exit 3
      ;;
  esac
done

for required in --confirm --checklist --material-hash --page-id --sources; do
  if [[ " $* " != *" $required "* ]]; then
    echo "ERROR: $required required" >&2
    exit 3
  fi
done

exec python3 scripts/editorial/approve_cli.py "$@"

