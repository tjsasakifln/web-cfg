#!/usr/bin/env python3
"""Preload the identity webfont on every shipped page that loads /styles.css.

Since 2026-09-16 the Archivo face ships in styles.css for all routes. With
font-display:swap the fallback faces are metric-matched, but a font that only
becomes discoverable after the stylesheet is parsed still repaints late on the
edge (the 2026-08 acceptance rollbacks measured CLS 0.065 on the hero). The
home already preloaded the file; this module makes that part of the shared
head contract for every mutable page and the generated shell.

Usage:
    python3 scripts/site/font_preload.py --check    # CI: every page preloads the font
    python3 scripts/site/font_preload.py --write    # insert the link before /styles.css

Hash-frozen BOFU pillars are skipped (their HTML may not change); they keep
the swap fallback only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.shell_nav import shipped_html_files  # noqa: E402

# Pages whose visitor HTML is bound to a human approval hash (editorial
# striking-distance canary). Their bytes may not change without a new
# approval, so they keep the swap fallback without the preload.
HASH_BOUND_DECISIONS = ROOT / "data" / "editorial" / "striking-distance-noindex.v1.json"

FONT_HREF = "/assets/archivo-var-latin-bf6e041e.woff2"
PRELOAD = (
    f'<link rel="preload" as="font" type="font/woff2" href="{FONT_HREF}" '
    'crossorigin="anonymous"/>'
)
STYLES_LINK_RE = re.compile(r'<link (?:href="/styles\.css" rel="stylesheet"|rel="stylesheet" href="/styles\.css")/>')
PRELOAD_RE = re.compile(
    r'<link[^>]*rel="preload"[^>]*as="font"[^>]*href="' + re.escape(FONT_HREF) + r'"[^>]*/?>'
)


# Click-origin articles pinned byte-for-byte to origin/main by
# scripts/organic/tests/test_inb08_owned_routes.py (only revision dates masked).
BYTE_PINNED_ARTICLES = frozenset(
    {
        "conteudos/custos-indiretos-atraso-administracao-obra/index.html",
        "conteudos/jogo-de-planilha-aditivo-obra-publica/index.html",
        "conteudos/fiscal-nao-assina-medicao-obra-publica/index.html",
    }
)


def hash_bound_pages() -> set[str]:
    bound = set(BYTE_PINNED_ARTICLES)
    if HASH_BOUND_DECISIONS.is_file():
        data = json.loads(HASH_BOUND_DECISIONS.read_text(encoding="utf-8"))
        bound |= {str(row.get("html") or "") for row in data.get("urls") or [] if row.get("approval")}
    return bound


def pages() -> list[Path]:
    bound = hash_bound_pages()
    return [
        p
        for p in shipped_html_files()
        if p.relative_to(ROOT).as_posix() not in bound
        and STYLES_LINK_RE.search(p.read_text(encoding="utf-8"))
    ]


def ensure_preload(text: str) -> str:
    if PRELOAD_RE.search(text):
        return text
    return STYLES_LINK_RE.sub(lambda m: PRELOAD + "\n" + m.group(0), text, count=1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    missing: list[str] = []
    changed = 0
    for path in pages():
        text = path.read_text(encoding="utf-8")
        new = ensure_preload(text)
        if new == text:
            continue
        rel = path.relative_to(ROOT).as_posix()
        if args.write:
            path.write_text(new, encoding="utf-8")
            changed += 1
        else:
            missing.append(rel)
    if args.write:
        print(f"font preload written on {changed} page(s)")
        return 0
    if missing:
        print("FAIL pages without the identity font preload (run --write):")
        for rel in missing:
            print(f"  {rel}")
        return 1
    print(f"OK font preload present on {len(pages())} page(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
