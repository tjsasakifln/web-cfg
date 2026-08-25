#!/usr/bin/env python3
"""Fail closed on executable inline scripts not authorized by the public CSP."""

from __future__ import annotations

import base64
import hashlib
import re
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HEADERS = ROOT / "_headers"
SITE = ROOT / "_site"
DATA_TYPES = frozenset({"application/ld+json", "application/json"})


class ScriptParser(HTMLParser):
    """Collect script bodies with exact attribute names and body bytes.

    Regex-only attribute matching mistakes ``data-src`` for ``src`` and can
    stop at a ``>`` inside a quoted value. Either bug could let an executable
    block escape the CSP census.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.blocks: list[tuple[list[tuple[str, str | None]], str]] = []
        self._attrs: list[tuple[str, str | None]] | None = None
        self._body: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "script":
            if self._attrs is not None:
                raise AssertionError("nested script start tag")
            self._attrs = [(name.lower(), value) for name, value in attrs]
            self._body = []

    def handle_data(self, data: str) -> None:
        if self._attrs is not None:
            self._body.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "script" and self._attrs is not None:
            self.blocks.append((self._attrs, "".join(self._body)))
            self._attrs = None
            self._body = []

    def finish(self) -> list[tuple[list[tuple[str, str | None]], str]]:
        self.close()
        if self._attrs is not None:
            raise AssertionError("unclosed script tag")
        return self.blocks


def parse_scripts(html: str) -> list[tuple[list[tuple[str, str | None]], str]]:
    parser = ScriptParser()
    parser.feed(html)
    return parser.finish()


def verify_parser_is_fail_closed() -> None:
    blocks = parse_scripts(
        '<script data-note=">" data-src="ignored.js" '
        'data-type="application/json">window.executed = true;</script>'
        '<script src="real.js">ignored()</script>'
    )
    attrs, body = blocks[0]
    assert not any(name == "src" for name, _ in attrs)
    assert next((value for name, value in attrs if name == "type"), None) is None
    assert body == "window.executed = true;"
    assert any(name == "src" for name, _ in blocks[1][0])


def csp_directives() -> dict[str, list[str]]:
    for raw in HEADERS.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line.lower().startswith("content-security-policy:"):
            continue
        value = line.split(":", 1)[1].strip()
        directives: dict[str, list[str]] = {}
        for part in value.split(";"):
            tokens = part.strip().split()
            if tokens:
                directives[tokens[0].lower()] = tokens[1:]
        return directives
    raise AssertionError("_headers has no Content-Security-Policy")


def executable_inline_hashes() -> Counter[str]:
    if not (SITE / "index.html").is_file():
        raise AssertionError("_site is missing; run npm run build:site before the CSP gate")
    hashes: Counter[str] = Counter()
    for path in sorted(SITE.rglob("*.html")):
        html = path.read_text(encoding="utf-8")
        for attrs, body in parse_scripts(html):
            if any(name == "src" for name, _ in attrs):
                continue
            script_type = next((value or "" for name, value in attrs if name == "type"), "")
            script_type = script_type.strip().lower()
            if script_type in DATA_TYPES:
                continue
            digest = base64.b64encode(
                hashlib.sha256(body.encode("utf-8")).digest()
            ).decode("ascii")
            hashes[f"'sha256-{digest}'"] += 1
    return hashes


def main() -> int:
    verify_parser_is_fail_closed()
    directives = csp_directives()
    script_src = set(directives.get("script-src", []))
    errors: list[str] = []
    if "'unsafe-inline'" in script_src:
        errors.append("script-src must not contain 'unsafe-inline'")
    if "'self'" not in script_src:
        errors.append("script-src must retain 'self'")
    if set(directives.get("script-src-attr", [])) != {"'none'"}:
        errors.append("script-src-attr must remain 'none'")

    observed = executable_inline_hashes()
    authorized = {token for token in script_src if token.startswith("'sha256-")}
    missing = set(observed) - authorized
    stale = authorized - set(observed)
    if missing:
        errors.append(f"{len(missing)} executable inline script hash(es) are missing")
    if stale:
        errors.append(f"{len(stale)} stale inline script hash(es) remain in CSP")

    if errors:
        for error in errors:
            print(f"FAIL {error}")
        return 1
    print(
        "CSP_CONTRACT_OK "
        f"html={len(list(SITE.rglob('*.html')))} "
        f"inline_blocks={sum(observed.values())} unique_hashes={len(observed)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
