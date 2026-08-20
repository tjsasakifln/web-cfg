"""GSC honesty: blocked last_sync is not zero; live job is not historical CSV."""

from __future__ import annotations

from scripts.bofu_dominance.core.gsc import (
    evidence_for_path,
    gsc_live_record,
    load_historical_pages,
    load_last_sync,
    load_live_overlay,
    missing_credentials_is_not_zero,
)
from tests.bofu_dominance.core.helpers import build_status


def test_committed_main_last_sync_still_missing_credentials_not_zero():
    sync = load_last_sync()
    assert sync.get("blocked") is True
    assert sync.get("error") == "missing_credentials"
    assert missing_credentials_is_not_zero(sync) is True
    # Overlay/job proof must not rewrite the committed main file's meaning.
    live_from_file = gsc_live_record(sync, overlay={})
    assert live_from_file["gsc_live_state"] == "BLOCKED_CREDENTIAL_FAILURE"
    assert live_from_file["recommendation"] == "NEEDS_EXTERNAL_ACTION"


def test_actions_job_overlay_is_live_job_ok_not_historical():
    overlay = load_live_overlay()
    assert overlay is not None
    assert overlay["gsc_live_state"] == "LIVE_JOB_OK"
    assert overlay["actions_run_id"] == 32322344062
    blob = str(overlay.get("paths"))
    assert "'query':" not in blob
    assert '"query":' not in blob
    live = gsc_live_record()
    assert live["gsc_live_state"] == "LIVE_JOB_OK"
    assert live["ready_for_product_decisions"] is False
    status = build_status()
    assert status["gsc_live_state"] == "LIVE_JOB_OK"
    assert status["historical_gsc"]["is_gsc_live"] is False


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
    assert "zero" not in family["reason"]


def test_live_overlay_aditivos_is_not_top_or_edit_now():
    evidence = evidence_for_path("/aditivos-obras-publicas/")
    assert evidence["is_gsc_live"] is True
    assert evidence["geo"] == "esp"
    assert evidence["device"] == "MIXED"
    status = build_status()
    family = next(item for item in status["families"] if item["id"] == "aditivos")
    assert family["state"] == "FROZEN"
    assert family["recommendation"]["authorizes_html_edit"] is False
    ranking = {"TOP10", "TOP3", "TOP1", "DOMINANT"}
    for item in status["families"]:
        assert item["state"] not in ranking, item


def test_absent_live_path_is_not_zero():
    evidence = evidence_for_path("/defesa-margem-contratos-publicos/")
    assert evidence["impressions"] is None
    assert evidence["clicks"] is None
    assert evidence["reason"] == "path_absent_from_live_top_rows_not_zero"
    assert evidence["is_gsc_live"] is True
