from __future__ import annotations

import copy
import hashlib
import json
import os
import select
import shutil
import subprocess
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from deploy.netcup.lib import release_control
from scripts.site import contract_news_runtime as news
from scripts.site import public_server_acceptance as acceptance
from scripts.site.test_public_server_acceptance import (
    HOME, SHA, _FakeTime, _asset_fetcher, _fixture, _html_fetcher, _identity_fetcher,
)

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")


def _write_snapshot(directory: Path, state: str) -> None:
    now = datetime.now(timezone.utc)
    date = lambda value: value.isoformat(timespec="seconds").replace("+00:00", "Z")
    identifier = f"12345678000195-2-000001/{now.year}"
    published = date(now - timedelta(hours=1))
    article = {
        "id": identifier, "slug": "saneamento-municipio-exemplo-abcd1234",
        "title": "Município registra contrato de saneamento", "description": "Registro de obra de saneamento no PNCP.",
        "lead": "O município registrou o contrato para redes de saneamento.",
        "paragraphs": ["O objeto informado compreende implantação de redes de saneamento."],
        "category": "saneamento", "published_at": published, "modified_at": published,
        "facts": {"id": identifier, "supplier_type": "PJ", "buyer": "Município de Exemplo",
                  "supplier": "Engenharia Exemplo Ltda.", "object": "Implantação de redes de saneamento.",
                  "value": {"amount": "1234567.1250", "kind": "valorGlobal", "currency": "BRL"},
                  "source_url": f"https://pncp.gov.br/app/contratos/12345678000195/{now.year}/1",
                  "source_published_at": date(now - timedelta(days=1)), "source_checked_at": date(now),
                  "signed_at": None, "starts_at": None, "ends_at": None,
                  "administrative_location": {"city": "Florianópolis", "state": "SC"}},
    }
    snapshot = {"schema": "confenge.contract-news-publication/v1", "generated_at": date(now),
                "articles": [article] if state == "published" else []}
    body = json.dumps(snapshot, ensure_ascii=False).encode()
    digest = hashlib.sha256(body).hexdigest()
    name = f"snapshot-{digest}.json"
    (directory / name).write_bytes(body)
    (directory / "current.json").write_text(json.dumps({"schema": "confenge.contract-news-pointer/v1",
        "file": name, "sha256": digest, "generated_at": snapshot["generated_at"],
        "article_count": len(snapshot["articles"])}))


def test_runtime_navigation_matches_the_shared_writer_in_every_page_state(tmp_path):
    from scripts.site.shell_nav import load_brand, sync_text

    _write_snapshot(tmp_path, "published")
    pointer = json.loads((tmp_path / "current.json").read_text())
    snapshot = json.loads((tmp_path / pointer["file"]).read_text())
    code = """
import { readFileSync } from 'node:fs';
import { renderIndex, renderArticle, renderError, articlePath, pagePath } from './runtime/contract-news/render.mjs';
import { PREFIX } from './runtime/contract-news/schema.mjs';
const snapshot = JSON.parse(readFileSync(0, 'utf8'));
const article = snapshot.articles[0];
const paginated = { ...snapshot, articles: Array.from({ length: 13 }, (_, index) => ({ ...article, slug: article.slug + '-' + index })) };
const rows = [
  { state: 'empty', path: PREFIX, ...renderIndex({ ...snapshot, articles: [] }) },
  { state: 'published', path: PREFIX, ...renderIndex(snapshot) },
  { state: 'article', path: articlePath(article), ...renderArticle(article) },
  { state: 'pagination', path: pagePath(2), ...renderIndex(paginated, 2) },
  { state: 'bootstrap', path: PREFIX, ...renderError(503, PREFIX) },
  { state: 'not_found', path: PREFIX + 'missing/', ...renderError(404, PREFIX + 'missing/') },
];
process.stdout.write(JSON.stringify(rows));
"""
    result = subprocess.run([NODE, "--input-type=module", "-e", code], cwd=ROOT,
                            input=json.dumps(snapshot), capture_output=True, text=True, check=True, timeout=15)
    rows = json.loads(result.stdout)
    for row in rows:
        assert sync_text(row["html"], load_brand(), row["path"]) == row["html"], row["state"]
        assert row["html"].count('data-nav-discovery="true"') == 1
        assert '<span>Atendimento em todo o Brasil.</span>' in row["html"]
        assert 'href="/conteudos/">Biblioteca</a>' in row["html"]
        assert 'data-cta-id="nav-mobile_nav-empresa"' in row["html"]
    assert (ROOT / news.HTML).read_text() == rows[0]["html"] + "\n"


@contextmanager
def _live_fixture(tmp_path: Path, state: str):
    directory = tmp_path / "private-publication"
    directory.mkdir()
    if state != "bootstrap":
        _write_snapshot(directory, state)
    env = {**os.environ, "CONFENGE_NEWS_DIR": str(directory)}
    result = subprocess.run([NODE, "runtime/contract-news/attest.mjs", SHA], cwd=ROOT,
                            env=env, capture_output=True, text=True, check=True, timeout=15)
    proof = json.loads(result.stdout)
    shell = (ROOT / news.HTML).read_bytes()
    fixture = _fixture(tmp_path, {"index.html": HOME, news.HTML: shell})
    inventory = json.loads(fixture["inventory"].read_text())
    for rel in news.DOCUMENTS:
        if rel == news.HTML:
            continue
        target = fixture["site"] / rel
        target.write_bytes((ROOT / rel).read_bytes())
        inventory["non_html_sha256"][rel] = hashlib.sha256(target.read_bytes()).hexdigest()
    proof["physical_sha256"] = {rel: (inventory["html_sha256"] | inventory["non_html_sha256"])[rel] for rel in news.DOCUMENTS}
    inventory["contract_news"] = proof
    fixture["inventory"].write_text(json.dumps(inventory))
    code = """
import { createServer } from 'node:http';
import { createContractNews } from './runtime/contract-news/server.mjs';
const serve = createContractNews();
const server = createServer(async (req,res) => { if (!await serve(req,res)) res.writeHead(404).end(); });
server.listen(0,'127.0.0.1',() => process.stdout.write(String(server.address().port)+'\\n'));
"""
    process = subprocess.Popen([NODE, "--input-type=module", "-e", code], cwd=ROOT, env=env,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        assert select.select([process.stdout], [], [], 10)[0], "real Node HTTP fixture did not start"
        port = int(process.stdout.readline())
        def fetch(url, timeout):
            assert url.startswith(news.ORIGIN + news.PREFIX.rstrip("/"))
            return acceptance._probe_first_hop(f"http://127.0.0.1:{port}" + url.removeprefix(news.ORIGIN), timeout, limit=news.MAX_RESPONSE)
        yield fixture, proof, inventory, fetch, directory
    finally:
        process.terminate()
        process.communicate(timeout=10)


@pytest.mark.parametrize("state", ["bootstrap", "empty", "published"])
def test_full_acceptance_checks_live_news_separately_and_keeps_every_static_hash(tmp_path, state):
    with _live_fixture(tmp_path, state) as (fixture, proof, inventory, fetch, _):
        report = acceptance.run_acceptance(
            site=fixture["site"], expected_sha=SHA, base=news.ORIGIN,
            server_inventory=fixture["inventory"], server_overlay_manifest=fixture["overlay"],
            report_dir=tmp_path / "report", identity_fetcher=_identity_fetcher(),
            html_fetcher=_html_fetcher({"index.html": HOME}), asset_fetcher=_asset_fetcher(fixture),
            news_fetcher=fetch, run_mutations=False,
        )
        assert report["ok"], report["errors"]
        assert report["static_html_expected"] == 1
        assert report["runtime_html_expected"] == 1
        assert report["server_html_fetched"] == report["server_html_expected"] == 2
        assert report["coverage"]["runtime"]["server_html_bodies_scanned"] == 2
        assert set(inventory["contract_news"]["physical_sha256"]) == set(news.DOCUMENTS)
        actual = report["contract_news_runtime"]
        assert actual["state"] == state and actual["infrastructure_published"]
        assert actual["archive_initialized"] is (state != "bootstrap")
        assert actual["executed"] == actual["planned"] == 4
        assert all(row["status"] == (503 if state == "bootstrap" else 200) for row in actual["responses"])
        assert len(actual["aliases"]) == 4 and all(row["ok"] for row in actual["aliases"])
        body = (tmp_path / "report/server-html-mirror" / news.HTML).read_text()
        if state == "published":
            assert "Município registra contrato de saneamento" in body
            assert proof["snapshot_sha256"]


@pytest.mark.parametrize("mutation", ["static_fallback", "wrong_snapshot", "lost_runtime", "unavailable", "tampered_feed", "bad_alias"])
def test_dynamic_http_regressions_fail_closed(tmp_path, mutation):
    with _live_fixture(tmp_path, "published") as (fixture, proof, _, fetch, _):
        def broken(url, timeout):
            entry, body = fetch(url, timeout)
            if url == news.ORIGIN + news.PREFIX:
                if mutation == "static_fallback":
                    body = (fixture["site"] / news.HTML).read_bytes()
                    entry["sha256"] = hashlib.sha256(body).hexdigest()
                    entry["headers"] = {"content-type": "text/html; charset=utf-8"}
                elif mutation == "wrong_snapshot":
                    entry["headers"]["x-confenge-news-snapshot"] = "f" * 64
                elif mutation == "lost_runtime":
                    entry["headers"].pop("x-confenge-contract-news")
                elif mutation == "unavailable":
                    entry["status"] = 503
            if mutation == "tampered_feed" and url.endswith("/feed.xml"):
                body = body.replace(b"<title>", b"<title>altered ", 1)
                entry["sha256"] = hashlib.sha256(body).hexdigest()
            if mutation == "bad_alias" and url.endswith("/index.html"):
                entry["status"] = 200
            return entry, body
        report, _ = news.verify_public(proof, site=fixture["site"], base=news.ORIGIN, fetcher=broken, timeout=3)
        assert not report["ok"] and report["errors"]


@pytest.mark.parametrize("mutation", ["release", "code", "prefix", "missing_document", "extra_document", "missing_attestation", "bootstrap_with_snapshot"])
def test_only_exact_code_bound_news_documents_are_classified_as_runtime(tmp_path, mutation):
    with _live_fixture(tmp_path, "empty") as (fixture, _, payload, _, _):
        raw = payload["contract_news"]
        if mutation == "release":
            raw["release_sha"] = "b" * 40
        elif mutation == "code":
            raw["source_files_sha256"]["runtime/contract-news/server.mjs"] = "f" * 64
        elif mutation == "prefix":
            raw["prefix"] = "/"
        elif mutation == "missing_document":
            raw["documents"].pop(news.RECENT)
        elif mutation == "extra_document":
            raw["documents"]["index.html"] = copy.deepcopy(raw["documents"][news.HTML])
        elif mutation == "missing_attestation":
            payload.pop("contract_news")
        else:
            raw["state"] = "bootstrap"
        fixture["inventory"].write_text(json.dumps(payload))
        parsed, errors = acceptance.load_served_inventory(fixture["inventory"])
        assert errors and parsed["contract_news"] is None


def test_other_static_html_still_requires_its_exact_public_bytes(tmp_path):
    with _live_fixture(tmp_path, "bootstrap") as (fixture, _, _, fetch, _):
        report = acceptance.run_acceptance(
            site=fixture["site"], expected_sha=SHA, base=news.ORIGIN,
            server_inventory=fixture["inventory"], server_overlay_manifest=fixture["overlay"],
            report_dir=tmp_path / "report", identity_fetcher=_identity_fetcher(),
            html_fetcher=_html_fetcher({"index.html": HOME + b"changed"}), asset_fetcher=_asset_fetcher(fixture),
            news_fetcher=fetch, run_mutations=False,
        )
        assert not report["ok"]
        assert "http_host_html_digest_mismatch:index.html" in report["errors"]
        assert report["contract_news_runtime"]["ok"]


def test_recent_sitemap_clock_boundary_is_bounded_and_never_accepts_another_snapshot(tmp_path):
    with _live_fixture(tmp_path, "published") as (_, proof, _, fetch, _):
        _, body = fetch(news.ORIGIN + news.PREFIX + "news-sitemap.xml", 3)
        publication = news.timestamp(proof["news_candidates"][0]["published_at"])
        assert news.recent_sitemap_errors(body, proof, publication + timedelta(hours=48, seconds=30)) == []
        assert news.recent_sitemap_errors(body, proof, publication + timedelta(hours=48, seconds=121))
        assert news.recent_sitemap_errors(body.replace(b"saneamento-municipio-exemplo-abcd1234", b"not-an-attested-article"), proof, datetime.now(timezone.utc))
        assert news.recent_sitemap_errors(body.replace(b"<news:title>", b"<news:title>Altered "), proof, datetime.now(timezone.utc))
        empty = b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>'
        assert news.recent_sitemap_errors(empty, proof, datetime.now(timezone.utc))


@pytest.mark.parametrize("mutation", ["title_child", "loc_child", "root_text", "attribute", "tail", "comment", "processing_instruction"])
def test_recent_sitemap_rejects_hidden_xml_content_and_structure_changes(tmp_path, mutation):
    with _live_fixture(tmp_path, "published") as (_, proof, _, fetch, _):
        _, body = fetch(news.ORIGIN + news.PREFIX + "news-sitemap.xml", 3)
        changes = {
            "title_child": (b"</news:title>", b"<unexpected>Other facts</unexpected></news:title>"),
            "loc_child": (b"</loc>", b"<unexpected>https://unrelated.example/</unexpected></loc>"),
            "root_text": (b"<url>", b"Other facts<url>"),
            "attribute": (b"<news:title>", b'<news:title hidden="Other facts">'),
            "tail": (b"</news:title>", b"</news:title>Other facts"),
            "comment": (b"<url>", b"<!-- Other facts --><url>"),
            "processing_instruction": (b"<url>", b"<?other facts?><url>"),
        }
        old, replacement = changes[mutation]
        changed = body.replace(old, replacement, 1)
        assert changed != body
        assert news.recent_sitemap_errors(changed, proof, datetime.now(timezone.utc))


@pytest.mark.parametrize("scenario", ["converges", "deadline", "uncached"])
def test_old_news_html_must_converge_within_the_shared_cache_deadline(tmp_path, scenario):
    with _live_fixture(tmp_path, "published") as (fixture, proof, _, fetch, _):
        clock = _FakeTime()
        calls = 0
        def cached(url, timeout):
            nonlocal calls
            entry, body = fetch(url, timeout)
            if url == news.ORIGIN + news.PREFIX:
                calls += 1
                if scenario != "converges" or calls == 1:
                    body = (fixture["site"] / news.HTML).read_bytes()
                    entry["sha256"] = hashlib.sha256(body).hexdigest()
                    entry["headers"]["x-confenge-news-snapshot"] = "f" * 64
                    entry["headers"]["cf-cache-status"] = "DYNAMIC" if scenario == "uncached" else "HIT"
            return entry, body
        report, _ = news.verify_public(proof, site=fixture["site"], base=news.ORIGIN, fetcher=cached,
                                      timeout=3, deadline_at=30, clock=clock.clock, sleeper=clock.sleep)
        attempts = next(row for row in report["responses"] if row["path"] == news.HTML)["attempts"]
        assert report["ok"] is (scenario == "converges")
        if scenario == "converges":
            assert clock.sleeps == [15] and attempts[-1]["decision"] == "verified"
        elif scenario == "deadline":
            assert sum(clock.sleeps) == 30 and attempts[-1]["decision"] == "cache_deadline_exhausted"
        else:
            assert clock.sleeps == [] and attempts[-1]["decision"] == "mismatch_no_retry"


def test_host_controller_rejects_corruption_and_does_not_repeat_snapshot_bytes(tmp_path, monkeypatch):
    directory = tmp_path / "private-publication"
    directory.mkdir()
    _write_snapshot(directory, "empty")
    monkeypatch.setenv("CONFENGE_NEWS_DIR", str(directory))
    html = {news.HTML: hashlib.sha256((ROOT / news.HTML).read_bytes()).hexdigest()}
    assets = {rel: hashlib.sha256((ROOT / rel).read_bytes()).hexdigest() for rel in news.DOCUMENTS if rel != news.HTML}
    host = {"runtime": {"contractNewsPrefix": news.PREFIX}}
    assert release_control._contract_news_runtime_inventory(ROOT, SHA, host, html, assets)["state"] == "empty"
    (directory / "current.json").write_text('{"sensitive":"PRIVATE RAW SNAPSHOT"')
    with pytest.raises(release_control.ReleaseError) as error:
        release_control._contract_news_runtime_inventory(ROOT, SHA, host, html, assets)
    assert "PRIVATE RAW SNAPSHOT" not in str(error.value)
    (directory / "current.json").unlink()
    with pytest.raises(release_control.ReleaseError):
        release_control._contract_news_runtime_inventory(ROOT, SHA, host, html, assets)
    with pytest.raises(release_control.ReleaseError, match="exact four"):
        release_control._contract_news_runtime_inventory(ROOT, SHA, host, html, {})
