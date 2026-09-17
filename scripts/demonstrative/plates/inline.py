"""Embed the rendered plates into hand-written source HTML.

A source page marks a slot with two comments:

    <!-- plate:recorte-banheiro --> ... <!-- /plate -->

and this script replaces everything between them with the desktop and mobile
SVGs of that plate (``assets/pranchas/<slug>-desktop.svg`` and ``-mobile.svg``),
tagged ``class="plate__desktop"`` / ``class="plate__mobile"`` so css/editorial.css
shows one of them per breakpoint. The comments stay, so the step is idempotent
and ``--check`` can prove the HTML matches the versioned SVGs.

Usage:
    python3 -m scripts.demonstrative.plates.inline            # rewrite pages
    python3 -m scripts.demonstrative.plates.inline --check    # exit 1 on drift
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PLATES_DIR = ROOT / "assets" / "pranchas"
PAGES = [
    "index.html",
    "servicos/index.html",
    "quantitativos-orcamento-obras/index.html",
    "medicoes-glosas-obras-publicas/index.html",
]
SLOT = re.compile(r"<!-- plate:([a-z0-9-]+) -->.*?<!-- /plate -->", re.S)


def _svg(slug: str, variant: str) -> str:
    path = PLATES_DIR / f"{slug}-{variant}.svg"
    text = path.read_text(encoding="utf-8").strip()
    if not text.startswith("<svg"):
        raise SystemExit(f"plate_not_svg:{path}")
    # The root element carries the breakpoint class; nothing else is touched.
    return text.replace("<svg ", f'<svg class="plate__{variant}" ', 1)


def render(html: str) -> str:
    def repl(match: re.Match[str]) -> str:
        slug = match.group(1)
        return (
            f"<!-- plate:{slug} -->\n"
            f"{_svg(slug, 'desktop')}\n{_svg(slug, 'mobile')}\n"
            f"<!-- /plate -->"
        )

    return SLOT.sub(repl, html)


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
