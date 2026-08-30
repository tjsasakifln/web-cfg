"""CSP census, hash rewrite and security-header contract."""

from __future__ import annotations

import argparse
import base64
import hashlib
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

DATA_TYPES = frozenset({"application/ld+json", "application/json"})
ALLOWED_SCRIPT_HOSTS = frozenset({"'self'", "https://challenges.cloudflare.com"})
ALLOWED_STYLE_HOSTS = frozenset({"'self'"})
ALLOWED_CONNECT_HOSTS = frozenset({"'self'", "https://challenges.cloudflare.com"})
ALLOWED_FRAME_HOSTS = frozenset(
    {"'self'", "https://www.youtube-nocookie.com", "https://challenges.cloudflare.com"}
)
ALLOWED_IMG_SOURCES = frozenset({"'self'", "data:", "https://i.ytimg.com"})
DENIED_PERMISSIONS = frozenset(
    {"camera", "microphone", "geolocation", "payment", "usb", "interest-cohort"}
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


class StyleParser(HTMLParser):
    """Collect exact inline style blocks and decoded style-attribute values."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.attributes: list[str] = []
        self.blocks: list[str] = []
        self._body: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, value in attrs:
            if name.lower() == "style" and value is not None:
                self.attributes.append(value)
        if tag.lower() == "style":
            if self._body is not None:
                raise AssertionError("nested style start tag")
            self._body = []

    def handle_data(self, data: str) -> None:
        if self._body is not None:
            self._body.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "style" and self._body is not None:
            self.blocks.append("".join(self._body))
            self._body = None

    def finish(self) -> tuple[list[str], list[str]]:
        self.close()
        if self._body is not None:
            raise AssertionError("unclosed style tag")
        return self.blocks, self.attributes


def parse_scripts(html: str) -> list[tuple[list[tuple[str, str | None]], str]]:
    parser = ScriptParser()
    parser.feed(html)
    return parser.finish()


def parse_styles(html: str) -> tuple[list[str], list[str]]:
    parser = StyleParser()
    parser.feed(html)
    return parser.finish()


def sha256_source(value: str) -> str:
    digest = base64.b64encode(hashlib.sha256(value.encode("utf-8")).digest()).decode("ascii")
    return f"'sha256-{digest}'"


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
            hashes[sha256_source(body)] += 1
    return hashes


def inline_style_hashes(root: Path) -> tuple[Counter[str], Counter[str]]:
    """Return unique-authority counters for style blocks and attributes."""
    if not (root / "index.html").is_file():
        raise AssertionError("_site is missing; run npm run build:site before the CSP gate")
    blocks: Counter[str] = Counter()
    attributes: Counter[str] = Counter()
    for path in sorted(root.rglob("*.html")):
        parsed_blocks, parsed_attributes = parse_styles(path.read_text(encoding="utf-8"))
        blocks.update(sha256_source(body) for body in parsed_blocks)
        attributes.update(sha256_source(value) for value in parsed_attributes)
    return blocks, attributes


def apply_source_hashes(headers_text: str, directive: str, hashes: list[str]) -> str:
    """Replace sha256 tokens in one source-list directive; keep other tokens intact."""
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
            if not tokens or tokens[0].lower() != directive:
                rebuilt.append(part)
                continue
            hosts = [token for token in tokens[1:] if not token.startswith("'sha256-")]
            rebuilt.append(" ".join([directive, *hosts, *ordered]))
            replaced = True
        newline = "\n" if raw.endswith("\n") else ""
        lines.append(f"  {prefix.strip()}: {'; '.join(rebuilt)}{newline}")
    if not replaced:
        # Minimal assemble fixtures may omit CSP; production `_headers` always has it.
        return headers_text
    return "".join(lines)


def apply_script_src_hashes(headers_text: str, hashes: list[str]) -> str:
    """Replace executable-inline sha256 tokens in script-src; keep hosts intact."""
    return apply_source_hashes(headers_text, "script-src", hashes)


def apply_style_src_hashes(headers_text: str, hashes: list[str]) -> str:
    """Replace inline-style sha256 tokens in style-src; keep hosts and unsafe-hashes."""
    return apply_source_hashes(headers_text, "style-src", hashes)


def apply_artifact_csp_hashes(headers_text: str, root: Path) -> str:
    scripts = executable_inline_hashes(root)
    style_blocks, style_attributes = inline_style_hashes(root)
    updated = apply_script_src_hashes(headers_text, list(scripts))
    return apply_style_src_hashes(updated, list(style_blocks + style_attributes))


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
    if "'unsafe-eval'" in script_src or "'wasm-unsafe-eval'" in script_src or "*" in script_src:
        errors.append("script-src must not contain eval or wildcard controls")
    script_controls = {token for token in script_src if not token.startswith("'sha256-")}
    if script_controls != ALLOWED_SCRIPT_HOSTS:
        errors.append(f"script-src controls must remain exact: {sorted(ALLOWED_SCRIPT_HOSTS)}")
    style_src = directives.get("style-src", [])
    if "'unsafe-inline'" in style_src:
        errors.append("style-src must not contain 'unsafe-inline'")
    if "'unsafe-eval'" in style_src or "*" in style_src:
        errors.append("style-src must not contain eval or wildcard controls")
    style_controls = {token for token in style_src if not token.startswith("'sha256-")}
    if style_controls != {"'self'", "'unsafe-hashes'"}:
        errors.append("style-src controls must remain exactly 'self' and 'unsafe-hashes'")
    if set(directives.get("img-src", [])) != ALLOWED_IMG_SOURCES:
        errors.append(f"img-src controls must remain exact: {sorted(ALLOWED_IMG_SOURCES)}")
    if set(directives.get("script-src-attr", [])) != {"'none'"}:
        errors.append("script-src-attr must remain 'none'")
    if set(directives.get("form-action", [])) != {"'self'"}:
        errors.append("form-action must remain 'self'")
    if set(directives.get("frame-ancestors", [])) != {"'self'"}:
        errors.append("frame-ancestors must remain exactly 'self'")
    if set(directives.get("object-src", [])) != {"'none'"}:
        errors.append("object-src must remain 'none'")
    if set(directives.get("base-uri", [])) != {"'self'"}:
        errors.append("base-uri must remain 'self'")
    if set(directives.get("default-src", [])) != {"'self'"}:
        errors.append("default-src must remain exactly 'self'")
    if "upgrade-insecure-requests" not in directives:
        errors.append("upgrade-insecure-requests is missing")

    if set(directives.get("connect-src", [])) != ALLOWED_CONNECT_HOSTS:
        errors.append(f"connect-src controls must remain exact: {sorted(ALLOWED_CONNECT_HOSTS)}")
    if set(directives.get("frame-src", [])) != ALLOWED_FRAME_HOSTS:
        errors.append(f"frame-src controls must remain exact: {sorted(ALLOWED_FRAME_HOSTS)}")

    unexpected_script = extra_hosts(script_src, ALLOWED_SCRIPT_HOSTS)
    if unexpected_script:
        errors.append(f"script-src has unexpected third-party host(s): {sorted(unexpected_script)}")
    unexpected_style = extra_hosts(style_src, ALLOWED_STYLE_HOSTS)
    if unexpected_style:
        errors.append(f"style-src has unexpected third-party host(s): {sorted(unexpected_style)}")
    unexpected_connect = extra_hosts(directives.get("connect-src", []), ALLOWED_CONNECT_HOSTS)
    if unexpected_connect:
        errors.append(f"connect-src has unexpected third-party host(s): {sorted(unexpected_connect)}")
    unexpected_frame = extra_hosts(directives.get("frame-src", []), ALLOWED_FRAME_HOSTS)
    if unexpected_frame:
        errors.append(f"frame-src has unexpected third-party host(s): {sorted(unexpected_frame)}")

    hsts = global_headers.get("strict-transport-security", "")
    hsts_age = re.search(r"(?:^|;)\s*max-age=(\d+)(?:;|$)", hsts, re.IGNORECASE)
    if (
        not hsts_age
        or int(hsts_age.group(1)) < 31536000
        or "includesubdomains" not in hsts.lower()
        or "preload" not in hsts.lower()
    ):
        errors.append("HSTS must set max-age>=31536000, includeSubDomains and preload")
    xfo = global_headers.get("x-frame-options", "")
    if xfo.upper() not in {"SAMEORIGIN", "DENY"}:
        errors.append("X-Frame-Options must be SAMEORIGIN or DENY")
    if global_headers.get("x-content-type-options", "").lower() != "nosniff":
        errors.append("X-Content-Type-Options must be nosniff")
    if global_headers.get("referrer-policy", "").lower() != "strict-origin-when-cross-origin":
        errors.append("Referrer-Policy must remain strict-origin-when-cross-origin")
    permissions = global_headers.get("permissions-policy", "").lower().replace(" ", "")
    missing_denials = sorted(
        feature for feature in DENIED_PERMISSIONS if f"{feature}=()" not in permissions
    )
    if missing_denials:
        errors.append(f"Permissions-Policy must deny: {missing_denials}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh exact CSP hashes from a built artifact")
    parser.add_argument("--write", type=Path, required=True, help="header source to rewrite")
    parser.add_argument("--root", type=Path, default=Path("_site"), help="built public artifact")
    args = parser.parse_args()
    current = args.write.read_text(encoding="utf-8")
    updated = apply_artifact_csp_hashes(current, args.root)
    args.write.write_text(updated, encoding="utf-8")
    scripts = executable_inline_hashes(args.root)
    blocks, attributes = inline_style_hashes(args.root)
    print(
        "CSP_HASHES_REFRESHED "
        f"scripts={len(scripts)} style_blocks={len(blocks)} style_attributes={len(attributes)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
