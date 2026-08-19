"""BOFU commercial-bridge and aditivos snippet pass for issue #128."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from scripts.organic.service_map import audit_link_coverage, html_has_commercial_bridge

ROOT = Path(__file__).resolve().parents[2]
ADITIVOS = ROOT / "aditivos-obras-publicas" / "index.html"
QUERY_LEAD = "aditivos em obras públicas"
CANONICAL_TITLE = "Aditivos em obras públicas: documentos e margem | CONFENGE"
PILLARS = (
    "aditivos-obras-publicas",
    "medicoes-glosas-obras-publicas",
    "reequilibrio-obras-publicas",
    "auditoria-orcamento-licitacao",
    "diagnostico-b2g-360",
    "diagnostico-pre-licitacao",
)


def parse_title(html: str) -> str:
    m = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""


def parse_meta_description(html: str) -> str:
    m = re.search(
        r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']|'
        r'<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']description["\']',
        html,
        re.I,
    )
    if not m:
        return ""
    return (m.group(1) or m.group(2) or "").strip()


def evaluate_aditivos_snippet(html: str | None = None) -> dict[str, Any]:
    text = html if html is not None else ADITIVOS.read_text(encoding="utf-8")
    title = parse_title(text)
    meta = parse_meta_description(text)
    fails: list[str] = []
    if QUERY_LEAD not in title.lower():
        fails.append("title_missing_query")
    if "CONFENGE" not in title:
        fails.append("title_missing_brand")
    if "Biblioteca CONFENGE" in meta or "Biblioteca CONFENGE" in title:
        fails.append("generic_library_snippet")
    robots = ""
    rm = re.search(r'name=["\']robots["\'][^>]*content=["\']([^"\']+)["\']', text, re.I)
    if rm:
        robots = rm.group(1).lower()
    if "noindex" in robots:
        fails.append("pillar_noindex")
    if 'id="quando-nao-contratar"' not in text and "data-when-not-hire" not in text:
        fails.append("missing_when_not_to_hire")
    if "canonical" not in text.lower():
        fails.append("missing_canonical")
    return {
        "schema_version": "bofu-aditivos-snippet-v1",
        "path": "/aditivos-obras-publicas/",
        "title": title,
        "meta": meta,
        "ok": not fails,
        "fails": fails,
    }


def evaluate_indexable_bridges(root: Path | None = None) -> dict[str, Any]:
    cov = audit_link_coverage(root or ROOT)
    fails: list[str] = []
    if cov["indexable_mapped"] < 1:
        fails.append("no_indexable_mapped")
    if cov["indexable_commercial_bridge_coverage"] < 1.0:
        fails.append("indexable_bridge_coverage_below_1")
    missing_pillars = []
    for slug in PILLARS:
        page = (root or ROOT) / slug / "index.html"
        if not page.is_file():
            missing_pillars.append(slug)
            continue
        html = page.read_text(encoding="utf-8")
        if re.search(r'content=["\'][^"\']*noindex', html, re.I):
            fails.append(f"pillar_noindex:{slug}")
    if missing_pillars:
        fails.append("missing_pillars:" + ",".join(missing_pillars))
    return {
        "schema_version": "bofu-indexable-bridges-v1",
        "coverage": {
            "indexable_mapped": cov["indexable_mapped"],
            "indexable_commercial_bridge_coverage": cov[
                "indexable_commercial_bridge_coverage"
            ],
            "commercial_bridge_coverage": cov["commercial_bridge_coverage"],
        },
        "ok": not fails,
        "fails": fails,
    }
