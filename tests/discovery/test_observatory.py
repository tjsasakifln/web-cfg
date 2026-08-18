"""Drive the shipped observatory report/eligibility/metric functions."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.discovery.eligibility import (
    eligibility_defects,
    is_publicable,
    publicable_urls,
)
from scripts.discovery.inspect import inspect_asset, load_sitemap_urls, structured_data_matches_visible
from scripts.discovery.metrics import MetricStageError, count_event, may_count
from scripts.discovery.registry import load_allowlist, load_cohort, publicable_assets
from scripts.discovery.report import build_report, dump_stable, format_report
from scripts.discovery.schema import METRIC_STAGES, REQUIRED_ASSET_FIELDS, REQUIRED_CATEGORIES

AS_OF = "2026-08-16T00:00:00Z"


def test_cohort_covers_required_categories_and_size():
    cohort = load_cohort(root=ROOT)
    categories = {asset["category"] for asset in cohort["assets"]}
    assert 5 <= len(cohort["assets"]) <= 10
    for required in REQUIRED_CATEGORIES:
        assert required in categories
    ids = [asset["id"] for asset in cohort["assets"]]
    assert "utility-diagnostico-defesa-margem" in ids
    assert "contract-analysis-hub" in ids
    assert "market-answer-aditivos-margem" in ids
    assert "valor-tipico-contratos-pavimentacao" in ids
    assert "methodology-inteligencia" in ids
    assert "author-tiago-sasaki" in ids
    assert "offer-defesa-margem" in ids
    assert "flagship-radar-nacional" in ids
    assert "fixture-only-citation-kit" in ids


def test_fixture_and_noindex_excluded_from_publicable_and_indexnow():
    report = build_report(root=ROOT, generated_at=AS_OF)
    fixture_ids = set(report["fixture_ids"])
    assert "fixture-only-citation-kit" in fixture_ids
    publicable = set(report["publicable_urls"])
    indexnow = set(report["indexnow_candidates"])
    allowlist = set(load_allowlist(root=ROOT)["urls"])
    for record in report["assets"]:
        if record["fixture"] or record["noindex"] or record["index_intent"] == "DO_NOT_INDEX":
            assert record["canonical"] not in publicable
            assert record["canonical"] not in indexnow
            assert record["indexnow_eligible"] is False
            if record["canonical"]:
                assert record["canonical"] not in allowlist
    assert None not in publicable
    registry_publicable = publicable_assets(load_cohort(root=ROOT))
    for asset in registry_publicable:
        assert asset.get("fixture") is not True
        assert asset.get("index_intent") == "INDEX"


def test_canonical_robots_sitemap_consistency_on_shipped_inspect():
    cohort = load_cohort(root=ROOT)
    sitemap = load_sitemap_urls(ROOT)
    inspections = {}
    for asset in cohort["assets"]:
        inspected = inspect_asset(asset, root=ROOT)
        inspections[asset["id"]] = inspected
        defects = eligibility_defects(asset, inspected)
        if asset.get("index_intent") == "DO_NOT_INDEX" and inspected.get("http", {}).get("local_file") == "present":
            assert "noindex" in str(inspected.get("robots_meta")).lower() or asset.get("noindex") is True
            assert inspected.get("sitemap") is False
            assert asset.get("canonical") not in sitemap
        if asset.get("index_intent") == "INDEX" and inspected.get("http", {}).get("local_file") == "present":
            assert "noindex" not in str(inspected.get("robots_meta")).lower()
            assert inspected.get("sitemap") is True
            assert asset.get("canonical") in sitemap
        if asset.get("fixture"):
            assert "fixture" in defects
            assert is_publicable(asset, inspected) is False
    assert publicable_urls(cohort["assets"], inspections)


def test_structured_data_matches_visible_on_live_pages():
    cohort = load_cohort(root=ROOT)
    for asset in cohort["assets"]:
        if asset.get("fixture"):
            continue
        inspected = inspect_asset(asset, root=ROOT)
        if inspected.get("http", {}).get("local_file") != "present":
            continue
        visible = {
            "title": inspected.get("title"),
            "h1": inspected.get("h1"),
            "description": inspected.get("description"),
            "canonical": inspected.get("declared_canonical") or asset.get("canonical"),
        }
        defects = structured_data_matches_visible(visible, inspected.get("jsonld") or [])
        assert defects == []
        assert inspected.get("structured_data_defects") == []
    invented = structured_data_matches_visible(
        {
            "title": "Diagnóstico de Defesa de Margem em Contratos Públicos | CONFENGE",
            "h1": "Diagnóstico de Defesa de Margem em Contratos Públicos",
            "description": "Leitura factual de um contrato público com fontes e UNKNOWN.",
            "canonical": "https://confenge.com.br/ferramentas/diagnostico-defesa-margem/",
        },
        [
            {
                "@type": "WebApplication",
                "name": "Completely unrelated widget",
                "description": "Receita de bolo de chocolate sem qualquer relação contratual.",
                "url": "https://example.com/other",
            }
        ],
    )
    assert "structured_data_name_mismatch" in invented
    assert "structured_data_description_mismatch" in invented
    assert "structured_data_url_mismatch" in invented


def test_report_records_required_fields_and_unknown_externals():
    report = build_report(root=ROOT, generated_at=AS_OF)
    assert report["metric_stages"] == list(METRIC_STAGES)
    assert report["network_probed"] is False
    assert report["llms_txt_strategy"] is False
    assert report["recommendation"] in {"READY_FOR_APPROVED_ASSET", "ADJUST", "STOP"}
    for record in report["assets"]:
        for field in REQUIRED_ASSET_FIELDS:
            assert field in record
        assert record["google_index_state"] == "UNKNOWN"
        assert record["bing_index_state"] == "UNKNOWN"
        assert record["gsc_state"] == "UNKNOWN"
        assert record["generative_ai_visibility"] == "UNKNOWN"
        assert record["chatgpt_ai_referrals"] == "UNKNOWN"
        assert record["citations"] == "UNKNOWN"
        assert record["referring_domains"] == "UNKNOWN"
        stages = record["metric_stages"]
        assert list(stages) == list(METRIC_STAGES)
        for stage in METRIC_STAGES:
            assert stages[stage]["status"] == "UNKNOWN"


def test_metric_stages_refuse_collapsed_counts():
    with pytest.raises(MetricStageError, match="forbidden_count:bot_hit->CITATION"):
        count_event("bot_hit", "CITATION")
    with pytest.raises(MetricStageError, match="forbidden_count:impression->ENGAGEMENT"):
        count_event("impression", "ENGAGEMENT")
    with pytest.raises(MetricStageError, match="forbidden_count:referral->LEAD/PIPELINE"):
        count_event("referral", "LEAD/PIPELINE")
    with pytest.raises(MetricStageError, match="forbidden_count:indexnow_receipt->INDEX/APPEARANCE"):
        count_event("indexnow_receipt", "INDEX/APPEARANCE")
    assert may_count("bot_hit", "CITATION") is False
    assert may_count("impression", "ENGAGEMENT") is False
    assert may_count("referral", "LEAD/PIPELINE") is False
    count_event("citation", "CITATION")
    count_event("session", "ENGAGEMENT")
    count_event("lead", "LEAD/PIPELINE")
    count_event("referral", "REFERRAL")


def test_report_is_deterministic_across_two_builds():
    first = dump_stable(build_report(root=ROOT, generated_at=AS_OF))
    second = dump_stable(build_report(root=ROOT, generated_at=AS_OF))
    assert first == second
    text_a = format_report(build_report(root=ROOT, generated_at=AS_OF))
    text_b = format_report(build_report(root=ROOT, generated_at=AS_OF))
    assert text_a == text_b


def test_cli_report_matches_shipped_builder():
    expected = format_report(build_report(root=ROOT, generated_at=AS_OF))
    proc = subprocess.run(
        [sys.executable, "-m", "scripts.discovery", "report", "--as-of", AS_OF],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    assert proc.stdout == expected
    assert "ELIGIBILITY" in proc.stdout
    assert "INDEX/APPEARANCE" in proc.stdout
    assert "CITATION" in proc.stdout
    assert "REFERRAL" in proc.stdout
    assert "ENGAGEMENT" in proc.stdout
    assert "LEAD/PIPELINE" in proc.stdout
    assert "READY_FOR_APPROVED_ASSET" in proc.stdout


def test_cli_json_round_trip_is_stable():
    proc = subprocess.run(
        [sys.executable, "-m", "scripts.discovery", "report", "--json", "--as-of", AS_OF],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    payload = proc.stdout[proc.stdout.index("{") :]
    parsed = json.loads(payload)
    assert parsed == build_report(root=ROOT, generated_at=AS_OF)
