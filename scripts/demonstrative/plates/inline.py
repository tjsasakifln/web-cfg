"""Embed the rendered plates into hand-written source HTML.

A source page marks a slot with two comments:

    <!-- plate:recorte-banheiro --> ... <!-- /plate -->

(``eager`` marks the one plate that sits in the first fold) and this script
replaces everything between them with a <picture> that points at the desktop
SVG from 700px up and at the mobile SVG below (``assets/pranchas/<slug>-desktop.svg``
and ``-mobile.svg``), with explicit dimensions so nothing shifts. The comments stay, so the step is idempotent
and ``--check`` can prove the HTML matches the versioned SVGs.

Usage:
    python3 -m scripts.demonstrative.plates.inline            # rewrite pages
    python3 -m scripts.demonstrative.plates.inline --check    # exit 1 on drift
"""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PLATES_DIR = ROOT / "assets" / "pranchas"
def _pages(root: Path = ROOT) -> list[str]:
    """Every tracked source page that carries a plate slot. Discovered from the
    markup (not a hand list) so a family can add a plate to its page without
    editing this module; docs, prototypes, node_modules and _site are never
    sources."""
    skip = {"_site", "docs", "node_modules", "build", "seo", ".git"}
    found: list[str] = []
    for path in sorted(root.rglob("*.html")):
        rel = path.relative_to(root)
        if rel.parts[0] in skip:
            continue
        if "<!-- plate:" in path.read_text(encoding="utf-8", errors="ignore"):
            found.append(rel.as_posix())
    return found


PAGES = _pages()
SLOT = re.compile(r"<!-- plate:([a-z0-9-]+)((?: eager| narrow)*) -->.*?<!-- /plate -->", re.S)


def _dims(svg_text: str) -> tuple[int, int]:
    m = re.search(r'viewBox="0 0 (\d+) (\d+)"', svg_text)
    if not m:
        raise SystemExit("plate_viewbox_missing")
    return int(m.group(1)), int(m.group(2))


def _title(svg_text: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", svg_text, re.S)
    return html.unescape(re.sub(r"\s+", " ", m.group(1)).strip()) if m else ""


def picture(slug: str, *, eager: bool = False, narrow: bool = False) -> str:
    """One <picture> per plate: desktop file from 700px up, mobile file below.

    The plates were inlined until 2026-09-17; the repository's Lighthouse gate
    then measured the home at 1.343 DOM elements (cap 800) and 163 KB of
    payload (cap 150 KB) because every slot carried two SVG documents. As
    external images each plate costs one element and one request, only the
    variant that matches the breakpoint is fetched, and below-the-fold plates
    are lazy. Inside <img> the sheet text renders with the system font (Arial /
    Liberation Sans, the same family the site's metric fallback uses), not
    Archivo; the drawing, dimensions and title block are unchanged.
    """
    desk = (PLATES_DIR / f"{slug}-desktop.svg").read_text(encoding="utf-8")
    mob = (PLATES_DIR / f"{slug}-mobile.svg").read_text(encoding="utf-8")
    dw, dh = _dims(desk)
    mw, mh = _dims(mob)
    alt = html.escape(_title(desk))
    loading = 'loading="eager"' if eager else 'loading="lazy"'
    if narrow:
        # Slot de coluna estreita (entregas da home, prancha secundaria, abertura
        # lateral): a composicao de 1200 px escalada a ~50% deixa cotas e carimbo
        # ilegiveis (aceite 2026-09-17). A variante reenquadrada (360x420, fonte
        # minima 12,5) e servida em todas as larguras.
        return (
            f'<picture class="plate__picture plate__picture--narrow">'
            f'<img alt="{alt}" decoding="async" {loading} src="/assets/pranchas/{slug}-mobile.svg" width="{mw}" height="{mh}"/>'
            f'</picture>'
        )
    return (
        f'<picture class="plate__picture">'
        f'<source media="(min-width:700px)" srcset="/assets/pranchas/{slug}-desktop.svg" width="{dw}" height="{dh}"/>'
        f'<img alt="{alt}" decoding="async" {loading} src="/assets/pranchas/{slug}-mobile.svg" width="{mw}" height="{mh}"/>'
        f'</picture>'
    )


def render(html_text: str) -> str:
    def repl(match: re.Match[str]) -> str:
        slug = match.group(1)
        flags = match.group(2) or ""
        eager = " eager" in flags
        narrow = " narrow" in flags
        return f"<!-- plate:{slug}{flags} -->\n{picture(slug, eager=eager, narrow=narrow)}\n<!-- /plate -->"

    return SLOT.sub(repl, html_text)


def main(argv: list[str]) -> int:
    check = "--check" in argv
    drift = []
    for rel in PAGES:
        path = ROOT / rel
        if not path.is_file():
            continue
        before = path.read_text(encoding="utf-8")
        if "<!-- plate:" not in before:
            continue
        after = render(before)
        if after != before:
            if check:
                drift.append(rel)
            else:
                path.write_text(after, encoding="utf-8")
                print(f"inlined plates: {rel}")
    if drift:
        print("plates_drift: " + ", ".join(drift))
        return 1
    if check:
        print("OK plates inline")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
