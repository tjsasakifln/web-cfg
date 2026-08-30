#!/usr/bin/env python3
"""Fail closed on executable inline scripts not authorized by the public CSP."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.cache_contract import parse_header_rules  # noqa: E402
from scripts.site.csp_contract import (  # noqa: E402
    apply_artifact_csp_hashes,
    apply_script_src_hashes,
    apply_style_src_hashes,
    csp_directives_from_text,
    evaluate_security_headers,
    executable_inline_hashes,
    inline_style_hashes,
    parse_styles,
    verify_parser_is_fail_closed,
)

HEADERS = ROOT / "_headers"
SITE = ROOT / "_site"
PACKAGE = ROOT / "package.json"
SITE_CI = ROOT / ".github" / "workflows" / "site-ci.yml"
DOWNLOADABLE = "/radar/nacional-obras-publicas/radar-nacional.pdf"


def _headers_with_script_src(
    script_src: str,
    extra_global: str = "",
    style_src: str = "'self' 'unsafe-hashes'",
) -> str:
    return (
        "/*\n"
        f"  Content-Security-Policy: default-src 'self'; img-src 'self' data: https://i.ytimg.com; "
        f"style-src {style_src}; "
        f"script-src {script_src}; "
        "script-src-attr 'none'; frame-src 'self' https://www.youtube-nocookie.com "
        "https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; "
        "object-src 'none'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'; "
        "upgrade-insecure-requests\n"
        "  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload\n"
        "  X-Frame-Options: SAMEORIGIN\n"
        "  X-Content-Type-Options: nosniff\n"
        "  Referrer-Policy: strict-origin-when-cross-origin\n"
        "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), "
        "usb=(), interest-cohort=()\n"
        f"{extra_global}"
    )


def test_unsafe_inline_fails() -> None:
    text = _headers_with_script_src("'self' 'unsafe-inline'")
    directives = csp_directives_from_text(text)
    errors = evaluate_security_headers(directives, parse_header_rules(text))
    assert any("unsafe-inline" in item for item in errors), errors


def test_style_unsafe_inline_fails() -> None:
    text = _headers_with_script_src("'self'", style_src="'self' 'unsafe-inline'")
    directives = csp_directives_from_text(text)
    errors = evaluate_security_headers(directives, parse_header_rules(text))
    assert any("style-src" in item and "unsafe-inline" in item for item in errors), errors


def test_missing_security_headers_fail() -> None:
    text = (
        "/*\n"
        "  Content-Security-Policy: default-src 'self'; script-src 'self'; "
        "script-src-attr 'none'; form-action 'none'; frame-ancestors 'none'\n"
    )
    directives = csp_directives_from_text(text)
    errors = evaluate_security_headers(directives, parse_header_rules(text))
    assert any("HSTS" in item for item in errors), errors
    assert any("X-Frame-Options" in item for item in errors), errors
    assert any("nosniff" in item for item in errors), errors
    assert any("Referrer-Policy" in item for item in errors), errors
    assert any("Permissions-Policy" in item for item in errors), errors
    assert any("form-action" in item for item in errors), errors


def test_new_third_party_host_fails() -> None:
    text = _headers_with_script_src("'self' https://evil.example")
    directives = csp_directives_from_text(text)
    errors = evaluate_security_headers(directives, parse_header_rules(text))
    assert any("unexpected third-party" in item for item in errors), errors


def test_wildcard_or_unsafe_eval_fails() -> None:
    text = _headers_with_script_src("'self' * 'unsafe-eval'")
    directives = csp_directives_from_text(text)
    errors = evaluate_security_headers(directives, parse_header_rules(text))
    assert any("script-src controls" in item for item in errors), errors


def test_permissions_policy_must_keep_every_denial() -> None:
    text = _headers_with_script_src(
        "'self' https://challenges.cloudflare.com",
        extra_global="  Permissions-Policy: camera=()\n",
    )
    directives = csp_directives_from_text(text)
    errors = evaluate_security_headers(directives, parse_header_rules(text))
    assert any("Permissions-Policy must deny" in item for item in errors), errors


def test_apply_script_src_hashes_is_noop_without_csp() -> None:
    stub = "/*\n  X-Robots-Tag: all\n"
    assert apply_script_src_hashes(stub, ["'sha256-aaa='"]) == stub


def test_apply_script_src_hashes_round_trip() -> None:
    original = _headers_with_script_src("'self' 'sha256-oldhash==' https://challenges.cloudflare.com")
    updated = apply_script_src_hashes(original, ["'sha256-aaa='", "'sha256-bbb='"])
    directives = csp_directives_from_text(updated)
    script_src = directives["script-src"]
    assert "'self'" in script_src
    assert "https://challenges.cloudflare.com" in script_src
    assert "'sha256-aaa='" in script_src
    assert "'sha256-bbb='" in script_src
    assert "'sha256-oldhash=='" not in script_src


def test_apply_style_src_hashes_round_trip() -> None:
    original = _headers_with_script_src(
        "'self'", style_src="'self' 'unsafe-hashes' 'sha256-oldhash=='"
    )
    updated = apply_style_src_hashes(original, ["'sha256-aaa='", "'sha256-bbb='"])
    style_src = csp_directives_from_text(updated)["style-src"]
    assert "'self'" in style_src
    assert "'unsafe-hashes'" in style_src
    assert "'sha256-aaa='" in style_src
    assert "'sha256-bbb='" in style_src
    assert "'sha256-oldhash=='" not in style_src


def test_hash_refresh_is_idempotent_and_preserves_header_indentation() -> None:
    original = _headers_with_script_src("'self' 'sha256-oldhash=='").replace(
        "  Content-Security-Policy:", "        Content-Security-Policy:"
    )
    once = apply_script_src_hashes(original, ["'sha256-aaa='"])
    twice = apply_script_src_hashes(once, ["'sha256-aaa='"])
    assert twice == once
    csp_line = next(line for line in twice.splitlines() if "Content-Security-Policy:" in line)
    assert csp_line.startswith("  Content-Security-Policy:")
    assert not csp_line.startswith("    Content-Security-Policy:")


def test_style_parser_covers_blocks_and_attributes() -> None:
    blocks, attributes = parse_styles(
        '<div style="--bar: 25%"></div><style>.safe { color: green }</style>'
    )
    assert blocks == [".safe { color: green }"]
    assert attributes == ["--bar: 25%"]


def evaluate_live() -> tuple[list[str], Counter[str], Counter[str], Counter[str]]:
    verify_parser_is_fail_closed()
    text = HEADERS.read_text(encoding="utf-8")
    directives = csp_directives_from_text(text)
    errors = evaluate_security_headers(directives, parse_header_rules(text))
    script_src = set(directives.get("script-src", []))
    style_src = set(directives.get("style-src", []))

    csp_line = next(
        (line.strip() for line in text.splitlines() if line.strip().lower().startswith("content-security-policy:")),
        "",
    )
    if len(csp_line.encode("utf-8")) > 7168:
        errors.append(f"Content-Security-Policy header exceeds 7168 bytes: {len(csp_line.encode('utf-8'))}")

    package = json.loads(PACKAGE.read_text(encoding="utf-8"))
    if package.get("scripts", {}).get("test:csp-browser") != "node scripts/site/test_csp_browser.mjs":
        errors.append("package.json must expose the CSP browser canary")
    workflow = SITE_CI.read_text(encoding="utf-8")
    if "npm run test:csp-browser" not in workflow or 'CSP_BROWSER_REQUIRED: "1"' not in workflow:
        errors.append("site-ci must run the CSP browser canary fail-closed")

    disposition = parse_header_rules(text).get(DOWNLOADABLE, {}).get("content-disposition", "")
    if "attachment" not in disposition.lower():
        errors.append(f"{DOWNLOADABLE} must send Content-Disposition attachment")

    observed = executable_inline_hashes(SITE)
    authorized = {token for token in script_src if token.startswith("'sha256-")}
    generated_src = set(
        csp_directives_from_text(apply_script_src_hashes(text, list(observed))).get("script-src", [])
    )
    generated_hashes = {token for token in generated_src if token.startswith("'sha256-")}
    if generated_hashes != set(observed):
        errors.append("CSP hash generator did not reproduce the executable-inline census")
    missing = set(observed) - authorized
    stale = authorized - set(observed)
    if missing:
        errors.append(f"{len(missing)} executable inline script hash(es) are missing")
    if stale:
        errors.append(f"{len(stale)} stale inline script hash(es) remain in CSP")

    style_blocks, style_attributes = inline_style_hashes(SITE)
    observed_styles = style_blocks + style_attributes
    authorized_styles = {token for token in style_src if token.startswith("'sha256-")}
    generated_style_src = set(
        csp_directives_from_text(apply_artifact_csp_hashes(text, SITE)).get("style-src", [])
    )
    generated_style_hashes = {
        token for token in generated_style_src if token.startswith("'sha256-")
    }
    if generated_style_hashes != set(observed_styles):
        errors.append("CSP hash generator did not reproduce the inline-style census")
    missing_styles = set(observed_styles) - authorized_styles
    stale_styles = authorized_styles - set(observed_styles)
    if missing_styles:
        errors.append(f"{len(missing_styles)} inline style hash(es) are missing")
    if stale_styles:
        errors.append(f"{len(stale_styles)} stale inline style hash(es) remain in CSP")
    return errors, observed, style_blocks, style_attributes


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
    errors, observed, style_blocks, style_attributes = evaluate_live()
    if errors:
        for error in errors:
            print(f"FAIL {error}")
        return 1
    print(
        "CSP_CONTRACT_OK "
        f"html={len(list(SITE.rglob('*.html')))} "
        f"inline_scripts={sum(observed.values())}/{len(observed)} "
        f"style_blocks={sum(style_blocks.values())}/{len(style_blocks)} "
        f"style_attributes={sum(style_attributes.values())}/{len(style_attributes)}"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
