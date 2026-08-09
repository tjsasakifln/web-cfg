"""Tests for acquisition-engine delta: CTR gap, service map, bridges, sitemap, growth."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.bridges import inject_bridge, render_bridge_html
from scripts.organic.gsc_loader import load_gsc_dir, normalize_path
from scripts.organic.metrics import commercial_exposure_metrics
from scripts.organic.serp_ctr import expected_ctr, find_ctr_opportunities, is_ctr_gap, load_ctr_config
from scripts.organic.service_map import map_content_to_service
from scripts.organic.sitemap_hygiene import audit_sitemaps, parse_redirects


def test_ctr_config_loaded_not_magic_only():
    cfg = load_ctr_config()
    assert cfg["schema_version"] == "serp-ctr-config-v1"
    assert cfg["min_impressions"] >= 1
    assert cfg["expected_ctr_by_position_band"]
    assert expected_ctr(3.0, cfg) > expected_ctr(10.0, cfg)


def test_ctr_gap_thresholds_configurable(tmp_path: Path):
    cfg = load_ctr_config()
    # competitive pos + impressions + low CTR → gap
    gap = is_ctr_gap(impressions=20, clicks=0, position=5.0, config=cfg)
    assert gap["is_opportunity"] is True
    assert gap["expected_ctr"] > 0
    # high CTR should not flag
    ok = is_ctr_gap(impressions=20, clicks=5, position=5.0, config=cfg)
    assert ok["is_opportunity"] is False
    # below min impressions
    low = is_ctr_gap(impressions=2, clicks=0, position=3.0, config=cfg)
    assert low["is_opportunity"] is False


def test_baseline_priority_urls_in_gsc_2026_08_09():
    gsc = load_gsc_dir(ROOT / "seo" / "gsc-2026-08-09")
    paths = {p["path"] for p in gsc["pages"]}
    assert "/conteudos/sinapi-desonerado-nao-desonerado/" in paths
    assert "/conteudos/chuva-prorrogacao-prazo-obra-publica/" in paths
    assert gsc["devices"]
    mobile = next(d for d in gsc["devices"] if d["device_key"] == "mobile")
    assert mobile["clicks"] == 0
    assert mobile["impressions"] == 94


def test_find_ctr_opportunities_includes_baseline_low_ctr():
    gsc = load_gsc_dir(ROOT / "seo" / "gsc-2026-08-09")
    opps = find_ctr_opportunities(gsc["pages"], root=ROOT, queries=gsc["queries"])
    paths = {o["path"] for o in opps}
    # low CTR competitive pages
    assert "/conteudos/chuva-prorrogacao-prazo-obra-publica/" in paths
    assert "/conteudos/aditivo-qualitativo-quantitativo/" in paths
    # each has structured diagnosis fields
    sample = next(o for o in opps if "sinapi" in o["path"] or "chuva" in o["path"])
    for key in ("title", "h1", "issues", "ctr_gap", "service_fit", "canonical"):
        assert key in sample


def test_content_service_map_examples():
    assert map_content_to_service("/conteudos/sinapi-desonerado-nao-desonerado/")["service_path"] == (
        "/auditoria-orcamento-licitacao/"
    )
    assert map_content_to_service("/conteudos/aditivo-qualitativo-quantitativo/")["service_path"] == (
        "/aditivos-obras-publicas/"
    )
    assert map_content_to_service("/conteudos/glosa-de-medicao-obra-publica/")["service_path"] == (
        "/medicoes-glosas-obras-publicas/"
    )
    assert map_content_to_service("/conteudos/curva-abc-reequilibrio-contrato/")["service_path"] == (
        "/reequilibrio-obras-publicas/"
    )


def test_bridge_html_is_editorial_not_popup():
    fit = map_content_to_service("/conteudos/sinapi-desonerado-nao-desonerado/")
    html = render_bridge_html(fit, source_path="/conteudos/sinapi-desonerado-nao-desonerado/")
    assert "data-commercial-bridge" in html
    assert "popup" not in html.lower()
    assert "urgency" not in html.lower()
    assert fit["service_path"] in html
    assert "origem=" in html  # attribution-preserving query
    # inject into minimal article
    base = "<html><body><article><p>body</p></article></body></html>"
    new, changed = inject_bridge(base, fit, source_path="/conteudos/sinapi-desonerado-nao-desonerado/")
    assert changed
    assert "data-commercial-bridge" in new
    assert new.count("data-commercial-bridge") == 1
    # idempotent replace
    new2, _ = inject_bridge(new, fit, source_path="/conteudos/sinapi-desonerado-nao-desonerado/")
    assert new2.count("data-commercial-bridge") == 1


def test_commercial_metrics_shares():
    pages = [
        {"path": "/conteudos/a/", "impressions": 80, "clicks": 8},
        {"path": "/aditivos-obras-publicas/", "impressions": 20, "clicks": 2},
    ]
    m = commercial_exposure_metrics(pages)
    assert m["informational_impression_share"] == 0.8
    assert m["commercial_impression_share"] == 0.2
    assert m["commercial_click_share"] == 0.2


def test_sitemap_hygiene_and_robots():
    report = audit_sitemaps(ROOT)
    # Must have robots → sitemap-index
    assert report["robots_sitemaps"]
    assert any("sitemap-index.xml" in s for s in report["robots_sitemaps"])
    assert report["url_count"] > 0
    # High severity issues should be empty on healthy main (or listed for fix)
    high = [i for i in report["issues"] if i.get("severity") == "high"]
    # Allow listing but fail test if any high issues — fix before PR
    assert high == [], f"sitemap high issues: {high[:10]}"


def test_legacy_redirects_registry_matches_inventory():
    inv = json.loads((ROOT / "data" / "organic" / "legacy-url-inventory.json").read_text(encoding="utf-8"))
    redirects = parse_redirects((ROOT / "_redirects").read_text(encoding="utf-8"))
    from_paths = {r["from"].rstrip("/") for r in redirects}
    for item in inv["items"]:
        legacy = item["legacy_url"]
        if legacy.startswith("http://") and legacy.rstrip("/").endswith("confenge.com.br"):
            continue  # host-level
        path = legacy.replace("https://confenge.com.br", "").replace("http://confenge.com.br", "")
        path = path.rstrip("/") or "/"
        if item["current_action"] in {"301", "301!", "410"}:
            assert path in from_paths or path + "/" in {r["from"] for r in redirects} or any(
                r["from"].rstrip("/") == path for r in redirects
            ), f"missing redirect for {path}"


def test_engine_emits_serp_ctr_section():
    from scripts.organic.engine import build_opportunities, load_pseo_snapshot
    from scripts.organic.gsc_loader import load_gsc_dir

    gsc = load_gsc_dir(ROOT / "seo" / "gsc-2026-08-09")
    snap = load_pseo_snapshot(ROOT / "data" / "pseo")
    pages = [
        {
            "Páginas principais": p["url"],
            "Cliques": p["clicks"],
            "Impressões": p["impressions"],
            "Posição": p["position"],
        }
        for p in gsc["pages"]
    ]
    doc = build_opportunities(snap, gsc_pages=pages, gsc_queries=None, as_of="2026-08-09")
    assert "serp_ctr_opportunities" in doc
    assert doc["counts"].get("serp_ctr_gap", 0) >= 1
    assert doc.get("serp_ctr_config_ref")


def test_cli_growth_and_run(tmp_path: Path):
    from scripts.organic.__main__ import main

    out = tmp_path / "SEO_OPPORTUNITIES.json"
    code = main(
        [
            "run",
            "--gsc-dir",
            str(ROOT / "seo" / "gsc-2026-08-09"),
            "--out",
            str(out),
            "--as-of",
            "2026-08-09",
        ]
    )
    assert code == 0
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["counts"]["total"] > 0
    assert "commercial_exposure_metrics" in data
    assert data["gsc_export"]["export_id"] == "gsc-2026-08-09"

    gj = tmp_path / "growth.json"
    gm = tmp_path / "growth.md"
    code2 = main(
        [
            "growth",
            "--gsc-dir",
            str(ROOT / "seo" / "gsc-2026-08-09"),
            "--out",
            str(gj),
            "--md",
            str(gm),
        ]
    )
    assert code2 == 0
    growth = json.loads(gj.read_text(encoding="utf-8"))
    assert growth["schema_version"] == "organic-growth-report-v1"
    assert growth["actions"]
    assert "ctr_gap" in growth["sections"]
    assert gm.exists() and "Organic Growth Report" in gm.read_text(encoding="utf-8")


def test_normalize_path_http_https():
    assert normalize_path("http://confenge.com.br/blog") == "/blog/"
    assert normalize_path("https://confenge.com.br/conteudos/x/") == "/conteudos/x/"
