#!/usr/bin/env python3
"""Verify public cache rules cannot freeze mutable assets, HTML, or identity JSON."""

from __future__ import annotations

import hashlib
import json
import subprocess
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
    IMMUTABLE_CACHE,
    evaluate_cache_contract,
    parse_header_rules,
    render_hashed_cache_block,
    upsert_hashed_cache_block,
)
from scripts.site.fingerprint_css import (  # noqa: E402
    is_fingerprinted_stylesheet_href,
    stylesheet_hrefs,
    validate_css_asset_manifest,
)

HEADERS = ROOT / "_headers"
SITE = ROOT / "_site"
DOWNLOADABLE = {
    "/radar/nacional-obras-publicas/gsc-demand-sample.json",
    "/casos/demonstrativo-projeto-privado/data/quantitativos.csv",
    "/casos/demonstrativo-projeto-privado/data/orcamento.csv",
    "/casos/demonstrativo-projeto-privado/data/coordenacao.csv",
    "/casos/demonstrativo-projeto-privado/data/revisao.csv",
    "/casos/demonstrativo-infraestrutura/data/quantitativos.csv",
    "/casos/demonstrativo-infraestrutura/data/orcamento.csv",
    "/casos/demonstrativo-infraestrutura/data/coordenacao.csv",
    "/casos/demonstrativo-infraestrutura/data/revisao.csv",
}


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
        "/assets/data-desk/*\n"
        "  Cache-Control: public, max-age=3600, must-revalidate, no-transform\n"
        "/bim/web/*\n"
        "  Cache-Control: public, max-age=0, must-revalidate, no-transform\n"
        "/bim/fotogrametria/*\n"
        "  Cache-Control: public, max-age=0, must-revalidate, no-transform\n"
        "/cad/editor/*\n"
        "  Cache-Control: public, max-age=0, must-revalidate, no-transform\n"
        "/cad/freecad/*\n"
        "  Cache-Control: public, max-age=0, must-revalidate, no-transform\n"
    )


def test_parser_reads_the_shipped_header_source() -> None:
    parsed = parse_header_rules(HEADERS.read_text(encoding="utf-8"))
    assert "/*" in parsed
    assert "/assets/*" in parsed
    assert parsed["/*"]["cache-control"]


def _parse_netcup_headers(text: str) -> dict[str, Any]:
    result = subprocess.run(
        ["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { parseHeaders } from './scripts/migration/netcup/lib/contract.mjs';
let result;
try { result = { rules: parseHeaders(readFileSync(0, 'utf8')) }; }
catch (error) { result = { error: error.code }; }
process.stdout.write(JSON.stringify(result));
"""],
        input=text, text=True, capture_output=True, check=True, cwd=ROOT, timeout=10,
    )
    return json.loads(result.stdout)


def _netcup_policies(text: str) -> dict[str, dict[str, str]]:
    result = _parse_netcup_headers(text)
    assert "error" not in result, result
    return {rule["path"]: {header["name"].lower(): header["value"]
                          for header in rule["headers"]} for rule in result["rules"]}


def _freecad_hrefs() -> list[str]:
    manifest = json.loads((ROOT / "scripts/freecad/runtime.json").read_text())
    return [entry["path"] for entry in manifest["files"].values()]


FREECAD_CACHE_MARKERS = {
    "begin": "# BEGIN FREECAD HASHED ASSETS", "end": "# END FREECAD HASHED ASSETS",
}
CSS_CACHE_MARKERS = {"begin": "# BEGIN hashed-css-cache", "end": "# END hashed-css-cache"}


def test_hashed_cache_composes_freecad_policies_for_the_strict_host_parser() -> None:
    source = HEADERS.read_text(encoding="utf-8")
    hrefs = _freecad_hrefs()
    # Reproduce the old composition with the real source and pinned filenames.
    duplicate = source + "\n" + render_hashed_cache_block(hrefs, **FREECAD_CACHE_MARKERS)
    assert _parse_netcup_headers(duplicate) == {"error": "HC_HEADER_SELECTOR_DUPLICATE"}

    built = upsert_hashed_cache_block(source, hrefs, **FREECAD_CACHE_MARKERS)
    assert upsert_hashed_cache_block(duplicate, hrefs, **FREECAD_CACHE_MARKERS) == built
    before, after = _netcup_policies(source), _netcup_policies(built)
    for route, policy in before.items():
        expected = dict(policy)
        if route in hrefs:
            expected["cache-control"] = IMMUTABLE_CACHE
        assert after[route] == expected, route
    for href in hrefs:
        assert after[href]["cache-control"] == IMMUTABLE_CACHE, href
    assert set(after) == set(before) | set(hrefs)
    assert [route for route in after if route in before] == list(before)
    assert upsert_hashed_cache_block(built, hrefs, **FREECAD_CACHE_MARKERS) == built


def test_hashed_cache_removes_only_its_obsolete_asset_rules_and_fields() -> None:
    source = HEADERS.read_text(encoding="utf-8")
    hrefs = _freecad_hrefs()
    wasm = next(href for href in hrefs if href.endswith(".wasm"))
    replacement = "/assets/freecad/FreeCAD-0123456789ab.data"
    built = upsert_hashed_cache_block(source, hrefs, **FREECAD_CACHE_MARKERS)
    updated = upsert_hashed_cache_block(built, [wasm, replacement], **FREECAD_CACHE_MARKERS)
    policies, original = _netcup_policies(updated), _netcup_policies(source)
    for href in set(hrefs) - {wasm}:
        if href in original:
            assert policies[href] == original[href], href
        else:
            assert href not in policies, href
    assert policies[wasm] == {**original[wasm], "cache-control": IMMUTABLE_CACHE}
    assert policies[replacement] == {"cache-control": IMMUTABLE_CACHE}
    assert upsert_hashed_cache_block(updated, [wasm, replacement], **FREECAD_CACHE_MARKERS) == updated
    removed = upsert_hashed_cache_block(updated, [], **FREECAD_CACHE_MARKERS)
    assert _netcup_policies(removed) == original


def test_hashed_cache_owners_do_not_remove_each_others_policy() -> None:
    css = "/assets/css/pinned.0123456789ab.css"
    source = HEADERS.read_text(encoding="utf-8") + f"\n{css}\n  Content-Type: text/css\n"
    owners = [(_freecad_hrefs(), FREECAD_CACHE_MARKERS), ([css], CSS_CACHE_MARKERS)]
    original = _netcup_policies(source)
    for first, second in (owners, owners[::-1]):
        first_hrefs, first_markers = first
        second_hrefs, second_markers = second
        built = upsert_hashed_cache_block(source, first_hrefs, **first_markers)
        built = upsert_hashed_cache_block(built, second_hrefs, **second_markers)
        assert upsert_hashed_cache_block(built, first_hrefs, **first_markers) == built
        assert upsert_hashed_cache_block(built, second_hrefs, **second_markers) == built
        pruned = upsert_hashed_cache_block(built, [], **first_markers)
        policies = _netcup_policies(pruned)
        for href in second_hrefs:
            assert policies[href]["cache-control"] == IMMUTABLE_CACHE
        assert _netcup_policies(upsert_hashed_cache_block(pruned, [], **second_markers)) == original


def test_hashed_cache_preserves_compatible_authored_cache_and_refuses_conflicts() -> None:
    href = "/assets/pinned.0123456789ab.js"
    for value in (IMMUTABLE_CACHE, "immutable, public, max-age=31536000, no-transform"):
        source = _headers(f"{href}\n  Content-Type: text/javascript\n  cAcHe-CoNtRoL: {value}\n")
        built = upsert_hashed_cache_block(source, [href], **FREECAD_CACHE_MARKERS)
        assert f"  cAcHe-CoNtRoL: {value}\n" in built
        assert _netcup_policies(built)[href]["cache-control"] == value
        removed = upsert_hashed_cache_block(built, [], **FREECAD_CACHE_MARKERS)
        assert _netcup_policies(removed) == _netcup_policies(source)
    for fields in (
        "  Cache-Control: no-store\n",
        "  Cache-Control: public, max-age=60, must-revalidate\n",
        f"  Cache-Control: {IMMUTABLE_CACHE}\n  cache-control: {IMMUTABLE_CACHE}\n",
    ):
        try:
            upsert_hashed_cache_block(f"{href}\n{fields}", [href], **FREECAD_CACHE_MARKERS)
        except ValueError:
            pass
        else:
            raise AssertionError("Conflicting or duplicate authored cache was accepted")


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


def test_html_serving_override_must_preserve_no_transform() -> None:
    valid = _headers(
        "/assets/*\n"
        "  Cache-Control: public, max-age=3600, must-revalidate\n"
        "/.well-known/build-info.json\n"
        "  Cache-Control: no-cache, max-age=0, must-revalidate\n"
    )
    mutated = valid.replace(
        "public, max-age=3600, must-revalidate, no-transform\n",
        "public, max-age=3600, must-revalidate\n",
        1,
    )

    assert not evaluate_cache_contract(
        headers_text=valid,
        hashed_source_assets=set(),
        hashed_published_assets=set(),
        published_headers_text=valid,
    )

    errors = evaluate_cache_contract(
        headers_text=mutated,
        hashed_source_assets=set(),
    )
    assert any(
        "/assets/data-desk/*" in item and "no-transform" in item
        for item in errors
    ), errors

    errors = evaluate_cache_contract(
        headers_text=valid,
        hashed_source_assets=set(),
        hashed_published_assets=set(),
        published_headers_text=mutated,
    )
    assert any(
        "published /assets/data-desk/*" in item and "no-transform" in item
        for item in errors
    ), errors


def test_bim_html_no_transform_cannot_be_removed() -> None:
    valid = _headers(
        "/assets/*\n"
        "  Cache-Control: public, max-age=3600, must-revalidate\n"
        "/.well-known/build-info.json\n"
        "  Cache-Control: no-cache, max-age=0, must-revalidate\n"
    )
    for route in ("/bim/web/*", "/bim/fotogrametria/*"):
        original = (
            route + "\n"
            "  Cache-Control: public, max-age=0, must-revalidate, no-transform\n"
        )
        assert original in valid
        mutated = valid.replace(
            original, original.replace(", no-transform", ""), 1
        )
        for source, published in ((mutated, valid), (valid, mutated)):
            errors = evaluate_cache_contract(
                headers_text=source,
                hashed_source_assets=set(),
                hashed_published_assets=set(),
                published_headers_text=published,
            )
            assert any(route in item and "no-transform" in item for item in errors), errors


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
