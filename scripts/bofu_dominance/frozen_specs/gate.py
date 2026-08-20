"""Apply-gate: refuse HTML mutation before 2026-09-16 unless the issue is evidentially closed."""

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


def evaluate_gate(
    *,
    now: date | datetime | str | None = None,
    evidential_close: bool | None = None,
    earliest_safe_action_at: date | datetime | str | None = None,
    issue_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Refuse apply when now < 2026-09-16 AND the corresponding issue is not evidentially closed."""
    today = _as_date(now, date.today())
    earliest = _as_date(earliest_safe_action_at, EARLIEST_SAFE_ACTION_AT)
    state = issue_state if issue_state is not None else load_issue_state()
    closed = (
        bool(evidential_close)
        if evidential_close is not None
        else bool(state.get("evidential_close"))
    )
    date_ok = today >= earliest
    gate_open = date_ok or closed
    refused = not gate_open
    reason = "gate_open" if gate_open else "before_gate"
    if refused and not date_ok and not closed:
        reason = "before_date_and_issue_not_evidentially_closed"
    return {
        "refused": refused,
        "gate_open": gate_open,
        "now": today.isoformat(),
        "earliest_safe_action_at": earliest.isoformat(),
        "evidential_close": closed,
        "corresponding_issue": int(state.get("issue") or CORRESPONDING_ISSUE),
        "issue_state": state.get("state"),
        "date_ok": date_ok,
        "reason": reason,
        "apply_refused_before_gate": refused,
        "html_mutation": False,
        "authorizes_html_edit": False if refused else True,
    }
