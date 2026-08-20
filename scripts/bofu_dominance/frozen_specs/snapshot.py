"""Read-only HTML snapshot of frozen BOFU pillars. Does not write HTML."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from scripts.bofu_dominance.frozen_specs.constants import PILLARS, html_path
from scripts.bofu_dominance.frozen_specs.hashing import content_sha256, sha256_bytes

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _strip(html_inner: str) -> str:
    return _WS_RE.sub(" ", _TAG_RE.sub("", html_inner)).strip()


def _attr(tag: str, name: str) -> str:
    m = re.search(rf"""{name}\s*=\s*["']([^"']*)["']""", tag, re.I)
    return m.group(1) if m else ""


def parse_title(html: str) -> str:
    m = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
    return _strip(m.group(1)) if m else ""


def parse_meta_name(html: str, name: str) -> str:
    for m in re.finditer(r"<meta\b[^>]*>", html, re.I):
        tag = m.group(0)
        if re.search(rf"""name\s*=\s*["']{re.escape(name)}["']""", tag, re.I):
            return _attr(tag, "content")
    return ""


def parse_meta_property(html: str, prop: str) -> str:
    for m in re.finditer(r"<meta\b[^>]*>", html, re.I):
        tag = m.group(0)
        if re.search(rf"""property\s*=\s*["']{re.escape(prop)}["']""", tag, re.I):
            return _attr(tag, "content")
    return ""


def parse_canonical(html: str) -> str:
    for m in re.finditer(r"<link\b[^>]*>", html, re.I):
        tag = m.group(0)
        if re.search(r"""rel\s*=\s*["']canonical["']""", tag, re.I):
            return _attr(tag, "href")
    return ""


def parse_h1(html: str) -> str:
    m = re.search(r"<h1\b[^>]*>(.*?)</h1>", html, re.I | re.S)
    return _strip(m.group(1)) if m else ""


def parse_schema_types(html: str) -> list[str]:
    types: list[str] = []
    seen: set[str] = set()
    blocks = re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    )
    for block in blocks:
        try:
            data = json.loads(block.strip())
        except json.JSONDecodeError:
            continue
        _walk_schema(data, types, seen)
    return types


def _walk_schema(obj: Any, types: list[str], seen: set[str]) -> None:
    if isinstance(obj, dict):
        raw = obj.get("@type")
        labels: list[str] = []
        if isinstance(raw, str):
            labels = [raw]
        elif isinstance(raw, list):
            labels = [str(x) for x in raw]
        for label in labels:
            if label not in seen:
                seen.add(label)
                types.append(label)
        for value in obj.values():
            _walk_schema(value, types, seen)
    elif isinstance(obj, list):
        for item in obj:
            _walk_schema(item, types, seen)


def parse_cta(html: str) -> dict[str, Any]:
    hero = ""
    hero_href = ""
    m = re.search(
        r'<header class="content-hero[^"]*".*?<div class="hero-actions">(.*?)</div>',
        html,
        re.I | re.S,
    )
    if m:
        am = re.search(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', m.group(1), re.I | re.S)
        if am:
            hero_href = am.group(1)
            hero = _strip(am.group(2))
    bridges: list[dict[str, str]] = []
    for bm in re.finditer(
        r'data-cta-position=["\']([^"\']+)["\'][^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>|'
        r'href=["\']([^"\']+)["\'][^>]*data-cta-position=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
        html,
        re.I | re.S,
    ):
        if bm.group(1):
            bridges.append(
                {
                    "position": bm.group(1),
                    "href": bm.group(2),
                    "text": _strip(bm.group(3)),
                }
            )
        else:
            bridges.append(
                {
                    "position": bm.group(5),
                    "href": bm.group(4),
                    "text": _strip(bm.group(6)),
                }
            )
    return {
        "hero_text": hero,
        "hero_href": hero_href,
        "bridges": bridges,
        "when_not_to_hire": (
            'id="quando-nao-contratar"' in html or "data-when-not-hire" in html
        ),
        "whatsapp_present": "wa.me/" in html.lower(),
        "form_count": len(re.findall(r"<form\b", html, re.I)),
    }


def snapshot_html(html: str, *, rel: str, slug: str, path: str) -> dict[str, Any]:
    return {
        "slug": slug,
        "path": path,
        "html_rel": rel,
        "title": parse_title(html),
        "meta_description": parse_meta_name(html, "description"),
        "robots": parse_meta_name(html, "robots"),
        "canonical": parse_canonical(html),
        "og_title": parse_meta_property(html, "og:title"),
        "og_url": parse_meta_property(html, "og:url"),
        "h1": parse_h1(html),
        "schema_types": parse_schema_types(html),
        "cta": parse_cta(html),
        "content_sha256": sha256_bytes(html.encode("utf-8")),
        "bytes": len(html.encode("utf-8")),
        "noindex": "noindex" in parse_meta_name(html, "robots").lower(),
    }


def snapshot_pillar(slug: str, root: Path | None = None) -> dict[str, Any]:
    pillar = next(p for p in PILLARS if p["slug"] == slug)
    path = html_path(slug, root)
    html = path.read_text(encoding="utf-8")
    snap = snapshot_html(
        html, rel=pillar["html_rel"], slug=slug, path=pillar["path"]
    )
    snap["content_sha256"] = content_sha256(path)
    snap["bytes"] = path.stat().st_size
    return snap


def snapshot_six(root: Path | None = None) -> list[dict[str, Any]]:
    return [snapshot_pillar(p["slug"], root) for p in PILLARS]


def write_snapshots_json(dest: Path, root: Path | None = None) -> dict[str, Any]:
    snaps = snapshot_six(root)
    doc = {
        "schema": "bofu_frozen_snapshots/v1",
        "html_mutation": False,
        "pillars": snaps,
    }
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return doc
