"""Promotion gate for a recurring market index (#91). DEFER until #65 citation proof."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
GATE_PATH = ROOT / "data" / "research" / "recurring-index-promotion-gate.v1.json"


def load_gate(path: Path | None = None) -> dict[str, Any]:
    return json.loads((path or GATE_PATH).read_text(encoding="utf-8"))


def may_build_index(data: dict[str, Any] | None = None) -> bool:
    data = data or load_gate()
    if data.get("decision_state") != "EXECUTE_NOW":
        return False
    proof = data.get("flagship_citation_proof") or {}
    if proof.get("status") != "PROVEN":
        return False
    if proof.get("qualified_citation") is not True and proof.get("qualified_reuse") is not True:
        return False
    if data.get("build_authorized") is not True:
        return False
    return True


def evaluate_promotion(data: dict[str, Any] | None = None) -> dict[str, Any]:
    data = data or load_gate()
    fails: list[str] = []
    if data.get("depends_on_issue") != 65:
        fails.append("missing_flagship_dependency")
    if data.get("decision_state") not in {"DEFER", "VALIDATE", "EXECUTE_NOW", "SUNSET"}:
        fails.append("bad_decision_state")
    proof = data.get("flagship_citation_proof") or {}
    if proof.get("status") == "UNKNOWN" and data.get("build_authorized") is True:
        fails.append("build_authorized_without_proof")
    if proof.get("status") == "UNKNOWN" and data.get("public_url_authorized") is True:
        fails.append("public_url_without_proof")
    if may_build_index(data) and proof.get("status") != "PROVEN":
        fails.append("may_build_incoherent")
    if data.get("decision_state") == "DEFER" and may_build_index(data):
        fails.append("defer_but_buildable")
    return {
        "schema_version": "recurring-index-promotion-gate-v1",
        "ok": not fails,
        "fails": fails,
        "may_build": may_build_index(data),
        "decision_state": data.get("decision_state"),
    }
