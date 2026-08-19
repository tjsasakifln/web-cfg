"""Founder-led QCO cycle gate for issue #64.

Does not send email, create charges, or infer pipeline. UNKNOWN stays UNKNOWN.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CYCLE_PATH = ROOT / "data" / "revops" / "qco" / "cycle-01.v1.json"
REQUIRED_ACCOUNT = (
    "account_id",
    "valid_account",
    "trigger",
    "decision_unit",
    "route",
    "founder_action",
    "outcome",
    "next_action",
    "learning",
)


def load_cycle(path: Path | None = None) -> dict[str, Any]:
    return json.loads((path or CYCLE_PATH).read_text(encoding="utf-8"))


def evaluate_cycle(data: dict[str, Any] | None = None) -> dict[str, Any]:
    data = data or load_cycle()
    fails: list[str] = []
    if data.get("bulk_auto_send") is not False:
        fails.append("bulk_auto_send_must_be_false")
    if data.get("offer", {}).get("charge_authorized") is True:
        fails.append("charge_authorized")
    icp = data.get("icp") or {}
    for key in ("include", "exclude", "defer"):
        if not icp.get(key):
            fails.append(f"icp_missing_{key}")
    accounts = list(data.get("accounts") or [])
    if not accounts:
        fails.append("no_account")
    for acc in accounts:
        for field in REQUIRED_ACCOUNT:
            if field not in acc:
                fails.append(f"missing_{field}:{acc.get('account_id')}")
        if acc.get("valid_account") is not True:
            fails.append(f"invalid_account:{acc.get('account_id')}")
        trigger = acc.get("trigger") or {}
        if not trigger.get("family"):
            fails.append(f"missing_trigger_family:{acc.get('account_id')}")
        for honest in ("outcome", "pipeline", "learning", "next_action"):
            value = acc.get(honest)
            if value in (None, "", "WON", "qualified_pipeline") and value != "UNKNOWN":
                if value in ("WON", "qualified_pipeline") and acc.get("kind") == "fixture":
                    fails.append(f"inferred_{honest}:{acc.get('account_id')}")
        if acc.get("kind") == "fixture" and acc.get("outcome") not in {
            "UNKNOWN",
            "REJECTED",
            "NO_ACTION",
        }:
            if acc.get("founder_action") == "NONE" and acc.get("outcome") not in {
                "UNKNOWN",
                "REJECTED",
                "NO_ACTION",
            }:
                fails.append(f"inferred_outcome:{acc.get('account_id')}")
        if acc.get("route") not in {
            "CALL",
            "ROUTED_CALL",
            "MANUAL_OUTREACH",
            "SEND_EMAIL",
            "NONE",
            "UNKNOWN",
        }:
            fails.append(f"bad_route:{acc.get('account_id')}")
    return {
        "schema_version": "qco-cycle-gate-v1",
        "ok": not fails,
        "fails": fails,
        "account_count": len(accounts),
        "bulk_auto_send": data.get("bulk_auto_send"),
        "outcomes": [a.get("outcome") for a in accounts],
    }
