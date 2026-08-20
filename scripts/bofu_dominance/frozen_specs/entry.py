"""Shipped entry: snapshot + gate over the six frozen pages. Never mutates HTML."""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from typing import Any

from scripts.bofu_dominance.frozen_specs.constants import PILLAR_SLUGS, ROOT
from scripts.bofu_dominance.frozen_specs.gate import evaluate_gate
from scripts.bofu_dominance.frozen_specs.hashing import forbidden_path_hashes
from scripts.bofu_dominance.frozen_specs.patch import apply_frozen_patch
from scripts.bofu_dominance.frozen_specs.snapshot import snapshot_six
from scripts.bofu_dominance.frozen_specs.spec import load_specs, validate_spec


def run_entry(
    *,
    root: Path | None = None,
    mutate: bool = False,
    now: date | datetime | str | None = None,
    evidential_close: bool | None = None,
) -> dict[str, Any]:
    """Primary observable: html_mutation=false and apply-refused-before-gate (current date)."""
    base = root or ROOT
    before_hashes = forbidden_path_hashes(base)
    gate = evaluate_gate(now=now, evidential_close=evidential_close)
    snapshots = snapshot_six(base)
    applies: list[dict[str, Any]] = []
    html_mutation = False
    for slug in PILLAR_SLUGS:
        result = apply_frozen_patch(
            slug,
            root=base,
            mutate=mutate,
            now=now,
            evidential_close=evidential_close,
        )
        applies.append(result)
        if result["html_mutation"]:
            html_mutation = True
    after_hashes = forbidden_path_hashes(base)
    specs = load_specs()
    spec_reports = []
    for spec in specs:
        fails = validate_spec(spec)
        spec_reports.append({"slug": spec.get("slug"), "ok": not fails, "fails": fails})
    return {
        "html_mutation": html_mutation,
        "apply_refused_before_gate": gate["apply_refused_before_gate"],
        "gate": gate,
        "mutate": mutate,
        "snapshots": snapshots,
        "applies": applies,
        "specs": spec_reports,
        "forbidden_unchanged": before_hashes == after_hashes,
        "forbidden_hashes": after_hashes,
        "pillar_count": len(snapshots),
    }
