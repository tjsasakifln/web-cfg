"""Program guard for issue #387: one on-page Medicoes/Glosas focus.

The contract coordinates child issues without changing a public URL. These tests
derive the baseline and route ownership from versioned sources so a plan cannot
quietly become page-volume, paid acquisition, or an invented outcome.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
EXPERIMENT = (
    ROOT
    / "data"
    / "organic"
    / "experiments"
    / "on-page-margin-focus-01"
    / "experiment.json"
)


def _json(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def _experiment() -> dict:
    return json.loads(EXPERIMENT.read_text(encoding="utf-8"))


def _csv_rows(relative: str, first_column: str) -> dict[str, dict[str, str]]:
    with (ROOT / relative).open(encoding="utf-8-sig", newline="") as handle:
        rows = csv.DictReader(handle)
        return {row[first_column]: row for row in rows}


def test_program_is_on_page_only_and_bounded_to_one_canary():
    record = _experiment()
    assert record["schema"] == "on-page-margin-focus/1.0"
    assert record["issues"] == {
        "parent": 387,
        "children": [388, 389, 390],
        "governance_parent": 61,
    }
    assert record["decision"]["execution_state"] == "EXECUTE_NOW"
    assert record["decision"]["outcome_state"] == "VALIDATE"
    assert record["implementation"] == {
        "contract_status": "READY",
        "public_change_status": "NOT_STARTED",
        "close_parent_after_children": [388, 389, 390],
        "deploy_anchor_status": "UNKNOWN_UNTIL_PUBLIC_CHANGE",
    }

    guard = record["scope_guard"]
    assert guard["acquisition_surface"] == "ON_PAGE_ONLY"
    assert guard["new_public_url_budget"] == 0
    for forbidden in (
        "new_keyword_pages",
        "paid_media",
        "external_distribution_dependency",
        "mass_robots_flip",
        "invented_case_or_result",
        "page_count_is_success_metric",
    ):
        assert guard[forbidden] is False, forbidden

    canary = record["focus"]["canary_policy"]
    assert canary["maximum_concurrent_human_rewrites"] == 1
    assert canary["selection_owner_issue"] == 389
    assert canary["selected_canary"] == "UNKNOWN_PENDING_389"
    assert canary["second_canary_allowed_after_first_window"] is False


def test_canonical_owner_is_consistent_across_existing_contracts():
    record = _experiment()
    focus = record["focus"]
    owner = focus["canonical_owner"]

    inventory = _json(record["contracts"]["intent_inventory"])
    intent = next(
        row for row in inventory["intents"] if row["intent"] == focus["inventory_intent"]
    )
    assert intent["canonical"] == owner
    assert intent["disposition"] == "IMPROVE"

    bofu = _json(record["contracts"]["bofu_matrix"])
    cluster = next(
        row for row in bofu["rows"] if row["intent_cluster"] == focus["intent_cluster"]
    )
    assert cluster["canonical_service_route"] == owner
    assert cluster["index_state"] == "index,follow"
    assert cluster["conversion_event_coverage"] == ["service_view", "service_cta"]

    service_map = _json(record["contracts"]["intent_to_service"])
    mapped = next(
        row for row in service_map["clusters"] if row["id"] == focus["intent_cluster"]
    )
    assert mapped["service_path"] == owner

    for route in (
        owner,
        focus["commercial_transfer_route"],
        focus["margin_context_route"],
        focus["money_asset"],
        *cluster["supporting_indexable_routes"],
    ):
        assert (ROOT / route.strip("/") / "index.html").is_file(), route


def test_live_baseline_is_derived_and_not_a_traffic_claim():
    record = _experiment()
    expected = record["baseline"]["live_gsc"]
    snapshot = _json(expected["source"])
    rows = snapshot["queries"]

    assert snapshot["query_text_redacted"] is True
    assert snapshot["ready_for_product_decisions"] is True
    assert snapshot["max_date"] == expected["provider_max_date"]
    assert snapshot["end"] == expected["requested_end_date"]
    assert sum(row["impressions"] for row in rows) == expected["impressions"] == 78
    assert sum(row["clicks"] for row in rows) == expected["clicks"] == 0
    assert (
        sum(row["impressions"] for row in rows if row["position"] > 20)
        == expected["impressions_beyond_position_20"]
        == 64
    )
    assert (
        sum(
            row["impressions"]
            for row in rows
            if row["country"] == "bra" and row["position"] <= 10
        )
        == expected["brazil_top_10_impressions"]
        == 12
    )


def test_historical_baseline_and_active_pain_signals_are_versioned():
    record = _experiment()
    expected = record["baseline"]["historical_gsc"]
    growth = _json(expected["source"])
    totals = growth["metrics"]["totals"]

    assert growth["gsc_export"] == expected["snapshot"]
    assert totals["impressions"] == expected["page_impressions"] == 373
    assert totals["clicks"] == expected["page_clicks"] == 10
    assert totals["commercial_impressions"] == expected["commercial_impressions"] == 29
    assert totals["commercial_clicks"] == expected["commercial_clicks"] == 0
    assert (
        growth["metrics"]["commercial_impression_share"]
        == expected["commercial_impression_share"]
        == 0.0777
    )

    queries = _csv_rows("seo/gsc-2026-08-09/Consultas.csv", "Top consultas")
    pages = _csv_rows("seo/gsc-2026-08-09/Paginas.csv", "Páginas principais")
    for signal in expected["signals"]:
        if "query" in signal:
            row = queries[signal["query"]]
        else:
            row = pages[f"https://confenge.com.br{signal['page']}"]
        assert int(row["Cliques"]) == signal["clicks"]
        assert int(row["Impressões"]) == signal["impressions"]
        assert float(row["Posição"]) == signal["position"]


def test_measurement_stays_ordered_unknown_and_non_causal():
    record = _experiment()
    measurement = record["measurement"]
    assert [row["metric"] for row in measurement["ordered_chain"]] == [
        "brazil_top_10_impressions",
        "organic_clicks",
        "commercial_route_visits",
        "persisted_handraises",
        "qualified_commercial_opportunities",
        "commercial_actions_or_outcomes",
    ]
    assert [row["owner"] for row in measurement["ordered_chain"][-3:]] == [
        "web-cfg CONFENGE_WEB conversion receipt",
        "extra-cli commercial-intent projection",
        "Warmbly action and observed-outcome contracts",
    ]
    assert set(measurement["post_change"].values()) == {"UNKNOWN"}
    assert measurement["window_policy"] == {
        "complete_days_per_window": 28,
        "first_judgment_windows": 1,
        "kill_judgment_windows": 2,
        "anchor": "DEPLOY_DATE_UNKNOWN",
    }
    assert "no click, lead or revenue is attributed causally" in measurement[
        "causal_claim_policy"
    ]
    assert record["protected_work"] == {
        "do_not_mutate_before_window_or_explicit_supersession": [126, 128],
        "human_indexation_gate_owner": 127,
        "live_vertical_proof_owner": 60,
        "first_fold_contract_owner": 327,
        "offer_scope_price_boundary_owner": 333,
    }
