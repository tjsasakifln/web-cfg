"""Fail-closed SmartLic capability classification for issue #63."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CLASS_PATH = ROOT / "data" / "migration" / "smartlic-confenge" / "capability-classification.v1.json"
EXECUTE_SET_PATH = ROOT / "data" / "migrations" / "smartlic-url-map" / "execute-set.v2.json"
ALLOWED = frozenset({"PORT_TO_WEB_CFG", "REIMPLEMENT", "MIGRATION_ONLY", "DEFER", "DROP"})
REQUIRED = frozenset({
    "id", "label", "class", "current_truth", "justification", "estimated_cost",
    "data_dependency", "executor_issue", "promotion_gate", "legacy_hold_paths", "smartlic_runtime",
})


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def evaluate_portfolio(data: dict[str, Any] | None = None, execute: dict[str, Any] | None = None) -> dict[str, Any]:
    data = data or load_json(CLASS_PATH)
    execute = execute or load_json(EXECUTE_SET_PATH)
    fails: list[str] = []
    if data.get("canonical_public_host") != "confenge.com.br":
        fails.append("canonical_host")
    if data.get("donor_host") != "smartlic.tech":
        fails.append("donor_host")
    if set(data.get("classes") or []) != ALLOWED:
        fails.append("class_vocabulary")
    try:
        review_date = date.fromisoformat(data.get("hold_review_date", ""))
    except (TypeError, ValueError):
        fails.append("hold_review_date")
        review_date = None
    if review_date and review_date < date(2026, 8, 24):
        fails.append("hold_review_date_stale")

    capabilities = list(data.get("capabilities") or [])
    ids: list[str] = []
    classified_holds: list[str] = []
    for capability in capabilities:
        capability_id = capability.get("id", "<missing>")
        ids.append(capability_id)
        missing = REQUIRED - set(capability)
        if missing:
            fails.append(f"missing_fields:{capability_id}:{','.join(sorted(missing))}")
        if capability.get("class") not in ALLOWED:
            fails.append(f"invalid_class:{capability_id}")
        if capability.get("smartlic_runtime") is not False:
            fails.append(f"smartlic_runtime:{capability_id}")
        paths = capability.get("legacy_hold_paths") or []
        if len(paths) != len(set(paths)):
            fails.append(f"duplicate_hold_inside:{capability_id}")
        classified_holds.extend(paths)
    if len(ids) != len(set(ids)):
        fails.append("duplicate_capability")
    if len(classified_holds) != len(set(classified_holds)):
        fails.append("hold_classified_more_than_once")

    execute_holds = {row["path"] for row in execute.get("holds") or []}
    classified_set = set(classified_holds)
    if classified_set != execute_holds:
        for path in sorted(execute_holds - classified_set):
            fails.append(f"unclassified_hold:{path}")
        for path in sorted(classified_set - execute_holds):
            fails.append(f"phantom_hold:{path}")
    if any(row.get("review_date") != data.get("hold_review_date") for row in execute.get("holds") or []):
        fails.append("hold_review_date_drift")

    return {
        "schema_version": "smartlic-capability-classification-gate/1.0",
        "ok": not fails,
        "fails": fails,
        "capability_count": len(capabilities),
        "hold_count": len(classified_holds),
        "by_class": {klass: sum(1 for c in capabilities if c.get("class") == klass) for klass in sorted(ALLOWED)},
    }
