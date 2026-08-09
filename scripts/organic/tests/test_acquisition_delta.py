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
    real_gaps = [o for o in opps if o.get("kind") == "ctr_gap"]
    gap_paths = {o["path"] for o in real_gaps}
    # low CTR competitive pages must be real gaps
    assert "/conteudos/chuva-prorrogacao-prazo-obra-publica/" in gap_paths
    assert "/conteudos/aditivo-qualitativo-quantitativo/" in gap_paths
    # each has structured diagnosis fields
    sample = next(o for o in real_gaps if "sinapi" in o["path"] or "chuva" in o["path"])
    for key in ("title", "h1", "issues", "ctr_gap", "service_fit", "canonical"):
        assert key in sample


def test_brand_suffix_title_not_clickbait():
    from scripts.organic.serp_ctr import diagnose_page_html

    html = (
        "<html><head><title>SINAPI desonerado ou não: qual base o edital exige | CONFENGE</title>"
        '<meta name="description" content="Diferença nos encargos."/>'
        '<link rel="canonical" href="https://confenge.com.br/conteudos/sinapi-desonerado-nao-desonerado/"/>'
        "</head><body><h1>SINAPI desonerado</h1></body></html>"
    )
    diag = diagnose_page_html(
        "/conteudos/sinapi-desonerado-nao-desonerado/",
        html,
        gsc={"impressions": 89, "clicks": 1, "position": 7.27, "ctr": 0.0112},
    )
    assert "clickbait_title_pattern" not in (diag.get("issues") or [])
    assert not diag.get("clickbait_flags")


def test_high_ctr_priority_not_ctr_gap_action():
    """bdi-diferenciado has high CTR — must not be classed as ctr_gap with zero-click narrative."""
    from scripts.organic.growth_report import build_growth_report

    gsc_dir = ROOT / "seo" / "gsc-2026-08-09"
    doc = build_growth_report(ROOT, gsc_dir)
    gap_urls = {a["url"] for a in doc["actions"] if a.get("class") == "ctr_gap"}
    assert "/conteudos/bdi-diferenciado-obra-publica/" not in gap_urls
    # section ctr_gap must only list real gaps
    for o in doc["sections"]["ctr_gap"]:
        assert o.get("kind") == "ctr_gap" or (o.get("ctr_gap") or {}).get("is_opportunity")
        assert "sem clique" not in (o.get("kind") or "")
    # healthy high-CTR priority may appear as benchmark only
    bench_paths = {o["path"] for o in doc["sections"].get("priority_benchmarks") or []}
    if "/conteudos/bdi-diferenciado-obra-publica/" in {
        p["path"] for p in (load_gsc_dir(gsc_dir)["pages"])
    }:
        # if force-included as benchmark, it is not a gap
        bdi = next(
            (
                o
                for o in (doc["sections"].get("priority_benchmarks") or [])
                if "bdi-diferenciado" in o["path"]
            ),
            None,
        )
        if bdi:
            assert bdi.get("kind") == "priority_benchmark"
            assert not (bdi.get("ctr_gap") or {}).get("is_opportunity")
    # no action claims "sem clique" for pages that have clicks
    for a in doc["actions"]:
        if a.get("class") != "ctr_gap":
            continue
        clicks = float((a.get("evidence") or {}).get("clicks") or 0)
        if clicks > 0:
            assert "zero cliques" not in (a.get("why_it_matters") or "").lower()
            assert "sem clique" not in (a.get("why_it_matters") or "").lower()


def test_priority_og_title_matches_title():
    import re

    priority = [
        "conteudos/sinapi-desonerado-nao-desonerado",
        "conteudos/chuva-prorrogacao-prazo-obra-publica",
        "conteudos/aditivo-qualitativo-quantitativo",
        "conteudos/prazo-vigencia-prazo-execucao-contrato-obra",
        "conteudos/glosa-de-medicao-obra-publica",
        "conteudos/medicao-de-obra-publica-rejeitada",
        "conteudos/curva-abc-reequilibrio-contrato",
        "conteudos/bdi-diferenciado-obra-publica",
    ]
    for rel in priority:
        html = (ROOT / rel / "index.html").read_text(encoding="utf-8")
        title = re.search(r"<title>([^<]+)</title>", html, re.I)
        assert title, rel
        og = re.search(
            r'property=["\']og:title["\'][^>]+content=["\']([^"\']*)["\']', html, re.I
        ) or re.search(
            r'content=["\']([^"\']*)["\'][^>]+property=["\']og:title["\']', html, re.I
        )
        assert og, f"missing og:title on {rel}"
        assert title.group(1).strip() == og.group(1).strip(), (
            f"{rel}: title={title.group(1)!r} og={og.group(1)!r}"
        )


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
    # query/fragment must not create duplicate indexable paths
    assert normalize_path("https://confenge.com.br/conteudos/x/?utm=1") == "/conteudos/x/"
    assert normalize_path("https://confenge.com.br/conteudos/x/#section") == "/conteudos/x/"
    assert normalize_path("https://www.confenge.com.br/blog") == "/blog/"


def test_gsc_loader_adversarial_decimals_total_bom(tmp_path: Path):
    import csv as csv_mod

    from scripts.organic.gsc_loader import (
        _is_total_or_junk_label,
        load_csv,
        load_devices,
        load_gsc_dir,
        load_page_device,
        load_pages,
    )

    # comma decimal + % + TOTAL row + BOM
    csv_body = (
        "\ufeffPáginas principais,Cliques,Impressões,CTR,Posição\n"
        "https://confenge.com.br/conteudos/a/,1,20,\"5,00%\",\"3,5\"\n"
        "TOTAL,10,100,10%,1\n"
        "https://confenge.com.br/conteudos/b/?q=1,0,12,0%,8.2\n"
    )
    p = tmp_path / "Paginas.csv"
    p.write_text(csv_body, encoding="utf-8")
    rows = load_csv(p)
    pages = load_pages(rows)
    paths = {x["path"] for x in pages}
    assert "/conteudos/a/" in paths
    assert "/conteudos/b/" in paths
    assert not any("total" in (x.get("url") or "").lower() for x in pages)
    a = next(x for x in pages if x["path"] == "/conteudos/a/")
    assert abs(a["ctr"] - 0.05) < 1e-6
    assert abs(a["position"] - 3.5) < 1e-6

    # TOTAL device row must not inflate devices_impressions_sum (TOTAL 100 + rows)
    dev_csv = (
        "Dispositivo,Cliques,Impressões,CTR,Posição\n"
        "TOTAL,10,100,10%,1\n"
        "Celular,2,20,10%,5\n"
        "Computador,8,80,10%,3\n"
    )
    devices = load_devices(list(csv_mod.DictReader(dev_csv.splitlines())))
    assert len(devices) == 2
    assert sum(d["impressions"] for d in devices) == 100  # not 200 with TOTAL
    assert all(d["device_key"] in {"mobile", "desktop"} for d in devices)
    assert not any(_is_total_or_junk_label(d["device"]) for d in devices)

    # TOTAL page×device must not become path /TOTAL/
    pd_csv = (
        "Página,Dispositivo,Cliques,Impressões,CTR,Posição\n"
        "TOTAL,Celular,1,50,2%,4\n"
        "https://confenge.com.br/conteudos/a/,Celular,1,20,5%,3.5\n"
        "https://confenge.com.br/conteudos/a/,TOTAL,1,20,5%,3.5\n"
    )
    pd_rows = load_page_device(list(csv_mod.DictReader(pd_csv.splitlines())))
    assert len(pd_rows) == 1
    assert pd_rows[0]["path"] == "/conteudos/a/"
    assert not any("/total" in (r.get("path") or "").lower() for r in pd_rows)

    # empty dir still loads
    empty = tmp_path / "gsc-empty"
    empty.mkdir()
    g = load_gsc_dir(empty)
    assert g["pages"] == []
    assert "aggregation_note" in g
    # missing device CSVs are empty, not fatal
    assert g["devices"] == []
    assert g["page_device"] == []

def test_parse_redirects_netlify_variants():
    text = """
# comment
/from-a  /to-a
/from-b  /to-b  301
/from-c  /to-c  301!
/from-d  /404.html  410
https://old.example/*  https://new.example/:splat  301!
/path  /other?x=1  301
"""
    rules = parse_redirects(text)
    by_from = {r["from"]: r for r in rules}
    assert by_from["/from-a"]["status"] == "301"  # default
    assert by_from["/from-a"]["to"] == "/to-a"
    assert by_from["/from-b"]["status"] == "301"
    assert by_from["/from-c"]["status"] == "301!"
    assert by_from["/from-d"]["status"] == "410"
    assert "https://old.example/*" in by_from
    assert by_from["/path"]["to"] == "/other?x=1"
    # 2-token rules must NOT be silently dropped
    assert len(rules) == 6


def test_origem_preserves_query_and_fragment():
    from scripts.organic.bridges import with_origem

    assert with_origem("/svc/", "/conteudos/x/") == "/svc/?origem=/conteudos/x"
    # existing query
    out = with_origem("/svc/?foo=1", "/conteudos/x/")
    assert "foo=1" in out and "origem=" in out and out.startswith("/svc/?")
    # fragment
    out2 = with_origem("/#contato", "/conteudos/x/")
    assert out2.startswith("?") or "?origem=" in out2
    assert out2.endswith("#contato")
    # query + fragment
    out3 = with_origem("/svc/?a=1#sec", "/conteudos/y/")
    assert "a=1" in out3 and "origem=" in out3 and out3.endswith("#sec")


def test_soft_bridge_when_article_aside_present():
    from scripts.organic.bridges import inject_bridge, render_bridge_html

    fit = map_content_to_service("/conteudos/sinapi-desonerado-nao-desonerado/")
    # full button when no aside
    full = render_bridge_html(fit, source_path="/conteudos/sinapi-desonerado-nao-desonerado/", soft=False)
    assert "button-secondary" in full
    assert 'data-bridge-mode="soft"' not in full
    # soft when aside already commercial
    soft = render_bridge_html(fit, source_path="/conteudos/sinapi-desonerado-nao-desonerado/", soft=True)
    assert "button-secondary" not in soft
    assert 'data-bridge-mode="soft"' in soft
    assert "text-link" in soft

    base = (
        "<html><body><article><p>body</p></article>"
        '<aside class="article-aside"><div class="aside-card">'
        '<a class="button button-primary" href="https://wa.me/1">WA</a>'
        '<a href="/auditoria-orcamento-licitacao/">svc</a></div></aside>'
        "</body></html>"
    )
    new, changed = inject_bridge(
        base, fit, source_path="/conteudos/sinapi-desonerado-nao-desonerado/"
    )
    assert changed
    assert 'data-bridge-mode="soft"' in new
    assert new.count("button-secondary") == 0  # no second commercial button


def test_small_sample_confidence_is_low():
    from scripts.organic.serp_ctr import diagnose_page_html

    html = (
        "<html><head><title>T | CONFENGE</title>"
        '<meta name="description" content="d"/>'
        '<link rel="canonical" href="https://confenge.com.br/conteudos/x/"/>'
        "</head><body><h1>T</h1></body></html>"
    )
    diag = diagnose_page_html(
        "/conteudos/x/",
        html,
        gsc={"impressions": 12, "clicks": 0, "position": 4.0, "ctr": 0.0},
    )
    assert diag["confidence"] <= 0.35
    assert diag["sample_quality"] in {"very_low", "anecdotal", "very_low+noindex"}
    assert "hypothesis" in (diag.get("evidence_note") or "").lower() or "heuristic" in (
        diag.get("evidence_note") or ""
    ).lower()


def test_trabalhe_conosco_is_410_not_commercial_contact():
    inv = json.loads((ROOT / "data" / "organic" / "legacy-url-inventory.json").read_text(encoding="utf-8"))
    item = next(i for i in inv["items"] if "trabalhe-conosco" in i["legacy_url"])
    assert item["current_action"] == "410"
    rules = parse_redirects((ROOT / "_redirects").read_text(encoding="utf-8"))
    rule = next(r for r in rules if r["from"].rstrip("/") == "/trabalhe-conosco")
    assert rule["status"].startswith("410")


def test_live_bridges_soft_when_aside_present():
    """Shipped sinapi page must not stack a second commercial button next to article-aside."""
    html = (ROOT / "conteudos/sinapi-desonerado-nao-desonerado/index.html").read_text(encoding="utf-8")
    assert 'data-commercial-bridge="1"' in html
    assert 'data-bridge-mode="soft"' in html
    # extract bridge block only
    import re

    m = re.search(r'<aside class="editorial-bridge commercial-bridge".*?</aside>', html, re.S | re.I)
    assert m
    bridge = m.group(0)
    assert "button-secondary" not in bridge
    assert "origem=" in bridge
