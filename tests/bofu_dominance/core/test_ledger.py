"""Drive the shipped ledger: every family has owner, state and reason."""

from __future__ import annotations

from tests.bofu_dominance.core.helpers import build_status, load_registry


def test_every_family_has_owner_state_reason():
    registry = load_registry()
    status = build_status()
    assert status["family_count"] == len(registry["families"])
    assert status["family_count"] >= 13
    ids = [item["id"] for item in status["families"]]
    assert len(ids) == len(set(ids))
    for item in status["families"]:
        assert item["id"]
        assert item["owner"], item
        assert item["state"], item
        assert item["reason"], item
        assert item["job"]
        assert item["decision"]
        assert item["primary_queries"]
        assert item["negative_queries"]
        assert item["canonical_owner"]
        assert item["active_issue"]
        assert item["earliest_safe_action_at"]
        assert item["overlap"]
        assert item["next_test"]
        assert item["kill"]
        assert item["consolidate"]
        assert item["evidence"]["source"]
        assert "geo" in item["evidence"]
        assert "device" in item["evidence"]
        assert "denominator" in item["evidence"]
        assert item["transition_owner_issue"] == 153


def test_gsc_live_state_is_job_ok_and_not_product_ready():
    status = build_status()
    assert status["gsc_live_state"] == "LIVE_JOB_OK"
    assert status["gsc_live"]["ready_for_product_decisions"] is False
    assert status["historical_gsc"]["is_gsc_live"] is False
    assert status["gsc_live"]["actions_run_id"] == 32322344062


def test_no_top_star_from_mixed_or_non_br_live_rows():
    status = build_status()
    ranking = {"TOP10", "TOP3", "TOP1", "DOMINANT"}
    for item in status["families"]:
        assert item["state"] not in ranking, item
