"""Candidate record completeness for the Market Answer canary (#84)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CANDIDATE = (
    ROOT
    / "data"
    / "editorial"
    / "market-answers"
    / "candidates"
    / "valor-tipico-contratos-pavimentacao.v1.json"
)
REQUIRED = (
    "question",
    "user_job",
    "demand",
    "dataset",
    "answerability",
    "cta",
    "kill_gate",
)


def load_candidate(path: Path | None = None) -> dict[str, Any]:
    return json.loads((path or CANDIDATE).read_text(encoding="utf-8"))


def evaluate_candidate(data: dict[str, Any] | None = None) -> dict[str, Any]:
    data = data or load_candidate()
    fails: list[str] = []
    for field in REQUIRED:
        value = data.get(field)
        if value in (None, ""):
            fails.append(f"missing_{field}")
    demand = data.get("demand")
    if demand in (None, ""):
        fails.append("missing_demand")
    if not data.get("maintenance") and not data.get("maintenance_cost"):
        fails.append("missing_maintenance")
    if isinstance(demand, dict) and not demand.get("status"):
        fails.append("demand_status_missing")
    # dimensional existence must not authorize index
    if data.get("exists") is True and data.get("index_authorized") is True and not data.get("human_index_authorized"):
        fails.append("dimensional_existence_indexed")
    if data.get("index_authorized") is True and data.get("value_gate") not in {True, "PASS"}:
        if data.get("human_index_authorized") is not True:
            fails.append("index_without_value_gate")
    return {
        "schema_version": "market-answer-candidate-v1",
        "ok": not fails,
        "fails": fails,
        "path": str(CANDIDATE.relative_to(ROOT)),
    }
