#!/usr/bin/env python3
"""Verify public cache rules cannot freeze mutable assets, HTML, or identity JSON."""

from __future__ import annotations

import hashlib
import json
import sys
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.cache_contract import (  # noqa: E402
    HASHED_DASH,
    evaluate_cache_contract,
    parse_header_rules,
)
from scripts.site.fingerprint_css import (  # noqa: E402
    is_fingerprinted_stylesheet_href,
    stylesheet_hrefs,
    validate_css_asset_manifest,
)

HEADERS = ROOT / "_headers"
SITE = ROOT / "_site"
DOWNLOADABLE = {"/radar/nacional-obras-publicas/radar-nacional.pdf"}


def hashed_source_assets() -> set[str]:
    return {
        "/" + path.relative_to(ROOT).as_posix()
        for path in (ROOT / "assets").rglob("*")
        if path.is_file() and HASHED_DASH.search(path.name)
    }


def hashed_published_assets(site: Path = SITE) -> set[str]:
    if not site.is_dir():
        return set()
    try:
        payload = validate_css_asset_manifest(site)
    except (FileNotFoundError, ValueError) as exc:
        raise AssertionError(str(exc)) from exc
    hrefs = {info["href"] for info in payload["files"].values()}
    for html_path in sorted(site.rglob("*.html")):
        try:
            linked = stylesheet_hrefs(html_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            rel = html_path.relative_to(site).as_posix()
            raise AssertionError(f"cannot audit stylesheet links in {rel}: {exc}") from exc
        for href in linked:
            try:
                fingerprinted = is_fingerprinted_stylesheet_href(href)
            except ValueError as exc:
                rel = html_path.relative_to(site).as_posix()
                raise AssertionError(f"invalid stylesheet link in {rel}: {exc}") from exc
            if fingerprinted and urlsplit(href.strip()).path not in hrefs:
                rel = html_path.relative_to(site).as_posix()
                raise AssertionError(
                    f"{rel}: fingerprinted stylesheet is absent from css-assets.json: {href}"
                )
    return hrefs


def _write_valid_css_manifest_fixture(site: Path) -> tuple[dict[str, Any], str]:
    data = b"body{}\n"
    sha256 = hashlib.sha256(data).hexdigest()
    digest = sha256[:12]
    href = f"/assets/css/styles.{digest}.css"
    (site / "assets" / "css").mkdir(parents=True, exist_ok=True)
    (site / ".well-known").mkdir(parents=True, exist_ok=True)
    (site / "styles.css").write_bytes(data)
    (site / href.lstrip("/")).write_bytes(data)
    (site / "index.html").write_text(
        f'<link rel="stylesheet" href="{href}">\n',
        encoding="utf-8",
    )
    payload: dict[str, Any] = {
        "schema_version": "1.0.0",
        "source": "scripts.site.fingerprint_css",
        "files": {
            "styles.css": {
                "sha256": sha256,
                "hash": digest,
                "href": href,
            }
        },
    }
    (site / ".well-known" / "css-assets.json").write_text(
        json.dumps(payload), encoding="utf-8"
    )
    return payload, href


def _write_css_manifest(site: Path, payload: object) -> None:
    (site / ".well-known").mkdir(parents=True, exist_ok=True)
    (site / ".well-known" / "css-assets.json").write_text(
        json.dumps(payload), encoding="utf-8"
    )


def _expect_manifest_rejection(site: Path, detail: str) -> None:
    try:
        hashed_published_assets(site)
    except AssertionError as exc:
        assert detail in str(exc), (detail, str(exc))
    else:
        raise AssertionError(f"invalid CSS manifest was accepted; expected {detail!r}")


def test_published_css_manifest_fails_closed_when_missing_empty_or_invalid() -> None:
    with tempfile.TemporaryDirectory() as td:
        base = Path(td)

        missing = base / "missing"
        missing.mkdir()
        _expect_manifest_rejection(missing, "manifest is missing")

        invalid_json = base / "invalid-json"
        (invalid_json / ".well-known").mkdir(parents=True)
        (invalid_json / ".well-known" / "css-assets.json").write_text(
            "{not json", encoding="utf-8"
        )
        _expect_manifest_rejection(invalid_json, "unreadable or invalid")

        for index, payload in enumerate(({}, {"files": {}}, {"files": []})):
            empty = base / f"empty-{index}"
            _write_css_manifest(empty, payload)
            _expect_manifest_rejection(empty, "at least one file")


def test_published_css_manifest_rejects_missing_or_tampered_asset() -> None:
    with tempfile.TemporaryDirectory() as td:
        missing = Path(td) / "missing-asset"
        _payload, href = _write_valid_css_manifest_fixture(missing)
        (missing / href.lstrip("/")).unlink()
        _expect_manifest_rejection(missing, "asset is absent")

        tampered = Path(td) / "tampered-asset"
        _payload, href = _write_valid_css_manifest_fixture(tampered)
        (tampered / href.lstrip("/")).write_text("body{color:red}\n", encoding="utf-8")
        _expect_manifest_rejection(tampered, "sha256 disagrees with asset bytes")


def test_published_css_manifest_rejects_hash_and_basename_divergence() -> None:
    with tempfile.TemporaryDirectory() as td:
        short_hash = Path(td) / "short-hash"
        payload, _href = _write_valid_css_manifest_fixture(short_hash)
        payload["files"]["styles.css"]["hash"] = "abc"
        _write_css_manifest(short_hash, payload)
        _expect_manifest_rejection(short_hash, "short hash is invalid")

        sha_divergence = Path(td) / "sha-divergence"
        payload, _href = _write_valid_css_manifest_fixture(sha_divergence)
        payload["files"]["styles.css"]["hash"] = "0" * 12
        _write_css_manifest(sha_divergence, payload)
        _expect_manifest_rejection(sha_divergence, "short hash disagrees with sha256")

        basename_divergence = Path(td) / "basename-divergence"
        payload, href = _write_valid_css_manifest_fixture(basename_divergence)
        payload["files"]["styles.css"]["href"] = href.replace(
            payload["files"]["styles.css"]["hash"], "0" * 12
        )
        _write_css_manifest(basename_divergence, payload)
        _expect_manifest_rejection(
            basename_divergence, "basename hash disagrees with sha256"
        )


def test_published_css_manifest_rejects_path_escape() -> None:
    with tempfile.TemporaryDirectory() as td:
        source_escape = Path(td) / "source-escape"
        payload, _href = _write_valid_css_manifest_fixture(source_escape)
        payload["files"]["../styles.css"] = payload["files"].pop("styles.css")
        _write_css_manifest(source_escape, payload)
        _expect_manifest_rejection(source_escape, "confined relative path")

        href_escape = Path(td) / "href-escape"
        payload, href = _write_valid_css_manifest_fixture(href_escape)
        payload["files"]["styles.css"]["href"] = href.replace(
            "/assets/css/", "/assets/css/../"
        )
        _write_css_manifest(href_escape, payload)
        _expect_manifest_rejection(href_escape, "does not preserve the source path")


def test_hashed_stylesheet_link_must_belong_to_manifest() -> None:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        site = root / "_site"
        _payload, _href = _write_valid_css_manifest_fixture(site)
        rogue = "/assets/css/rogue.000000000000.css"
        (site / "index.html").write_text(
            f'<link rel="stylesheet" href="{rogue}">\n', encoding="utf-8"
        )
        _expect_manifest_rejection(site, "absent from css-assets.json")

        from scripts.pseo.public_artifact import audit_public_artifact

        report = audit_public_artifact(root)
        assert any(
            finding["code"] == "unmanifested_stylesheet"
            and finding["path"] == "index.html"
            for finding in report["findings"]
        ), report

        _write_css_manifest(site, {"files": {}})
        report = audit_public_artifact(root)
        assert any(
            finding["code"] == "invalid_css_asset_manifest"
            and finding["path"] == ".well-known/css-assets.json"
            for finding in report["findings"]
        ), report


def _headers(body: str) -> str:
    return (
        "/*\n"
        "  Cache-Control: no-cache, max-age=0, must-revalidate, no-transform\n"
        + body
        + "/ops/*\n"
        "  Cache-Control: no-store, no-transform\n"
    )


def test_parser_reads_the_shipped_header_source() -> None:
    parsed = parse_header_rules(HEADERS.read_text(encoding="utf-8"))
    assert "/*" in parsed
    assert "/assets/*" in parsed
    assert parsed["/*"]["cache-control"]


def test_html_default_must_not_be_immutable() -> None:
    text = (
        "/*\n"
        "  Cache-Control: public, max-age=31536000, immutable\n"
        "/assets/*\n"
        "  Cache-Control: public, max-age=3600, must-revalidate\n"
        "/.well-known/build-info.json\n"
        "  Cache-Control: no-cache, max-age=0, must-revalidate\n"
    )
    errors = evaluate_cache_contract(headers_text=text, hashed_source_assets=set())
    assert any("HTML default" in item for item in errors), errors


def test_html_default_without_no_transform_fails() -> None:
    text = (
        "/*\n"
        "  Cache-Control: no-cache, max-age=0, must-revalidate\n"
        "/assets/*\n"
        "  Cache-Control: public, max-age=3600, must-revalidate\n"
        "/.well-known/build-info.json\n"
        "  Cache-Control: no-cache, max-age=0, must-revalidate\n"
    )
    errors = evaluate_cache_contract(headers_text=text, hashed_source_assets=set())
    assert any("no-transform" in item for item in errors), errors


def test_build_info_must_not_be_immutable() -> None:
    text = _headers(
        "/assets/*\n"
        "  Cache-Control: public, max-age=3600, must-revalidate\n"
        "/.well-known/build-info.json\n"
        "  Cache-Control: public, max-age=31536000, immutable\n"
    )
    errors = evaluate_cache_contract(headers_text=text, hashed_source_assets=set())
    assert any("build-info.json" in item for item in errors), errors


def test_hashed_asset_without_immutable_fails() -> None:
    text = _headers(
        "/assets/*\n"
        "  Cache-Control: public, max-age=3600, must-revalidate\n"
        "/.well-known/build-info.json\n"
        "  Cache-Control: no-cache, max-age=0, must-revalidate\n"
    )
    errors = evaluate_cache_contract(
        headers_text=text,
        hashed_source_assets={"/assets/logo-confenge-500-f8a83f6d.png"},
    )
    assert any("missing immutable" in item for item in errors), errors


def test_assets_wildcard_immutable_fails() -> None:
    text = _headers(
        "/assets/*\n"
        "  Cache-Control: public, max-age=31536000, immutable\n"
        "/.well-known/build-info.json\n"
        "  Cache-Control: no-cache, max-age=0, must-revalidate\n"
    )
    errors = evaluate_cache_contract(headers_text=text, hashed_source_assets=set())
    assert any("/assets/*" in item and "immutable" in item for item in errors), errors


def test_private_ops_surface_must_be_no_store_and_no_transform() -> None:
    text = (
        "/*\n"
        "  Cache-Control: no-cache, max-age=0, must-revalidate, no-transform\n"
        "/assets/*\n"
        "  Cache-Control: public, max-age=3600, must-revalidate\n"
        "/.well-known/build-info.json\n"
        "  Cache-Control: no-cache, max-age=0, must-revalidate\n"
        "/ops/*\n"
        "  Cache-Control: no-store\n"
    )
    errors = evaluate_cache_contract(headers_text=text, hashed_source_assets=set())
    assert any(
        "/ops/*" in item and "no-store" in item and "no-transform" in item
        for item in errors
    ), errors


def test_downloadable_without_content_disposition_fails() -> None:
    text = _headers(
        "/assets/*\n"
        "  Cache-Control: public, max-age=3600, must-revalidate\n"
        "/.well-known/build-info.json\n"
        "  Cache-Control: no-cache, max-age=0, must-revalidate\n"
    )
    errors = evaluate_cache_contract(
        headers_text=text,
        hashed_source_assets=set(),
        downloadable_paths={"/radar/nacional-obras-publicas/radar-nacional.pdf"},
    )
    assert any("Content-Disposition" in item for item in errors), errors


def test_published_hashed_css_must_be_immutable() -> None:
    source = _headers(
        "/assets/*\n"
        "  Cache-Control: public, max-age=3600, must-revalidate\n"
        "/.well-known/build-info.json\n"
        "  Cache-Control: no-cache, max-age=0, must-revalidate\n"
        "/assets/logo-confenge-500-f8a83f6d.png\n"
        "  Cache-Control: public, max-age=31536000, immutable\n"
    )
    published = source + (
        "/assets/css/styles.0123456789ab.css\n"
        "  Cache-Control: public, max-age=3600, must-revalidate\n"
    )
    errors = evaluate_cache_contract(
        headers_text=source,
        hashed_source_assets={"/assets/logo-confenge-500-f8a83f6d.png"},
        hashed_published_assets={"/assets/css/styles.0123456789ab.css"},
        published_headers_text=published,
    )
    assert any("published hashed assets missing immutable" in item for item in errors), errors


def evaluate_live() -> list[str]:
    published = SITE / "_headers"
    hashed_published = hashed_published_assets()
    return evaluate_cache_contract(
        headers_text=HEADERS.read_text(encoding="utf-8"),
        hashed_source_assets=hashed_source_assets(),
        hashed_published_assets=hashed_published if SITE.is_dir() else None,
        published_headers_text=published.read_text(encoding="utf-8") if published.is_file() else None,
        downloadable_paths=DOWNLOADABLE,
    )


def test_live_headers_satisfy_the_contract() -> None:
    errors = evaluate_live()
    assert not errors, errors


def main() -> int:
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print("OK", test.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", test.__name__, exc)
    errors = evaluate_live()
    if errors:
        for error in errors:
            print(f"FAIL {error}")
        return 1
    parsed = parse_header_rules(HEADERS.read_text(encoding="utf-8"))
    fallback_age = 3600
    cache = parsed.get("/assets/*", {}).get("cache-control", "")
    from scripts.site.cache_contract import max_age

    fallback_age = max_age(cache)
    exact = sum(1 for route, headers in parsed.items() if "immutable" in headers.get("cache-control", "").lower())
    print(
        "CACHE_CONTRACT_OK "
        f"fallback_max_age={fallback_age} immutable_assets={exact} "
        "missing_asset_policy=revalidate html=revalidate+no-transform "
        "build-info=revalidate ops=no-store"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
