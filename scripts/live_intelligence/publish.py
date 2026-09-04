"""Publish official INDEX opportunity pages, or refuse without fixture fallback.

Called from the site build. Official input missing is not a site-build
failure: other families still publish. Official input present but invalid
or stale fails closed and does not refresh last-accepted or write pages.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from scripts.live_intelligence import (
    DEFAULT_ACCEPTED_DIR,
    DEFAULT_LAST_ACCEPTED_DIR,
    FAMILY_PATH,
    SOURCE_OFFICIAL_LIVE,
)
from scripts.live_intelligence import consume as C
from scripts.live_intelligence import render as R

SITE = "https://confenge.com.br"
DISCOVERY_MARKER = "<!-- live-intelligence-index-discovery -->"


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def publish(
    root: Path | None = None,
    *,
    public_root: Path | None = None,
    mutate_discovery: bool = True,
) -> dict[str, Any]:
    """Consume official input when present and render INDEX pages.

    Returns a status object. ``ok`` is True when either there is no official
    input (skip, no fixture promote) or official consume+render succeeded.
    ``ok`` is False only when official input exists and was rejected.
    """
    site = root or _root()
    pages_root = public_root or site
    official = C.official_dir()
    if not official.is_absolute():
        official = site / official
    if not official.is_dir() or not (official / "manifest.json").is_file():
        return {
            "ok": True,
            "skipped": True,
            "reason": "official_input_absent",
            "official_live": False,
            "pages": 0,
            "indexable": 0,
        }
    try:
        projection = C.consume(official, require_official=True)
    except C.ConsumeError as exc:
        return {
            "ok": False,
            "skipped": False,
            "reason": str(exc),
            "official_live": False,
            "pages": 0,
            "indexable": 0,
        }
    ack = C.ack_payload(projection)
    if not ack["official_live"] or not ack["hash_identity"]:
        return {
            "ok": False,
            "skipped": False,
            "reason": "official_ack_rejected",
            "ack": ack,
            "pages": 0,
            "indexable": 0,
        }
    C.write_projection(
        projection,
        site / DEFAULT_ACCEPTED_DIR,
        last_accepted=site / DEFAULT_LAST_ACCEPTED_DIR,
    )
    written = R.write_pages(projection, root=pages_root)
    try:
        from scripts.organic.sitemap_graph import ensure_index_member

        ensure_index_member(pages_root, R.SITEMAP_NAME)
    except (ImportError, OSError, ValueError):
        pass
    indexable = [
        record
        for record in R.renderable(projection)
        if R.record_is_indexable(record, projection_kind=projection.get("source_kind"))
    ]
    if mutate_discovery:
        _write_discovery(site if public_root is None else pages_root, indexable)
    return {
        "ok": True,
        "skipped": False,
        "reason": "official_live_published",
        "ack": ack,
        "pages": len(written),
        "indexable": len(indexable),
        "index_ready_url": (
            f"{SITE}{R.opportunity_route(indexable[0]['opportunity_id'])}" if indexable else None
        ),
    }


def _write_discovery(site: Path, indexable: list[dict[str, Any]]) -> None:
    """Contextual internal links from ferramentas to INDEX_READY opportunities."""
    ferramentas = site / "ferramentas" / "index.html"
    if not ferramentas.is_file() or not indexable:
        return
    featured = indexable[0]
    route = R.opportunity_route(featured["opportunity_id"])
    objeto = str(featured.get("objeto") or "oportunidade pública").strip()
    snippet = (
        f'{DISCOVERY_MARKER}<p class="tool-situation-result">'
        f'<strong>Oportunidade pública em acompanhamento:</strong> '
        f'<a href="{route}">{R.e(objeto[:160])}</a></p>'
    )
    html = ferramentas.read_text(encoding="utf-8")
    if DISCOVERY_MARKER in html:
        start = html.index(DISCOVERY_MARKER)
        end = html.find("</p>", start)
        if end != -1:
            html = html[:start] + snippet + html[end + 4 :]
            ferramentas.write_text(html, encoding="utf-8")
            return
    needle = "oportunidades públicas oficiais com fonte e data de referência."
    if needle in html:
        html = html.replace(
            needle,
            "oportunidades públicas oficiais com fonte e data de referência.",
        )
    insert_at = html.find('<a class="button button-secondary" href="/analise-cnpj/">')
    if insert_at == -1:
        return
    html = html[:insert_at] + snippet + "\n" + html[insert_at:]
    ferramentas.write_text(html, encoding="utf-8")
