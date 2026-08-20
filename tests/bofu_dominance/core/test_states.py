"""TOP* requires live/official evidence with context. GATED is NO_CANONICAL."""

from __future__ import annotations

from scripts.bofu_dominance.core.states import ranking_evidence_complete, resolve_family_state
from tests.bofu_dominance.core.helpers import build_status, load_registry


def _covered_family() -> dict:
    return {
        "id": "probe-covered",
        "canonical_owner": {
            "path": "/defesa-margem-contratos-publicos/",
            "page_exists": True,
            "indexable": True,
            "issue": 60,
        },
        "freeze": {"frozen": False},
        "gate": {},
    }


def test_historical_position_does_not_yield_top10():
    family = _covered_family()
    evidence = {
        "source": "historical_csv_not_live",
        "is_gsc_live": False,
        "date": "2026-08-09",
        "geo": "UNKNOWN",
        "device": "UNKNOWN",
        "denominator": "impressions_in_export_row",
        "position": 7.75,
        "impressions": 4,
    }
    assert ranking_evidence_complete(evidence) is False
    resolved = resolve_family_state(
        family, evidence=evidence, gsc_live_state="BLOCKED_CREDENTIAL_FAILURE"
    )
    assert resolved["state"] == "COVERED"


def test_top10_requires_complete_live_context():
    family = _covered_family()
    live = {
        "source": "gsc_live",
        "is_gsc_live": True,
        "date": "2026-08-19",
        "geo": "bra",
        "device": "DESKTOP",
        "denominator": "impressions",
        "position": 8.0,
        "impressions": 20,
    }
    resolved = resolve_family_state(family, evidence=live, gsc_live_state="LIVE")
    assert resolved["state"] == "TOP10"
    incomplete = dict(live, geo="UNKNOWN")
    resolved_incomplete = resolve_family_state(
        family, evidence=incomplete, gsc_live_state="LIVE"
    )
    assert resolved_incomplete["state"] == "COVERED"


def test_web_search_sample_cannot_be_top1():
    family = _covered_family()
    evidence = {
        "source": "web_search_api",
        "is_gsc_live": False,
        "date": "2026-08-19",
        "geo": "UNKNOWN",
        "device": "UNKNOWN",
        "denominator": None,
        "position": 1,
    }
    assert ranking_evidence_complete(evidence) is False
    resolved = resolve_family_state(family, evidence=evidence, gsc_live_state="LIVE")
    assert resolved["state"] == "COVERED"
    assert resolved["state"] != "TOP1"


def test_gated_families_are_no_canonical_not_existing_pages():
    status = build_status()
    by_id = {item["id"]: item for item in status["families"]}
    for fid, issue in (("bid-readiness", 155), ("partner-integrity", 156)):
        item = by_id[fid]
        assert item["state"] == "NO_CANONICAL"
        assert item["gate"]["status"] == "GATED"
        assert item["canonical_owner"]["page_exists"] is False
        assert item["canonical_owner"]["path"] is None
        assert item["owner"] == f"issue:{issue}"
        assert item["recommendation"]["authorizes_html_edit"] is False
        assert item["recommendation"]["action"] == "hold_gated"


def test_registry_matches_gated_issues():
    registry = load_registry()
    gated = [item for item in registry["families"] if (item.get("gate") or {}).get("status") == "GATED"]
    assert {item["id"] for item in gated} == {"bid-readiness", "partner-integrity"}
    assert {item["active_issue"] for item in gated} == {155, 156}
