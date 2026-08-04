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

    # branded detection
    ok("branded_confenge", sdo.branded("confenge consultoria"))
    ok("nonbranded_aditivo", not sdo.branded("aditivo 25% obra pública"))

    if failures:
        print("FAILURES", failures)
        return 1
    print("ALL search demand tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
