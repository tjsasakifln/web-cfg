"""Current-state baseline is INSUFFICIENT_EVIDENCE. Do not massage it through gates."""

from __future__ import annotations

from pathlib import Path

from scripts.growth_accounting.constants import (
    COHORT_DAYS,
    PRIMARY_SERIES_NAME,
    SCHEMA,
    TIMEZONE,
)
from scripts.growth_accounting.load import load_payload
from scripts.growth_accounting.report import build_report
from scripts.growth_accounting.validate import validate_report

ROOT = Path(__file__).resolve().parents[2]


def test_current_state_insufficient_evidence():
    payload = load_payload(ROOT / "data/growth-accounting/baseline/current-state-input.v1.json")
    assert payload["labeled_synthetic"] is False
    report = build_report(payload)
    validate_report(report, payload=payload)
    assert report["schema"] == SCHEMA
    assert report["timezone"] == TIMEZONE
    assert report["cohort_days"] == COHORT_DAYS
    assert report["current_state"] == "INSUFFICIENT_EVIDENCE"
    assert report["primary_series"]["name"] == PRIMARY_SERIES_NAME
    assert report["flags"]["source_families_separated"] is True
    assert report["flags"]["unknown_preserved"] is True
    assert report["flags"]["query_to_lead_join"] is False
    assert report["flags"]["page_count_kpi"] is False
    assert report["flags"]["scale_allowed_auto_emitted"] is False
    assert report["exponential_gate_eligible"] is False
    assert report["classification"]["state"] != "SCALE_ALLOWED"
    assert report["classification"]["scale_allowed"] is False
    for key in ("input", "discovery", "qualified_use", "commercial", "moat", "efficiency"):
        assert key in report["components"]
    discovery = report["components"]["discovery"]
    assert discovery["non_branded_clicks"]["value"] == 10
    assert discovery["non_branded_impressions"]["value"] == 373
    assert discovery["commercial_clicks_snapshot"]["value"] == 0
    assert discovery["commercial_clicks_snapshot"]["status"] == "ZERO"
    assert report["north_star"]["status"] == "UNKNOWN"
    assert report["north_star"]["value"] is None
    assert report["public_claim"] is None
    assert "crescimento exponencial" not in str(report.get("public_claim"))


def test_committed_current_state_report_matches_rebuild():
    payload = load_payload(ROOT / "data/growth-accounting/baseline/current-state-input.v1.json")
    rebuilt = build_report(payload)
    from scripts.growth_accounting.serialize import canonical_dumps
    from scripts.growth_accounting.validate import load_json

    committed = load_json(ROOT / "data/growth-accounting/reports/current-state.json")
    assert canonical_dumps(committed) == canonical_dumps(rebuilt)
    assert committed["current_state"] == "INSUFFICIENT_EVIDENCE"


def test_current_state_does_not_treat_page_count_as_kpi():
    payload = load_payload(ROOT / "data/growth-accounting/baseline/current-state-input.v1.json")
    report = build_report(payload)
    assert report["flags"]["page_count_kpi"] is False
    assert report["primary_series"]["name"] != "page_count"
