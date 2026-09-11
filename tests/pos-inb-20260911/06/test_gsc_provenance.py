"""Drive shipped GSC import/classify/learn. No reimplementation."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]

from scripts.revops import gsc_import_learning as gil
from scripts.revops import search_demand_observatory as sdo

FOUNDER = ROOT / "scripts/revops/fixtures/gsc-founder-baseline-2026-09-02-08"


def test_founder_provided_aggregate_not_fixture_or_live(tmp_path: Path) -> None:
    first = gil.import_gsc_export(
        FOUNDER, persist=True, data_dir=tmp_path / "gsc", private_dir=tmp_path / "gsc" / "private"
    )
    second = gil.import_gsc_export(
        FOUNDER, persist=True, data_dir=tmp_path / "gsc", private_dir=tmp_path / "gsc" / "private"
    )
    assert first["ok"] is True
    assert first["source_kind"] == "provided_aggregate"
    assert first["fixture"] is False
    assert first["synthetic"] is False
    assert first["provided_aggregate"] is True
    assert first["freshness"] == "NOT_CURRENT"
    assert first["ready_for_product_decisions"] is False
    assert sdo.classify_snapshot_source(first) == "provided_aggregate"
    assert sdo.is_live_gsc_payload(first) is False
    assert sdo.snapshot_freshness(first) == "NOT_CURRENT"
    prop = first["dimensions"]["property"]
    page = first["dimensions"]["page"]
    query = first["dimensions"]["query"]
    country = first["dimensions"]["country"]
    assert prop["clicks"] == 6
    assert prop["impressions"] == 176
    assert page["impressions"] == 215
    assert page["impressions"] != prop["impressions"]
    assert "summed_impressions" not in first
    assert query["impressions"] == 16
    assert query["clicks"] == 0
    assert country["brazil"]["impressions"] == 147
    assert country["brazil"]["clicks"] == 6
    assert first["as_of"] == "2026-09-08"
    assert first["extracted_at"] == "2026-09-11"
    assert first["as_of"] != first["extracted_at"]
    assert first["as_of_not_rewritten_as_release"] is True
    assert second["idempotent_replay"] is True
    assert second["duplicate_rows_written"] is False
    assert first["idempotency_key"] == second["idempotency_key"]


def test_page_grain_is_not_query_and_omitted_is_not_zero() -> None:
    payload = gil.import_gsc_export(FOUNDER, persist=False)
    assert payload["page_grain_is_not_query"] is True
    assert payload["query_labels_are_not_observed_search_terms"] is True
    assert payload["unknown_click_terms"] is True
    for row in payload["queries"]:
        assert row.get("query") is None
        assert row.get("query_label_status") == "UNKNOWN"
        assert row.get("page_grain_promoted_to_query") is False
        assert row.get("reconstructed") is False
    assert payload["omitted_queries"]["status"] == "UNKNOWN"
    assert payload["omitted_queries"]["reconstructed"] is False
    csv_text = (FOUNDER / "Consultas.csv").read_text(encoding="utf-8")
    assert "desonerado e não desonerado" in csv_text
    isolated = gil.isolate_dimension_totals(payload)
    mutated = dict(isolated)
    mutated["summed_impressions"] = 176 + 215
    assert gil.validate_dimension_isolation(isolated) is True
    assert gil.validate_dimension_isolation(mutated) is False


def test_incomplete_current_day_not_zero_filled() -> None:
    from datetime import date

    current = gil.incomplete_current_day_status(date(2026, 9, 11), today=date(2026, 9, 11))
    assert current["incomplete"] is True
    assert current["status"] == "INCOMPLETE"
    assert current["zero_filled"] is False
    missing = gil.incomplete_current_day_status(None, today=date(2026, 9, 11))
    assert missing["status"] == "UNKNOWN"
    assert missing["zero_filled"] is False
    payload = gil.import_gsc_export(FOUNDER, persist=False)
    assert payload["incomplete_current_day_zero_filled"] is False
    for row in payload["property_days"]:
        assert row["current_day"]["zero_filled"] is False


def test_capture_stages_unknown_without_warmbly_no_pii() -> None:
    stages = gil.join_capture_stages(clicks=6, funnel={"visitor": 2}, warmbly=None)
    assert stages["visita"]["value"] == 2
    assert stages["clique"]["value"] == 6
    assert stages["solicitacao_persistida"]["status"] == "UNKNOWN"
    assert stages["solicitacao_persistida"]["value"] is None
    assert stages["oportunidade_qualificada"]["status"] == "UNKNOWN"
    assert stages["oportunidade_qualificada"]["authority"] == "warmbly_absent"
    assert stages["lead_id_excluded"] is True
    blob = json.dumps(stages)
    assert '"lead_id":' not in blob
    assert stages.get("lead_id") is None
    assert "email" not in blob


def test_absence_and_credential_failure_are_distinct() -> None:
    assert sdo.classify_snapshot_source({}) == "absence"
    missing = sdo.pull_api(7)
    assert missing["error"] == "missing_credentials"
    assert missing["source_kind"] == "credential_failure"
    assert missing["rows"] is None
    assert missing["impressions"] is None
    assert missing["clicks"] is None
    assert sdo.classify_snapshot_source(missing) == "credential_failure"
    assert missing.get("external_evidence") is True
