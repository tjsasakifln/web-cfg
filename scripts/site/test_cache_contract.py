#!/usr/bin/env python3
"""Verify public cache rules cannot freeze mutable assets, HTML, or identity JSON."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.cache_contract import (  # noqa: E402
    HASHED_DASH,
    evaluate_cache_contract,
    is_hashed_asset_name,
    parse_header_rules,
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


def hashed_published_assets() -> set[str]:
    css_dir = SITE / "assets" / "css"
    if not css_dir.is_dir():
        return set()
    return {
        "/" + path.relative_to(SITE).as_posix()
        for path in css_dir.glob("*")
        if path.is_file() and is_hashed_asset_name(path.name)
    }


def _headers(body: str) -> str:
    return "/*\n  Cache-Control: no-cache, max-age=0, must-revalidate\n" + body


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
        hashed_published_assets=hashed_published or None,
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
        "missing_asset_policy=revalidate html=revalidate build-info=revalidate"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
