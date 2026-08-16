"""Simulate the canary package. Never creates a campaign, spend, or Ads mutate."""

from __future__ import annotations

from typing import Any

from scripts.paid_search.kill import evaluate_kill_conditions
from scripts.paid_search.preflight import preflight
from scripts.paid_search.schema import SCHEMA


def dry_run(package: dict[str, Any]) -> dict[str, Any]:
    gate = preflight(package)
    kills = evaluate_kill_conditions(package.get("kill") or {})
    only_human = gate.get("decision") == "READY_BEHIND_HUMAN_GATE"
    forbidden = (not only_human) and bool(gate.get("reasons"))
    simulation_ok = only_human or not gate.get("reasons")
    return {
        "schema": SCHEMA,
        "ok": simulation_ok,
        "executable": False,
        "go_live": False,
        "decision": "READY_BEHIND_HUMAN_GATE" if only_human else "BLOCKED",
        "campaign_created": False,
        "spend_authorized": False,
        "ads_mutate": False,
        "google_ads_api_called": False,
        "budget_committed_brl": 0,
        "reasons": list(gate.get("reasons") or []),
        "preflight": {
            "ok": gate.get("ok"),
            "decision": gate.get("decision"),
            "reasons": gate.get("reasons"),
            "human_required_blocking": gate.get("human_required_blocking"),
        },
        "kill": kills,
        "note": (
            "Dry-run only. No Google Ads campaign, ad group, budget or mutate "
            "was created. HUMAN_REQUIRED owner/account/budget/cap stay unapproved. "
            "This document is not go-live."
        ),
        "forbidden_variant": forbidden,
    }
