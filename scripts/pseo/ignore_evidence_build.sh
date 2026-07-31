#!/usr/bin/env bash
# Netlify build ignore: exit 0 = skip build, exit 1 = run build.
# Skip publish when the only changed paths are campaign evidence / audit reports
# so freezing deploy SHAs into JSON cannot move the live tip.
set -euo pipefail

# CACHED_COMMIT_REF is previous deploy; COMMIT_REF is the commit being evaluated.
# On first build either may be empty — always build.
if [[ -z "${CACHED_COMMIT_REF:-}" || -z "${COMMIT_REF:-}" ]]; then
  exit 1
fi

# List files changed vs previous deploy
mapfile -t changed < <(git diff --name-only "${CACHED_COMMIT_REF}" "${COMMIT_REF}" 2>/dev/null || true)
if [[ ${#changed[@]} -eq 0 ]]; then
  # no diff info — build
  exit 1
fi

# Allowlisted evidence-only paths (and pure docs under seo/ that never affect HTML)
is_evidence() {
  local f="$1"
  case "$f" in
    seo/pseo-operational-result.json|\
    seo/PSEO-OPERATIONAL-INBOUND-FINAL.md|\
    seo/pseo-production-audit.json|\
    seo/pseo-production-audit.md|\
    seo/pseo-indexation-status.json|\
    seo/pseo-query-map.json|\
    seo/SNAPSHOT-UPDATE.md|\
    seo/pseo-site-build-report.json|\
    seo/pseo-build-report.json|\
    seo/pseo-editorial-report.json|\
    seo/pseo-editorial-report.md|\
    seo/pseo-audit-report.json)
      return 0
      ;;
  esac
  return 1
}

for f in "${changed[@]}"; do
  if ! is_evidence "$f"; then
    # non-evidence path changed → must build
    exit 1
  fi
done

# Only evidence paths changed → skip Netlify publish
echo "ignore: evidence-only commit (${#changed[@]} path(s)) — skip build"
exit 0
