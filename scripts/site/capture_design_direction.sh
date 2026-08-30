#!/usr/bin/env bash
# Capture the #494 comparison matrix with the #512 harness.
#
# The five protocol viewports are not in the default sweep — CAPTURE_VIEWPORTS
# =protocol yields 390x844, 768x1024, 1366x768, 1363x936 and 1440x1000. The
# protocol also requires full-page, JavaScript off and reduced motion, and a
# durable output directory: the harness refuses /tmp by design, because #494
# recorded exactly that failure once already.
#
# One run per (variant, job), because capture_screenshots.mjs derives a slug
# from the first 40 characters of the route and every prototype route shares a
# longer prefix than that. Separate output directories keep the evidence from
# overwriting itself.
#
# Why the staging directory is outside the checkout: the harness refuses to
# stamp a commit on screenshots of an uncommitted tree, and a run that wrote
# its manifests into the repository would dirty the tree with its own output
# and make every run after the first one refuse. Staging outside, then copying
# only the manifests in, lets all nine runs stamp the same clean commit.
#
# Usage: bash scripts/site/capture_design_direction.sh [stageDir]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAGE="${1:-${XDG_CACHE_HOME:-$HOME/.cache}/confenge/design-direction-494}"
EVIDENCE="$ROOT/docs/design-audit/evidence/capture"
PROTO="/docs/design-audit/prototypes"

export CAPTURE_VIEWPORTS=protocol
export CAPTURE_FULLPAGE=1
export CAPTURE_JS=off
export CAPTURE_MOTION=reduced

CAPTURED=()

run() {
  local group="$1"; shift
  local paths="$1"; shift
  mkdir -p "$STAGE/$group"
  CAPTURE_PATHS="$paths" node "$ROOT/scripts/site/capture_screenshots.mjs" "$STAGE/$group" >/dev/null
  CAPTURED+=("$group")
  echo "captured $group"
}

# Baseline: the shipped routes the protocol names, one per visitor job.
run baseline "/defesa-margem-contratos-publicos/,/conteudos/documentos-reequilibrio-obra-publica/,/ferramentas/limite-acrescimos-supressoes/"

for variant in a-trilho-de-memoria b-estado-de-revisao; do
  for job in comercial leitura instrumento specimen; do
    run "$variant/$job" "$PROTO/$variant/$job/"
  done
done

# Only now: every run has stamped the same clean commit, so copying the
# manifests in cannot dirty the tree underneath a later run.
for group in "${CAPTURED[@]}"; do
  mkdir -p "$EVIDENCE/$group"
  cp "$STAGE/$group"/manifest-*.json "$EVIDENCE/$group/"
done

echo "CAPTURE_DESIGN_DIRECTION_OK stage=$STAGE manifests=$EVIDENCE groups=${#CAPTURED[@]}"
