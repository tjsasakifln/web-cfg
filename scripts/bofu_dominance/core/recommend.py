"""Next actions. Frozen state never recommends edit-now."""

from __future__ import annotations

from typing import Any

from scripts.bofu_dominance.core.constants import (
    EARLIEST_SAFE_ACTION_FROZEN,
    EDIT_NOW_ACTIONS,
    GSC_LIVE_RECOMMENDATION,
    MAX_NEXT_ACTIONS,
)
from scripts.bofu_dominance.core.schema import RegistryError


def recommend_family(resolved: dict[str, Any], family: dict[str, Any]) -> dict[str, Any]:
    state = resolved["state"]
    freeze = family.get("freeze") or {}
    gated = (family.get("gate") or {}).get("status") == "GATED"
    earliest = family.get("earliest_safe_action_at") or EARLIEST_SAFE_ACTION_FROZEN
    if state == "FROZEN" or freeze.get("frozen") is True:
        action = "observe_only"
        authorizes = False
        summary = (
            f"Family {family['id']} is FROZEN under issue #{family.get('active_issue')}. "
            "Census and spec are allowed; HTML edit-now is refused."
        )
    elif gated or state == "NO_CANONICAL":
        action = "hold_gated"
        authorizes = False
        summary = f"Family {family['id']} is GATED/NO_CANONICAL. Do not publish a page in this slot."
    elif state in {"COVERED", "ELIGIBLE", "VISIBLE"}:
        action = "observe_only"
        authorizes = False
        summary = (
            f"Family {family['id']} is {state} with live GSC blocked. "
            "No edit-now; wait for credentials or earliest_safe_action_at."
        )
    else:
        action = "observe_only"
        authorizes = False
        summary = f"Family {family['id']} state={state}; default is observe_only."
    if action in EDIT_NOW_ACTIONS:
        raise RegistryError(f"{family['id']}: resolver produced forbidden edit-now action")
    if (state == "FROZEN" or freeze.get("frozen") is True) and authorizes:
        raise RegistryError(f"{family['id']}: frozen family cannot authorize HTML edit")
    return {
        "family_id": family["id"],
        "state": state,
        "action": action,
        "authorizes_html_edit": authorizes,
        "earliest_safe_action_at": earliest,
        "summary": summary,
        "next_test": family.get("next_test"),
        "kill": family.get("kill"),
        "consolidate": family.get("consolidate"),
    }


def ledger_next_actions() -> list[dict[str, Any]]:
    actions = [
        {
            "id": "gsc-credentials",
            "action": GSC_LIVE_RECOMMENDATION,
            "authorizes_html_edit": False,
            "owner": "operator_secrets",
            "refs": ["pr-159", "issue-128"],
            "summary": (
                "Set GSC_CREDENTIALS_JSON (or client secrets+token) and GSC_SITE_URL. "
                "Until then gsc_live_state=BLOCKED_CREDENTIAL_FAILURE. "
                "Do not treat historical CSV, redacted snapshots or SERP samples as live."
            ),
        },
        {
            "id": "freeze-128",
            "action": "observe_only",
            "authorizes_html_edit": False,
            "owner": "issue-128",
            "earliest_safe_action_at": EARLIEST_SAFE_ACTION_FROZEN,
            "refs": ["issue-128"],
            "summary": (
                "Keep the six #128 BOFU pillars FROZEN. Census and spec are allowed; "
                "do not recommend snippet/HTML edit-now before 2026-09-16."
            ),
        },
        {
            "id": "origin-to-service-153",
            "action": "keep_owner",
            "authorizes_html_edit": False,
            "owner": "issue-153",
            "refs": ["issue-153", "issue-128"],
            "summary": (
                "#153 owns the origin→service transition with destination_service_id. "
                "This ledger does not reimplement analytics or edit script.js."
            ),
        },
        {
            "id": "gated-155-156",
            "action": "hold_gated",
            "authorizes_html_edit": False,
            "owner": "issue-155",
            "refs": ["issue-155", "issue-156", "issue-154"],
            "summary": (
                "#155 bid-readiness and #156 partner-integrity enter as GATED, not as "
                "existing pages. Do not ship HTML. #156 stays blocked on extra-cli#436."
            ),
        },
        {
            "id": "prs-157-159-roles",
            "action": "do_not_duplicate",
            "authorizes_html_edit": False,
            "owner": "pr-159",
            "refs": ["pr-157", "pr-158", "pr-159"],
            "summary": (
                "PR #157 is one contract-analysis canary, not a BOFU family. "
                "PR #158 is the Data Desk kit, not a second target registry. "
                "PR #159 is an observability candidate to merge, not live GSC on main."
            ),
        },
    ]
    if len(actions) > MAX_NEXT_ACTIONS:
        raise RegistryError(f"next actions exceed {MAX_NEXT_ACTIONS}")
    for item in actions:
        if item["action"] in EDIT_NOW_ACTIONS or item.get("authorizes_html_edit"):
            raise RegistryError("ledger next actions must not authorize HTML edit-now")
    return actions
