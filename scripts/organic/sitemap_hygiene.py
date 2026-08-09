"""Sitemap / robots / redirect hygiene checks (pure, testable)."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

SITE = "https://confenge.com.br"
NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


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


def _local_path(url: str) -> str:
    if url.startswith("http"):
        p = urlparse(url).path or "/"
    else:
        p = url
    if not p.startswith("/"):
        p = "/" + p
    return p


def extract_locs_from_urlset(xml_text: str) -> list[str]:
    root = ET.fromstring(xml_text)
    locs: list[str] = []
    # with or without namespace
    for loc in root.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc"):
        if loc.text:
            locs.append(loc.text.strip())
    if not locs:
        for loc in root.findall(".//loc"):
            if loc.text:
                locs.append(loc.text.strip())
    return locs


def extract_sitemap_index(xml_text: str) -> list[str]:
    return extract_locs_from_urlset(xml_text)  # same loc elements


def audit_sitemaps(root: Path) -> dict[str, Any]:
    """Validate sitemap-index + members against local files, robots, redirects."""
    issues: list[dict[str, Any]] = []
    robots = (root / "robots.txt").read_text(encoding="utf-8", errors="replace")
    sm_dirs = re.findall(r"(?im)^Sitemap:\s*(\S+)", robots)
    if not sm_dirs:
        issues.append({"severity": "high", "code": "robots_missing_sitemap"})
    elif not any(s.rstrip("/").endswith("sitemap-index.xml") for s in sm_dirs):
        issues.append(
            {
                "severity": "medium",
                "code": "robots_not_pointing_sitemap_index",
                "found": sm_dirs,
            }
        )

    index_path = root / "sitemap-index.xml"
    if not index_path.exists():
        issues.append({"severity": "high", "code": "missing_sitemap_index"})
        return {"ok": False, "issues": issues, "urls": []}

    member_urls = extract_sitemap_index(index_path.read_text(encoding="utf-8"))
    all_page_urls: list[str] = []
    for murl in member_urls:
        path = _local_path(murl).lstrip("/")
        member_file = root / path
        if not member_file.exists():
            issues.append(
                {"severity": "high", "code": "sitemap_member_missing", "url": murl}
            )
            continue
        locs = extract_locs_from_urlset(member_file.read_text(encoding="utf-8"))
        all_page_urls.extend(locs)

    redirects = parse_redirects(
        (root / "_redirects").read_text(encoding="utf-8", errors="replace")
        if (root / "_redirects").exists()
        else ""
    )
    redirect_from = set()
    for r in redirects:
        fr = r["from"]
        # only path rules
        if fr.startswith("http"):
            fr = urlparse(fr).path or fr
        redirect_from.add(fr.rstrip("/") or "/")
        redirect_from.add(fr if fr.endswith("/") else fr + "/")

    seen: set[str] = set()
    for url in all_page_urls:
        if not url.startswith(SITE):
            issues.append(
                {"severity": "high", "code": "non_canonical_host", "url": url}
            )
        path = _local_path(url)
        if path in seen:
            issues.append({"severity": "high", "code": "duplicate_url", "url": url})
        seen.add(path)

        # redirect source in sitemap?
        if path.rstrip("/") in {p.rstrip("/") for p in redirect_from} or path in redirect_from:
            # force rules with trailing variants
            issues.append(
                {"severity": "high", "code": "sitemap_url_is_redirect_source", "url": url}
            )

        # local file exists?
        rel = path.strip("/")
        local = root / rel / "index.html" if rel else root / "index.html"
        if not local.exists():
            # try exact file
            alt = root / rel
            if not alt.exists():
                issues.append(
                    {"severity": "high", "code": "sitemap_url_missing_file", "url": url}
                )
                continue
            local = alt
        html = local.read_text(encoding="utf-8", errors="replace")
        if re.search(
            r'name=["\']robots["\'][^>]*noindex|content=["\'][^"\']*noindex', html, re.I
        ):
            issues.append(
                {"severity": "high", "code": "sitemap_url_noindex", "url": url}
            )
        # canonical self?
        can = re.search(
            r'rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']', html, re.I
        ) or re.search(
            r'href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']', html, re.I
        )
        if can:
            can_url = can.group(1).strip()
            if can_url.rstrip("/") != url.rstrip("/") and can_url != url:
                # allow missing trailing slash mismatch soft
                if can_url.rstrip("/") != url.rstrip("/"):
                    issues.append(
                        {
                            "severity": "medium",
                            "code": "canonical_mismatch",
                            "url": url,
                            "canonical": can_url,
                        }
                    )

    high = [i for i in issues if i.get("severity") == "high"]
    return {
        "ok": len(high) == 0,
        "issues": issues,
        "url_count": len(all_page_urls),
        "unique_paths": len(seen),
        "member_sitemaps": member_urls,
        "robots_sitemaps": sm_dirs,
    }
