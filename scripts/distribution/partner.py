"""Partner hypothesis gate for earned distribution (#66). Manual-first."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
PATH = ROOT / "data" / "distribution" / "partner-hypothesis.v1.json"


def load_partner(path: Path | None = None) -> dict[str, Any]:
    return json.loads((path or PATH).read_text(encoding="utf-8"))


def evaluate_partner(data: dict[str, Any] | None = None) -> dict[str, Any]:
    data = data or load_partner()
    fails: list[str] = []
    if data.get("auto_send") is not False:
        fails.append("auto_send")
    if not data.get("owner"):
        fails.append("missing_owner")
    if not data.get("kill_gate"):
        fails.append("missing_kill_gate")
    partner = data.get("partner") or {}
    for field in ("audience", "incentive", "referral_path", "attribution"):
        if not partner.get(field):
            fails.append(f"missing_{field}")
    outcomes = data.get("outcomes") or {}
    for key, value in outcomes.items():
        if value not in {"UNKNOWN", "NONE"} and data.get("auto_send") is False:
            if value not in {"UNKNOWN", "NONE"} and not str(value).startswith("observed:"):
                if value not in {"UNKNOWN", "NONE"}:
                    # inferred mention without observation
                    if value in {"WON", True, "yes"}:
                        fails.append(f"inferred_{key}")
    return {
        "schema_version": "partner-hypothesis-gate-v1",
        "ok": not fails,
        "fails": fails,
        "auto_send": data.get("auto_send"),
    }
