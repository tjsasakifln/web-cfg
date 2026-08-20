"""Missing GSC credentials are NEEDS_EXTERNAL_ACTION, not ranking zero."""

from __future__ import annotations

from scripts.bofu_dominance.core.gsc import (
    evidence_for_path,
    gsc_live_record,
    load_historical_pages,
    load_last_sync,
    missing_credentials_is_not_zero,
)
from tests.bofu_dominance.core.helpers import build_status


def test_last_sync_on_main_is_missing_credentials():
    sync = load_last_sync()
    assert sync.get("blocked") is True
    assert sync.get("error") == "missing_credentials"
    live = gsc_live_record(sync)
    assert live["gsc_live_state"] == "BLOCKED_CREDENTIAL_FAILURE"
    assert live["recommendation"] == "NEEDS_EXTERNAL_ACTION"
    assert missing_credentials_is_not_zero(live) is True
    assert live["ready_for_product_decisions"] is False


def test_historical_zero_clicks_are_not_live_rank_zero():
    pages = load_historical_pages()
    aditivos = evidence_for_path("/aditivos-obras-publicas/", pages)
    assert aditivos["is_gsc_live"] is False
    assert aditivos["source"] == "historical_csv_not_live"
    assert aditivos["clicks"] == 0.0
    assert aditivos["impressions"] == 12.0
    assert aditivos["position"] == 49.25
    status = build_status()
    family = next(item for item in status["families"] if item["id"] == "aditivos")
    assert family["state"] == "FROZEN"
    assert family["state"] != "UNKNOWN" or family["reason"] != "rank_zero"
    assert "zero" not in family["reason"]


def test_absent_path_is_not_zero():
    evidence = evidence_for_path("/defesa-margem-contratos-publicos/", load_historical_pages())
    assert evidence["impressions"] is None
    assert evidence["clicks"] is None
    assert evidence["reason"] == "path_absent_from_historical_export_not_zero"
    assert evidence["is_gsc_live"] is False
