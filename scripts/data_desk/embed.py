"""Optional responsive embed. Source/canonical visible. No tracker by default."""

from __future__ import annotations

from html import escape
from typing import Any

TRACKER_MARKERS = (
    "googletagmanager",
    "google-analytics",
    "gtag(",
    "analytics.js",
    "plausible.io",
    "hotjar",
    "facebook.net",
    "pixel",
    "doubleclick",
    "mixpanel",
    "segment.com",
)


def build_embed(package: dict[str, Any], *, svg_markup: str | None = None) -> str:
    watermark = package.get("watermark") or ""
    permalink = package.get("permalink") or ""
    canonical = package.get("canonical")
    source_href = canonical or permalink
    source_label = canonical or permalink or "CONFENGE"
    title = escape(str(package.get("title") or "CONFENGE data"))
    citation = escape(str(package.get("citation_text") or ""))
    source_href_e = escape(str(source_href), quote=True)
    source_label_e = escape(str(source_label))
    watermark_html = ""
    if watermark:
        watermark_html = f'<p class="confenge-embed-watermark">{escape(str(watermark))}</p>'
    figure_inner = ""
    if svg_markup:
        figure_inner = svg_markup.strip()
    else:
        figure_inner = f"<p>{citation}</p>"
    html = (
        '<figure class="confenge-embed" data-tracker="none" data-embed="confenge-data-desk">\n'
        f"  {watermark_html}\n"
        f"  <div class=\"confenge-embed-body\">{figure_inner}</div>\n"
        f'  <figcaption class="confenge-embed-source">'
        f"Source: <a href=\"{source_href_e}\" rel=\"noopener\">{source_label_e}</a>"
        f" · {title}"
        f"</figcaption>\n"
        "</figure>\n"
    )
    return html


def embed_has_visible_source(html: str) -> bool:
    return "confenge-embed-source" in html and "<a href=" in html and "Source:" in html


def embed_has_tracker(html: str) -> bool:
    lowered = html.lower()
    if "<script" in lowered:
        return True
    return any(marker in lowered for marker in TRACKER_MARKERS)
