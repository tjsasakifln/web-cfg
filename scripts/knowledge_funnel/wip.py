"""WIP canary registry for the inbound epic (#61)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "data" / "inbound" / "wip-canary-registry.v1.json"


def load_registry(path: Path | None = None) -> dict[str, Any]:
    return json.loads((path or REGISTRY).read_text(encoding="utf-8"))


def evaluate_wip(data: dict[str, Any] | None = None) -> dict[str, Any]:
    data = data or load_registry()
    fails: list[str] = []
    if "84" not in json.dumps(data):
        fails.append("issue_84_not_represented")
    seen: dict[str, int] = {}
    for row in data.get("mechanisms") or []:
        mid = row.get("id")
        count = int(row.get("count") or 0)
        if count > 1:
            fails.append(f"wip_exceeded:{mid}")
        if mid in seen:
            fails.append(f"duplicate_mechanism:{mid}")
        seen[mid] = count
        if row.get("state") not in {"EXECUTE_NOW", "VALIDATE", "DEFER", "SUNSET"}:
            fails.append(f"bad_state:{mid}")
    return {
        "schema_version": "wip-canary-gate-v1",
        "ok": not fails,
        "fails": fails,
        "mechanism_count": len(data.get("mechanisms") or []),
    }
