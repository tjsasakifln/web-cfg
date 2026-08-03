#!/usr/bin/env bash
# Wave 1 human approval runner — MUST be executed by a named human outside agents/CI.
# This script does NOT approve anything by itself; it invokes approve_cli.py per page
# only when the human supplies checklist + material hash + explicit confirm.
#
# Usage (human only):
#   ALLOW_HUMAN_APPROVAL=1 ./scripts/editorial/approve_wave1_tiago.sh \
#     --reviewer "Tiago Sasaki" \
#     --page-id lei-art124-alteracao-obra \
#     --material-hash <hash> \
#     --notes "..." \
#     --sources lei-14133-planalto \
#     --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \
#     --confirm
#
# Forbidden: approve-all, bulk page lists, CI, empty checklist, missing hash.

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

# Reject bulk flags
for a in "$@"; do
  case "$a" in
    --approve-all|ALL|*','*|approve-all)
      echo "ERROR: bulk_approval_forbidden" >&2
      exit 3
      ;;
  esac
done

if [[ "$*" != *"--confirm"* ]]; then
  echo "ERROR: --confirm required" >&2
  exit 3
fi
if [[ "$*" != *"--checklist"* ]]; then
  echo "ERROR: --checklist required" >&2
  exit 3
fi
if [[ "$*" != *"--material-hash"* ]]; then
  echo "ERROR: --material-hash required" >&2
  exit 3
fi

exec python3 scripts/editorial/approve_cli.py "$@"
