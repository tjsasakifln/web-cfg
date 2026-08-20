"""Sitemap hygiene: only the parameter-free SC canonical may enter.

Query/filter/drill-down URLs stay out. Other sitemap members are preserved.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from scripts.market_answers import CANONICAL, FAMILY_PATH, SITE


SITEMAP_NAME = "sitemap-inteligencia.xml"
NS_LOC = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>", re.I)


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def robots_for_url(url: str, *, indexable_canonical: bool) -> str:
    """Parameter-free canonical may be index,follow. Anything else stays noindex."""
    text = str(url or "").strip()
    if "?" in text or "#" in text:
        return "noindex,nofollow"
    path = text
    if path.startswith("http"):
        path = path.split("://", 1)[-1]
        path = path.split("/", 1)[-1] if "/" in path else ""
        path = "/" + path
    if not path.endswith("/"):
        path = path + "/"
    if path == FAMILY_PATH and indexable_canonical:
        return "index,follow"
    return "noindex,nofollow"


def parse_locs(xml_text: str) -> list[str]:
    return [item.strip() for item in NS_LOC.findall(xml_text or "")]


def is_market_answer_loc(url: str) -> bool:
    text = str(url or "").rstrip("/")
    return text.endswith("/inteligencia/valor-tipico-contratos-pavimentacao")


def write_urlset(path: Path, locs: list[tuple[str, str]]) -> None:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    seen: set[str] = set()
    for loc, lastmod in locs:
        if loc in seen:
            continue
        seen.add(loc)
        lines.append(" <url>")
        lines.append(f" <loc>{loc}</loc>")
        if lastmod:
            lines.append(f" <lastmod>{lastmod}</lastmod>")
        lines.append(" </url>")
    lines.append("</urlset>")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def merge_inteligencia_sitemap(
    root: Path | None,
    *,
    include: bool,
    lastmod: str,
) -> Path:
    base = root or _root()
    path = base / SITEMAP_NAME
    existing: list[tuple[str, str]] = []
    if path.is_file():
        from scripts.organic.sitemap_graph import parse_urlset_entries

        text = path.read_text(encoding="utf-8")
        for loc, prev in parse_urlset_entries(text):
            if is_market_answer_loc(loc):
                continue
            existing.append((loc, prev or ""))
    if include:
        existing.append((CANONICAL, lastmod or ""))
    write_urlset(path, existing)
    return path


def apply_market_answer_sitemap(
    root: Path | None = None,
    *,
    indexable: bool,
    lastmod: str,
) -> Path:
    return merge_inteligencia_sitemap(root, include=indexable, lastmod=lastmod)


def sitemap_contains_only_eligible_canonical(root: Path | None, *, indexable: bool) -> bool:
    base = root or _root()
    path = base / SITEMAP_NAME
    if not path.is_file():
        return not indexable
    locs = parse_locs(path.read_text(encoding="utf-8"))
    ma = [item for item in locs if is_market_answer_loc(item)]
    if any("?" in item for item in ma):
        return False
    if indexable:
        return ma == [CANONICAL] or ma == [CANONICAL.rstrip("/")]
    return ma == []


def combinatorial_market_answer_urls(root: Path | None = None) -> list[str]:
    """Public generated URL set. Must stay the singleton path."""
    del root
    return [FAMILY_PATH]
