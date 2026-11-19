"""SINAPI SERP snippet pass for issue #126.

Evaluates the shipped article HTML. Does not invent GSC outcomes.
"""

from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from scripts.organic.service_map import extract_bridge_service, html_has_commercial_bridge

ROOT = Path(__file__).resolve().parents[2]
SINAPI_PATH = ROOT / "conteudos" / "sinapi-desonerado-nao-desonerado" / "index.html"
QUERY_LEAD = "desonerado e não desonerado"
# Query language first. The November GSC observation supports testing a clearer
# comparison promise; the on-page decision and technical claims stay unchanged.
CANONICAL_TITLE = "Desonerado e não desonerado no SINAPI: diferenças | CONFENGE"
SERVICE = "/auditoria-orcamento-licitacao/"
TITLE_SOFT_MAX = 60


def _attr(html: str, name: str) -> str:
    """Read every matching meta tag, independently of title and attribute order.

    Crawler directives are cumulative. Reading only the first tag would miss a
    later noindex, and the former title alternative masked every robots value.
    """
    class MetaValues(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.values: list[str] = []

        def handle_starttag(self, tag, attrs):
            if tag != "meta":
                return
            attributes = dict(attrs)
            if (attributes.get("name") or "").lower() == name.lower():
                self.values.append((attributes.get("content") or "").strip())

    parser = MetaValues()
    parser.feed(html)
    return ",".join(parser.values)


def parse_title(html: str) -> str:
    m = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""


def parse_meta_description(html: str) -> str:
    m = re.search(
        r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']|<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']description["\']',
        html,
        re.I,
    )
    if not m:
        return ""
    return (m.group(1) or m.group(2) or "").strip()


def evaluate_sinapi_snippet(html: str | None = None, *, path: Path | None = None) -> dict[str, Any]:
    """Fail-closed snippet audit of the live SINAPI article."""
    source = path or SINAPI_PATH
    text = html if html is not None else source.read_text(encoding="utf-8")
    title = parse_title(text)
    meta = parse_meta_description(text)
    title_core = re.sub(r"\s*\|\s*CONFENGE\s*$", "", title, flags=re.I).strip()
    fails: list[str] = []
    if QUERY_LEAD not in title.lower():
        fails.append("title_missing_query_language")
    if title.lower().startswith("sinapi"):
        fails.append("title_front_loads_sinapi")
    if "sinapi" not in title.lower():
        fails.append("title_omits_sinapi")
    if "CONFENGE" not in title:
        fails.append("title_missing_brand")
    if len(title_core) > TITLE_SOFT_MAX:
        fails.append("title_core_over_soft_max")
    if "edital" not in title.lower() and "edital" not in meta.lower():
        fails.append("missing_edital_answer")
    if "Biblioteca CONFENGE" in meta:
        fails.append("generic_library_meta")
    robots = ",".join((_attr(text, "robots"), _attr(text, "googlebot"))).lower()
    if {"noindex", "none"} & set(re.split(r"[\s,]+", robots)):
        fails.append("unexpected_noindex")
    if not html_has_commercial_bridge(text):
        fails.append("missing_commercial_bridge")
    bridge = extract_bridge_service(text)
    if bridge != SERVICE:
        fails.append("bridge_not_auditoria")
    if "qual usar?" not in text:
        fails.append("on_page_decision_prompt_missing")
    if "SINAPI desonerado" not in text:
        fails.append("on_page_sinapi_missing")
    return {
        "schema_version": "sinapi-snippet-v1",
        "path": "/conteudos/sinapi-desonerado-nao-desonerado/",
        "title": title,
        "title_core": title_core,
        "title_core_chars": len(title_core),
        "meta": meta,
        "bridge_service": bridge,
        "ok": not fails,
        "fails": fails,
    }
