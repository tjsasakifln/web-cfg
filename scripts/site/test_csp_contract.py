#!/usr/bin/env python3
"""Fail closed on executable inline scripts not authorized by the public CSP."""

from __future__ import annotations

import base64
import hashlib
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HEADERS = ROOT / "_headers"
SITE = ROOT / "_site"
SCRIPT_RE = re.compile(
    r"<script\b(?P<attrs>[^>]*)>(?P<body>[\s\S]*?)</script>",
    re.IGNORECASE,
)
TYPE_RE = re.compile(r"\btype\s*=\s*[\"'](?P<type>[^\"']+)", re.IGNORECASE)
SRC_RE = re.compile(r"\bsrc\s*=", re.IGNORECASE)
DATA_TYPES = frozenset({"application/ld+json", "application/json", "importmap"})


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
        for match in SCRIPT_RE.finditer(html):
            attrs = match.group("attrs")
            if SRC_RE.search(attrs):
                continue
            type_match = TYPE_RE.search(attrs)
            script_type = type_match.group("type").strip().lower() if type_match else ""
            if script_type in DATA_TYPES:
                continue
            digest = base64.b64encode(
                hashlib.sha256(match.group("body").encode("utf-8")).digest()
            ).decode("ascii")
            hashes[f"'sha256-{digest}'"] += 1
    return hashes


def main() -> int:
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
