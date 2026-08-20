"""Drive shipped #86 cohort overlay for demand-control — not a second observatory."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.discovery.metrics import MetricStageError, count_event
from scripts.discovery.report import build_report, demand_control_cohort
from scripts.discovery.registry import load_cohort


AS_OF = "2026-08-19T00:00:00Z"


def test_demand_control_uses_existing_86_registry():
    cohort = load_cohort(root=ROOT)
    overlay = demand_control_cohort(root=ROOT, generated_at=AS_OF)
    assert overlay["replaces_86_registry"] is False
    assert overlay["issue"] == 86
    assert overlay["llms_txt_strategy"] is False
    assert overlay["geo_score"] is False
    ids = {asset["id"] for asset in overlay["assets"]}
    registry_ids = {asset["id"] for asset in cohort["assets"]}
    assert ids == registry_ids
    assert overlay["collapsed_stage_refused"] is True
    assert overlay["query_not_joined_to_lead"] is True


def test_demand_control_keeps_uncollapsed_stage_cells():
    overlay = demand_control_cohort(root=ROOT, generated_at=AS_OF)
    for asset in overlay["assets"]:
        stages = asset["demand_control_stages"]
        for name in ("ELIGIBLE", "APPEARED", "CLICKED", "ENGAGED", "LEAD", "PIPELINE"):
            cell = stages[name]
            assert cell["status"] in {"TRUE", "FALSE", "UNKNOWN", "BLOCKED", "ABSENT"}
            assert cell["authority"]
        # Appearance is not a lead.
        assert stages["APPEARED"]["authority"] != stages["LEAD"]["authority"]
        assert stages["LEAD"]["status"] in {"UNKNOWN", "TRUE", "FALSE", "BLOCKED"}
        assert "lead_id" not in json_blob(asset)


def json_blob(value) -> str:
    import json

    return json.dumps(value)


def test_collapsed_impression_as_lead_is_refused():
    with pytest.raises(MetricStageError):
        count_event("impression", "LEAD/PIPELINE")
    with pytest.raises(MetricStageError):
        count_event("bot_hit", "CITATION")


def test_build_report_still_separates_stages():
    report = build_report(root=ROOT, generated_at=AS_OF)
    assert report["llms_txt_strategy"] is False
    assert report["stage_separation"]["absence_is_not_zero"] is True
    assert "ELIGIBILITY" in report["metric_stages"]
    assert "LEAD/PIPELINE" in report["metric_stages"]
