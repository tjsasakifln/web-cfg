"""Fail-closed INDEX: fixture, stale coverage/claim, approval drift."""

from __future__ import annotations

from datetime import date

from scripts.market_answers.gate import evaluate
from tests.market_answers.helpers import (
    drifted_approval,
    load_shipped_candidate,
    load_shipped_fixture,
    matching_approval,
    official_like_payload,
)

TODAY = date(2026, 8, 17)


def test_fixture_never_indexes():
    record = load_shipped_candidate()
    payload = load_shipped_fixture()
    # Even a matching hash + index_authorized cannot promote a fixture.
    approvals = matching_approval(payload, index_authorized=True)
    decision = evaluate(record, payload, approvals, today=TODAY)
    assert decision.is_fixture is True
    assert decision.official_live is False
    assert decision.producer_status == "CONTRACT_FIXTURE"
    assert decision.state != "PUBLISHABLE_INDEX"
    assert decision.indexable is False
    assert "noindex" in decision.robots
    assert decision.sitemap is False
    assert "fixture_never_index" in decision.reason_codes
    assert decision.recommendation != "READY_FOR_OFFICIAL_PAYLOAD"
    assert decision.recommendation in {"GO_NOINDEX", "NEEDS_DATA", "REJECT"}


def test_stale_coverage_blocks_index():
    record = load_shipped_candidate()
    payload = official_like_payload()
    payload["coverage"] = {
        "status": "INSUFFICIENT",
        "stale": True,
        "national_universe_complete": False,
        "reason_codes": ["coverage_stale"],
    }
    decision = evaluate(record, payload, matching_approval(payload), today=TODAY)
    assert decision.indexable is False
    assert decision.state != "PUBLISHABLE_INDEX"
    assert decision.conditions["coverage_sufficient"] is False
    assert any(code.startswith("coverage_") for code in decision.reason_codes)


def test_unauthorized_national_302_does_not_block_sc_estadual():
    """#302 remains the national gate. It must not block a UF=SC claim."""
    record = load_shipped_candidate()
    unauthorized = official_like_payload()
    unauthorized["claim"] = {
        "authorization_state": "UNAUTHORIZED",
        "national_claim_allowed": False,
        "current_publication_allowed": False,
        "claim_scope": "uf",
        "issue": "#302",
    }
    dec_unauth = evaluate(record, unauthorized, matching_approval(unauthorized), today=TODAY)
    assert dec_unauth.indexable is True, dec_unauth.reason_codes
    assert dec_unauth.conditions["claim_authorized"] is True
    assert dec_unauth.conditions["national_gate_302"] is True
    assert "claim_unauthorized" not in dec_unauth.reason_codes

    national = official_like_payload()
    national["geography"] = {
        "kind": "national",
        "scope": "national",
        "code": "BR",
        "ufs": [],
        "label": "Brasil",
    }
    national["claim"] = {
        "authorization_state": "STALE",
        "national_claim_allowed": False,
        "current_publication_allowed": False,
        "claim_scope": "national",
    }
    dec_stale = evaluate(record, national, matching_approval(national), today=TODAY)
    assert dec_stale.indexable is False
    assert "claim_stale" in dec_stale.reason_codes or dec_stale.conditions["national_gate_302"] is False


def test_approval_hash_drift_denies_index():
    record = load_shipped_candidate()
    payload = official_like_payload()
    decision = evaluate(record, payload, drifted_approval(payload), today=TODAY)
    assert decision.indexable is False
    assert decision.conditions["human_approval_hash"] is False
    assert "approval_hash_drift" in decision.reason_codes


def test_official_like_can_index_only_when_all_conditions_hold():
    record = load_shipped_candidate()
    payload = official_like_payload()
    decision = evaluate(record, payload, matching_approval(payload), today=TODAY)
    assert all(decision.conditions.values()), decision.conditions
    assert decision.state == "PUBLISHABLE_INDEX"
    assert decision.indexable is True


def test_closed_states_are_exactly_the_seven():
    from scripts.market_answers import PUBLICATION_STATES

    assert PUBLICATION_STATES == (
        "REJECT",
        "NEEDS_DATA",
        "PRIVATE_ANSWER_ONLY",
        "CANDIDATE",
        "EDITORIAL_REVIEW",
        "PUBLISHABLE_NOINDEX",
        "PUBLISHABLE_INDEX",
    )
