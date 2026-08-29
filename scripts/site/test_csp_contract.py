#!/usr/bin/env python3
"""Fail closed on executable inline scripts not authorized by the public CSP."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.cache_contract import parse_header_rules  # noqa: E402
from scripts.site.csp_contract import (  # noqa: E402
    apply_script_src_hashes,
    csp_directives_from_text,
    evaluate_security_headers,
    executable_inline_hashes,
    verify_parser_is_fail_closed,
)

HEADERS = ROOT / "_headers"
SITE = ROOT / "_site"
PACKAGE = ROOT / "package.json"
SITE_CI = ROOT / ".github" / "workflows" / "site-ci.yml"
DOWNLOADABLE = "/radar/nacional-obras-publicas/radar-nacional.pdf"


def _headers_with_script_src(script_src: str, extra_global: str = "") -> str:
    return (
        "/*\n"
        f"  Content-Security-Policy: default-src 'self'; script-src {script_src}; "
        "script-src-attr 'none'; frame-src 'self' https://www.youtube-nocookie.com "
        "https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; "
        "form-action 'self'; frame-ancestors 'self'\n"
        "  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload\n"
        "  X-Frame-Options: SAMEORIGIN\n"
        "  X-Content-Type-Options: nosniff\n"
        "  Referrer-Policy: strict-origin-when-cross-origin\n"
        "  Permissions-Policy: camera=()\n"
        f"{extra_global}"
    )


def test_unsafe_inline_fails() -> None:
    text = _headers_with_script_src("'self' 'unsafe-inline'")
    directives = csp_directives_from_text(text)
    errors = evaluate_security_headers(directives, parse_header_rules(text))
    assert any("unsafe-inline" in item for item in errors), errors


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


def evaluate_live() -> list[str]:
    verify_parser_is_fail_closed()
    text = HEADERS.read_text(encoding="utf-8")
    directives = csp_directives_from_text(text)
    errors = evaluate_security_headers(directives, parse_header_rules(text))
    script_src = set(directives.get("script-src", []))

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
    return errors, observed


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
    errors, observed = evaluate_live()
    if errors:
        for error in errors:
            print(f"FAIL {error}")
        return 1
    print(
        "CSP_CONTRACT_OK "
        f"html={len(list(SITE.rglob('*.html')))} "
        f"inline_blocks={sum(observed.values())} unique_hashes={len(observed)}"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
