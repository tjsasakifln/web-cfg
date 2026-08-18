#!/usr/bin/env python3
"""Tests for Search Demand Observatory — drives real import + analyze on fixture CSV."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.revops import search_demand_observatory as sdo  # noqa: E402


def main() -> int:
    failures = []

    def ok(name: str, cond: bool, detail: str = "") -> None:
        if cond:
            print("PASS", name, detail)
        else:
            print("FAIL", name, detail)
            failures.append(name)

    # Real fixture from repo if present
    fixture = ROOT / "seo" / "gsc-2026-07-30"
    if fixture.is_dir():
        payload = sdo.import_csv_dir(fixture, as_of="2026-07-30")
        ok("import_queries", payload["query_count"] >= 5, str(payload["query_count"]))
        ok("import_pages", payload["page_count"] >= 5, str(payload["page_count"]))
        insights = sdo.analyze(payload)
        ok("insights_actions", isinstance(insights["priority_actions"], list))
        ok("legacy_detected", any(
            "avcb" in (q.get("query") or "").lower()
            for q in insights["analyses"]["legacy_entity_queries_still_ranking"]
        ), str(insights["analyses"]["legacy_entity_queries_still_ranking"]))
        ok("attribution_warning", "aggregate" in insights["attribution_warning"].lower())
        # No fake lead↔query join field
        blob = json.dumps(insights)
        ok("no_lead_query_join", "lead_id" not in blob or "never" in insights["attribution_warning"].lower())
        required = [
            "1_high_impressions_low_ctr",
            "2_striking_distance_pos_4_20",
            "3_commercial_queries_without_page_join",
            "4_cluster_page_competition",
            "5_content_growing",
            "6_content_decaying",
            "7_indexed_without_impressions",
            "8_informational_to_offer",
            "9_clusters_traffic_without_leads",
            "10_pages_leads_low_traffic",
            "11_emerging_terms",
            "12_competitor_content_gaps",
        ]
        missing = [k for k in required if k not in insights["analyses"]]
        ok("twelve_analyses", not missing, str(missing or insights["counts"].get("analysis_keys")))
        ok("cohort_not_identity", "cohort" in json.dumps(insights["analyses"]["9_clusters_traffic_without_leads"]).lower())
        ok("gap_proxy_list", isinstance(insights["analyses"]["12_competitor_content_gaps"], list))
    else:
        # Synthetic CSV
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / "Consultas.csv").write_text(
                "Top consultas,Cliques,Impressões,CTR,Posição\n"
                "aditivos obra pública,0,50,0%,8\n"
                "avcb,0,10,0%,4\n",
                encoding="utf-8",
            )
            (d / "Paginas.csv").write_text(
                "Páginas principais,Cliques,Impressões,CTR,Posição\n"
                "https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/,0,24,0%,12\n",
                encoding="utf-8",
            )
            payload = sdo.import_csv_dir(d, as_of="2026-01-01")
            ok("synthetic_import", payload["query_count"] == 2)
            insights = sdo.analyze(payload)
            ok("low_ctr_flagged", len(insights["analyses"]["1_high_impressions_low_ctr"]) >= 1)

    # API without credentials must soft-fail with docs
    result = sdo.pull_api(7)
    ok("api_missing_creds", result.get("ok") is False)
    ok("api_lists_env", "required_env" in result)

    # branded detection — versioned classifier (shipped function, not a twin)
    ok("branded_confenge", sdo.branded("confenge consultoria"))
    ok("nonbranded_aditivo", not sdo.branded("aditivo 25% obra pública"))
    cls_confenge = sdo.classify_query("confenge consultoria")
    ok("class_confenge_brand", cls_confenge["label"] == "brand")
    ok("class_versioned", cls_confenge["version"] == sdo.BRAND_CLASSIFICATION_VERSION)
    ok("class_smartlic_legacy", sdo.classify_query("smartlic avcb")["label"] == "legacy_brand")
    ok("class_smartlic_not_current_brand", sdo.branded("smartlic avcb") is False)
    ok("class_tiago_nav", sdo.classify_query("tiago sasaki")["label"] == "brand")
    ok("class_tiago_jun_nav", sdo.classify_query("tiago jun sasaki")["label"] == "brand")
    ok("class_tiago_sector_not_brand", sdo.classify_query("aditivo tiago sasaki reequilibrio")["label"] == "non_brand")
    ok("class_limite_aditivo", sdo.classify_query("limite aditivo")["label"] == "non_brand")
    ok("class_reequilibrio", sdo.classify_query("reequilibrio")["label"] == "non_brand")
    ok("class_pavimentacao", sdo.classify_query("pavimentacao")["label"] == "non_brand")

    thin = sdo.ctr_optimization_decision(99)
    ok("ctr_insufficient", thin["decision"] == "INSUFFICIENT_EVIDENCE")
    ok("ctr_data_kept", thin["data_preserved"] is True)
    ok("ctr_no_optimize", thin["optimize_ctr"] is False)
    ok("ctr_allowed_at_100", sdo.ctr_optimization_decision(100)["decision"] == "ALLOWED")

    today = sdo.date(2026, 8, 18)
    windows = sdo.complete_windows(today=today, provider_max_date=sdo.date(2026, 8, 17))
    ok("window_no_mix", windows["mixed_incomplete_periods"] is False)
    ok("window_today_not_zero", windows["today_missing_is_not_zero"] is True)
    ok("window_pulse_7", len(windows["pulse"]["days"]) == 7)
    ok("window_trend_28", len(windows["trend"]["current"]["days"]) == 28)
    ok("window_prior_28", len(windows["trend"]["prior"]["days"]) == 28)
    ok("window_excludes_today", today.isoformat() not in windows["pulse"]["days"])
    ok("limitation_declared", "top rows" in windows["search_analytics_limitation"].lower())

    absent = sdo.day_status("2026-08-18", rows_by_date={})
    ok("absent_not_zero", absent["status"] == "ABSENT" and absent["value"] is None)
    ok("absent_note", "not_zero" in (absent.get("note") or ""))

    cannibal = sdo.cannibalization_verdict(
        [
            {
                "query": "limite aditivo 25",
                "page": "https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/",
            },
            {
                "query": "limite aditivo 25",
                "page": "https://confenge.com.br/aditivos-obras-publicas/",
            },
        ],
        reviewed_semantic_overlap=False,
    )
    ok("cannibal_needs_review", cannibal["status"] == "INSUFFICIENT_EVIDENCE")

    safe = sdo.git_safe_aggregate(
        [{"query": "limite aditivo", "page": "https://confenge.com.br/", "impressions": 3, "clicks": 0}]
    )
    blob = json.dumps(safe)
    ok("redacted_no_raw_query", "limite aditivo" not in blob)
    ok("redacted_has_hash", "sha256:" in blob)

    fixture = sdo.sync_from_fixture()
    ok("fixture_ok", fixture.get("ok") is True)
    ok("fixture_not_product", fixture.get("ready_for_product_decisions") is False)
    ok("fixture_synthetic", fixture.get("synthetic") is True)
    ok("fixture_max_date", bool(fixture.get("max_date")))
    ok("fixture_latency", isinstance(fixture.get("latency_ms"), int))

    if failures:
        print("FAILURES", failures)
        return 1
    print("ALL search demand tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
