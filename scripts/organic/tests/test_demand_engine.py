"""Drive the shipped demand-engine entry points — no reimplementation."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.demand_engine import (
    REASON_CANNIBALIZATION,
    REASON_DEMAND_UNKNOWN,
    REASON_DOES_NOT_AUTHORIZE,
    REASON_JOIN_UNAVAILABLE,
    REASON_KEYWORD_COMBO,
    REASON_QUERY_WITHOUT_USEFUL_PAGE,
    REASON_STRIKING_DISTANCE,
    REASON_WRONG_LANDING,
    UNKNOWN,
    classify_row,
    comparable_document,
    demand_from_row,
    load_config,
    run_demand_engine,
)
from scripts.organic.gsc_loader import load_gsc_dir, normalize_snapshot

GSC_JUL = ROOT / "seo" / "gsc-2026-07-30"
GSC_AUG = ROOT / "seo" / "gsc-2026-08-09"
JOIN_FIXTURE = ROOT / "data" / "revops" / "gsc" / "fixtures" / "demand-engine-join-present.json"
SAMPLE_ROWS = ROOT / "data" / "revops" / "gsc" / "fixtures" / "sample_rows.json"


def _join_rows() -> list[dict]:
    return json.loads(JOIN_FIXTURE.read_text(encoding="utf-8"))


def test_snapshot_rows_carry_five_tuple_and_privacy_note():
    loaded = load_gsc_dir(GSC_JUL)
    assert loaded["countries"], "Paises.csv must be loaded"
    assert loaded["dates"], "Grafico.csv must be loaded"
    assert loaded["totals_reconciled"] is False
    assert "privacy" in loaded["privacy_note"].lower() or "threshold" in loaded["aggregation_note"].lower()

    norm = normalize_snapshot(GSC_JUL)
    assert norm["totals_reconciled"] is False
    assert norm["join_status"] == "join_unavailable"
    assert "not force-reconciled" in norm["privacy_note"] or "join_unavailable" in norm["privacy_note"]
    assert {r["source_table"] for r in norm["rows"]} >= {"queries", "pages", "devices", "countries", "dates"}
    for row in norm["rows"]:
        for key in ("query", "page", "device", "country", "date"):
            assert key in row
        assert row["privacy_note"]
        if row["source_table"] != "query_page":
            assert row["join_status"] == "join_unavailable"

    # Dimensional totals stay independent — do not force equality.
    totals = loaded["totals"]
    assert "pages_impressions_sum" in totals
    assert "queries_impressions_sum" in totals
    assert "countries_impressions_sum" in totals
    assert "dates_impressions_sum" in totals
    assert totals["countries_impressions_sum"] > 0
    assert totals["dates_impressions_sum"] > 0


def test_aug_snapshot_loads_page_device_and_does_not_invent_join():
    norm = normalize_snapshot(GSC_AUG)
    tables = {r["source_table"] for r in norm["rows"]}
    assert "page_device" in tables
    assert norm["join_status"] == "join_unavailable"
    assert all(r["join_status"] != "present" or (r.get("query") and r.get("page")) for r in norm["rows"])


def test_missing_demand_stays_unknown_not_numeric():
    cfg = load_config()
    proposal = {
        "query": "qual valor tipico contrato pavimentacao",
        "demand": UNKNOWN,
        "no_gsc_evidence": True,
    }
    assert demand_from_row({"demand": UNKNOWN, "no_gsc_evidence": True, "source_table": "proposal"}) == UNKNOWN
    labeled = classify_row(
        {
            "query": proposal["query"],
            "source_table": "proposal",
            "demand": UNKNOWN,
            "no_gsc_evidence": True,
        },
        cfg,
    )
    assert labeled["demand"] == UNKNOWN
    assert labeled["demand"] not in {0, 0.0, 0.15, "0", "0.15"}

    doc = run_demand_engine(rows=[], proposals=[proposal])
    recs = [r for r in doc["records"] if r["query"] == proposal["query"]]
    assert recs
    rec = recs[0]
    assert rec["demand"] == UNKNOWN
    assert "demand" in rec["ranking"]["unknown_components"]
    assert REASON_DEMAND_UNKNOWN in rec["reason_codes"]
    assert rec["authorizes_page"] is False
    assert rec["decision"] == "DEFER"


def test_high_volume_keyword_combination_does_not_authorize_page():
    doc = run_demand_engine(
        rows=[],
        proposals=[
            {
                "query": "aditivo 25% obra publica florianopolis sc pavimentacao preco km",
                "keyword_combination": True,
                "impressions": 10000,
                "clicks": 400,
                "position": 5.0,
                "authorize_page": True,
                "page_count_objective": True,
            }
        ],
    )
    assert doc["counts"]["authorized_pages"] == 0
    assert doc["authorized_pages"] == []
    rec = doc["records"][0]
    assert rec["authorizes_page"] is False
    assert rec["decision"] == "REJECT"
    assert REASON_KEYWORD_COMBO in rec["reason_codes"]
    assert rec["owner"]
    assert rec["expected_evidence"]
    assert rec["cost"]
    assert rec["kill_gate"]


def test_striking_distance_on_position_4_to_20_with_impressions():
    doc = run_demand_engine(rows=_join_rows())
    striking = [r for r in doc["records"] if REASON_STRIKING_DISTANCE in r["reason_codes"]]
    assert striking, doc["detectors"]
    assert all(
        r.get("query") or r.get("page")
        for r in striking
    )
    # Fixture positions 8, 12, 6.5, 4.3, 9.1 are all in 4–20 with impressions.
    assert len(striking) >= 4


def test_cannibalization_only_when_query_page_join_present():
    joined = run_demand_engine(rows=_join_rows())
    cannibals = [r for r in joined["records"] if REASON_CANNIBALIZATION in r["reason_codes"]]
    assert cannibals
    assert all(r["join_status"] == "present" for r in cannibals)
    assert any("limite aditivo" in (r.get("query") or "") for r in cannibals)

    csv_doc = run_demand_engine(gsc_dir=GSC_JUL)
    assert csv_doc["join_status"] == "join_unavailable"
    assert csv_doc["detectors"][REASON_CANNIBALIZATION] == []
    query_rows = [r for r in csv_doc["records"] if r["source_table"] == "queries"]
    assert query_rows
    assert all(REASON_JOIN_UNAVAILABLE in r["reason_codes"] for r in query_rows)
    assert all(REASON_CANNIBALIZATION not in r["reason_codes"] for r in query_rows)


def test_csv_query_with_useful_inventory_is_not_query_without_useful_page():
    """Consultas.csv has no page column. A useful on-site page in the same
    snapshot is not a gap — only join_unavailable, never a fabricated join."""
    loaded = load_gsc_dir(GSC_JUL)
    sinapi = "/conteudos/sinapi-desonerado-nao-desonerado/"
    assert any(
        (p.get("path") or "") == sinapi or (p.get("url") or "").rstrip("/").endswith(sinapi.rstrip("/"))
        for p in loaded["pages"]
    ), "snapshot must contain the SINAPI page used as inventory"

    doc = run_demand_engine(gsc_dir=GSC_JUL)
    wanted = (
        "desonerado ou não desonerado",
        "sinapi desonerado ou não desonerado qual usar",
    )
    found = {r.get("query"): r for r in doc["records"] if r.get("query") in wanted}
    assert set(found) == set(wanted), set(found)
    for query, rec in found.items():
        assert rec["join_status"] == "join_unavailable", query
        assert REASON_JOIN_UNAVAILABLE in rec["reason_codes"], rec["reason_codes"]
        assert REASON_QUERY_WITHOUT_USEFUL_PAGE not in rec["reason_codes"], (
            query,
            rec["reason_codes"],
        )
        assert rec["authorizes_page"] is False


def test_wrong_landing_and_query_without_useful_page():
    doc = run_demand_engine(rows=_join_rows())
    wrong = [r for r in doc["records"] if REASON_WRONG_LANDING in r["reason_codes"]]
    assert any("reequilibrio" in (r.get("query") or "") for r in wrong), [r["query"] for r in doc["records"]]

    no_page = [r for r in doc["records"] if REASON_QUERY_WITHOUT_USEFUL_PAGE in r["reason_codes"]]
    assert any("avcb" in (r.get("query") or "") for r in no_page)
    assert any("consultoria defesa" in (r.get("query") or "") for r in no_page)

    avcb = next(r for r in doc["records"] if r.get("query") == "avcb")
    assert avcb["decision"] == "REJECT"
    assert avcb["owner"] and avcb["expected_evidence"] and avcb["cost"] and avcb["kill_gate"]


def test_reject_records_carry_registry_fields():
    doc = run_demand_engine(
        rows=_join_rows(),
        proposals=[{"query": "uf × municipio × objeto × metrica", "keyword_combination": True}],
    )
    rejects = [r for r in doc["records"] if r["decision"] == "REJECT"]
    assert rejects
    for rec in rejects:
        assert rec["owner"]
        assert rec["expected_evidence"]
        assert rec["cost"]
        assert rec["kill_gate"]
        assert rec["authorizes_page"] is False
        assert REASON_DOES_NOT_AUTHORIZE in rec["reason_codes"]


def test_same_snapshot_ranking_and_reasons_are_byte_identical():
    first = comparable_document(run_demand_engine(gsc_dir=GSC_JUL))
    second = comparable_document(run_demand_engine(gsc_dir=GSC_JUL))
    third = comparable_document(run_demand_engine(gsc_dir=GSC_JUL))
    assert first["ranking"] == second["ranking"] == third["ranking"]
    assert json.dumps(first["ranking"], sort_keys=True) == json.dumps(second["ranking"], sort_keys=True)
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True) == json.dumps(third, sort_keys=True)
    # Wall-clock must not leak into compared fields.
    blob = json.dumps(first)
    assert "generated_at" not in blob
    assert "imported_at" not in blob


def test_sample_api_fixture_has_present_join_and_never_authorizes():
    rows = json.loads(SAMPLE_ROWS.read_text(encoding="utf-8"))
    doc = run_demand_engine(rows=rows, snapshot_id="sample_rows")
    assert doc["join_status"] == "present"
    assert doc["counts"]["authorized_pages"] == 0
    assert any(REASON_STRIKING_DISTANCE in r["reason_codes"] for r in doc["records"])


def test_cli_module_is_the_shipped_entry(tmp_path: Path):
    from scripts.organic.demand_engine import main as demand_main
    from scripts.organic.__main__ import main as organic_main

    out1 = tmp_path / "run-1.json"
    rc = demand_main(["--gsc-dir", str(GSC_JUL), "--out", str(out1), "--compare-strip-clock"])
    assert rc == 0
    assert out1.is_file()
    payload = json.loads(out1.read_text(encoding="utf-8"))
    assert payload["schema"] == "demand-engine/1.0"
    assert payload["counts"]["authorized_pages"] == 0
    assert "generated_at" in payload  # declared wall-clock on disk
    comparable = comparable_document(payload)
    assert "generated_at" not in comparable

    rc2 = organic_main(["demand-engine", "--gsc-dir", str(GSC_JUL), "--compare-strip-clock"])
    assert rc2 == 0


def test_pull_api_fail_closed_without_credentials():
    from scripts.organic.demand_engine import pull_api_fail_closed

    result = pull_api_fail_closed()
    assert result.get("ok") is False
    assert result.get("blocked") is True
    assert result.get("error") == "missing_credentials"
    assert "required_env" in result
    assert any("GSC_CREDENTIALS_JSON" in str(item) for item in (result.get("required_env") or []))
