#!/usr/bin/env python3
"""Content-hash every first-party CSS file linked by the public artifact.

Source HTML keeps readable stylesheet paths for local viewing. The public
artifact (`_site`) rewrites every same-origin CSS href to a content-addressed
file below `/assets/css/`, so HTML release N cannot load CSS release N-1 from a
browser cache. Unversioned source files remain as fallbacks for leftover
clients; this build's HTML never points at them.
"""

from __future__ import annotations

import hashlib
import html
import json
import posixpath
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import unquote, urljoin, urlsplit

HASH_LEN = 12
ASSET_DIR = "assets/css"
MANIFEST_REL = ".well-known/css-assets.json"
CANONICAL_HOST = "confenge.com.br"

IMPORT_RE = re.compile(
    r"""(@import\s+url\(\s*["']?)(/styles-tokens\.css)(?:[?#][^"')\s]*)?(["']?\s*\))""",
    re.IGNORECASE,
)
HASHED_CSS_HREF_RE = re.compile(
    rf"^/assets/css/(?:.*/)?[^/]+\.[0-9a-f]{{{HASH_LEN}}}\.css$",
    re.IGNORECASE,
)
HASHED_CSS_NAME_RE = re.compile(
    rf"\.([0-9a-f]{{{HASH_LEN}}})\.css$",
    re.IGNORECASE,
)
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
INVALID_PERCENT_RE = re.compile(r"%(?![0-9a-f]{2})", re.IGNORECASE)
ENCODED_PATH_SEPARATOR_RE = re.compile(r"%(?:00|2f|5c)", re.IGNORECASE)
HTML_ATTRIBUTE_RE = re.compile(
    r"""(?P<name>[^\s"'<>/=]+)(?:\s*=\s*(?:"(?P<double>[^"]*)"|'(?P<single>[^']*)'|(?P<bare>[^\s"'=<>`]+)))?"""
)
CSS_URL_RE = re.compile(r"""url\(\s*(["']?)([^"')]+)\1\s*\)""", re.IGNORECASE)
CSS_IMPORT_RE = re.compile(
    r"""@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1\s*\)?[^;]*;""",
    re.IGNORECASE,
)


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def short_hash(data: bytes) -> str:
    return sha256_hex(data)[:HASH_LEN]


def hashed_filename(name: str, digest: str) -> str:
    if name.lower().endswith(".css"):
        return f"{name[:-4]}.{digest}.css"
    return f"{name}.{digest}.css"


@dataclass(frozen=True)
class _StylesheetLink:
    href: str
    href_start: int
    href_end: int


def _raw_attributes(raw_tag: str) -> list[tuple[str, str | None, int, int]]:
    """Lex one HTMLParser-confirmed start tag while retaining value offsets."""
    tag_name = re.match(r"<\s*link\b", raw_tag, re.IGNORECASE)
    if not tag_name:
        raise ValueError(f"expected a link start tag: {raw_tag[:80]}")
    attrs: list[tuple[str, str | None, int, int]] = []
    cursor = tag_name.end()
    while cursor < len(raw_tag):
        while cursor < len(raw_tag) and raw_tag[cursor].isspace():
            cursor += 1
        if cursor >= len(raw_tag) or raw_tag[cursor] == ">":
            break
        if raw_tag.startswith("/>", cursor):
            break
        match = HTML_ATTRIBUTE_RE.match(raw_tag, cursor)
        if not match:
            raise ValueError(f"cannot parse link attribute near: {raw_tag[cursor:cursor + 80]}")
        name = match.group("name").lower()
        value_group = next(
            (group for group in ("double", "single", "bare") if match.group(group) is not None),
            None,
        )
        if value_group is None:
            attrs.append((name, None, match.end(), match.end()))
        else:
            start, end = match.span(value_group)
            attrs.append((name, html.unescape(match.group(value_group)), start, end))
        cursor = match.end()
    return attrs


class _StylesheetLinkParser(HTMLParser):
    """Find real link elements, excluding comments and script/style text."""

    def __init__(self, source: str) -> None:
        super().__init__(convert_charrefs=False)
        self.source = source
        self.links: list[_StylesheetLink] = []
        self.line_offsets = [0]
        self.line_offsets.extend(match.end() for match in re.finditer(r"\n", source))

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del attrs  # Raw offsets below are authoritative for byte-preserving rewrites.
        if tag.lower() != "link":
            return
        raw_tag = self.get_starttag_text()
        parsed = _raw_attributes(raw_tag)
        rel_values = [value or "" for name, value, _, _ in parsed if name == "rel"]
        rel_tokens = {
            token.lower()
            for value in rel_values
            for token in re.split(r"[\t\n\f\r ]+", value.strip())
            if token
        }
        if "stylesheet" not in rel_tokens:
            return
        hrefs = [(value, start, end) for name, value, start, end in parsed if name == "href"]
        if len(hrefs) != 1 or not hrefs[0][0]:
            line, column = self.getpos()
            raise ValueError(
                f"stylesheet link at {line}:{column + 1} must have exactly one non-empty href"
            )
        href, start, end = hrefs[0]
        line, column = self.getpos()
        tag_start = self.line_offsets[line - 1] + column
        self.links.append(
            _StylesheetLink(href=href, href_start=tag_start + start, href_end=tag_start + end)
        )


def _stylesheet_links(source: str) -> list[_StylesheetLink]:
    parser = _StylesheetLinkParser(source)
    parser.feed(source)
    parser.close()
    return parser.links


def stylesheet_hrefs(html: str) -> list[str]:
    return [link.href for link in _stylesheet_links(html)]


def _href_path(href: str) -> str:
    parts = urlsplit(href.strip())
    if parts.netloc:
        scheme = parts.scheme.lower() or "https"
        if (parts.hostname or "").lower() != CANONICAL_HOST:
            return ""
        try:
            port = parts.port
        except ValueError:
            return ""
        if scheme != "https" or port not in {None, 443}:
            return ""
    elif parts.scheme:
        return ""
    raw_path = parts.path
    if not raw_path:
        raise ValueError(f"local stylesheet href must include a path: {href}")
    if INVALID_PERCENT_RE.search(raw_path):
        raise ValueError(f"stylesheet href has invalid percent encoding: {href}")
    if ENCODED_PATH_SEPARATOR_RE.search(raw_path):
        raise ValueError(f"stylesheet href encodes a path separator or NUL: {href}")
    try:
        return unquote(raw_path, encoding="utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise ValueError(f"stylesheet href is not valid UTF-8: {href}") from exc


def is_local_stylesheet_href(href: str) -> bool:
    path = _href_path(href)
    return bool(path and not path.startswith("//"))


def is_fingerprinted_stylesheet_href(href: str) -> bool:
    path = _href_path(href)
    return bool(path and HASHED_CSS_HREF_RE.search(path))


def duplicate_stylesheet_hrefs(html: str) -> list[str]:
    """Return duplicate stylesheet paths, ignoring query strings/fragments."""
    seen: set[str] = set()
    duplicates: set[str] = set()
    for href in stylesheet_hrefs(html):
        key = _href_path(href)
        if not key:
            continue
        if key in seen:
            duplicates.add(key)
        seen.add(key)
    return sorted(duplicates)


def html_uses_unversioned_styles(html: str) -> bool:
    """True when any same-origin stylesheet is not content-addressed."""
    for href in stylesheet_hrefs(html):
        if is_local_stylesheet_href(href) and not is_fingerprinted_stylesheet_href(href):
            return True
    return False


def _resolve_local_stylesheet(dest: Path, html_path: Path, href: str) -> tuple[str, Path] | None:
    """Resolve a local CSS href to its canonical root URL and artifact path."""
    if not is_local_stylesheet_href(href) or is_fingerprinted_stylesheet_href(href):
        return None
    raw_path = _href_path(href)
    if "\\" in raw_path:
        raise ValueError(f"stylesheet href must use URL separators: {href}")
    if raw_path.startswith("/"):
        source_href = posixpath.normpath(raw_path)
    else:
        page_href = "/" + html_path.relative_to(dest).as_posix()
        source_href = posixpath.normpath(urljoin(page_href, raw_path))
    if not source_href.startswith("/"):
        source_href = "/" + source_href
    resolved_dest = dest.resolve()
    source_path = (dest / source_href.lstrip("/")).resolve()
    if not source_path.is_relative_to(resolved_dest):
        raise ValueError(f"stylesheet href escapes public artifact: {href}")
    return source_href, source_path


def _hashed_asset_rel(source_href: str, digest: str) -> str:
    source = PurePosixPath(source_href.lstrip("/"))
    return (PurePosixPath(ASSET_DIR) / source.parent / hashed_filename(source.name, digest)).as_posix()


def validate_css_asset_manifest(dest: Path) -> dict[str, Any]:
    """Validate the published CSS manifest and every source/output byte contract.

    Raises instead of returning findings so build/audit consumers fail closed.
    """
    dest = Path(dest).resolve()
    manifest_path = dest / MANIFEST_REL
    if not manifest_path.is_file():
        raise FileNotFoundError(f"published CSS manifest is missing: {MANIFEST_REL}")
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"published CSS manifest is unreadable or invalid: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError("published CSS manifest must be a JSON object")
    files = payload.get("files")
    if not isinstance(files, dict) or not files:
        raise ValueError("published CSS manifest must contain at least one file")

    asset_root = (dest / ASSET_DIR).resolve()
    seen_hrefs: set[str] = set()
    for source, info in files.items():
        if not isinstance(source, str) or not source or "\\" in source:
            raise ValueError(f"invalid CSS manifest source: {source!r}")
        source_parts = PurePosixPath(source).parts
        if source.startswith("/") or any(part in {"", ".", ".."} for part in source_parts):
            raise ValueError(f"CSS manifest source must be a confined relative path: {source}")
        source_path = (dest / source).resolve()
        if not source_path.is_relative_to(dest) or not source_path.is_file():
            raise FileNotFoundError(f"CSS manifest source is absent or escapes artifact: {source}")
        if not isinstance(info, dict):
            raise ValueError(f"CSS manifest entry must be an object: {source}")

        href = info.get("href")
        digest = info.get("hash")
        expected_sha = info.get("sha256")
        if not isinstance(href, str) or not HASHED_CSS_HREF_RE.fullmatch(href):
            raise ValueError(f"CSS manifest href is not canonical/content-addressed: {source}: {href!r}")
        if href in seen_hrefs:
            raise ValueError(f"CSS manifest href is duplicated: {href}")
        seen_hrefs.add(href)
        if not isinstance(expected_sha, str) or not SHA256_RE.fullmatch(expected_sha):
            raise ValueError(f"CSS manifest sha256 is invalid: {source}: {expected_sha!r}")
        if not isinstance(digest, str) or not re.fullmatch(rf"[0-9a-f]{{{HASH_LEN}}}", digest):
            raise ValueError(f"CSS manifest short hash is invalid: {source}: {digest!r}")
        if digest != expected_sha[:HASH_LEN]:
            raise ValueError(f"CSS manifest short hash disagrees with sha256: {source}")
        name_match = HASHED_CSS_NAME_RE.search(PurePosixPath(href).name)
        if not name_match or name_match.group(1).lower() != digest:
            raise ValueError(f"CSS manifest basename hash disagrees with sha256: {source}: {href}")

        expected_href = f"/{_hashed_asset_rel('/' + source, digest)}"
        if href != expected_href:
            raise ValueError(
                f"CSS manifest href does not preserve the source path: {source}: {href} != {expected_href}"
            )
        asset_path = (dest / href.lstrip("/")).resolve()
        if not asset_path.is_relative_to(asset_root) or not asset_path.is_file():
            raise FileNotFoundError(f"CSS manifest asset is absent or escapes asset root: {href}")
        actual_sha = sha256_hex(asset_path.read_bytes())
        if actual_sha != expected_sha:
            raise ValueError(f"CSS manifest sha256 disagrees with asset bytes: {source}: {href}")
    return payload


def _validate_relocatable_css(
    css: str,
    source_href: str,
    *,
    allowed_local_imports: set[str] | None = None,
) -> None:
    """Fail closed when relocating CSS would change a relative asset base URL."""
    allowed = allowed_local_imports or set()
    for match in CSS_IMPORT_RE.finditer(css):
        href = match.group(2).strip()
        if is_local_stylesheet_href(href) and _href_path(href) not in allowed:
            raise ValueError(
                f"{source_href}: imported local CSS is not a validated build dependency: {href}"
            )
    for match in CSS_URL_RE.finditer(css):
        value = match.group(2).strip()
        parts = urlsplit(value)
        if not value or value.startswith("#") or parts.scheme or parts.netloc or parts.path.startswith("/"):
            continue
        raise ValueError(
            f"{source_href}: relative CSS url() cannot be moved safely: {value}; use a root-absolute URL"
        )


def fingerprint_published_css(dest: Path) -> dict[str, Any]:
    """Rewrite dest HTML to content-hashed CSS; write css-assets.json.

    Safe no-op when no local stylesheets exist (minimal assemble fixtures).
    """
    dest = Path(dest)
    mapping: dict[str, str] = {}
    files: dict[str, dict[str, str]] = {}
    man_path = dest / MANIFEST_REL
    existing_reverse: dict[str, str] = {}
    existing: dict[str, Any] | None = None
    if man_path.is_file():
        existing = json.loads(man_path.read_text(encoding="utf-8"))
        if not isinstance(existing, dict) or not isinstance(existing.get("files"), dict):
            raise ValueError("published CSS manifest must contain a files object")
        if existing["files"]:
            existing = validate_css_asset_manifest(dest)
        for source, info in existing["files"].items():
            href = str(info.get("href", ""))
            href_path = _href_path(href)
            if href_path:
                existing_reverse[href_path] = "/" + source.lstrip("/")

    html_paths = sorted(dest.rglob("*.html"))
    sources: dict[str, Path] = {}
    for html_path in html_paths:
        html = html_path.read_text(encoding="utf-8")
        for href in stylesheet_hrefs(html):
            if is_fingerprinted_stylesheet_href(href):
                source_href = existing_reverse.get(_href_path(href))
                source_path = dest / source_href.lstrip("/") if source_href else None
                if not source_href:
                    rel = html_path.relative_to(dest).as_posix()
                    raise ValueError(f"{rel}: fingerprinted stylesheet is absent from manifest: {href}")
                if not source_path or not source_path.is_file():
                    rel = html_path.relative_to(dest).as_posix()
                    raise FileNotFoundError(
                        f"{rel}: fingerprinted stylesheet source is absent: {source_href}"
                    )
                sources[source_href] = source_path
                continue
            resolved = _resolve_local_stylesheet(dest, html_path, href)
            if resolved is None:
                continue
            source_href, source_path = resolved
            if not source_path.is_file():
                rel = html_path.relative_to(dest).as_posix()
                raise FileNotFoundError(f"{rel}: local stylesheet does not exist: {href}")
            sources[source_href] = source_path

    token_path = dest / "styles-tokens.css"
    token_bytes = token_path.read_bytes() if token_path.is_file() else b""
    token_hash = short_hash(token_bytes) if token_bytes else ""
    token_href = (
        f"/{ASSET_DIR}/{hashed_filename('styles-tokens.css', token_hash)}"
        if token_hash
        else "/styles-tokens.css"
    )

    css_dir = dest / ASSET_DIR
    if token_bytes:
        _validate_relocatable_css(token_bytes.decode("utf-8"), "/styles-tokens.css")
        sources["/styles-tokens.css"] = token_path
    if sources:
        css_dir.mkdir(parents=True, exist_ok=True)

    if token_bytes:
        token_rel = _hashed_asset_rel("/styles-tokens.css", token_hash)
        token_output = dest / token_rel
        token_output.parent.mkdir(parents=True, exist_ok=True)
        token_output.write_bytes(token_bytes)
        mapping["/styles-tokens.css"] = token_href
        files["styles-tokens.css"] = {
            "sha256": sha256_hex(token_bytes),
            "hash": token_hash,
            "href": token_href,
        }

    for source_href in sorted(sources):
        if source_href == "/styles-tokens.css":
            continue
        path = sources[source_href]
        raw = path.read_text(encoding="utf-8")
        rewritten = IMPORT_RE.sub(rf"\g<1>{token_href}\g<3>", raw) if token_hash else raw
        _validate_relocatable_css(
            rewritten,
            source_href,
            allowed_local_imports={_href_path(token_href)} if token_hash else set(),
        )
        data = rewritten.encode("utf-8")
        digest = short_hash(data)
        hashed_rel = _hashed_asset_rel(source_href, digest)
        hashed_path = dest / hashed_rel
        hashed_path.parent.mkdir(parents=True, exist_ok=True)
        hashed_path.write_bytes(data)
        href = f"/{hashed_rel}"
        mapping[source_href] = href
        files[source_href.lstrip("/")] = {
            "sha256": sha256_hex(data),
            "hash": digest,
            "href": href,
        }

    html_rewritten = 0
    for html_path in html_paths:
        text = html_path.read_text(encoding="utf-8")
        replacements: list[tuple[int, int, str]] = []
        for link in _stylesheet_links(text):
            old_href = link.href
            if is_fingerprinted_stylesheet_href(old_href):
                source_href = existing_reverse.get(_href_path(old_href), "")
            else:
                resolved = _resolve_local_stylesheet(dest, html_path, old_href)
                source_href = resolved[0] if resolved else ""
            new = mapping.get(source_href)
            if not new:
                continue
            fragment = urlsplit(old_href).fragment
            if fragment:
                new = f"{new}#{fragment}"
            replacements.append((link.href_start, link.href_end, new))

        updated = text
        for start, end, new in reversed(replacements):
            updated = updated[:start] + new + updated[end:]
        if updated != text:
            html_path.write_text(updated, encoding="utf-8")
            html_rewritten += 1

    persisted_rewrites = html_rewritten
    if existing and existing.get("files") == files and html_rewritten == 0:
        previous = existing.get("html_rewritten")
        if isinstance(previous, int) and previous >= 0:
            persisted_rewrites = previous
    manifest: dict[str, Any] = {
        "schema_version": "1.0.0",
        "source": "scripts.site.fingerprint_css",
        "files": files,
        "html_rewritten": persisted_rewrites,
    }
    hrefs = [info["href"] for info in files.values() if info.get("href")]
    headers_path = dest / "_headers"
    if hrefs and headers_path.is_file():
        from scripts.site.cache_contract import upsert_hashed_cache_block

        headers_path.write_text(
            upsert_hashed_cache_block(
                headers_path.read_text(encoding="utf-8"),
                hrefs,
                begin="# BEGIN hashed-css-cache",
                end="# END hashed-css-cache",
            ),
            encoding="utf-8",
        )
        manifest["hashed_cache_rules"] = len(hrefs)

    man_path.parent.mkdir(parents=True, exist_ok=True)
    man_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if files:
        validate_css_asset_manifest(dest)
    return manifest
