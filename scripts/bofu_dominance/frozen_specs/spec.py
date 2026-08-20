"""Load and validate frozen-pillar specs. Specs live under data/bofu-dominance/frozen-specs/specs/."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.bofu_dominance.frozen_specs.constants import (
    PILLAR_SLUGS,
    REQUIRED_SPEC_FIELDS,
    spec_path,
)

SNAPSHOT_REQUIRED = ("title", "meta_description", "h1", "schema_types", "canonical", "cta")


def load_spec(slug: str, path: Path | None = None) -> dict[str, Any]:
    target = path or spec_path(slug)
    return json.loads(target.read_text(encoding="utf-8"))


def load_specs() -> list[dict[str, Any]]:
    return [load_spec(slug) for slug in PILLAR_SLUGS]


def validate_spec(spec: dict[str, Any]) -> list[str]:
    fails: list[str] = []
    for field in REQUIRED_SPEC_FIELDS:
        if field not in spec:
            fails.append(f"missing:{field}")
    snap = spec.get("snapshot") or {}
    if not isinstance(snap, dict):
        fails.append("snapshot_not_object")
    else:
        for field in SNAPSHOT_REQUIRED:
            if field not in snap:
                fails.append(f"snapshot.missing:{field}")
        if "content_sha256" not in snap:
            fails.append("snapshot.missing:content_sha256")
    census = spec.get("serp_census") or {}
    if not isinstance(census, dict):
        fails.append("serp_census_not_object")
    else:
        for key in ("family", "competitors", "intent_gaps"):
            if key not in census:
                fails.append(f"serp_census.missing:{key}")
    gsc = spec.get("gsc_precondition") or {}
    if not isinstance(gsc, dict):
        fails.append("gsc_precondition_not_object")
    else:
        live = gsc.get("gsc_live_available")
        other = gsc.get("other_evidence_decision")
        if live is True:
            pass
        elif live is False and other:
            pass
        else:
            fails.append("gsc_precondition.need_live_or_explicit_other_evidence")
    earliest = spec.get("earliest_safe_action_at")
    if not earliest or str(earliest) < "2026-09-16":
        if not spec.get("evidential_close"):
            fails.append("earliest_safe_action_at_before_gate_without_evidential_close")
    for block_name in ("before_after_blocks", "evidence_proof_needed"):
        if not spec.get(block_name):
            fails.append(f"empty:{block_name}")
    for metric_name in ("success_metrics", "kill_metrics", "revert_metrics"):
        if not spec.get(metric_name):
            fails.append(f"empty:{metric_name}")
    if not spec.get("query_ownership"):
        fails.append("empty:query_ownership")
    if not spec.get("negative_queries"):
        fails.append("empty:negative_queries")
    if "cannibalization" not in spec:
        fails.append("missing:cannibalization")
    return fails
