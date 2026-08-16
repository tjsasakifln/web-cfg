"""Fail-closed preflight. Never creates a campaign or authorizes spend."""

from __future__ import annotations

from typing import Any

from scripts.paid_search.kill import evaluate_kill_conditions
from scripts.paid_search.package import validate_package
from scripts.paid_search.schema import HUMAN_REQUIRED_FIELDS, SCHEMA

PREFLIGHT_BLOCKING = frozenset(
    {
        "BROAD_MATCH",
        "PMAX_OR_FORBIDDEN_CHANNEL",
        "CHANNEL_NOT_SEARCH",
        "MATCH_TYPE_FORBIDDEN",
        "RETARGETING",
        "PII_IN_PARAMS",
        "TRACKING_INCOMPLETE",
        "CONVERSION_HIERARCHY_INCOMPLETE",
        "PRIMARY_IS_CLICK_OR_CTR",
        "PRIMARY_METRIC_MISSING",
        "LANDING_MISSING",
        "LANDING_NOINDEX",
        "WRONG_LANDING",
        "LANDING_INELIGIBLE",
        "FAMILY_NOT_SELECTED",
        "FAMILY_EVIDENCE_MISSING",
        "SCHEMA_MISMATCH",
        "ATTRIBUTION_SOURCE",
        "PAID_DEMAND_INVENTED",
        *[f"HUMAN_REQUIRED_{field.upper()}" for field in HUMAN_REQUIRED_FIELDS],
        *[f"HUMAN_REQUIRED_{field.upper()}_VALUE" for field in HUMAN_REQUIRED_FIELDS],
    }
)


def preflight(package: dict[str, Any]) -> dict[str, Any]:
    validation = validate_package(package)
    reasons = list(validation.get("reasons") or [])
    kills = evaluate_kill_conditions(package.get("kill") or {})
    if kills.get("fired"):
        reasons.append("KILL_CONDITION_PRE_FIRED")

    blocking = [r for r in reasons if r in PREFLIGHT_BLOCKING or r.startswith("HUMAN_REQUIRED_")]
    # unique
    ordered: list[str] = []
    for reason in reasons:
        if reason not in ordered:
            ordered.append(reason)

    go_live = not ordered
    return {
        "schema": SCHEMA,
        "ok": go_live,
        "go_live": False,
        "blocked": True,
        "executable": False,
        "campaign_created": False,
        "spend_authorized": False,
        "ads_mutate": False,
        "reasons": ordered,
        "blocking": blocking,
        "human_required_blocking": validation.get("human_required_blocking") or [],
        "kill": kills,
        "validation": validation,
        "decision": "READY_BEHIND_HUMAN_GATE" if _only_human_gates(ordered) else "BLOCKED",
        "note": (
            "Preflight cannot go live. Owner, Ads account, budget and cap "
            "remain HUMAN_REQUIRED. No campaign is created."
        ),
    }


def _only_human_gates(reasons: list[str]) -> bool:
    if not reasons:
        return False
    return all(r.startswith("HUMAN_REQUIRED_") for r in reasons)
