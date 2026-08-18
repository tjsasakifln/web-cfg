"""Drive the shipped four-URL campaign overlay — not a reimplementation."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.discovery.campaign_overlay import (
    CAMPAIGN_STAGES,
    FROZEN_COHORT,
    build_stage_report,
    campaign_urls,
    format_stage_report,
    gsc_page_evidence,
    inspect_local,
    refuse_collapsed_stage,
)
from scripts.discovery.http_client import FakeTransport, ProbeResponse
from scripts.discovery.metrics import MetricStageError
from scripts.discovery.registry import load_cohort
from scripts.discovery.url_inspection import founder_manual_checklist, inspect_urls

AS_OF = "2026-08-18T00:00:00Z"


def test_overlay_does_not_replace_86_registry():
    cohort = load_cohort(root=ROOT)
    ids = {asset["id"] for asset in cohort["assets"]}
    assert "valor-tipico-contratos-pavimentacao" in ids
    assert "fixture-only-citation-kit" in ids
    assert 5 <= len(cohort["assets"]) <= 10
    report = build_stage_report(root=ROOT, generated_at=AS_OF, live=False)
    assert report["replaces_86_registry"] is False
    assert report["llms_txt_strategy"] is False
    assert set(campaign_urls()) == {row["canonical"] for row in FROZEN_COHORT}
    assert len(report["assets"]) == 4


def test_local_reproof_of_four_urls_and_no_new_public_path():
    report = build_stage_report(root=ROOT, generated_at=AS_OF, live=False)
    assert report["new_public_url_created"] is False
    for asset in FROZEN_COHORT:
        local = inspect_local(asset, root=ROOT)
        assert local["http"]["local_file"] == "present"
        assert local["self_canonical"] is True
        assert local["indexable_robots"] is True
        assert local["sitemap"] is True
        assert local["cta"]["cta_present"] is True
        assert local["copy_changed"] is False
        for bot in ("Googlebot", "Bingbot", "OAI-SearchBot"):
            assert local["bot_policy"]["bots"][bot] == "allowed_via_star"
    for record in report["assets"]:
        assert record["copy_changed"] is False
        for stage in CAMPAIGN_STAGES:
            cell = record["stages"][stage]
            assert cell["status"] in {"TRUE", "FALSE", "UNKNOWN", "BLOCKED"}
            assert cell["source"]
            assert cell["freshness"]
            assert cell["owner"]
            assert cell["next_action"]


def test_stages_refuse_collapsed_counts():
    with pytest.raises(MetricStageError):
        refuse_collapsed_stage("impression", "ENGAGEMENT")
    with pytest.raises(MetricStageError):
        refuse_collapsed_stage("impression", "REFERRAL")
    with pytest.raises(MetricStageError):
        refuse_collapsed_stage("indexnow_receipt", "INDEX/APPEARANCE")
    with pytest.raises(MetricStageError):
        refuse_collapsed_stage("bot_hit", "CITATION")
    with pytest.raises(MetricStageError):
        refuse_collapsed_stage("crawler_hit", "CITATION")


def test_gsc_page_evidence_preserves_missing_as_unknown():
    first, second = campaign_urls()[:2]
    evidence = gsc_page_evidence(
        {
            "queries": [
                {"date": "2026-08-10", "page": first, "impressions": 3, "clicks": 0},
                {"date": "2026-08-11", "page": first, "impressions": 2, "clicks": 1},
            ]
        }
    )
    assert evidence[first] == {
        "returned_rows": 2,
        "impressions": 5.0,
        "clicks": 1.0,
        "max_date": "2026-08-11",
    }
    assert second not in evidence


def test_url_inspection_unknown_without_creds_and_no_indexing_api():
    result = inspect_urls(campaign_urls(), inspected_at=AS_OF)
    assert result["indexing_api_called"] is False
    assert result["error"] == "missing_credentials"
    for row in result["inspections"]:
        assert row["index_state"] == "UNKNOWN"
        assert row["indexing_api_called"] is False
        assert row["inspected_at"] == AS_OF
    text = founder_manual_checklist(
        [{"url": u, "technical_state": "LOCAL_OK", "inspection_field": "UNKNOWN"} for u in campaign_urls()],
        inspected_at=AS_OF,
    )
    assert "Solicitar indexação" in text
    for url in campaign_urls():
        assert url in text
    assert "Indexing API" in text


def test_live_reproof_uses_shipped_transport_seam():
    from scripts.discovery.campaign_overlay import reprove_live

    asset = FROZEN_COHORT[0]
    html = (ROOT / asset["local_path"]).read_text(encoding="utf-8")
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    sm_int = (ROOT / "sitemap-inteligencia.xml").read_text(encoding="utf-8")
    fake = FakeTransport()
    fake.add("GET", asset["canonical"], ProbeResponse("GET", asset["canonical"], 200, body=html.encode()))
    fake.add(
        "GET",
        "https://confenge.com.br/robots.txt",
        ProbeResponse("GET", "https://confenge.com.br/robots.txt", 200, body=robots.encode()),
    )
    fake.add(
        "GET",
        "https://confenge.com.br/sitemap.xml",
        ProbeResponse("GET", "https://confenge.com.br/sitemap.xml", 200, body=sitemap.encode()),
    )
    fake.add(
        "GET",
        "https://confenge.com.br/sitemap-inteligencia.xml",
        ProbeResponse(
            "GET",
            "https://confenge.com.br/sitemap-inteligencia.xml",
            200,
            body=sm_int.encode(),
        ),
    )
    reproof = reprove_live(asset, root=ROOT, transport=fake)
    assert reproof["http_status"] == 200
    assert reproof["self_canonical"] is True
    assert reproof["sitemap"] is True
    assert reproof["cta"]["cta_present"] is True
    assert reproof["copy_changed"] is False


def test_cli_campaign_report_twice_is_stable():
    cmd = [
        sys.executable,
        "-m",
        "scripts.discovery",
        "campaign-report",
        "--as-of",
        AS_OF,
    ]
    first = subprocess.run(cmd, cwd=ROOT, check=True, capture_output=True, text=True)
    second = subprocess.run(cmd, cwd=ROOT, check=True, capture_output=True, text=True)
    assert first.stdout == second.stdout
    expected = format_stage_report(build_stage_report(root=ROOT, generated_at=AS_OF, live=False))
    assert first.stdout == expected
    for url in campaign_urls():
        assert url in first.stdout
    for stage in CAMPAIGN_STAGES:
        assert f"{stage}:" in first.stdout
    assert "BLOCKED" in first.stdout or "UNKNOWN" in first.stdout
