"""Drive the shipped publication gate from missing-field start states."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis import INDEX_CONDITIONS
from scripts.contract_analysis.gate import evaluate_publication
from scripts.contract_analysis.tests.helpers import complete_live_record, entity_swap_clone


def test_complete_live_record_can_index_when_alone():
    rec = complete_live_record()
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state == "PUBLISHABLE_INDEX"
    assert decision.indexable is True
    assert decision.sitemap is True
    assert decision.robots == "index,follow"
    assert all(decision.conditions[name] for name in INDEX_CONDITIONS)


def test_missing_any_index_condition_blocks_index():
    knockouts = {
        "data_readiness": {"data_incomplete": True, "facts": []},
        "insight_singular": {"insight_singular": "ok"},
        "conteudo_substancial": {
            "executive_summary": "curto",
            "why_analysis": "",
            "facts": [{"kind": "FACT", "text": "x"}],
            "calculations": [],
            "interpretation": [],
            "cannot_conclude": "",
            "methodology": "m" * 50,
        },
        "utilidade_alem_da_fonte": {"utility_beyond_source": ""},
        "source_provenance": {"sources": []},
        "freshness": {"as_of": "2024-01-01", "freshness": {"as_of": "2024-01-01", "max_age_days": 180}},
        "method_limitations": {"methodology": "", "limitations": ""},
        "author_reviewer": {"author": {"name": ""}, "reviewer": {}, "solo_reviewer_disclosure": False},
        "reputational_safety": {
            "interpretation": [
                {
                    "kind": "INFERENCE",
                    "text": "Isso configura irregularidade e má-fé da contratada.",
                }
            ]
        },
        "maintenance_owner": {"maintenance_owner": ""},
        "intent_plausivel": {"intent": "xyz-nao-e-job"},
        "unique_content": None,
    }
    for name in INDEX_CONDITIONS:
        rec = complete_live_record()
        if name == "unique_content":
            clone = entity_swap_clone(rec)
            decision = evaluate_publication(rec, cohort=[rec, clone])
        else:
            rec.update(knockouts[name])
            decision = evaluate_publication(rec, cohort=[rec])
        assert decision.state != "PUBLISHABLE_INDEX", f"{name} still indexed: {decision}"
        assert decision.indexable is False
        assert decision.sitemap is False
        assert "noindex" in decision.robots


def test_fixture_cannot_reach_live_publishable_index():
    rec = complete_live_record(is_fixture=True, test_only=True, source_kind="test_only_fixture", approved_for_index=True)
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert decision.is_fixture is True
    assert "noindex" in decision.robots
    assert decision.sitemap is False


def test_fixture_flag_wins_even_if_source_kind_says_live():
    rec = complete_live_record(is_fixture=True, source_kind="official_live", approved_for_index=True)
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert decision.source_kind == "test_only_fixture"


def test_data_hold_and_data_reject_cannot_index():
    hold = complete_live_record(publication_readiness="DATA_HOLD", data_state="DATA_HOLD", data_incomplete=True)
    reject = complete_live_record(publication_readiness="DATA_REJECT", data_state="DATA_REJECT", data_incomplete=True)
    assert evaluate_publication(hold, cohort=[hold]).state != "PUBLISHABLE_INDEX"
    assert evaluate_publication(reject, cohort=[reject]).state != "PUBLISHABLE_INDEX"
    assert evaluate_publication(reject, cohort=[reject]).state == "REJECT"


def test_claimed_live_on_fixture_cannot_index():
    rec = complete_live_record(
        catalog_mode="fixture",
        claimed_live=True,
        approved_for_index=True,
        is_fixture=False,
        source_kind="official_live",
    )
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"


def test_states_are_exactly_the_five_allowed():
    cases = [
        (
            complete_live_record(
                interpretation=[{"kind": "INFERENCE", "text": "Há fraude e ilegalidade."}]
            ),
            "REJECT",
        ),
        (complete_live_record(data_incomplete=True, facts=[], sources=[]), "HOLD_FOR_DATA"),
        (complete_live_record(author={"name": ""}, reviewer={}, solo_reviewer_disclosure=False), "EDITORIAL_REVIEW"),
        (
            complete_live_record(
                is_fixture=True,
                source_kind="test_only_fixture",
                approved_for_index=False,
            ),
            "PUBLISHABLE_NOINDEX",
        ),
        (complete_live_record(), "PUBLISHABLE_INDEX"),
    ]
    for rec, expected in cases:
        decision = evaluate_publication(rec, cohort=[rec])
        assert decision.state == expected, (expected, decision.state, decision.reason_codes)


def test_expired_or_stale_extra_cli_freshness_cannot_index():
    stale = complete_live_record(
        freshness={"as_of": "2026-08-01", "max_age_days": 180, "stale": True}
    )
    stale_decision = evaluate_publication(stale, cohort=[stale])
    assert stale_decision.state != "PUBLISHABLE_INDEX"
    assert stale_decision.conditions["freshness"] is False
    assert "freshness_stale_flag" in stale_decision.reason_codes

    expired = complete_live_record(
        freshness={
            "as_of": "2026-08-01",
            "source_as_of": "2026-08-01T00:00:00+00:00",
            "expires_at": "2026-08-03T00:00:00+00:00",
            "max_age_hours": 48,
            "stale": False,
        }
    )
    expired_decision = evaluate_publication(expired, cohort=[expired])
    assert expired_decision.state != "PUBLISHABLE_INDEX"
    assert expired_decision.conditions["freshness"] is False
    assert "freshness_expired" in expired_decision.reason_codes or "freshness_max_age_hours" in expired_decision.reason_codes

    hours = complete_live_record(
        as_of="2026-08-01",
        freshness={"as_of": "2026-08-01", "max_age_hours": 48, "stale": False},
    )
    hours_decision = evaluate_publication(hours, cohort=[hours])
    assert hours_decision.state != "PUBLISHABLE_INDEX"
    assert "freshness_max_age_hours" in hours_decision.reason_codes


def test_near_duplicate_pair_cannot_index():
    rec = complete_live_record()
    clone = entity_swap_clone(rec)
    left = evaluate_publication(rec, cohort=[rec, clone])
    right = evaluate_publication(clone, cohort=[rec, clone])
    assert left.state != "PUBLISHABLE_INDEX"
    assert right.state != "PUBLISHABLE_INDEX"
    assert any(code.startswith("unique_content") for code in left.reason_codes)
    assert any(code.startswith("unique_content") for code in right.reason_codes)
