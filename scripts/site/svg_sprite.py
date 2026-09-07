#!/usr/bin/env python3
"""One source for the inline SVG icon sprite, and the writer that ships it.

An icon on this site is drawn by a same-document reference::

    <svg class="icon menu-open"><use href="#i-menu"></use></svg>

``<use href="#id">`` resolves only inside the *same* HTML document. When the
page never ships ``<symbol id="i-menu">`` the browser reports nothing at all:
no console error, no network request, no fallback glyph. The element renders
empty and the control silently disappears. That is exactly how the mobile menu
button shipped invisible on 14 published pages while every gate stayed green.

So the reference and the definition are a per-document pair, and the pairing
has to be produced by a writer rather than by hand-pasting the sprite onto each
new page. ``ensure_sprite`` is that writer:

* it adds only the symbols a page actually references, so no page carries icon
  markup it does not draw;
* it never rewrites a symbol a page already defines, which keeps the ~200
  already-correct pages (and the hash-pinned frozen pillar specs) byte-stable;
* it refuses an unknown id instead of inventing a path, so a typo in a
  ``<use>`` surfaces as an error rather than as a plausible wrong drawing.

``scripts/site/html_integrity.py`` is the matching fail-closed gate: it reports
``svg_symbol_undefined`` for every reference without a definition, over the
whole published source census, on every CI run.

The symbol markup below is copied verbatim from the shipped canonical sprite in
``index.html`` (``i-arrow``, ``i-check``, ``i-menu``, ``i-close``,
``i-whatsapp``, ``i-mail``, ``i-pin``) and from ``scripts/pseo/html_shell.py``
(``i-chart``, ``i-shield``, ``i-building``, ``i-file``). Nothing here is drawn
from scratch.
"""

from __future__ import annotations

import re

SPRITE_CLASS = "svg-sprite"

# id -> the exact <symbol> element shipped for that icon.
SPRITE_SYMBOLS: dict[str, str] = {
    "i-arrow": '<symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"></path></symbol>',
    "i-check": '<symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"></path></symbol>',
    "i-menu": '<symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"></path></symbol>',
    "i-close": '<symbol id="i-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></symbol>',
    "i-chart": '<symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 20V10m6 10V4m6 16v-7m4 7H2"></path></symbol>',
    "i-shield": '<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path></symbol>',
    "i-building": '<symbol id="i-building" viewBox="0 0 24 24"><path d="M3 21h18M5 21V9m14 12V9M3 9h18L12 3 3 9Z"></path></symbol>',
    "i-file": '<symbol id="i-file" viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6z"></path></symbol>',
    "i-mail": '<symbol id="i-mail" viewBox="0 0 24 24"><rect height="14" rx="2" width="18" x="3" y="5"></rect><path d="m3 7 9 6 9-6"></path></symbol>',
    "i-pin": '<symbol id="i-pin" viewBox="0 0 24 24"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2"></circle></symbol>',
    # `index.html` and `scripts/pseo/html_shell.py` both ship this symbol with a
    # lowercase `viewbox=`, which is not a valid SVG attribute: a browser ignores
    # it and the icon scales wrong. Those two copies belong to other writers and
    # are left as they are; the one this module can inject is spelled correctly.
    "i-whatsapp": (
        '<symbol id="i-whatsapp" viewBox="0 0 24 24">'
        '<path fill="none" stroke="#fff" stroke-width="1.8" d="M20.5 11.6 A8.5 8.5 0 0 1 7.9 19.1 L3 20.5 '
        'L4.4 15.8 A8.5 8.5 0 1 1 20.5 11.6 Z"></path>'
        '<path fill="none" stroke="#fff" stroke-width="1.8" d="M8.4 7.7 C8.8 7.1 9.4 7 9.8 7.6 L11 9.4 '
        "C11.2 9.8 11.1 10.2 10.8 10.5 L10 11.1 C10.8 12.6 12 13.8 13.5 14.6 L14.2 13.8 C14.5 13.5 14.9 "
        "13.4 15.3 13.6 L17.1 14.6 C17.8 15 17.7 15.7 17.3 16.2 C16.8 16.9 15.9 17.2 15 17.1 C10.6 16.6 "
        '7.2 13.2 6.8 8.8 C6.7 8.3 7.3 7.8 8.4 7.7 Z"></path></symbol>'
    ),
}

USE_REF_RE = re.compile(
    r"""<use\b[^>]*\b(?:xlink:)?href\s*=\s*["']#([A-Za-z][\w:.-]*)["']""",
    re.I,
)
SYMBOL_DEF_RE = re.compile(
    r"""<symbol\b[^>]*\bid\s*=\s*["']([A-Za-z][\w:.-]*)["']""",
    re.I,
)
SPRITE_SVG_RE = re.compile(
    r"""<svg\b[^>]*\bclass\s*=\s*["'][^"']*\bsvg-sprite\b[^"']*["'][^>]*>.*?</svg\s*>""",
    re.I | re.S,
)
SKIP_LINK_RE = re.compile(
    r"""<a\b[^>]*\bclass\s*=\s*["'][^"']*\bskip-link\b[^"']*["'][^>]*>.*?</a\s*>""",
    re.I | re.S,
)
BODY_OPEN_RE = re.compile(r"<body\b[^>]*>", re.I)


def referenced_symbols(html: str) -> set[str]:
    """Every same-document symbol id the page draws with ``<use>``."""
    return set(USE_REF_RE.findall(html or ""))


def defined_symbols(html: str) -> set[str]:
    """Every symbol id the page itself defines."""
    return set(SYMBOL_DEF_RE.findall(html or ""))


def missing_symbols(html: str) -> list[str]:
    """Referenced-but-undefined ids, in a stable order."""
    return sorted(referenced_symbols(html) - defined_symbols(html))


def sprite_block(symbol_ids: list[str]) -> str:
    body = "\n".join(SPRITE_SYMBOLS[symbol_id] for symbol_id in symbol_ids)
    return (
        f'<svg aria-hidden="true" class="{SPRITE_CLASS}" height="0" width="0">\n'
        f"{body}\n"
        "</svg>"
    )


def ensure_sprite(html: str) -> str:
    """Return ``html`` with a definition for every symbol the page references.

    Idempotent: a page whose references are already satisfied comes back byte
    for byte. Raises ``KeyError`` for a referenced id this module does not know
    how to draw — a dangling reference must be reported, never guessed at.
    """
    text = html or ""
    missing = missing_symbols(text)
    if not missing:
        return text

    unknown = [symbol_id for symbol_id in missing if symbol_id not in SPRITE_SYMBOLS]
    if unknown:
        raise KeyError(
            "unknown sprite symbol(s) referenced with <use>: " + ", ".join(unknown)
        )

    existing = SPRITE_SVG_RE.search(text)
    if existing:
        block = existing.group(0)
        addition = "\n".join(SPRITE_SYMBOLS[symbol_id] for symbol_id in missing)
        closing = re.search(r"</svg\s*>\s*\Z", block, re.I)
        assert closing is not None  # SPRITE_SVG_RE only matches a closed <svg>
        patched = block[: closing.start()] + addition + "\n" + block[closing.start() :]
        return text[: existing.start()] + patched + text[existing.end() :]

    block = sprite_block(missing)
    anchor = SKIP_LINK_RE.search(text)
    if anchor:
        return text[: anchor.end()] + "\n" + block + text[anchor.end() :]
    body = BODY_OPEN_RE.search(text)
    if body:
        return text[: body.end()] + "\n" + block + text[body.end() :]
    raise ValueError("cannot place the sprite: the document has no <body> element")
