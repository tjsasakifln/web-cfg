"""Dynamic news discovery stays separate from the static page census."""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

import pytest

from scripts.organic.sitemap_graph import (
    CONTRACT_NEWS_SITEMAP,
    CONTRACT_NEWS_SITEMAP_FILE,
    SITE,
    audit_graph,
    close_graph,
    render_sitemap_index,
    render_urlset,
    robots_with_index_only,
)

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def news_site(tmp_path: Path) -> Path:
    (tmp_path / "index.html").write_text(
        f'<html><head><link rel="canonical" href="{SITE}/"></head><body><h1>Home</h1></body></html>'
    )
    (tmp_path / "sitemap.xml").write_text(render_urlset([(f"{SITE}/", None)]))
    (tmp_path / "sitemap-index.xml").write_text(render_sitemap_index([(f"{SITE}/sitemap.xml", None)]))
    (tmp_path / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap-index.xml\nSitemap: {CONTRACT_NEWS_SITEMAP}\n"
    )
    for name in ["runtime/contract.json", "runtime/lib/server.mjs", "runtime/contract-news/server.mjs", CONTRACT_NEWS_SITEMAP_FILE]:
        dest = tmp_path / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes((ROOT / name).read_bytes())
    return tmp_path


def test_dynamic_archive_is_advertised_without_inventing_static_articles(news_site: Path):
    report = audit_graph(news_site)
    assert report["ok"], report["issues"]
    assert report["static_url_count"] == report["url_count"] == 1
    assert report["locs"] == [f"{SITE}/"]
    assert report["dynamic_sitemaps"] == [{
        "loc": CONTRACT_NEWS_SITEMAP, "scope": "durable_runtime_archive",
        "included_in_static_url_count": False, "http_checked": False, "url_count": None,
    }]
    closed = close_graph(news_site)
    assert closed["ok"], closed["issues"]
    assert CONTRACT_NEWS_SITEMAP in (news_site / "robots.txt").read_text()
    assert CONTRACT_NEWS_SITEMAP not in (news_site / "sitemap-index.xml").read_text()


@pytest.mark.parametrize("path", ["runtime/contract.json", "runtime/lib/server.mjs", "runtime/contract-news/server.mjs"])
def test_dynamic_announcement_requires_contract_and_implemented_handler(news_site: Path, path: str):
    (news_site / path).unlink()
    report = audit_graph(news_site)
    assert not report["ok"]
    assert any(item["code"] == "dynamic_sitemap_handler_missing" for item in report["issues"])
    assert CONTRACT_NEWS_SITEMAP not in robots_with_index_only((news_site / "robots.txt").read_text(), root=news_site)


def test_wrong_prefix_does_not_authorize_a_dynamic_family(news_site: Path):
    contract = news_site / "runtime/contract.json"
    value = json.loads(contract.read_text())
    value["contract_news_prefix"] = "/noticias/"
    contract.write_text(json.dumps(value))
    assert not audit_graph(news_site)["ok"]


@pytest.mark.parametrize("contents", [None, "<html>not XML</html>", render_urlset([(SITE + "/noticias/contratos-publicos/example/", None)])])
def test_dynamic_announcement_requires_a_real_empty_shell_xml(news_site: Path, contents: str | None):
    shell = news_site / CONTRACT_NEWS_SITEMAP_FILE
    if contents is None:
        shell.unlink()
    else:
        shell.write_text(contents)
    report = audit_graph(news_site)
    assert not report["ok"]
    assert any(item["code"] == "dynamic_sitemap_shell_invalid" for item in report["issues"])


@pytest.mark.parametrize("other", [
    SITE + "/noticias/contratos-publicos/news-sitemap.xml",
    SITE + "/noticias/contratos-publicos/sitemap.xml?override=1",
    "https://example.com/noticias/contratos-publicos/sitemap.xml",
    SITE + "/another/sitemap.xml",
])
def test_only_the_exact_declared_sitemap_is_exempt(news_site: Path, other: str):
    robots = news_site / "robots.txt"
    robots.write_text(robots.read_text() + f"Sitemap: {other}\n")
    report = audit_graph(news_site)
    assert not report["ok"]
    assert any(item["code"] == "robots_lists_non_index_sitemap" for item in report["issues"])
    repaired = robots_with_index_only(robots.read_text(), root=news_site)
    assert f"Sitemap: {other}\n" not in repaired
    assert f"Sitemap: {CONTRACT_NEWS_SITEMAP}\n" in repaired


def test_pseo_patcher_keeps_only_the_declared_news_sitemap(news_site: Path, monkeypatch):
    from scripts.pseo import build
    monkeypatch.setattr(build, "ROOT", news_site)
    robots = news_site / "robots.txt"
    robots.write_text(robots.read_text() + f"Sitemap: {SITE}/sitemap-spare.xml\n")
    build.patch_main_sitemap_index()
    assert CONTRACT_NEWS_SITEMAP in robots.read_text()
    assert "sitemap-spare.xml" not in robots.read_text()
    before = robots.read_bytes()
    build.patch_main_sitemap_index()
    assert robots.read_bytes() == before


def test_news_discovery_survives_hub_generation_without_changing_approved_chrome(tmp_path: Path, monkeypatch):
    from scripts.pseo import build
    captured = {}
    monkeypatch.setattr(build, "ROOT", tmp_path)
    monkeypatch.setattr(build, "write_public_html", lambda path, html: captured.__setitem__(path.relative_to(tmp_path).as_posix(), html))
    build.render_hubs([])
    html = captured["inteligencia/index.html"]
    before, rest = html.split('<main', 1)
    main, after = rest.split('</main>', 1)
    assert 'href="/noticias/contratos-publicos/"' in main
    assert 'data-news-discovery="true"' in main
    assert 'href="/noticias/contratos-publicos/"' not in before + after


@pytest.mark.parametrize("http_status,body,expected", [
    (200, render_urlset([(SITE + "/noticias/contratos-publicos/", None), (SITE + "/noticias/contratos-publicos/obra-citada/", None)]), True),
    (503, "Notícias indisponíveis", False),
    (200, "<html>Erro</html>", False),
    (200, render_urlset([("https://example.com/noticias/contratos-publicos/obra/", None)]), False),
])
def test_live_audit_checks_real_http_separately(news_site: Path, http_status: int, body: str, expected: bool):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            assert self.path == "/noticias/contratos-publicos/sitemap.xml"
            self.send_response(http_status)
            self.send_header("Content-Type", "application/xml")
            self.end_headers()
            self.wfile.write(body.encode())

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        report = audit_graph(news_site, runtime_base_url=f"http://127.0.0.1:{server.server_port}")
    finally:
        server.shutdown()
        thread.join()
        server.server_close()
    assert report["ok"] is expected, report["issues"]
    assert report["static_url_count"] == 1
    assert report["dynamic_sitemaps"][0]["http_checked"] is True
    assert report["dynamic_sitemaps"][0]["url_count"] == (2 if expected else None)
    assert any(item["code"] == "dynamic_sitemap_http_failed" for item in report["issues"]) is not expected
