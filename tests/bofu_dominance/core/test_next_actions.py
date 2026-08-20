"""Ledger next actions: at most five, never HTML edit-now."""

from __future__ import annotations

from scripts.bofu_dominance.core.constants import EDIT_NOW_ACTIONS, MAX_NEXT_ACTIONS
from scripts.bofu_dominance.core.recommend import ledger_next_actions
from tests.bofu_dominance.core.helpers import build_status


def test_next_actions_cap_and_no_edit_now():
    actions = ledger_next_actions()
    assert 1 <= len(actions) <= MAX_NEXT_ACTIONS
    assert len(actions) == 5
    for item in actions:
        assert item["authorizes_html_edit"] is False
        assert item["action"] not in EDIT_NOW_ACTIONS
    ids = [item["id"] for item in actions]
    assert "gsc-credentials" in ids
    assert "freeze-128" in ids
    assert "origin-to-service-153" in ids
    assert "gated-155-156" in ids
    assert "prs-157-159-roles" in ids
    status = build_status()
    assert status["next_actions"] == actions
