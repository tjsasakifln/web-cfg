"""REPORT.md must emit the shipped gsc_live_state, not a hardcoded block."""

from __future__ import annotations

from scripts.bofu_dominance.core.report import render_report
from tests.bofu_dominance.core.helpers import build_status, write_artifacts


def test_report_does_not_claim_blocked_when_live(tmp_path):
    status = build_status()
    assert status["gsc_live_state"] == "LIVE_JOB_OK"
    text = render_report(status)
    assert f"`gsc_live_state`: `{status['gsc_live_state']}`" in text
    assert f"`gsc_live_state` is `{status['gsc_live_state']}`" in text
    assert "stays blocked" not in text
    lowered = text.lower()
    assert "gsc_live_state` stays blocked" not in lowered
    paths = write_artifacts(status, data_dir=tmp_path, docs_dir=tmp_path / "docs")
    report = paths["report"].read_text(encoding="utf-8")
    assert f"`gsc_live_state`: `{status['gsc_live_state']}`" in report
    assert "stays blocked" not in report


def test_report_can_still_name_blocked_when_status_is_blocked():
    status = build_status()
    blocked = dict(status)
    blocked["gsc_live_state"] = "BLOCKED_CREDENTIAL_FAILURE"
    blocked["gsc_live"] = dict(status["gsc_live"])
    blocked["gsc_live"]["actions_run_id"] = None
    text = render_report(blocked)
    assert "`gsc_live_state`: `BLOCKED_CREDENTIAL_FAILURE`" in text
    assert "`gsc_live_state` is `BLOCKED_CREDENTIAL_FAILURE`" in text
    assert "stays blocked" not in text
    assert "Live GSC remains blocked" in text
