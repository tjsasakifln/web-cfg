"""Next actions. Frozen state never recommends edit-now."""

from __future__ import annotations

from typing import Any

from scripts.bofu_dominance.core.constants import (
    EARLIEST_SAFE_ACTION_FROZEN,
    EDIT_NOW_ACTIONS,
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
            f"Family {family['id']} is {state}. Live GSC job may be OK; "
            "top-rows/non-BR/mixed context still refuse edit-now."
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
            "id": "gsc-live-overlay",
            "action": "observe_only",
            "authorizes_html_edit": False,
            "owner": "web-cfg/search-observatory",
            "refs": ["pr-159", "issue-128"],
            "summary": (
                "Current mechanical state is LIVE_JOB_OK with "
                "core_ready_for_product_decisions=false (overlay "
                "gsc-live-overlay.v1.json, as_of 2026-08-17). last_sync.json is "
                "gitignored, not a committed missing_credentials file. PR #159 "
                "freeze-head historically recorded credential_failure. Do not "
                "treat historical CSV, SERP samples, non-BR geo, mixed device, "
                "or top-row gaps as BR TOP* or HTML authorization."
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
            "id": "origin-to-service-contract",
            "action": "keep_owner",
            "authorizes_html_edit": False,
            "owner": "web-cfg/attribution-contract",
            "refs": ["issue-153", "issue-128"],
            "summary": (
                "The versioned attribution contract owns origin→service; closed #153 is historical. "
                "This ledger does not reimplement analytics or edit script.js."
            ),
        },
        {
            "id": "gap-155-blocked-156",
            "action": "hold_gated",
            "authorizes_html_edit": False,
            "owner": "web-cfg/organic-market-capture",
            "refs": ["issue-155", "issue-156", "issue-154"],
            "summary": (
                "Closed #155 is historical NO_DEMAND_EVIDENCE; open #156 remains an external "
                "CONTENT_GAP. Neither is an existing page or current URL owner."
            ),
        },
        {
            "id": "historical-pr-roles",
            "action": "do_not_duplicate",
            "authorizes_html_edit": False,
            "owner": "web-cfg/organic-market-capture",
            "refs": ["pr-157", "pr-158", "pr-159"],
            "summary": (
                "PR #157 closed unmerged and is not a BOFU family. PR #158 and PR #159 "
                "are historical merged implementations, not operational owners or live-rank claims."
            ),
        },
    ]
    if len(actions) > MAX_NEXT_ACTIONS:
        raise RegistryError(f"next actions exceed {MAX_NEXT_ACTIONS}")
    for item in actions:
        if item["action"] in EDIT_NOW_ACTIONS or item.get("authorizes_html_edit"):
            raise RegistryError("ledger next actions must not authorize HTML edit-now")
    return actions
