"""Sitemap / robots / redirect hygiene checks (pure, testable)."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

SITE = "https://confenge.com.br"


def parse_redirects(text: str) -> list[dict[str, str]]:
    """Parse Netlify ``_redirects`` syntax without silent false negatives.

    Supported shapes (path rules):
    - ``/from  /to``                          → status defaults to 301
    - ``/from  /to  301`` / ``410`` / ``200``
    - ``/from  /to  301!``                    → force flag preserved on status
    - host rules with ``http(s)://…`` from/to
    - splats / wildcards (``/*``, ``:splat``) kept as-is for source matching

    Query-parameter and shadowing rules are accepted when they have ≥2 tokens.
    Lines with fewer than 2 non-comment tokens are skipped (malformed).
    """
    rules: list[dict[str, str]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        from_path = parts[0]
        to_path = parts[1]
        status = "301"
        if len(parts) >= 3:
            # status may be "301", "301!", "410", "200" — keep force marker
            status = parts[2]
        # Optional further tokens (Role conditions, country, language) ignored for hygiene
        rules.append({"from": from_path, "to": to_path, "status": status})
    return rules


def _meta_robots_noindex(html: str) -> bool:
    """True only when a real robots meta tag contains noindex.

    Fail-closed JS that *writes* noindex into a string is not a robots tag.
    """
    for match in re.finditer(r"<meta\b[^>]*>", html, re.I):
        tag = match.group(0)
        if not re.search(r'name=["\']robots["\']', tag, re.I):
            continue
        content = re.search(r'content=["\']([^"\']+)["\']', tag, re.I)
        if content and "noindex" in content.group(1).lower():
            return True
    return False


def _local_path(url: str) -> str:
    if url.startswith("http"):
        p = urlparse(url).path or "/"
    else:
        p = url
    if not p.startswith("/"):
        p = "/" + p
    return p


def extract_locs_from_urlset(xml_text: str) -> list[str]:
    from scripts.organic.sitemap_graph import parse_urlset_locs

    return parse_urlset_locs(xml_text)


def extract_sitemap_index(xml_text: str) -> list[str]:
    from scripts.organic.sitemap_graph import parse_sitemap_index

    return [member.loc for member in parse_sitemap_index(xml_text)]


def audit_sitemaps(root: Path) -> dict[str, Any]:
    """Validate sitemap-index + every child against local files, robots, redirects.

    Walks the index (not a hardcoded four-file list). Exact-one, noindex,
    robots-block, redirect, missing file, external canonical, lastmod, sitemap.txt
    drift and #151 stale Market Answer membership fail the gate.
    """
    from scripts.organic.sitemap_graph import audit_graph

    return audit_graph(root)
