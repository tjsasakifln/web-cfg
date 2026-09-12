#!/usr/bin/env python3
"""Tests for Search Demand Observatory — drives real import + analyze on fixture CSV."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.revops import search_demand_observatory as sdo  # noqa: E402

COMMITTED_GSC_RELS = (
    "data/revops/gsc/latest_import.json",
    "data/revops/gsc/imports/import-2026-07-30.json",
    "data/revops/gsc/insights_latest.json",
    "data/ops/gsc-insights.json",
    "netlify/functions/data/gsc-insights.json",
)


def _snapshot_committed_gsc() -> dict[str, bytes]:
    backup: dict[str, bytes] = {}
    for rel in COMMITTED_GSC_RELS:
        path = ROOT / rel
        if path.is_file():
            backup[rel] = path.read_bytes()
    return backup


def _restore_committed_gsc(backup: dict[str, bytes]) -> None:
    for rel, content in backup.items():
        dest = ROOT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)


def main() -> int:
    failures = []
    backup = _snapshot_committed_gsc()
    try:

        def ok(name: str, cond: bool, detail: str = "") -> None:
            if cond:
                print("PASS", name, detail)
            else:
                print("FAIL", name, detail)
                failures.append(name)

        # Committed snapshots are either labeled historical fixtures or a
        # provider-backed, query-redacted live snapshot.
        for rel in (
            "data/revops/gsc/latest_import.json",
            "data/revops/gsc/imports/import-2026-07-30.json",
            "data/revops/gsc/insights_latest.json",
        ):
            payload = json.loads((ROOT / rel).read_text(encoding="utf-8"))
            if sdo.is_live_gsc_payload(payload):
                ok(f"committed {rel} live", payload.get("synthetic") is False)
                ok(f"committed {rel} product ready", payload.get("ready_for_product_decisions") is True)
                ok(f"committed {rel} query redacted", payload.get("query_text_redacted") is True)
                ok(f"committed {rel} no raw rows", payload.get("raw_query_rows_in_git") is False)
            else:
                ok(f"committed {rel} synthetic", payload.get("synthetic") is True)
                ok(f"committed {rel} fixture", payload.get("fixture") is True)
                ok(
                    f"committed {rel} not product",
                    payload.get("ready_for_product_decisions") is False,
                )

        # Real fixture from repo if present
        fixture = ROOT / "seo" / "gsc-2026-07-30"
        if fixture.is_dir():
            payload = sdo.import_csv_dir(fixture, as_of="2026-07-30")
            ok("import_queries", payload["query_count"] >= 5, str(payload["query_count"]))
            ok("import_pages", payload["page_count"] >= 5, str(payload["page_count"]))
            insights = sdo.analyze(payload)
            ok("insights_actions", isinstance(insights["priority_actions"], list))
            forbidden_publish_keys = {
                "queries",
                "branded_queries",
                "nonbranded_queries",
                "3_commercial_queries_without_page_join",
                "legacy_entity_queries_still_ranking",
            }
            produced_keys = set(insights["counts"]) | set(insights["analyses"])
            ok(
                "publishable_insights_key_shape",
                not (produced_keys & forbidden_publish_keys),
                str(sorted(produced_keys & forbidden_publish_keys)),
            )
            ok("legacy_detected", any(
                "avcb" in (q.get("query") or "").lower()
                for q in insights["analyses"]["legacy_entity_demand_still_ranking"]
            ), str(insights["analyses"]["legacy_entity_demand_still_ranking"]))
            ok("attribution_warning", "aggregate" in insights["attribution_warning"].lower())
            # No fake lead↔query join field
            blob = json.dumps(insights)
            ok("no_lead_query_join", "lead_id" not in blob or "never" in insights["attribution_warning"].lower())
            required = [
                "1_high_impressions_low_ctr",
                "2_striking_distance_pos_4_20",
                "3_commercial_demand_without_page_join",
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

            # Exercise the real producer -> recursive redaction -> JS publisher
            # validator seam, including non-empty nested priority actions.
            with tempfile.TemporaryDirectory() as td:
                previous_data = sdo.DATA
                previous_private = sdo.PRIVATE_DIR
                sdo.DATA = Path(td) / "gsc"
                sdo.PRIVATE_DIR = sdo.DATA / "private"
                try:
                    current_as_of = datetime.now(timezone.utc).date().isoformat()
                    sdo.analyze(
                        {
                            "as_of": current_as_of,
                            "source": "search_analytics_api",
                            "source_kind": "search_analytics_api",
                            "synthetic": False,
                            "fixture": False,
                            "historical": False,
                            "ready_for_product_decisions": True,
                            "readiness_status": "READY",
                            "readiness_access_mode": "READ_WRITE",
                            "readiness_reasons": [],
                            "reason_codes": [],
                            "readiness_contract_version": "gsc-readiness/v2",
                            "history_state_sha256": "b" * 64,
                            "manifest": {"content_sha256": "a" * 64},
                            "queries": [
                                {
                                    "query": "licitacao de obra publica",
                                    "page": "https://confenge.com.br/",
                                    "impressions": 200,
                                    "clicks": 0,
                                    "ctr": 0,
                                    "position": 5,
                                    "branded": False,
                                    "intent": "commercial",
                                    "cluster": "licitacoes",
                                }
                            ],
                            "pages": [],
                        }
                    )
                    persisted = json.loads(
                        (sdo.DATA / "insights_latest.json").read_text(encoding="utf-8")
                    )
                finally:
                    sdo.DATA = previous_data
                    sdo.PRIVATE_DIR = previous_private
            validator = subprocess.run(
                [
                    "node",
                    "--input-type=module",
                    "-e",
                    (
                        'import { validatePublishable } from "./scripts/revops/'
                        'publish_gsc_insights.mjs"; '
                        'let raw = ""; for await (const chunk of process.stdin) raw += chunk; '
                        'validatePublishable(JSON.parse(raw));'
                    ),
                ],
                cwd=ROOT,
                input=json.dumps(persisted),
                text=True,
                capture_output=True,
                check=False,
            )
            ok(
                "producer_redaction_publisher_contract",
                validator.returncode == 0,
                (validator.stderr or validator.stdout).strip(),
            )
            ok(
                "redaction_drops_non_string_query_key",
                "query" not in sdo.redact_live_query_fields({"query": None}),
            )
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
            [{
                "query": "limite aditivo",
                "page": "https://confenge.com.br/?email=private%40example.com#fragment",
                "impressions": 3,
                "clicks": 0,
            }]
        )
        blob = json.dumps(safe)
        ok("redacted_no_raw_query", "limite aditivo" not in blob)
        ok("redacted_has_hash", "sha256:" in blob)
        ok("sensitive_url_query_stripped", "private%40example.com" not in blob and "?" not in safe["rows"][0]["page"])
        ok(
            "external_url_redacted",
            sdo.redact_sensitive_url("https://other.example/path?token=secret") == "[external-url-redacted]",
        )


        ok("live_payload_true", sdo.is_live_gsc_payload({
            "source": "search_analytics_api",
            "synthetic": False,
            "ready_for_product_decisions": True,
        }) is True)
        ok("historical_not_live", sdo.is_live_gsc_payload({
            "source": "seo/gsc-2026-07-30",
            "synthetic": True,
            "fixture": True,
            "ready_for_product_decisions": False,
        }) is False)
        ok("fixture_flag_not_live", sdo.is_live_gsc_payload({
            "source": "fixture",
            "synthetic": True,
            "ready_for_product_decisions": False,
        }) is False)
        labeled = sdo.stamp_non_live_snapshot({"source": "csv_export", "queries": []})
        ok("label_historical_not_live", sdo.is_live_gsc_payload(labeled) is False)
        ok("label_historical_source", labeled.get("source") == "csv_export")
        ok("label_historical_not_product", labeled.get("ready_for_product_decisions") is False)

        live_payload = sdo.git_safe_live_payload(
            {
                "source": "search_analytics_api",
                "ready_for_product_decisions": True,
                "synthetic": False,
                "queries": [
                    {
                        "date": "2026-08-10",
                        "query": "consulta privada",
                        "page": "https://confenge.com.br/aditivos-obras-publicas/",
                        "impressions": 2,
                        "clicks": 0,
                    }
                ],
            }
        )
        ok("live_git_safe_query_redacted", "consulta privada" not in json.dumps(live_payload))
        ok("live_git_safe_ready", live_payload["ready_for_product_decisions"] is True)
        ok("live_git_safe_marked", live_payload["raw_query_rows_in_git"] is False)

        raw_live = {
            "source": "search_analytics_api",
            "source_kind": "search_analytics_api",
            "ready_for_product_decisions": True,
            "synthetic": False,
            "max_date": "2026-08-10",
            "as_of": "2026-08-10",
            "queries": [
                {
                    "date": "2026-08-10",
                    "query": "confenge consultoria",
                    "page": "https://confenge.com.br/",
                    "country": "bra",
                    "device": "DESKTOP",
                    "impressions": 5,
                    "clicks": 1,
                    "position": 2.0,
                    "brand_class": sdo.classify_query("confenge consultoria"),
                },
                {
                    "date": "2026-08-10",
                    "query": "sinapi desonerado",
                    "page": "https://confenge.com.br/",
                    "country": "bra",
                    "device": "DESKTOP",
                    "impressions": 8,
                    "clicks": 0,
                    "position": 7.5,
                    "brand_class": sdo.classify_query("sinapi desonerado"),
                },
            ],
        }
        safe_live = sdo.git_safe_live_payload(raw_live)
        ok("safe_live_no_raw_brand_query", "confenge consultoria" not in json.dumps(safe_live))
        ok("safe_live_no_raw_sinapi", "sinapi desonerado" not in json.dumps(safe_live))
        ok(
            "safe_live_stores_brand_string",
            any(r.get("brand_class") == "brand" for r in safe_live["queries"]),
        )
        ok(
            "row_brand_honors_stored_string",
            sdo.row_brand_label({"query_hash": "sha256:deadbeefdeadbeef", "brand_class": "brand"})
            == "brand",
        )
        ok(
            "row_brand_does_not_classify_hash",
            sdo.row_brand_label({"query_hash": "sha256:deadbeefdeadbeef", "query": "sha256:deadbeefdeadbeef"})
            == "non_brand",
        )
        counts_safe = sdo.brand_class_counts(safe_live["queries"])
        ok("git_safe_brand_count", counts_safe.get("brand") == 1, str(counts_safe))
        ok("git_safe_nonbrand_count", counts_safe.get("non_brand") == 1, str(counts_safe))
        baseline_safe = sdo.build_operational_baseline(safe_live, today=sdo.date(2026, 8, 11))
        pulse_safe = baseline_safe["windows"]["pulse_7"]["totals"]
        ok(
            "git_safe_baseline_brand_imps",
            pulse_safe["brand"]["impressions"] == 5.0,
            str(pulse_safe["brand"]),
        )
        ok(
            "git_safe_baseline_nonbrand_imps",
            pulse_safe["non_brand"]["impressions"] == 8.0,
            str(pulse_safe["non_brand"]),
        )
        wrong_from_safe = sdo.detect_wrong_landing(safe_live["queries"])
        ok(
            "git_safe_wrong_landing_fires",
            any(
                item.get("intended") == "/conteudos/sinapi-desonerado-nao-desonerado/"
                and item.get("landed") == "/"
                for item in wrong_from_safe.get("items") or []
            ),
            str(wrong_from_safe),
        )

        private_path = sdo.PRIVATE_DIR / "latest_import.json"
        last_sync_path = sdo.DATA / "last_sync.json"
        public_path = sdo.DATA / "latest_import.json"
        private_backup = private_path.read_bytes() if private_path.is_file() else None
        last_backup = last_sync_path.read_bytes() if last_sync_path.is_file() else None
        public_backup = public_path.read_bytes() if public_path.is_file() else None
        try:
            sdo.PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
            private_path.write_text(json.dumps(raw_live, ensure_ascii=False), encoding="utf-8")
            public_path.write_text(json.dumps(safe_live, ensure_ascii=False), encoding="utf-8")
            last_sync_path.write_text(
                json.dumps(
                    {
                        "source": "search_analytics_api",
                        "source_kind": "search_analytics_api",
                        "ready_for_product_decisions": True,
                        "synthetic": False,
                        "last_sync_at": "2026-08-11T00:00:00+00:00",
                    }
                ),
                encoding="utf-8",
            )
            loaded = sdo.load_labeled_snapshot()
            ok("analysis_prefers_private_raw", loaded.get("analysis_source") == "private_raw")
            ok(
                "analysis_private_keeps_query",
                any(r.get("query") == "sinapi desonerado" for r in loaded.get("queries") or []),
            )
            private_wrong = sdo.detect_wrong_landing(loaded.get("queries") or [])
            ok(
                "private_wrong_landing_fires",
                any(
                    item.get("intended") == "/conteudos/sinapi-desonerado-nao-desonerado/"
                    for item in private_wrong.get("items") or []
                ),
            )
        finally:
            if private_backup is None:
                if private_path.is_file():
                    private_path.unlink()
            else:
                private_path.write_bytes(private_backup)
            if last_backup is None:
                if last_sync_path.is_file():
                    last_sync_path.unlink()
            else:
                last_sync_path.write_bytes(last_backup)
            if public_backup is None:
                if public_path.is_file():
                    public_path.unlink()
            else:
                public_path.write_bytes(public_backup)

        fixture = sdo.sync_from_fixture()
        ok("fixture_ok", fixture.get("ok") is True)
        ok("fixture_not_product", fixture.get("ready_for_product_decisions") is False)
        ok("fixture_synthetic", fixture.get("synthetic") is True)
        ok("fixture_max_date", bool(fixture.get("max_date")))
        ok("fixture_latency", isinstance(fixture.get("latency_ms"), int))

        unstamped = {"as_of": "2026-07-30", "source_dir": "seo/gsc-2026-07-30", "queries": []}
        stamped_mem = sdo.stamp_non_live_snapshot(unstamped)
        ok("stamper_synthetic", stamped_mem.get("synthetic") is True)
        ok("stamper_fixture", stamped_mem.get("fixture") is True)
        ok("stamper_not_product", stamped_mem.get("ready_for_product_decisions") is False)
        ok("stamper_not_invented", stamped_mem.get("live_baseline_invented") is False)

        written = sdo.write_last_fixture_manifest()
        manifest_path = ROOT / sdo.FIXTURE_MANIFEST_REL
        ok("manifest_written", manifest_path.is_file() and written.get("ok") is True)
        on_disk = json.loads(manifest_path.read_text(encoding="utf-8"))
        rows = json.loads((ROOT / "data/revops/gsc/fixtures/sample_rows.json").read_text(encoding="utf-8"))
        expected = sdo.snapshot_manifest(
            source="fixture",
            rows=rows,
            max_date=max(str(r.get("date") or "1970-01-01") for r in rows),
            latency_ms=0,
            ready_for_product_decisions=False,
            synthetic=True,
        )
        ok("manifest_from_shipped", on_disk["content_sha256"] == expected["content_sha256"])
        ok("manifest_not_product", on_disk["ready_for_product_decisions"] is False)
        ok("manifest_synthetic", on_disk["synthetic"] is True)

        # Honesty: absence stays UNKNOWN; historical ≠ live; rows dedupe; zero not inferred.
        missing = sdo.pull_api(7)
        ok("pull_missing_ok_false", missing.get("ok") is False)
        ok("pull_missing_creds_shape", missing.get("error") == "missing_credentials")
        ok("pull_missing_lists_env", "GSC_CREDENTIALS_JSON" in " ".join(missing.get("required_env") or []))
        ok("perf_unknown_without_live", sdo.gsc_performance_status(missing) == "UNKNOWN")
        ok(
        "perf_unknown_empty",
        sdo.gsc_performance_status({}) == "UNKNOWN",
        )
        ok(
        "perf_live_only_when_ready",
        sdo.gsc_performance_status(
            {"ok": True, "ready_for_product_decisions": True, "synthetic": False}
        )
        == "LIVE",
        )
        historical = sdo.label_historical_export({"source": "csv", "queries": [{"query": "aditivo"}]})
        ok("historical_flag", historical.get("historical") is True)
        ok("historical_neq_live", historical.get("historical_neq_live") is True)
        ok("historical_not_product", historical.get("ready_for_product_decisions") is False)
        ok("historical_perf_unknown", historical.get("performance_status") == "UNKNOWN")

        duped = [
        {
            "date": "2026-07-28",
            "query": "limite aditivo 25",
            "page": "https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/",
            "country": "bra",
            "device": "DESKTOP",
            "impressions": 4,
            "clicks": 0,
            "position": 12,
        },
        {
            "date": "2026-07-28",
            "query": "limite aditivo 25",
            "page": "https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/",
            "country": "bra",
            "device": "DESKTOP",
            "impressions": 4,
            "clicks": 0,
            "position": 12,
        },
        {
            "date": "2026-07-28",
            "query": "sinapi desonerado",
            "page": "https://confenge.com.br/",
            "country": "bra",
            "device": "MOBILE",
            "impressions": 8,
            "clicks": 0,
            "position": 7.5,
        },
        ]
        deduped = sdo.dedupe_gsc_rows(duped)
        ok("rows_dedupe", len(deduped) == 2)
        detections = sdo.detect_all(
        duped,
        indexable_urls=[
            "https://confenge.com.br/conteudos/sinapi-desonerado-nao-desonerado/",
            "https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/",
        ],
        cta_by_path={"/conteudos/bdi-diferenciado-obra-publica/": "weak"},
        )
        ok("detect_grain", detections["grain"] == ["date", "query", "page", "country", "device"])
        ok("detect_no_zero_infer", detections["zero_inferred_from_absence"] is False)
        ok("detect_inspection_split", detections["inspection_is_not_indexation"] is True)
        ok("detect_brand_classes", "non_brand" in detections["brand_classes"])
        ok("detect_striking", detections["striking_distance"]["class"] == "striking_distance")
        ok("detect_wrong_landing_class", detections["wrong_landing"]["class"] == "wrong_landing")
        ok(
        "detect_wrong_landing_sinapi_home",
        any(
            item.get("intended") == "/conteudos/sinapi-desonerado-nao-desonerado/"
            for item in detections["wrong_landing"]["items"]
        ),
        )
        absent_indexable = detections["indexable_without_impressions"]["items"]
        ok(
        "indexable_missing_is_absent",
        any(
            item.get("status") == "ABSENT" and item.get("impressions") is None
            for item in absent_indexable
            if "sinapi" in item.get("url", "")
        ),
        )
        ok(
        "indexable_zero_not_inferred",
        detections["indexable_without_impressions"]["zero_inferred_from_absence"] is False,
        )
        weak = sdo.detect_clicks_weak_cta(
        [{"page": "https://confenge.com.br/conteudos/bdi-diferenciado-obra-publica/", "clicks": 2}],
        {"/conteudos/bdi-diferenciado-obra-publica/": "weak"},
        )
        ok("weak_cta_observed", weak["status"] == "observed" and len(weak["items"]) == 1)
        no_cta_map = sdo.detect_clicks_weak_cta([{"page": "/x/", "clicks": 1}])
        ok("weak_cta_needs_map", no_cta_map["status"] == "INSUFFICIENT_EVIDENCE")

        ok("source_kinds_seven", set(sdo.SNAPSHOT_SOURCE_KINDS) == {
            "search_analytics_api",
            "historical_csv_export",
            "fixture",
            "provided_aggregate",
            "absence",
            "credential_failure",
            "search_analytics_top_row_truncation",
        })
        ok(
            "classify_api_live",
            sdo.classify_snapshot_source({"source": "search_analytics_api", "synthetic": False})
            == "search_analytics_api",
        )
        ok(
            "classify_csv",
            sdo.classify_snapshot_source({"source": "csv_export", "historical": True})
            == "historical_csv_export",
        )
        ok("classify_fixture", sdo.classify_snapshot_source({"source": "fixture"}) == "fixture")
        ok(
            "classify_provided_aggregate",
            sdo.classify_snapshot_source({"origin": "founder_provided_baseline", "fixture": True})
            == "provided_aggregate",
        )
        ok("classify_absence", sdo.classify_snapshot_source({}) == "absence")
        ok(
            "classify_creds",
            sdo.classify_snapshot_source({"error": "missing_credentials"}) == "credential_failure",
        )
        ok(
            "classify_truncation",
            sdo.classify_snapshot_source({"source": "search_analytics_api", "truncated": True})
            == "search_analytics_top_row_truncation",
        )
        empty_env = sdo.credential_blocker_record()
        ok("blocker_no_zero_rows", empty_env.get("rows") is None)
        ok("blocker_no_zero_imps", empty_env.get("impressions") is None)
        ok("blocker_not_product", empty_env.get("ready_for_product_decisions") is False)
        ok("blocker_names_secret", empty_env.get("required_secret") == "GSC_CREDENTIALS_JSON")
        ok("ctr_none_not_zero", sdo.ctr_optimization_decision(None)["impressions"] is None)
        ok(
            "ctr_none_insufficient",
            sdo.ctr_optimization_decision(None)["decision"] == "INSUFFICIENT_EVIDENCE",
        )
        ok(
            "github_actions_run_id_is_hashed",
            sdo.operational_run_id(
                {"GITHUB_RUN_ID": "33260693783", "GITHUB_RUN_ATTEMPT": "1"}
            )
            == "sha256:f765a77132602fc3f875cccefc67fcf4a0122195bc39bfc984b8ea441eac47b4",
        )
        dependency_receipt = sdo.write_blocked_last_sync(
            {"ok": False, "error": "dependency_unavailable"}
        )
        ok(
            "dependency_receipt_has_explicit_non_fixture_provenance",
            dependency_receipt.get("source") == "search_analytics_api"
            and dependency_receipt.get("synthetic") is False
            and dependency_receipt.get("fixture") is False
            and dependency_receipt.get("live_baseline_invented") is False,
        )

        before_latest = (ROOT / "data/revops/gsc/latest_import.json").read_bytes()
        fixture_payload = sdo.sync_from_fixture()
        ok("fixture_source_kind", fixture_payload.get("source_kind") == "fixture")
        ok("fixture_not_live_kind", sdo.is_live_gsc_payload(fixture_payload) is False)
        fixture_sync_state = json.loads((ROOT / "data/revops/gsc/last_sync.json").read_text())
        ok("sync_state_schema_versioned", fixture_sync_state.get("schema_version") == "gsc-sync-state/v1")
        ok(
            "sync_state_manifest_schema_versioned",
            fixture_sync_state.get("manifest_schema_version") == "gsc_snapshot_manifest_v1",
        )
        ok(
            "fixture_source_freshness_unknown",
            (fixture_sync_state.get("source_freshness") or {}).get("status") == "UNKNOWN",
        )
        after_latest = (ROOT / "data/revops/gsc/latest_import.json").read_bytes()
        ok("fixture_does_not_overwrite_latest_import", before_latest == after_latest)
        csv_labeled = sdo.stamp_non_live_snapshot({"source": "csv_export", "queries": []})
        ok("csv_kind", csv_labeled.get("source_kind") == "historical_csv_export")
        ok("csv_not_live", sdo.is_live_gsc_payload(csv_labeled) is False)

        windows_today = sdo.complete_windows(
            today=sdo.date(2026, 8, 19), provider_max_date=sdo.date(2026, 8, 16)
        )
        ok("windows_exclude_today_aug19", "2026-08-19" not in windows_today["pulse"]["days"])
        ok("windows_90", len(windows_today["context"]["days"]) == 90)
        ok("windows_pulse_complete", windows_today["pulse"]["complete"] is True)

        creds_pull = sdo.pull_api(7)
        blob = json.dumps(creds_pull)
        ok("pull_missing_not_zero_rows", creds_pull.get("rows") is None)
        ok("pull_missing_source_kind", sdo.classify_snapshot_source(creds_pull) == "credential_failure")
        ok("pull_missing_no_fake_clicks", '"clicks": 0' not in blob or creds_pull.get("clicks") is None)
        ok("pull_missing_ready_false", creds_pull.get("ready_for_product_decisions") is False)

        workflow = (ROOT / ".github/workflows/revops-scheduled.yml").read_text(encoding="utf-8")
        gsc_job = workflow.split("\n  gsc:\n", 1)[1].split("\n  weekly:\n", 1)[0]
        ok(
            "gsc_workflow_restores_authenticated_history",
            "--restore-history" in gsc_job and "OPS_TOKEN:" in gsc_job,
        )
        ok("gsc_workflow_has_single_history_store", "actions/cache/" not in gsc_job)
        ok(
            "gsc_workflow_persists_before_readiness_exit",
            gsc_job.index("publish_gsc_insights.mjs") < gsc_job.index("Enforce GSC readiness fail-closed"),
        )
        ok(
            "gsc_workflow_fail_closed",
            "--allow-missing-creds" not in gsc_job and "|| true" not in gsc_job,
        )
        ok(
            "gsc_workflow_serializes_private_producer",
            "group: gsc-private-snapshot-producer" in gsc_job
            and "cancel-in-progress: false" in gsc_job,
        )
        artifact_paths = gsc_job.split("path: |", 1)[1] if "path: |" in gsc_job else ""
        ok("gsc_artifact_excludes_individual_rows", "data/revops/gsc/daily/" not in artifact_paths)
        ok("gsc_artifact_excludes_private_tree", "data/revops/gsc/private/" not in artifact_paths)

        hist_rows = [
            {
                "date": "2026-07-28",
                "query": "consulta privada demand-control",
                "page": "https://confenge.com.br/conteudos/bdi-diferenciado-obra-publica/",
                "impressions": 12,
                "clicks": 0,
                "position": 8,
                "country": "bra",
                "device": "DESKTOP",
            }
        ]
        hist_snap = sdo.label_historical_export(
            {"source": "csv_export", "queries": hist_rows, "max_date": "2026-07-28"}
        )
        baseline = sdo.build_operational_baseline(hist_snap, today=sdo.date(2026, 8, 19))
        ok("baseline_not_live", baseline.get("live") is False)
        ok("baseline_source_csv", baseline.get("source_kind") == "historical_csv_export")
        ok("baseline_not_product", baseline.get("ready_for_product_decisions") is False)
        ok("baseline_pulse_7", "pulse_7" in baseline["windows"])
        ok("baseline_90", "context_90" in baseline["windows"])
        pulse_tot = baseline["windows"]["pulse_7"]["totals"]
        ok("baseline_missing_not_zero", pulse_tot.get("coverage") in {"ABSENT", "partial", "observed"})
        ok(
            "baseline_brand_keys",
            set((pulse_tot.keys() if False else ["brand", "legacy_brand", "non_brand"]))
            <= set(pulse_tot),
        )
        for label in ("brand", "legacy_brand", "non_brand"):
            cell = pulse_tot[label]
            if cell["impressions"] == 0 and pulse_tot["coverage"] == "ABSENT":
                ok("baseline_absent_not_numeric_zero", False, label)
        queue = sdo.build_next_action_queue(hist_snap, today=sdo.date(2026, 8, 19))
        ok("queue_max_3", queue.get("count", 99) <= 3)
        ok("queue_len_eq", len(queue.get("candidates") or []) <= 3)
        ok("queue_no_html_auth", queue.get("authorizes_html_edit") is False)
        excluded_hits = []
        for cand in queue.get("candidates") or []:
            if cand.get("observe_only"):
                continue
            for url in (cand.get("current_landing"), cand.get("intended_landing")):
                reason = sdo.exclusion_for_url(str(url or ""))
                if reason:
                    excluded_hits.append((url, reason))
        ok("queue_change_now_excludes_experiments", not excluded_hits, str(excluded_hits))
        report = sdo.render_human_report(baseline, queue)
        ok("report_as_of", str(baseline.get("as_of")) in report)
        ok("report_source", str(baseline.get("source_kind")) in report)
        ok("report_queue_len", f"`{queue.get('count')}`" in report or str(queue.get("count")) in report)
        ok("report_no_raw_query", "consulta privada demand-control" not in report)
        safe = sdo.git_safe_aggregate(hist_rows)
        ok("git_safe_no_private_query", "consulta privada demand-control" not in json.dumps(safe))

        funnel = sdo.url_funnel_status(
            eligible=True, appeared=True, clicked=False, engaged=None, lead=None, pipeline=None
        )
        ok("funnel_appeared", funnel == "APPEARED")
        ok(
            "funnel_unknown",
            sdo.url_funnel_status(
                eligible=None, appeared=None, clicked=None, engaged=None, lead=None, pipeline=None
            )
            == "UNKNOWN",
        )

        from scripts.revops import gsc_import_learning as gil

        founder_dir = ROOT / "scripts/revops/fixtures/gsc-founder-baseline-2026-09-02-08"
        with tempfile.TemporaryDirectory() as td:
            tpath = Path(td)
            founder = gil.import_gsc_export(
                founder_dir,
                persist=True,
                data_dir=tpath / "gsc",
                private_dir=tpath / "gsc" / "private",
            )
        insights_before = (ROOT / "data/revops/gsc/insights_latest.json").read_bytes()
        sdo.analyze(founder)
        ok(
            "historical_analyze_does_not_clobber_live",
            (ROOT / "data/revops/gsc/insights_latest.json").read_bytes() == insights_before,
        )
        ok("founder_ok", founder.get("ok") is True)
        ok("founder_not_current", founder.get("freshness") == "NOT_CURRENT")
        ok("founder_not_product", founder.get("ready_for_product_decisions") is False)
        ok("founder_provided_kind", founder.get("source_kind") == "provided_aggregate")
        ok("founder_not_fixture", founder.get("fixture") is False)
        ok("founder_not_synthetic", founder.get("synthetic") is False)
        ok("founder_provided_flag", founder.get("provided_aggregate") is True)
        ok("founder_classify", sdo.classify_snapshot_source(founder) == "provided_aggregate")
        ok("founder_freshness_not_current", sdo.snapshot_freshness(founder) == "NOT_CURRENT")
        ok("founder_site", founder.get("site") == "sc-domain:confenge.com.br")
        ok("founder_search_type", founder.get("search_type") == "web")
        ok("founder_extracted_at", founder.get("extracted_at") == "2026-09-11")
        ok("founder_last_data", founder.get("last_data_date") == "2026-09-08")
        ok("founder_interval_start", (founder.get("effective_interval") or {}).get("start") == "2026-09-02")
        ok("founder_pt_calendar", founder.get("search_analytics_calendar_timezone") == "America/Los_Angeles")
        ok("founder_sp_report", founder.get("executive_report_timezone") == "America/Sao_Paulo")
        ok("founder_not_utc_shift", founder.get("aggregate_date_not_shifted_as_utc") is True)
        prop = (founder.get("dimensions") or {}).get("property") or {}
        page_dim = (founder.get("dimensions") or {}).get("page") or {}
        query_dim = (founder.get("dimensions") or {}).get("query") or {}
        country_dim = (founder.get("dimensions") or {}).get("country") or {}
        ok("founder_property_clicks", prop.get("clicks") == 6)
        ok("founder_property_imps", prop.get("impressions") == 176)
        ok("founder_property_ctr", prop.get("ctr") == 6 / 176)
        ok("founder_property_pos", abs((prop.get("position") or 0) - (1667.2 / 176)) < 1e-9)
        ok("founder_property_pos_approx", prop.get("position_approximate") is True)
        ok("founder_page_imps", page_dim.get("impressions") == 215)
        ok("founder_query_imps", query_dim.get("impressions") == 16)
        ok("founder_query_clicks", query_dim.get("clicks") == 0)
        ok("founder_query_count", founder.get("query_count") == 4)
        brazil = country_dim.get("brazil") or {}
        ok("founder_brazil_imps", brazil.get("impressions") == 147)
        ok("founder_brazil_clicks", brazil.get("clicks") == 6)
        ok("founder_brazil_filter_absent", (founder.get("filters") or {}).get("brazil_filter_present") is False)
        ok("founder_country_not_invented_on_queries", all(q.get("country") is None for q in founder.get("queries") or []))
        ok("founder_omitted_unknown", (founder.get("omitted_queries") or {}).get("status") == "UNKNOWN")
        ok("founder_omitted_not_reconstructed", (founder.get("omitted_queries") or {}).get("reconstructed") is False)
        ok("founder_query_labels_not_observed", founder.get("query_labels_are_not_observed_search_terms") is True)
        ok("founder_page_grain_not_query", founder.get("page_grain_is_not_query") is True)
        ok("founder_unknown_click_terms", founder.get("unknown_click_terms") is True)
        ok(
            "founder_query_text_unknown",
            all(q.get("query") is None and q.get("query_label_status") == "UNKNOWN" for q in founder.get("queries") or []),
        )
        ok(
            "founder_query_not_page_keyword",
            not any(
                "sinapi" in str(q.get("query") or "").lower() or "quantitativo" in str(q.get("query") or "").lower()
                for q in founder.get("queries") or []
            ),
        )
        ok("founder_as_of_is_last_data", founder.get("as_of") == "2026-09-08")
        ok("founder_extracted_not_as_of", founder.get("extracted_at_is_not_as_of") is True)
        ok("founder_as_of_not_release", founder.get("as_of_not_rewritten_as_release") is True)
        ok("founder_current_day_not_zero_filled", founder.get("incomplete_current_day_zero_filled") is False)
        ok(
            "founder_not_live",
            sdo.is_live_gsc_payload(founder) is False,
        )
        ok(
            "founder_suppressed_not_in_disclosed",
            not any(gil.is_suppressed_query(str(q.get("query") or "")) is False and q.get("suppressed") for q in founder.get("queries") or []),
        )
        isolated = gil.isolate_dimension_totals(founder)
        ok("founder_isolated", gil.validate_dimension_isolation(isolated) is True)
        ok("founder_no_combined", "combined" not in isolated)
        mutated = dict(isolated)
        mutated["summed_impressions"] = (prop.get("impressions") or 0) + (page_dim.get("impressions") or 0)
        ok("counterproof_sum_rejected", gil.validate_dimension_isolation(mutated) is False)
        raised = False
        try:
            gil.reject_cross_dimension_sum(176, 215)
        except gil.DimensionIsolationError:
            raised = True
        ok("counterproof_cross_sum_raises", raised is True)

        zero = gil.ctr_from_sums(0, 0)
        ok("zero_denominator_undefined", zero["status"] == "UNDEFINED" and zero["ctr"] is None)
        ok("zero_denominator_flag", zero["zero_denominator"] is True)
        missing_ctr = gil.ctr_from_sums(None, 10)
        ok("missing_clicks_unknown_ctr", missing_ctr["ctr"] is None and missing_ctr["status"] == "UNKNOWN")

        suppressed = gil.is_suppressed_query("(consultas ocultas)")
        ok("suppressed_marker", suppressed is True)
        ok("empty_query_unknown", gil.is_suppressed_query("") is True)

        en_dir = Path(tempfile.mkdtemp())
        (en_dir / "Chart.csv").write_text(
            "Date,Clicks,Impressions,CTR,Position\n"
            "2026-09-02,2,43,4.65%,9.5\n"
            "2026-09-03,0,44,0%,7.6\n"
            "2026-09-04,2,34,5.88%,10.3\n"
            "2026-09-05,0,7,0%,25.6\n"
            "2026-09-06,1,11,9.09%,12.8\n"
            "2026-09-07,0,8,0%,11.1\n"
            "2026-09-08,1,29,3.45%,5.7\n",
            encoding="utf-8",
        )
        (en_dir / "Queries.csv").write_text(
            "Query,Clicks,Impressions,CTR,Position\n"
            "desonerado e não desonerado,0,6,0%,9.2\n"
            "não desonerado,0,4,0%,6.67\n"
            "aditivos obra pública,0,5,0%,23.8\n"
            "empreitada por preço unitário,0,1,0%,16\n",
            encoding="utf-8",
        )
        en_payload = gil.import_gsc_export(en_dir, persist=False, extracted_at="2026-09-11")
        ok("en_locale_property_imps", (en_payload.get("dimensions") or {}).get("property", {}).get("impressions") == 176)
        ok("en_locale_ctr", (en_payload.get("dimensions") or {}).get("property", {}).get("ctr") == 6 / 176)

        pt_semi = Path(tempfile.mkdtemp())
        (pt_semi / "Grafico.csv").write_text(
            "Data;Cliques;Impressões;CTR;Posição\n"
            "2026-09-02;2;43;4,65%;9,5\n"
            "2026-09-08;1;29;3,45%;5,7\n",
            encoding="utf-8",
        )
        pt_payload = gil.import_gsc_export(pt_semi, persist=False)
        pt_prop = (pt_payload.get("dimensions") or {}).get("property") or {}
        ok("pt_semicolon_clicks", pt_prop.get("clicks") == 3)
        ok("pt_semicolon_imps", pt_prop.get("impressions") == 72)

        no_br = Path(tempfile.mkdtemp())
        (no_br / "Grafico.csv").write_text("Data,Cliques,Impressões,CTR,Posição\n2026-09-02,1,10,10%,5\n", encoding="utf-8")
        (no_br / "Filtros.csv").write_text("Filtro,Valor\nTipo de pesquisa,Web\n", encoding="utf-8")
        no_br_payload = gil.import_gsc_export(no_br, persist=False)
        ok("brazil_filter_unavailable", (no_br_payload.get("filters") or {}).get("brazil_filter_present") is False)
        ok("brazil_not_invented", (no_br_payload.get("dimensions") or {}).get("country", {}).get("brazil") is None)
        ok("country_dim_absent", (no_br_payload.get("dimensions") or {}).get("country", {}).get("available") is False)

        new_page = gil.publication_cohort(
            "/pagina-nova-sem-historico/",
            {"available": False, "records": {}},
        )
        ok("new_page_cohort_unknown", new_page.get("status") == "UNKNOWN")
        ok("new_page_no_git_pub", new_page.get("commit_is_not_publication") is True)
        ok("new_page_no_pr_pub", new_page.get("pr_is_not_publication") is True)
        ok("new_page_first_verified_null", new_page.get("first_verified_deploy_at") is None)
        dated = gil.publication_cohort(
            "/aditivos-obras-publicas/",
            {"records": {"/aditivos-obras-publicas/": {"first_verified_deploy_at": "2026-08-01T12:00:00-03:00", "editorial_changed_at": "2026-09-04T10:00:00-03:00"}}},
        )
        ok("cohort_uses_verified_deploy", dated.get("cohort") == "2026-08-01")
        ok("editorial_distinct", dated.get("editorial_changed_at") != dated.get("first_verified_deploy_at"))

        incomplete = gil.complete_window_assessment(
            days=["2026-09-01", "2026-09-02"],
            available_dates={"2026-09-02"},
            exploratory=False,
        )
        ok("incomplete_not_complete", incomplete["complete"] is False)
        ok("incomplete_not_comparable", incomplete["comparable"] is False)
        ok("incomplete_not_zero", "not_zero" in (incomplete.get("note") or ""))
        unknown_win = gil.complete_window_assessment(
            days=["2026-09-01"], available_dates=None, exploratory=True
        )
        ok("missing_available_dates_unknown", unknown_win["completeness"] == "UNKNOWN")
        comparison = gil.compare_equivalent_windows(
            ["2026-09-01"],
            ["2026-08-04"],
            {"2026-09-01"},
        )
        ok("incomplete_28_insufficient", comparison["status"] == "INSUFFICIENT_EVIDENCE")
        ok("no_proven_lift", comparison["proven_lift"] is False)

        delayed = gil.delayed_data_status(sdo.date(2026, 9, 5), expected_end=sdo.date(2026, 9, 8))
        ok("delayed_status", delayed["status"] == "DELAYED")
        ok("delayed_not_zero_filled", delayed["zero_filled"] is False)
        current_day = gil.incomplete_current_day_status(
            sdo.date(2026, 9, 11), today=sdo.date(2026, 9, 11)
        )
        ok("current_day_incomplete", current_day["incomplete"] is True)
        ok("current_day_status", current_day["status"] == "INCOMPLETE")
        ok("current_day_not_zero", current_day["zero_filled"] is False)
        prior_day = gil.incomplete_current_day_status(
            sdo.date(2026, 9, 8), today=sdo.date(2026, 9, 11)
        )
        ok("prior_day_complete", prior_day["incomplete"] is False)
        missing_day = gil.incomplete_current_day_status(None, today=sdo.date(2026, 9, 11))
        ok("missing_day_unknown", missing_day["status"] == "UNKNOWN")
        ok("missing_day_not_zero", missing_day["zero_filled"] is False)

        with tempfile.TemporaryDirectory() as td:
            tpath = Path(td)
            first = gil.import_gsc_export(
                founder_dir, persist=True, data_dir=tpath / "gsc", private_dir=tpath / "gsc" / "private"
            )
            second = gil.import_gsc_export(
                founder_dir, persist=True, data_dir=tpath / "gsc", private_dir=tpath / "gsc" / "private"
            )
            ok("reimport_idempotent_flag", second.get("idempotent_replay") is True)
            ok("reimport_no_dup_rows", second.get("duplicate_rows_written") is False)
            ok("reimport_same_key", first.get("idempotency_key") == second.get("idempotency_key"))
            ok("reimport_same_imps", (first.get("dimensions") or {}).get("property", {}).get("impressions") == 176)
            ok("reimport_same_imps_2", (second.get("dimensions") or {}).get("property", {}).get("impressions") == 176)

        timeout = gil.provider_failure_record(
            "api_timeout",
            history_state={"last_known_good": {"as_of": "2026-08-10", "snapshot_sha256": "abc"}},
            site="sc-domain:confenge.com.br",
        )
        ok("timeout_ok_false", timeout.get("ok") is False)
        ok("timeout_null_imps", timeout.get("impressions") is None)
        ok("timeout_null_clicks", timeout.get("clicks") is None)
        ok("timeout_keeps_lkg", timeout.get("last_known_good_preserved") is True)
        ok("timeout_not_zeroed", timeout.get("metrics_zeroed") is False)
        ok("timeout_external", timeout.get("external_evidence") is True)

        missing = sdo.pull_api(7)
        ok("missing_secret_error", missing.get("error") == "missing_credentials")
        ok("missing_secret_null_rows", missing.get("rows") is None)
        ok("missing_secret_external", missing.get("external_evidence") is True)

        leaked = {
            "email": "pessoa@example.com",
            "phone": "11999999999",
            "whatsapp": "11999999999",
            "query": "consulta privada",
            "path": "/x/",
            "commercial_stages": {
                "received_contact": {"status": "UNKNOWN", "value": None, "authority": "warmbly_absent"}
            },
        }
        ok("personal_detected", gil.artifact_contains_personal_field(leaked) is True)
        stripped = gil.redact_personal_fields(leaked)
        ok("personal_stripped", gil.artifact_contains_personal_field(stripped) is False)
        ok("personal_email_gone", "pessoa@example.com" not in json.dumps(stripped) and "email" not in stripped)
        ok("personal_phone_gone", "phone" not in stripped)
        ok("personal_whatsapp_gone", "whatsapp" not in stripped)
        ok("personal_query_key_gone", "query" not in stripped)
        ok(
            "redact_keeps_received_contact",
            (stripped.get("commercial_stages") or {}).get("received_contact", {}).get("status") == "UNKNOWN",
        )
        ok(
            "contact_key_is_not_pii",
            "contact" not in gil.PERSONAL_FIELD_KEYS,
        )

        need_budget = gil.classify_need_class("https://confenge.com.br/quantitativos-orcamento-obras/")
        ok("budget_need_mixed", need_budget.get("need_class") == "mixed")
        ok("budget_not_url_keyword", need_budget.get("url_keyword_classifier") is False)
        need_aditivo = gil.classify_need_class("https://confenge.com.br/aditivos-obras-publicas/")
        ok("aditivo_need_public", need_aditivo.get("need_class") == "public")
        need_home = gil.classify_need_class("https://confenge.com.br/")
        ok("home_need_unknown", need_home.get("need_class") == "unknown")
        ok("home_click_not_brand", need_home.get("home_click_does_not_infer_brand") is True)
        need_unknown = gil.classify_need_class("https://confenge.com.br/conteudos/pagina-sem-contrato/")
        ok("unjoined_need_unknown", need_unknown.get("need_class") == "unknown")

        stages = gil.commercial_stages(impressions=28, clicks=0, warmbly=None)
        ok("proposal_unknown_without_warmbly", stages["proposal"]["status"] == "UNKNOWN")
        ok("proposal_not_zero", stages["proposal"]["value"] is None)
        ok("hire_unknown", stages["hire"]["status"] == "UNKNOWN")
        ok("received_contact_unknown_without_store", stages["received_contact"]["status"] == "UNKNOWN")
        ok("received_contact_not_zero", stages["received_contact"]["value"] is None)
        ok("no_person_join", stages["anonymous_query_not_joined_to_person"] is True)
        ok("one_imp_no_failure_alert", gil.is_failure_alert_forbidden(1, 0) is True)
        capture = gil.join_capture_stages(clicks=6, funnel={"visitor": 3}, warmbly=None)
        ok("capture_visita_observed", capture["visita"]["status"] == "observed" and capture["visita"]["value"] == 3)
        ok("capture_clique_gsc", capture["clique"]["authority"] == "gsc_search_analytics" and capture["clique"]["value"] == 6)
        ok("capture_persistida_unknown", capture["solicitacao_persistida"]["status"] == "UNKNOWN")
        ok("capture_persistida_not_zero", capture["solicitacao_persistida"]["value"] is None)
        ok("capture_qualificada_unknown", capture["oportunidade_qualificada"]["status"] == "UNKNOWN")
        ok("capture_qualificada_not_zero", capture["oportunidade_qualificada"]["value"] is None)
        ok("capture_no_lead_id", capture["lead_id_excluded"] is True)
        ok("capture_no_person_join", capture["anonymous_query_not_joined_to_person"] is True)
        ok("stages_include_capture", (stages.get("capture_stages") or {}).get("clique", {}).get("status") == "observed")

        learning = gil.build_operational_learning(founder)
        ok("learning_not_current", learning.get("freshness") == "NOT_CURRENT")
        ok("learning_queue_max", (learning.get("queue") or {}).get("count", 99) <= 3)
        ok("learning_no_ab", (learning.get("queue") or {}).get("authorizes_ab_test") is False)
        blob = json.dumps(learning)
        ok("learning_no_raw_query", "desonerado e não desonerado" not in blob)
        ok("learning_no_personal", gil.artifact_contains_personal_field(learning) is False)
        learn_pages = learning.get("pages") or []
        ok("learning_has_pages", len(learn_pages) >= 1)
        rc = (learn_pages[0].get("commercial_stages") or {}).get("received_contact") or {}
        ok("learn_received_contact_present", rc.get("status") == "UNKNOWN")
        ok("learn_received_contact_not_zero", rc.get("value") is None)
        ok("learning_no_failure_from_one_imp", all(not c.get("commercial_failure_alert") for c in (learning.get("queue") or {}).get("candidates") or []))
        ok("learning_no_proven_lift", all(c.get("proven_lift") is False for c in (learning.get("queue") or {}).get("candidates") or []))

        behind = json.loads(json.dumps(founder))
        behind["last_data_date"] = "2026-09-05"
        behind["as_of"] = "2026-09-05"
        learn_behind = gil.build_operational_learning(
            behind, search_analytics_today_date=sdo.date(2026, 9, 11)
        )
        delayed_learn = learn_behind.get("delayed") or {}
        ok("learn_behind_delayed", delayed_learn.get("status") == "DELAYED")
        ok("learn_behind_not_zero_filled", delayed_learn.get("zero_filled") is False)
        ok(
            "learn_behind_expected_end_is_pt_last_complete",
            delayed_learn.get("expected_end")
            == gil.search_analytics_last_complete_day(today=sdo.date(2026, 9, 11)).isoformat(),
        )
        ok("learn_behind_expected_end_2026_09_10", delayed_learn.get("expected_end") == "2026-09-10")
        behind_prop = (learn_behind.get("dimensions") or {}).get("property") or {}
        ok("learn_behind_does_not_zero_clicks", behind_prop.get("clicks") == 6)
        ok("learn_behind_does_not_zero_imps", behind_prop.get("impressions") == 176)
        one_imp_page = {
            "pages": [{"page": "https://confenge.com.br/x/", "path": "/x/", "impressions": 1, "clicks": 0}],
            "queries": [],
        }
        tiny_queue = gil.build_learning_queue(one_imp_page)
        ok(
            "one_impression_not_queued_as_failure",
            not any(c.get("diagnosis") == "pertinent_impression_without_click" for c in tiny_queue.get("candidates") or []),
        )

        zip_dir = Path(tempfile.mkdtemp())
        zip_path = zip_dir / "confenge.com.br-Performance-on-Search-2026-09-11.zip"
        import zipfile

        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("Grafico.csv", (founder_dir / "Grafico.csv").read_text(encoding="utf-8"))
            zf.writestr("Consultas.csv", (founder_dir / "Consultas.csv").read_text(encoding="utf-8"))
            zf.writestr("Paginas.csv", (founder_dir / "Paginas.csv").read_text(encoding="utf-8"))
            zf.writestr("Paises.csv", (founder_dir / "Paises.csv").read_text(encoding="utf-8"))
            zf.writestr("Filtros.csv", (founder_dir / "Filtros.csv").read_text(encoding="utf-8"))
            zf.writestr("meta.json", (founder_dir / "meta.json").read_text(encoding="utf-8"))
            zf.writestr("../escape.csv", "x")
            zf.writestr("nested/../../etc/passwd", "root")
        unsafe = False
        try:
            gil.safe_unzip(zip_path, zip_dir / "out")
        except gil.UnsafeZipError:
            unsafe = True
        ok("zip_rejects_traversal", unsafe is True)
        safe_zip = zip_dir / "safe.zip"
        with zipfile.ZipFile(safe_zip, "w") as zf:
            zf.writestr("Grafico.csv", (founder_dir / "Grafico.csv").read_text(encoding="utf-8"))
            zf.writestr("Consultas.csv", (founder_dir / "Consultas.csv").read_text(encoding="utf-8"))
            zf.writestr("Paginas.csv", (founder_dir / "Paginas.csv").read_text(encoding="utf-8"))
            zf.writestr("Paises.csv", (founder_dir / "Paises.csv").read_text(encoding="utf-8"))
            zf.writestr("Filtros.csv", (founder_dir / "Filtros.csv").read_text(encoding="utf-8"))
        zip_payload = gil.import_gsc_zip(
            safe_zip,
            dest=zip_dir / "extracted",
            persist=False,
            extracted_at="2026-09-11",
        )
        ok("zip_property_imps", (zip_payload.get("dimensions") or {}).get("property", {}).get("impressions") == 176)
        ok("zip_name_date_not_last_data", zip_payload.get("last_data_date") != "2026-09-11")
        ok("zip_last_data_from_chart", zip_payload.get("last_data_date") == "2026-09-08")

        ok("parse_num_empty_none", gil.parse_gsc_number("") is None)
        ok("parse_num_not_zero", gil.parse_gsc_number("") != 0)
        ok("parse_pt_percent", abs((gil.parse_gsc_rate("3,41%") or 0) - 0.0341) < 1e-9)
        ok("parse_en_thousands", gil.parse_gsc_number("1,234.5") == 1234.5)
        ok("parse_pt_thousands", gil.parse_gsc_number("1.234,5") == 1234.5)

        windows = sdo.complete_windows(
            today=sdo.date(2026, 9, 11),
            provider_max_date=sdo.date(2026, 9, 8),
            available_dates={sdo.date(2026, 9, 8)},
        )
        ok("pulse_exploratory", windows["pulse"]["exploratory"] is True)
        ok("pulse_not_comparable", windows["pulse"]["comparable"] is False)
        ok("trend_incomplete_observed", windows["trend"]["current"]["observed_complete"] is False)
        ok(
            "trend_comparison_insufficient",
            (windows["trend"].get("comparison") or {}).get("status") == "INSUFFICIENT_EVIDENCE",
        )

        if failures:
            print("FAILURES", failures)
            return 1
        print("ALL search demand tests passed")
        return 0
    finally:
        _restore_committed_gsc(backup)


if __name__ == "__main__":
    raise SystemExit(main())
