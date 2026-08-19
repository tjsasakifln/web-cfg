"""Named syndication targets for the Data Desk canary (#89). Prepare-only."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.data_desk.schema import SYNDICATION_TARGET_COUNT, SchemaError

ROOT = Path(__file__).resolve().parents[2]
PATH = ROOT / "data" / "data-desk" / "syndication-targets.v1.json"


def load_targets(path: Path | None = None) -> dict[str, Any]:
    return json.loads((path or PATH).read_text(encoding="utf-8"))


def evaluate_named_targets(data: dict[str, Any] | None = None) -> dict[str, Any]:
    data = data or load_targets()
    fails: list[str] = []
    if data.get("auto_send") is not False:
        fails.append("auto_send")
    if data.get("sent") is True:
        fails.append("sent")
    targets = list(data.get("targets") or [])
    if len(targets) != SYNDICATION_TARGET_COUNT:
        fails.append(f"need_{SYNDICATION_TARGET_COUNT}_targets")
    names = []
    for row in targets:
        nominal = (row.get("target_nominal") or "").strip()
        if not nominal or nominal.upper() == "UNNAMED":
            fails.append(f"unnamed:{row.get('id')}")
        names.append(nominal.lower())
        if row.get("outcome") not in {"UNKNOWN", "NONE"}:
            fails.append(f"inferred_outcome:{row.get('id')}")
        if "smartlic.tech" in json.dumps(row).lower():
            fails.append(f"smartlic_target:{row.get('id')}")
    if len(set(names)) != len(names):
        fails.append("duplicate_nominal")
    return {
        "schema_version": "named-syndication-targets-v1",
        "ok": not fails,
        "fails": fails,
        "count": len(targets),
    }


def validate_or_raise(data: dict[str, Any] | None = None) -> dict[str, Any]:
    report = evaluate_named_targets(data)
    if not report["ok"]:
        raise SchemaError(";".join(report["fails"]))
    return report
