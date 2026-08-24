"""Fail-closed SmartLic capability classification for issue #63."""

from __future__ import annotations

import json
import posixpath
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CLASS_PATH = ROOT / "data" / "migration" / "smartlic-confenge" / "capability-classification.v1.json"
EXECUTE_SET_PATH = ROOT / "data" / "migrations" / "smartlic-url-map" / "execute-set.v2.json"
ALLOWED = frozenset({
    "PORT_TO_WEB_CFG",
    "REIMPLEMENT",
    "MIGRATION_ONLY",
    "DEFER",
    "DROP",
})
CANONICAL_CAPABILITY_CLASSES = {
    "margin-defense-suite": "PORT_TO_WEB_CFG",
    "contract-intelligence-publishing": "PORT_TO_WEB_CFG",
    "market-answer-engine": "REIMPLEMENT",
    "contracts-prices-explorer": "DEFER",
    "company-agency-municipality-hubs": "DEFER",
    "static-entity-profile-farms": "DROP",
    "tender-operations-hub": "DEFER",
    "smartlic-digest-runtime": "DROP",
    "smartlic-raiox-watchlists": "MIGRATION_ONLY",
    "geo-llms-txt-hacks": "DROP",
    "smartlic-lead-magnet-cro-stack": "DROP",
}
CANONICAL_CAPABILITY_IDS = frozenset(CANONICAL_CAPABILITY_CLASSES)
ROOT_CONTRACT = {
    "schema_version": "smartlic-capability-classification/1.0",
    "issue": 63,
    "as_of": "2026-08-24",
    "decision_state": "EXECUTE_NOW",
    "canonical_public_host": "confenge.com.br",
    "donor_host": "smartlic.tech",
    "rule": (
        "SmartLic is donor, URL-specific migration bridge and sunset evidence only. "
        "Classification never authorizes a SmartLic public runtime or a new capability."
    ),
}
REQUIRED = frozenset({
    "id", "label", "class", "current_truth", "justification", "estimated_cost",
    "data_dependency", "executor_issue", "promotion_gate", "legacy_hold_paths", "smartlic_runtime",
})
STRING_FIELDS = REQUIRED - {"executor_issue", "legacy_hold_paths", "smartlic_runtime"}


def _normalized_hold_path(value: Any) -> bool:
    return (
        isinstance(value, str)
        and value.startswith("/")
        and value != "/"
        and "?" not in value
        and "#" not in value
        and posixpath.normpath(value) == value
    )


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def evaluate_portfolio(
    data: dict[str, Any] | None = None,
    execute: dict[str, Any] | None = None,
    *,
    today: date | None = None,
) -> dict[str, Any]:
    data = data or load_json(CLASS_PATH)
    execute = execute or load_json(EXECUTE_SET_PATH)
    fails: list[str] = []
    for field, expected in ROOT_CONTRACT.items():
        if data.get(field) != expected:
            fails.append(f"root_contract:{field}")
    declared_classes = data.get("classes")
    if (
        not isinstance(declared_classes, list)
        or not all(isinstance(item, str) for item in declared_classes)
        or set(declared_classes) != ALLOWED
    ):
        fails.append("class_vocabulary")
    try:
        review_date = date.fromisoformat(data.get("hold_review_date", ""))
    except (TypeError, ValueError):
        fails.append("hold_review_date")
        review_date = None
    if review_date and review_date < (today or date.today()):
        fails.append("hold_review_date_stale")

    raw_capabilities = data.get("capabilities")
    if not isinstance(raw_capabilities, list):
        fails.append("invalid_capabilities")
        raw_capabilities = []
    capabilities = [row for row in raw_capabilities if isinstance(row, dict)]
    if len(capabilities) != len(raw_capabilities):
        fails.append("invalid_capability_record")
    ids: list[str] = []
    classified_holds: list[str] = []
    for capability in capabilities:
        raw_id = capability.get("id")
        capability_id = raw_id if isinstance(raw_id, str) and raw_id else "<missing>"
        if capability_id != "<missing>":
            ids.append(capability_id)
        missing = REQUIRED - set(capability)
        if missing:
            fails.append(f"missing_fields:{capability_id}:{','.join(sorted(missing))}")
        if capability.get("class") not in ALLOWED:
            fails.append(f"invalid_class:{capability_id}")
        elif CANONICAL_CAPABILITY_CLASSES.get(capability_id) != capability.get("class"):
            fails.append(f"canonical_class_drift:{capability_id}")
        if capability.get("smartlic_runtime") is not False:
            fails.append(f"smartlic_runtime:{capability_id}")
        for field in STRING_FIELDS:
            value = capability.get(field)
            if not isinstance(value, str) or not value.strip():
                fails.append(f"empty_field:{capability_id}:{field}")
        executor_issue = capability.get("executor_issue")
        if executor_issue is not None and (
            not isinstance(executor_issue, int)
            or isinstance(executor_issue, bool)
            or executor_issue <= 0
        ):
            fails.append(f"invalid_executor_issue:{capability_id}")
        raw_paths = capability.get("legacy_hold_paths")
        if not isinstance(raw_paths, list):
            fails.append(f"invalid_hold_paths:{capability_id}")
            paths: list[str] = []
        else:
            paths = raw_paths
        for path in paths:
            if not _normalized_hold_path(path):
                fails.append(f"invalid_hold_path:{capability_id}")
        if capability.get("class") == "DROP" and paths:
            fails.append(f"hold_under_drop:{capability_id}")
        path_keys = [json.dumps(path, ensure_ascii=False, sort_keys=True) for path in paths]
        if len(path_keys) != len(set(path_keys)):
            fails.append(f"duplicate_hold_inside:{capability_id}")
        classified_holds.extend(path for path in paths if isinstance(path, str))
    if len(ids) != len(set(ids)):
        fails.append("duplicate_capability")
    if set(ids) != CANONICAL_CAPABILITY_IDS:
        for capability_id in sorted(CANONICAL_CAPABILITY_IDS - set(ids)):
            fails.append(f"missing_capability:{capability_id}")
        for capability_id in sorted(set(ids) - CANONICAL_CAPABILITY_IDS):
            fails.append(f"unknown_capability:{capability_id}")
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
