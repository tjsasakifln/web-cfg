#!/usr/bin/env python3
"""Content-hash published CSS so HTML release N cannot load CSS release N-1.

Source HTML keeps `/styles.css` for local viewing. The public artifact (`_site`)
rewrites stylesheet hrefs to `/assets/css/styles.<12-hex>.css` (and tokens/tools).
Unversioned `/styles.css` remains as a fallback for leftover clients; it is not
what this build's HTML loads.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

HASH_LEN = 12
ASSET_DIR = "assets/css"
MANIFEST_REL = ".well-known/css-assets.json"

STYLESHEET_HREF_RE = re.compile(
    r"""(href\s*=\s*["'])(/styles(?:-tokens|-tools)?\.css)(["'])"""
)
IMPORT_RE = re.compile(
    r"""(@import\s+url\(\s*["']?)(/styles-tokens\.css)(["']?\s*\))"""
)
STYLESHEET_LINK_RE = re.compile(
    r"""<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*>""",
    re.IGNORECASE,
)
HREF_IN_TAG_RE = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.IGNORECASE)


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def short_hash(data: bytes) -> str:
    return sha256_hex(data)[:HASH_LEN]


def hashed_filename(name: str, digest: str) -> str:
    if not name.endswith(".css"):
        return f"{name}.{digest}"
    return f"{name[:-4]}.{digest}.css"


def stylesheet_hrefs(html: str) -> list[str]:
    hrefs: list[str] = []
    for tag in STYLESHEET_LINK_RE.findall(html):
        m = HREF_IN_TAG_RE.search(tag)
        if m:
            hrefs.append(m.group(1))
    return hrefs


def html_uses_unversioned_styles(html: str) -> bool:
    """True when a stylesheet link still points at cacheable /styles.css."""
    for href in stylesheet_hrefs(html):
        path = href.split("?", 1)[0]
        if path in {"/styles.css", "/styles-tokens.css", "/styles-tools.css"}:
            return True
    return False


def fingerprint_published_css(dest: Path) -> dict[str, Any]:
    """Rewrite dest HTML to content-hashed CSS; write css-assets.json.

    Safe no-op when styles.css is missing (minimal assemble fixtures).
    """
    dest = Path(dest)
    mapping: dict[str, str] = {}
    files: dict[str, dict[str, str]] = {}

    token_path = dest / "styles-tokens.css"
    token_bytes = token_path.read_bytes() if token_path.is_file() else b""
    token_hash = short_hash(token_bytes) if token_bytes else ""
    token_href = (
        f"/{ASSET_DIR}/{hashed_filename('styles-tokens.css', token_hash)}"
        if token_hash
        else "/styles-tokens.css"
    )

    css_dir = dest / ASSET_DIR
    if token_bytes or (dest / "styles.css").is_file() or (dest / "styles-tools.css").is_file():
        css_dir.mkdir(parents=True, exist_ok=True)

    if token_bytes:
        (css_dir / hashed_filename("styles-tokens.css", token_hash)).write_bytes(token_bytes)
        mapping["/styles-tokens.css"] = token_href
        files["styles-tokens.css"] = {
            "sha256": sha256_hex(token_bytes),
            "hash": token_hash,
            "href": token_href,
        }

    for name in ("styles.css", "styles-tools.css"):
        path = dest / name
        if not path.is_file():
            continue
        raw = path.read_text(encoding="utf-8")
        rewritten = IMPORT_RE.sub(rf"\g<1>{token_href}\g<3>", raw) if token_hash else raw
        data = rewritten.encode("utf-8")
        digest = short_hash(data)
        hashed_rel = f"{ASSET_DIR}/{hashed_filename(name, digest)}"
        (dest / hashed_rel).write_bytes(data)
        href = f"/{hashed_rel}"
        mapping[f"/{name}"] = href
        files[name] = {
            "sha256": sha256_hex(data),
            "hash": digest,
            "href": href,
        }

    html_rewritten = 0
    for html_path in dest.rglob("*.html"):
        text = html_path.read_text(encoding="utf-8")

        def _repl(match: re.Match[str]) -> str:
            old = match.group(2)
            new = mapping.get(old)
            if not new:
                return match.group(0)
            return f"{match.group(1)}{new}{match.group(3)}"

        updated = STYLESHEET_HREF_RE.sub(_repl, text)
        if updated != text:
            html_path.write_text(updated, encoding="utf-8")
            html_rewritten += 1

    manifest: dict[str, Any] = {
        "schema_version": "1.0.0",
        "source": "scripts.site.fingerprint_css",
        "files": files,
        "html_rewritten": html_rewritten,
    }
    man_path = dest / MANIFEST_REL
    man_path.parent.mkdir(parents=True, exist_ok=True)
    man_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest
