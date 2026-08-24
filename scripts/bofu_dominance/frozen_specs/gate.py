"""Apply gate for the legacy freeze and the all-required unlock plan."""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

from scripts.bofu_dominance.frozen_specs.constants import (
    CORRESPONDING_ISSUE,
    DATA_DIR,
    EARLIEST_SAFE_ACTION_AT,
)

ISSUE_STATE_PATH = DATA_DIR / "issue-state.json"
UNLOCK_PLAN_PATH = DATA_DIR / "unlock-plan.v1.json"


def _as_date(value: date | datetime | str | None, default: date) -> date:
    if value is None:
        return default
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def load_issue_state(path: Path | None = None) -> dict[str, Any]:
    target = path or ISSUE_STATE_PATH
    if not target.is_file():
        return {
            "issue": CORRESPONDING_ISSUE,
            "state": "LANDED_AWAITING_LIVE_EVIDENCE",
            "evidential_close": False,
            "closed_at": None,
        }
    return json.loads(target.read_text(encoding="utf-8"))


def load_unlock_plan(path: Path | None = None) -> dict[str, Any] | None:
    target = path or UNLOCK_PLAN_PATH
    if not target.is_file():
        return None
    payload = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"invalid unlock plan: {target}")
    return payload


def evaluate_gate(
    *,
    now: date | datetime | str | None = None,
    evidential_close: bool | None = None,
    earliest_safe_action_at: date | datetime | str | None = None,
    issue_state: dict[str, Any] | None = None,
    unlock_plan: dict[str, Any] | None = None,
    unlock_plan_path: Path | None = None,
) -> dict[str, Any]:
    """Require the versioned all-required unlock plan; absence fails closed."""
    today = _as_date(now, date.today())
    earliest = _as_date(earliest_safe_action_at, EARLIEST_SAFE_ACTION_AT)
    state = issue_state if issue_state is not None else load_issue_state()
    closed = (
        bool(evidential_close)
        if evidential_close is not None
        else bool(state.get("evidential_close"))
    )
    date_ok = today >= earliest
    plan = (
        unlock_plan
        if unlock_plan is not None
        else load_unlock_plan(unlock_plan_path)
    )
    plan_authorized = None
    unmet_preconditions: list[str] = []
    authorization_mode = "unlock_plan_all_required"
    plan_date_matches_patch = True
    if plan is None:
        plan_authorized = False
        unmet_preconditions.append("unlock_plan")
        gate_open = False
    else:
        plan_earliest = _as_date(plan.get("earliest_safe_action_at"), earliest)
        plan_date_matches_patch = plan_earliest == earliest
        preconditions = plan.get("preconditions_all_required") or []
        if not isinstance(preconditions, list) or not preconditions:
            unmet_preconditions.append("preconditions_all_required")
        else:
            for item in preconditions:
                if not isinstance(item, dict) or not item.get("id"):
                    unmet_preconditions.append("invalid_precondition")
                    continue
                if item.get("state") != "READY":
                    unmet_preconditions.append(str(item["id"]))
        plan_authorized = plan.get("html_mutation_authorized") is True
        gate_open = (
            date_ok
            and plan_date_matches_patch
            and not unmet_preconditions
            and plan_authorized
        )
    refused = not gate_open
    reason = "gate_open" if gate_open else "before_gate"
    if plan is None:
        reason = "unlock_plan_missing"
    elif refused:
        if not date_ok:
            reason = "before_date"
        elif not plan_date_matches_patch:
            reason = "unlock_plan_date_mismatch"
        elif unmet_preconditions:
            reason = "unlock_plan_preconditions_not_ready"
        elif not plan_authorized:
            reason = "unlock_plan_not_authorized"
    return {
        "refused": refused,
        "gate_open": gate_open,
        "now": today.isoformat(),
        "earliest_safe_action_at": earliest.isoformat(),
        "evidential_close": closed,
        "authorization_mode": authorization_mode,
        "unlock_plan_present": plan is not None,
        "unlock_plan_authorized": plan_authorized,
        "unlock_plan_date_matches_patch": plan_date_matches_patch,
        "unmet_preconditions": unmet_preconditions,
        "corresponding_issue": int(state.get("issue") or CORRESPONDING_ISSUE),
        "issue_state": state.get("state"),
        "date_ok": date_ok,
        "reason": reason,
        "apply_refused_before_gate": refused,
        "html_mutation": False,
        "authorizes_html_edit": False if refused else True,
    }
