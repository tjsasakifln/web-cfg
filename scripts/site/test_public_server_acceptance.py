from __future__ import annotations

import hashlib
import http.client
import io
import json
import sys
import urllib.error
from email.message import Message
from pathlib import Path
from types import SimpleNamespace

import pytest

import scripts.site.public_server_acceptance as acceptance
from scripts.site.public_server_acceptance import (
    CANONICAL_BASE,
    CachePropagationFetcher,
    run_acceptance,
)

SHA = "a" * 40
ARTIFACT_HASH = "b" * 64
MANIFEST_HASH = "c" * 64
BUNDLE_HASH = "d" * 64
HOME = b"<html><head><title>CONFENGE</title></head><body><main><h1>Engenharia</h1></main></body></html>"


@pytest.mark.parametrize("mode,expected_error", [
    ("complete", None),
    ("empty", "first_hop_empty_410_body"),
    ("short", "first_hop_content_length_mismatch"),
    ("oserror", "first_hop_read_failed:OSError"),
    ("incomplete", "first_hop_read_failed:IncompleteRead"),
])
def test_first_hop_preserves_error_body_failures(monkeypatch, mode, expected_error):
    headers = Message()
    headers["Content-Type"] = "text/html"
    body = b"" if mode == "empty" else HOME
    headers["Content-Length"] = str(len(body) + (1 if mode == "short" else 0))
    failure = urllib.error.HTTPError(CANONICAL_BASE + "/retirada", 410, "Gone", headers, io.BytesIO(body))
    if mode in {"oserror", "incomplete"}:
        def broken_read(_limit):
            if mode == "incomplete":
                raise http.client.IncompleteRead(HOME[:7], len(HOME) - 7)
            raise OSError("controlled body read failure")
        failure.read = broken_read
    def open_failure(*_args, **_kwargs):
        raise failure
    monkeypatch.setattr(acceptance.urllib.request, "build_opener", lambda *_: SimpleNamespace(open=open_failure))
    entry, received = acceptance._probe_first_hop(CANONICAL_BASE + "/retirada", 1)
    assert entry["status"] == 410
    assert entry["headers"]["content-length"] == headers["Content-Length"]
    if expected_error:
        assert entry["error"].startswith(expected_error)
        assert received is None
    else:
        assert entry["error"] is None
        assert received == HOME
        assert entry["sha256"] == hashlib.sha256(HOME).hexdigest()
    if mode == "incomplete":
        assert entry["bytes_received"] == 7


def test_empty_redirect_body_remains_legitimate():
    response = SimpleNamespace(read=lambda _limit: b"", headers={"Content-Length": "0"})
    assert acceptance._read_first_hop_body(response, 301) == (b"", None)


def _fixture(tmp_path: Path, html: dict[str, bytes] | None = None) -> dict:
    html = html or {"index.html": HOME}
    site = tmp_path / "candidate" / "_site"
    (site / ".well-known").mkdir(parents=True)
    (site / ".well-known" / "build-info.json").write_text(
        json.dumps(
            {
                "commit": SHA,
                "environment": "production",
                "artifact_hash": ARTIFACT_HASH,
                "manifest_hash": MANIFEST_HASH,
            }
        ),
        encoding="utf-8",
    )
    for rel, body in html.items():
        target = site / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
    manifest = site.parent / "seo" / "PUBLIC-ARTIFACT-MANIFEST.json"
    manifest.parent.mkdir()
    routes = [
        acceptance._request_path_for_html(rel)
        for rel in html
        if rel == "index.html" or rel.endswith("/index.html")
    ]
    manifest.write_text(
        json.dumps({"html_route_count": len(routes), "html_routes": routes}),
        encoding="utf-8",
    )
    overlay = {
        "schema": "confenge.live-intelligence-overlay/v1",
        "release_sha": SHA,
        "routes": [],
        "removed_html_paths": [],
        "static_html_paths": [],
        "static_html_sha256": {},
    }
    overlay_path = tmp_path / "overlay.json"
    overlay_path.write_text(json.dumps(overlay), encoding="utf-8")
    inventory_path = tmp_path / "server-inventory.json"
    hashes = {rel: hashlib.sha256(body).hexdigest() for rel, body in html.items()}
    inventory_path.write_text(
        json.dumps(
            {
                "schema": "confenge.served-html-inventory/v1",
                "release_sha": SHA,
                "html_sha256": hashes,
                "http_dispositions": {
                    rel: {
                        "request_path": acceptance._request_path_for_html(rel),
                        "status": 200,
                        "location": None,
                        "final_status": 200,
                        "effective_html_path": rel,
                        "sha256": digest,
                    }
                    for rel, digest in hashes.items()
                },
                "contract_probes": {},
                "overlay": overlay,
                "build_info": {
                    "commit": SHA,
                    "environment": "production",
                    "artifact_hash": ARTIFACT_HASH,
                    "manifest_hash": MANIFEST_HASH,
                },
                "runtime_info": {
                    "release_sha": SHA,
                    "environment": "production",
                    "public_artifact_hash": ARTIFACT_HASH,
                    "release_bundle_hash": BUNDLE_HASH,
                    "host_architecture_version": acceptance.EXPECTED_HOST_ARCHITECTURE_VERSION,
                    "storage_backend": acceptance.EXPECTED_STORAGE_BACKEND,
                },
            }
        ),
        encoding="utf-8",
    )
    return {
        "site": site,
        "overlay": overlay_path,
        "inventory": inventory_path,
        "html": html,
    }


def _identity_fetcher(
    commit: str = SHA,
    *,
    build_overrides: dict | None = None,
    build_headers: dict | None = None,
    runtime_overrides: dict | None = None,
    runtime_headers: dict | None = None,
):
    def fetch(url: str, _timeout: float) -> dict:
        if url.endswith("build-info.json"):
            payload = {
                "commit": commit,
                "environment": "production",
                "artifact_hash": ARTIFACT_HASH,
                "manifest_hash": MANIFEST_HASH,
                **(build_overrides or {}),
            }
            headers = {
                "server": acceptance.EXPECTED_SERVER_HEADER,
                "x-confenge-host-architecture-version": acceptance.EXPECTED_HOST_ARCHITECTURE_VERSION,
                **(build_headers or {}),
            }
        else:
            payload = {
                "release_sha": commit,
                "environment": "production",
                "public_artifact_hash": ARTIFACT_HASH,
                "release_bundle_hash": BUNDLE_HASH,
                "host_architecture_version": acceptance.EXPECTED_HOST_ARCHITECTURE_VERSION,
                "storage_backend": acceptance.EXPECTED_STORAGE_BACKEND,
                **(runtime_overrides or {}),
            }
            headers = {
                "server": acceptance.EXPECTED_SERVER_HEADER,
                "x-confenge-host-architecture-version": acceptance.EXPECTED_HOST_ARCHITECTURE_VERSION,
                **(runtime_headers or {}),
            }
        return {
            "ok": True,
            "url": url,
            "final_url": url,
            "status": 200,
            "content_type": "application/json",
            "sha256": hashlib.sha256(json.dumps(payload).encode()).hexdigest(),
            "payload": payload,
            "headers": headers,
            "error": None,
        }

    return fetch


def _html_fetcher(
    bodies: dict[str, bytes],
    *,
    fail: set[str] | None = None,
    effective: dict[str, str] | None = None,
):
    fail = fail or set()
    effective = effective or {}

    def fetch(rel: str, _timeout: float):
        url = CANONICAL_BASE + acceptance._request_path_for_html(rel)
        if rel in fail:
            return ({
                "path": rel,
                "url": url,
                "status": 503,
                "final_url": url,
                "sha256": None,
                "bytes": None,
                "headers": {},
                "error": "unexpected_http_status:503",
            }, None)
        final_rel = effective.get(rel, rel)
        body = bodies[final_rel]
        final_url = CANONICAL_BASE + acceptance._request_path_for_html(final_rel)
        return ({
            "path": rel,
            "url": url,
            "status": 200,
            "final_url": final_url,
            "sha256": hashlib.sha256(body).hexdigest(),
            "bytes": len(body),
            "headers": {"content-type": "text/html; charset=utf-8"},
            "error": None,
        }, body)

    return fetch


class _FakeTime:
    def __init__(self):
        self.now = 0.0
        self.sleeps = []

    def clock(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


def _cached_entry(rel: str, body: bytes, state: str, age: str = "0"):
    return ({
        "path": rel,
        "url": f"{CANONICAL_BASE}/{rel}",
        "status": 200,
        "final_url": f"{CANONICAL_BASE}/{rel}",
        "sha256": hashlib.sha256(body).hexdigest(),
        "bytes": len(body),
        "headers": {
            "content-type": "text/html; charset=utf-8",
            "cf-cache-status": state,
            "age": age,
        },
        "error": None,
    }, body)


def _run(tmp_path: Path, fixture: dict, **kwargs):
    return run_acceptance(
        site=fixture["site"],
        expected_sha=SHA,
        base=CANONICAL_BASE,
        server_inventory=fixture["inventory"],
        server_overlay_manifest=kwargs.get("server_overlay_manifest", fixture["overlay"]),
        report_dir=tmp_path / "report",
        identity_fetcher=kwargs.get("identity_fetcher", _identity_fetcher()),
        html_fetcher=kwargs.get("html_fetcher", _html_fetcher(fixture["html"])),
        disposition_fetcher=kwargs.get(
            "disposition_fetcher", acceptance._probe_first_hop
        ),
        run_mutations=kwargs.get("run_mutations", False),
        cache_deadline_seconds=kwargs.get(
            "cache_deadline_seconds", acceptance.CACHE_PROPAGATION_SECONDS
        ),
        clock=kwargs.get("clock", acceptance.time.monotonic),
        sleeper=kwargs.get("sleeper", acceptance.time.sleep),
    )


@pytest.mark.parametrize("cache_control,accepted", [
    ("public, max-age=3600, must-revalidate, no-transform", True),
    ("public, max-age=3600, must-revalidate", False),
    ("public, x-no-transform", False),
    ("", False),
])
def test_public_datadesk_requires_actual_no_transform_header(tmp_path, cache_control, accepted):
    rel = "assets/data-desk/valor-tipico-contratos-pavimentacao-sc/v1/index.html"
    fixture = _fixture(tmp_path, {"index.html": HOME, rel: HOME})
    delegate = _html_fetcher(fixture["html"])
    def fetch(path, timeout):
        entry, body = delegate(path, timeout)
        if path == rel:
            entry["headers"]["cache-control"] = cache_control
        return entry, body
    report = _run(tmp_path, fixture, html_fetcher=fetch)
    assert report["ok"] is accepted, report["errors"]
    if not accepted:
        assert f"http_html_cache_no_transform_missing:{rel}" in report["errors"]


def test_accepts_complete_exact_server_inventory(tmp_path):
    fixture = _fixture(tmp_path)
    report = _run(
        tmp_path,
        fixture,
        server_overlay_manifest=None,
        run_mutations=True,
    )
    assert report["ok"] is True, report["errors"]
    assert report["server_html_expected"] == 1
    assert report["server_html_fetched"] == 1
    assert report["server_html_digest_matched"] == 1
    assert report["http_responses"][0]["title"] == "CONFENGE"
    assert report["http_responses"][0]["content_type"].startswith("text/html")
    assert report["identity_before"]["build"]["payload"]["artifact_hash"] == ARTIFACT_HASH
    assert report["identity_before"]["build"]["payload"]["manifest_hash"] == MANIFEST_HASH
    assert (
        report["identity_before"]["runtime"]["payload"]["release_bundle_hash"]
        == BUNDLE_HASH
    )
    assert report["identity_before"]["runtime"]["headers"] == {
        "server": "cloudflare",
        "x-confenge-host-architecture-version": "confenge-nginx-node/v2",
    }
    assert report["mutation_contracts_passed"]
    assert (tmp_path / "report" / "acceptance.json").is_file()


def test_rejects_server_html_not_authorized_by_artifact_or_overlay(tmp_path):
    extra = b"<html><head><title>Surpresa</title></head><body><main>Extra</main></body></html>"
    fixture = _fixture(tmp_path)
    inventory = json.loads(fixture["inventory"].read_text(encoding="utf-8"))
    digest = hashlib.sha256(extra).hexdigest()
    inventory["html_sha256"]["extra/index.html"] = digest
    inventory["http_dispositions"]["extra/index.html"] = {
        "request_path": "/extra/",
        "status": 200,
        "location": None,
        "final_status": 200,
        "effective_html_path": "extra/index.html",
        "sha256": digest,
    }
    fixture["inventory"].write_text(json.dumps(inventory), encoding="utf-8")
    fixture["html"]["extra/index.html"] = extra
    report = _run(tmp_path, fixture)
    assert report["ok"] is False
    assert "public_surface_coverage_failed" in report["errors"]
    assert report["coverage"]["runtime"]["server_unauthorized_html_added"] == [
        "extra/index.html"
    ]


def test_rejects_wrong_public_identity_before_and_after(tmp_path):
    fixture = _fixture(tmp_path)
    report = _run(tmp_path, fixture, identity_fetcher=_identity_fetcher("b" * 40))
    assert report["ok"] is False
    assert "before:public_build_sha_mismatch" in report["errors"]
    assert "before:public_runtime_sha_mismatch" in report["errors"]
    assert "after:public_build_sha_mismatch" in report["errors"]
    assert "after:public_runtime_sha_mismatch" in report["errors"]


def test_rejects_public_build_digest_not_bound_to_exact_artifact(tmp_path):
    fixture = _fixture(tmp_path)
    report = _run(
        tmp_path,
        fixture,
        identity_fetcher=_identity_fetcher(
            build_overrides={"artifact_hash": "e" * 64, "manifest_hash": "f" * 64}
        ),
    )
    assert report["ok"] is False
    for phase in ("before", "after"):
        assert f"{phase}:public_build_artifact_hash_mismatch" in report["errors"]
        assert f"{phase}:public_build_manifest_hash_mismatch" in report["errors"]


def test_rejects_runtime_identity_or_authority_header_mismatch(tmp_path):
    fixture = _fixture(tmp_path)
    report = _run(
        tmp_path,
        fixture,
        identity_fetcher=_identity_fetcher(
            build_headers={
                "server": "nginx",
                "x-confenge-host-architecture-version": "confenge-nginx-node/v1",
            },
            runtime_overrides={"release_bundle_hash": "e" * 64},
            runtime_headers={
                "server": "nginx",
                "x-confenge-host-architecture-version": "confenge-nginx-node/v1",
            },
        ),
    )
    assert report["ok"] is False
    for phase in ("before", "after"):
        assert f"{phase}:public_build_server_header_mismatch" in report["errors"]
        assert f"{phase}:public_build_host_architecture_header_mismatch" in report["errors"]
        assert f"{phase}:public_runtime_release_bundle_hash_mismatch" in report["errors"]
        assert f"{phase}:public_runtime_server_header_mismatch" in report["errors"]
        assert f"{phase}:public_runtime_host_architecture_header_mismatch" in report["errors"]


def test_rejects_incomplete_http_mirror(tmp_path):
    fixture = _fixture(tmp_path)
    report = _run(
        tmp_path,
        fixture,
        html_fetcher=_html_fetcher(fixture["html"], fail={"index.html"}),
    )
    assert report["ok"] is False
    assert "server_html_fetch_incomplete" in report["errors"]
    assert "http_host_html_digest_mismatch:index.html" in report["errors"]
    assert report["server_html_digest_matched"] == 0


def test_cli_matches_post_release_wiring_without_redundant_overlay_argument(
    tmp_path, monkeypatch
):
    captured = {}

    def fake_run(**kwargs):
        captured.update(kwargs)
        return {
            "ok": True,
            "expected_sha": SHA,
            "server_html_expected": 1,
            "server_html_fetched": 1,
            "server_html_digest_matched": 1,
            "errors": [],
        }

    monkeypatch.setattr(acceptance, "run_acceptance", fake_run)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "public_server_acceptance.py",
            "--site",
            "_site",
            "--expected-sha",
            SHA,
            "--base",
            CANONICAL_BASE,
            "--server-inventory",
            f"build/reports/server-inventory-{SHA}.json",
            "--report-dir",
            str(tmp_path / "served-public-acceptance"),
        ],
    )
    assert acceptance.main() == 0
    assert captured["server_overlay_manifest"] is None


def test_cached_old_html_retries_until_exact_host_digest():
    old = b"<title>Anterior</title>"
    current = b"<title>Atual</title>"
    calls = iter(
        [
            _cached_entry("index.html", old, "HIT", "272"),
            _cached_entry("index.html", current, "HIT", "1"),
        ]
    )
    fake_time = _FakeTime()
    fetcher = CachePropagationFetcher(
        {"index.html": hashlib.sha256(current).hexdigest()},
        fetcher=lambda _rel, _timeout: next(calls),
        clock=fake_time.clock,
        sleeper=fake_time.sleep,
    )
    entry, body = fetcher("index.html", 5)
    assert body == current
    assert entry["sha256"] == hashlib.sha256(current).hexdigest()
    assert fake_time.sleeps == [15.0]
    assert [row["decision"] for row in fetcher.attempts["index.html"]] == [
        "retry_cache_propagation",
        "host_digest_matched",
    ]
    assert [row["age"] for row in fetcher.attempts["index.html"]] == ["272", "1"]


def test_miss_with_wrong_html_fails_immediately_without_retry():
    old = b"<title>Anterior</title>"
    current = b"<title>Atual</title>"
    fake_time = _FakeTime()
    fetcher = CachePropagationFetcher(
        {"index.html": hashlib.sha256(current).hexdigest()},
        fetcher=lambda rel, _timeout: _cached_entry(rel, old, "MISS"),
        clock=fake_time.clock,
        sleeper=fake_time.sleep,
    )
    entry, body = fetcher("index.html", 5)
    assert body is None
    assert entry["error"] == "host_digest_mismatch_nontransient_cache:MISS"
    assert fake_time.sleeps == []
    assert len(fetcher.attempts["index.html"]) == 1


def test_cache_deadline_is_global_and_never_accepts_old_html():
    old = b"<title>Anterior</title>"
    current = b"<title>Atual</title>"
    fake_time = _FakeTime()
    fetcher = CachePropagationFetcher(
        {
            "index.html": hashlib.sha256(current).hexdigest(),
            "outra/index.html": hashlib.sha256(current).hexdigest(),
        },
        fetcher=lambda rel, _timeout: _cached_entry(rel, old, "STALE", "300"),
        deadline_seconds=20.0,
        clock=fake_time.clock,
        sleeper=fake_time.sleep,
    )
    first, first_body = fetcher("index.html", 5)
    assert first_body is None
    assert first["error"] == "host_digest_mismatch_cache_deadline_exhausted"
    assert fake_time.sleeps == [15.0, 5.0]
    assert all(delay <= 15 for delay in fake_time.sleeps)

    second, second_body = fetcher("outra/index.html", 5)
    assert second_body is None
    assert second["error"] == "host_digest_mismatch_cache_deadline_exhausted"
    assert fake_time.sleeps == [15.0, 5.0]
    assert len(fetcher.attempts["outra/index.html"]) == 1


def test_accepts_exact_forced_redirect_and_compares_effective_body(tmp_path):
    old_alias = b"<html><head><title>Alias fisico</title></head><body>Antigo</body></html>"
    destination = b"<html><head><title>Destino</title></head><body><main>Conteudo atual</main></body></html>"
    fixture = _fixture(
        tmp_path,
        {
            "index.html": HOME,
            "alias/index.html": old_alias,
            "destino/index.html": destination,
        },
    )
    inventory = json.loads(fixture["inventory"].read_text(encoding="utf-8"))
    inventory["http_dispositions"]["alias/index.html"] = {
        "request_path": "/alias/",
        "status": 301,
        "location": "/destino/",
        "final_status": 200,
        "effective_html_path": "destino/index.html",
        "sha256": hashlib.sha256(destination).hexdigest(),
    }
    fixture["inventory"].write_text(json.dumps(inventory), encoding="utf-8")

    def first_hop(url: str, _timeout: float):
        assert url == f"{CANONICAL_BASE}/alias/"
        return ({
            "url": url,
            "status": 301,
            "location": "/destino/",
            "content_type": "text/html; charset=utf-8",
            "sha256": None,
            "error": None,
        }, None)

    report = _run(
        tmp_path,
        fixture,
        html_fetcher=_html_fetcher(
            fixture["html"], effective={"alias/index.html": "destino/index.html"}
        ),
        disposition_fetcher=first_hop,
    )
    assert report["ok"] is True, report["errors"]
    alias = next(row for row in report["http_responses"] if row["path"] == "alias/index.html")
    assert alias["physical_sha256"] == hashlib.sha256(old_alias).hexdigest()
    assert alias["http_sha256"] == hashlib.sha256(destination).hexdigest()
    assert alias["first_hop"]["status"] == 301
    assert alias["final_url"] == f"{CANONICAL_BASE}/destino/"


def test_rejects_redirect_with_wrong_first_hop_location(tmp_path):
    destination = b"<html><head><title>Destino</title></head><body><main>Atual</main></body></html>"
    fixture = _fixture(
        tmp_path,
        {"index.html": HOME, "alias/index.html": HOME, "destino/index.html": destination},
    )
    inventory = json.loads(fixture["inventory"].read_text(encoding="utf-8"))
    inventory["http_dispositions"]["alias/index.html"] = {
        "request_path": "/alias/",
        "status": 301,
        "location": "/destino/",
        "final_status": 200,
        "effective_html_path": "destino/index.html",
        "sha256": hashlib.sha256(destination).hexdigest(),
    }
    fixture["inventory"].write_text(json.dumps(inventory), encoding="utf-8")

    def wrong_first_hop(url: str, _timeout: float):
        return ({
            "url": url,
            "status": 301,
            "location": "/outro-destino/",
            "content_type": "text/html; charset=utf-8",
            "sha256": None,
            "error": None,
        }, None)

    report = _run(
        tmp_path,
        fixture,
        html_fetcher=_html_fetcher(
            fixture["html"], effective={"alias/index.html": "destino/index.html"}
        ),
        disposition_fetcher=wrong_first_hop,
    )
    assert report["ok"] is False
    assert "http_first_hop_location_mismatch:alias/index.html" in report["errors"]


def test_accepts_exact_410_without_exposing_physical_html(tmp_path):
    physical = b"<html><head><title>Retirado</title></head><body>Rascunho preservado</body></html>"
    not_found = b"<html><head><title>Conteudo indisponivel</title></head><body><main>Esta pagina nao esta disponivel.</main></body></html>"
    fixture = _fixture(
        tmp_path,
        {"index.html": HOME, "404.html": not_found, "retirado/index.html": physical},
    )
    inventory = json.loads(fixture["inventory"].read_text(encoding="utf-8"))
    inventory["http_dispositions"]["retirado/index.html"] = {
        "request_path": "/retirado/",
        "status": 410,
        "location": None,
        "final_status": 410,
        "effective_html_path": "404.html",
        "sha256": hashlib.sha256(not_found).hexdigest(),
    }
    fixture["inventory"].write_text(json.dumps(inventory), encoding="utf-8")

    def gone_first_hop(url: str, _timeout: float):
        assert url == f"{CANONICAL_BASE}/retirado/"
        return ({
            "url": url,
            "status": 410,
            "location": None,
            "content_type": "text/html; charset=utf-8",
            "sha256": hashlib.sha256(not_found).hexdigest(),
            "error": None,
        }, not_found)

    report = _run(
        tmp_path,
        fixture,
        disposition_fetcher=gone_first_hop,
    )
    assert report["ok"] is True, report["errors"]
    retired = next(
        row for row in report["http_responses"] if row["path"] == "retirado/index.html"
    )
    assert retired["status"] == 410
    assert retired["http_sha256"] == hashlib.sha256(not_found).hexdigest()
    assert retired["physical_sha256"] == hashlib.sha256(physical).hexdigest()


def _fixture_with_contract_probe(tmp_path: Path):
    not_found = b"<html><head><title>Conteudo indisponivel</title></head><body><main>Esta pagina nao esta disponivel.</main></body></html>"
    fixture = _fixture(tmp_path, {"index.html": HOME, "404.html": not_found})
    inventory = json.loads(fixture["inventory"].read_text(encoding="utf-8"))
    inventory["contract_probes"] = {
        "/piloto/__confenge_contract_probe__": {
            "request_path": "/piloto/__confenge_contract_probe__",
            "status": 410,
            "location": None,
            "final_status": 410,
            "effective_html_path": "404.html",
            "sha256": hashlib.sha256(not_found).hexdigest(),
            "rule_order": 12,
            "match": "prefix",
        }
    }
    fixture["inventory"].write_text(json.dumps(inventory), encoding="utf-8")
    return fixture, not_found


def _probe_entry(url: str, status: int, body: bytes, cache: str = ""):
    return ({
        "url": url,
        "status": status,
        "location": None,
        "content_type": "text/html; charset=utf-8",
        "headers": {
            **({"cf-cache-status": cache} if cache else {}),
            "content-type": "text/html; charset=utf-8",
        },
        "sha256": hashlib.sha256(body).hexdigest(),
        "error": None,
    }, body)


def test_withdrawn_contract_probe_retries_cached_200_then_proves_exact_410(tmp_path):
    fixture, not_found = _fixture_with_contract_probe(tmp_path)
    leaked = b"<html><body>preview interno proof_state: DRAFT</body></html>"
    calls = iter(
        [
            lambda url: _probe_entry(url, 200, leaked, "HIT"),
            lambda url: _probe_entry(url, 410, not_found, "HIT"),
        ]
    )
    fake_time = _FakeTime()

    def probe(url: str, _timeout: float):
        return next(calls)(url)

    report = run_acceptance(
        site=fixture["site"],
        expected_sha=SHA,
        base=CANONICAL_BASE,
        server_inventory=fixture["inventory"],
        server_overlay_manifest=fixture["overlay"],
        report_dir=tmp_path / "report",
        identity_fetcher=_identity_fetcher(),
        html_fetcher=_html_fetcher(fixture["html"]),
        disposition_fetcher=probe,
        run_mutations=False,
        clock=fake_time.clock,
        sleeper=fake_time.sleep,
    )
    assert report["ok"] is True, report["errors"]
    assert report["contract_probes"] == {
        "planned": 1,
        "executed": 1,
        "passed": 1,
        "failures": 0,
        "ok": True,
    }
    evidence = json.loads(
        (tmp_path / "report" / "contract-probes.json").read_text(encoding="utf-8")
    )
    assert [row["decision"] for row in evidence["attempts"]["/piloto/__confenge_contract_probe__"]] == [
        "retry_cached_pre_release_200",
        "exact_410_contract_matched",
    ]
    assert evidence["results"][0]["withdrawn_source_body_absent"] is True
    assert fake_time.sleeps == [15.0]


def test_withdrawn_contract_probe_rejects_200_without_transient_cache(tmp_path):
    fixture, _not_found = _fixture_with_contract_probe(tmp_path)
    leaked = b"<html><body>preview interno proof_state: DRAFT</body></html>"
    report = _run(
        tmp_path,
        fixture,
        disposition_fetcher=lambda url, _timeout: _probe_entry(url, 200, leaked, "MISS"),
    )
    assert report["ok"] is False
    assert "withdrawn_contract_probes_failed" in report["errors"]
    evidence = json.loads(
        (tmp_path / "report" / "contract-probes.json").read_text(encoding="utf-8")
    )
    assert evidence["executed"] == 1
    assert evidence["failures"][0]["actual_status"] == 200
    assert len(evidence["attempts"]["/piloto/__confenge_contract_probe__"]) == 1


def test_withdrawn_contract_probe_rejects_404(tmp_path):
    fixture, not_found = _fixture_with_contract_probe(tmp_path)
    report = _run(
        tmp_path,
        fixture,
        disposition_fetcher=lambda url, _timeout: _probe_entry(url, 404, not_found),
    )
    assert report["ok"] is False
    assert "withdrawn_contract_probes_failed" in report["errors"]
    evidence = json.loads(
        (tmp_path / "report" / "contract-probes.json").read_text(encoding="utf-8")
    )
    assert evidence["failures"][0]["actual_status"] == 404
    assert evidence["failures"][0]["error_page_digest_matched"] is False


def test_withdrawn_contract_probe_cached_200_stops_at_global_deadline(tmp_path):
    fixture, _not_found = _fixture_with_contract_probe(tmp_path)
    leaked = b"<html><body>preview interno proof_state: DRAFT</body></html>"
    fake_time = _FakeTime()
    report = _run(
        tmp_path,
        fixture,
        disposition_fetcher=lambda url, _timeout: _probe_entry(url, 200, leaked, "STALE"),
        cache_deadline_seconds=20.0,
        clock=fake_time.clock,
        sleeper=fake_time.sleep,
    )
    assert report["ok"] is False
    assert "withdrawn_contract_probes_failed" in report["errors"]
    evidence = json.loads(
        (tmp_path / "report" / "contract-probes.json").read_text(encoding="utf-8")
    )
    attempts = evidence["attempts"]["/piloto/__confenge_contract_probe__"]
    assert [row["decision"] for row in attempts] == [
        "retry_cached_pre_release_200",
        "retry_cached_pre_release_200",
        "cache_deadline_exhausted",
    ]
    assert fake_time.sleeps == [15.0, 5.0]
