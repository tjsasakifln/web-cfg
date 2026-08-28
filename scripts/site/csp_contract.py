"""CSP census, hash rewrite and security-header contract."""

from __future__ import annotations

import base64
import hashlib
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

DATA_TYPES = frozenset({"application/ld+json", "application/json"})
ALLOWED_SCRIPT_HOSTS = frozenset({"'self'", "https://challenges.cloudflare.com"})
ALLOWED_CONNECT_HOSTS = frozenset({"'self'", "https://challenges.cloudflare.com"})
ALLOWED_FRAME_HOSTS = frozenset(
    {"'self'", "https://www.youtube-nocookie.com", "https://challenges.cloudflare.com"}
)


class ScriptParser(HTMLParser):
    """Collect script bodies with exact attribute names and body bytes."""

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


def csp_directives_from_text(text: str) -> dict[str, list[str]]:
    for raw in text.splitlines():
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
    raise AssertionError("headers have no Content-Security-Policy")


def executable_inline_hashes(root: Path) -> Counter[str]:
    if not (root / "index.html").is_file():
        raise AssertionError("_site is missing; run npm run build:site before the CSP gate")
    hashes: Counter[str] = Counter()
    for path in sorted(root.rglob("*.html")):
        html = path.read_text(encoding="utf-8")
        for attrs, body in parse_scripts(html):
            if any(name == "src" for name, _ in attrs):
                continue
            script_type = next((value or "" for name, value in attrs if name == "type"), "")
            script_type = script_type.strip().lower()
            if script_type in DATA_TYPES:
                continue
            digest = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode("ascii")
            hashes[f"'sha256-{digest}'"] += 1
    return hashes


def apply_script_src_hashes(headers_text: str, hashes: list[str]) -> str:
    """Replace executable-inline sha256 tokens in script-src; keep hosts intact."""
    ordered = sorted(set(hashes))
    lines: list[str] = []
    replaced = False
    for raw in headers_text.splitlines(keepends=True):
        stripped = raw.strip()
        if not stripped.lower().startswith("content-security-policy:"):
            lines.append(raw)
            continue
        prefix, value = raw.split(":", 1)
        parts = [part.strip() for part in value.strip().split(";")]
        rebuilt: list[str] = []
        for part in parts:
            tokens = part.split()
            if not tokens or tokens[0].lower() != "script-src":
                rebuilt.append(part)
                continue
            hosts = [token for token in tokens[1:] if not token.startswith("'sha256-")]
            rebuilt.append(" ".join(["script-src", *hosts, *ordered]))
            replaced = True
        newline = "\n" if raw.endswith("\n") else ""
        indent = raw[: len(raw) - len(raw.lstrip())]
        lines.append(f"{indent}{prefix}: {'; '.join(rebuilt)}{newline}")
    if not replaced:
        raise AssertionError("Content-Security-Policy script-src was not rewritten")
    return "".join(lines)


def extra_hosts(tokens: list[str], allowed: set[str]) -> set[str]:
    found = set()
    for token in tokens:
        if token.startswith("'"):
            continue
        if token.startswith("https://") or token.startswith("http://"):
            found.add(token)
    return found - {host for host in allowed if host.startswith("http")}


def evaluate_security_headers(directives: dict[str, list[str]], headers_map: dict[str, dict[str, str]]) -> list[str]:
    errors: list[str] = []
    global_headers = headers_map.get("/*", {})
    script_src = directives.get("script-src", [])
    if "'unsafe-inline'" in script_src:
        errors.append("script-src must not contain 'unsafe-inline'")
    if "'self'" not in script_src:
        errors.append("script-src must retain 'self'")
    if set(directives.get("script-src-attr", [])) != {"'none'"}:
        errors.append("script-src-attr must remain 'none'")
    if set(directives.get("form-action", [])) != {"'self'"}:
        errors.append("form-action must remain 'self'")
    if "'self'" not in directives.get("frame-ancestors", []):
        errors.append("frame-ancestors must include 'self'")

    unexpected_script = extra_hosts(script_src, ALLOWED_SCRIPT_HOSTS)
    if unexpected_script:
        errors.append(f"script-src has unexpected third-party host(s): {sorted(unexpected_script)}")
    unexpected_connect = extra_hosts(directives.get("connect-src", []), ALLOWED_CONNECT_HOSTS)
    if unexpected_connect:
        errors.append(f"connect-src has unexpected third-party host(s): {sorted(unexpected_connect)}")
    unexpected_frame = extra_hosts(directives.get("frame-src", []), ALLOWED_FRAME_HOSTS)
    if unexpected_frame:
        errors.append(f"frame-src has unexpected third-party host(s): {sorted(unexpected_frame)}")

    hsts = global_headers.get("strict-transport-security", "")
    if "max-age=" not in hsts.lower() or "includesubdomains" not in hsts.lower():
        errors.append("HSTS must set max-age and includeSubDomains")
    xfo = global_headers.get("x-frame-options", "")
    if xfo.upper() not in {"SAMEORIGIN", "DENY"}:
        errors.append("X-Frame-Options must be SAMEORIGIN or DENY")
    if global_headers.get("x-content-type-options", "").lower() != "nosniff":
        errors.append("X-Content-Type-Options must be nosniff")
    if not global_headers.get("referrer-policy"):
        errors.append("Referrer-Policy is missing")
    if not global_headers.get("permissions-policy"):
        errors.append("Permissions-Policy is missing")
    return errors
