#!/usr/bin/env python3
"""Every glyph a webfont route renders must exist in the shipped subset.

A missing glyph does not raise. The browser silently substitutes another
family for that one character, so a `m²` or a `©` renders in a different
typeface than the sentence around it and nobody notices until someone looks at
a screenshot closely. Both of those shipped in visible home copy on the first
cut of the 2026-08-30 canary, which is why this gate exists.

The alternative was to buy coverage with bytes — subset the whole Latin-1
block and hope. That costs ~14 KB for glyphs the site mostly never uses and
still leaves the trap open one block further out: the next `⌀` or `≈` an editor
types falls back just as quietly. A check is cheaper than the bytes and closes
the class instead of one instance.

Scope is derived, never listed: any route whose HTML links a stylesheet that
declares an `@font-face` with a repo-local `src` is in scope, and the union of
the faces it declares is what its visible text must fit inside.
"""
from __future__ import annotations

import html as html_mod
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fontTools.ttLib import TTFont  # noqa: E402

FONT_FACE_RE = re.compile(r"@font-face\s*\{(.*?)\}", re.S | re.I)
SRC_URL_RE = re.compile(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", re.I)
STYLESHEET_RE = re.compile(
    r"""<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>""", re.I
)
HREF_RE = re.compile(r"""\bhref\s*=\s*["']([^"']+)["']""", re.I)
DROP_ELEMENTS_RE = re.compile(r"<(script|style|template)\b.*?</\1\s*>", re.S | re.I)
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
TAG_RE = re.compile(r"<[^>]+>")
# Attributes a browser paints as text.
TEXT_ATTR_RE = re.compile(
    r"""\b(?:alt|title|placeholder|aria-label)\s*=\s*["']([^"']*)["']""", re.I
)
CSS_CONTENT_RE = re.compile(r"""content\s*:\s*"((?:[^"\\]|\\.)*)\"""")
CSS_ESCAPE_RE = re.compile(r"\\([0-9A-Fa-f]{1,6})\s?")

# Characters that never reach a glyph: whitespace, controls, and the
# zero-width/joining marks used for layout rather than for a drawn shape.
IGNORED = set("\n\r\t\f\v \u00a0\u200b\u200c\u200d\u2060\ufeff\u00ad")


def local_font_files(css_text: str, css_path: Path) -> list[Path]:
    """Repo-local files behind the @font-face rules of one stylesheet."""
    files: list[Path] = []
    for block in FONT_FACE_RE.findall(css_text):
        for url in SRC_URL_RE.findall(block):
            if url.startswith(("http://", "https://", "data:")):
                continue
            target = (ROOT / url.lstrip("/")) if url.startswith("/") else (css_path.parent / url)
            files.append(target.resolve())
    return files


def stylesheets_of(html_text: str, html_path: Path) -> list[Path]:
    out: list[Path] = []
    for tag in STYLESHEET_RE.findall(html_text):
        href = HREF_RE.search(tag)
        if not href:
            continue
        url = href.group(1).split("?")[0].split("#")[0]
        if url.startswith(("http://", "https://", "data:")):
            continue
        target = (ROOT / url.lstrip("/")) if url.startswith("/") else (html_path.parent / url)
        out.append(target.resolve())
    return out


def visible_characters(html_text: str) -> set[str]:
    body = html_text.split("<body", 1)[-1]
    body = DROP_ELEMENTS_RE.sub(" ", body)
    body = COMMENT_RE.sub(" ", body)
    painted = " ".join(TEXT_ATTR_RE.findall(body))
    text = html_mod.unescape(TAG_RE.sub(" ", body)) + " " + html_mod.unescape(painted)
    return {ch for ch in text if ch not in IGNORED}


def generated_characters(css_text: str) -> set[str]:
    """`content:` strings are painted too, and they carry CSS escapes."""
    out: set[str] = set()
    for raw in CSS_CONTENT_RE.findall(css_text):
        decoded = CSS_ESCAPE_RE.sub(lambda m: chr(int(m.group(1), 16)), raw)
        decoded = decoded.replace("\\\\", "\\").replace('\\"', '"')
        out |= {ch for ch in decoded if ch not in IGNORED}
    return out


def hidden_characters(html_text: str) -> set[str]:
    """Characters inside `aria-hidden` elements the canary hides in CSS.

    The external-link glyph `↗` is in the markup but `display:none` on the
    surfaces that ship a subset, replaced by a drawn arrow. It is never
    painted, so it is not a coverage failure — but it is only excusable while
    it stays `aria-hidden`, which is what this narrow carve-out encodes.
    """
    out: set[str] = set()
    for inner in re.findall(
        r"""<span\b[^>]*\baria-hidden\s*=\s*["']true["'][^>]*>([^<]*)</span>""",
        html_text,
        re.I,
    ):
        out |= {ch for ch in html_mod.unescape(inner) if ch not in IGNORED}
    return out


def routes_with_subset_fonts() -> list[tuple[Path, list[Path]]]:
    found: list[tuple[Path, list[Path]]] = []
    for html_path in sorted(ROOT.rglob("*.html")):
        rel = html_path.relative_to(ROOT).as_posix()
        if rel.startswith(("_site/", "node_modules/", "dist/", "build/", ".claude/")):
            continue
        text = html_path.read_text(encoding="utf-8", errors="replace")
        fonts: list[Path] = []
        for sheet in stylesheets_of(text, html_path):
            if not sheet.is_file():
                continue
            fonts.extend(local_font_files(sheet.read_text(encoding="utf-8"), sheet))
        if fonts:
            found.append((html_path, fonts))
    return found


def coverage_failures() -> list[str]:
    failures: list[str] = []
    for html_path, fonts in routes_with_subset_fonts():
        rel = html_path.relative_to(ROOT).as_posix()
        covered: set[int] = set()
        for font_path in fonts:
            if not font_path.is_file():
                failures.append(f"{rel}: @font-face aponta para arquivo inexistente: {font_path}")
                continue
            covered |= set(TTFont(str(font_path)).getBestCmap())

        chars = visible_characters(html_path.read_text(encoding="utf-8"))
        for sheet in stylesheets_of(html_path.read_text(encoding="utf-8"), html_path):
            if sheet.is_file():
                chars |= generated_characters(sheet.read_text(encoding="utf-8"))
        chars -= hidden_characters(html_path.read_text(encoding="utf-8"))

        missing = sorted(ch for ch in chars if ord(ch) not in covered)
        if missing:
            shown = ", ".join(f"U+{ord(ch):04X} {ch!r}" for ch in missing)
            failures.append(
                f"{rel}: glifos fora do subconjunto (renderizam noutra fonte, sem erro): {shown}"
            )
    return failures


def test_subset_fonts_cover_every_glyph_their_routes_render() -> None:
    routes = routes_with_subset_fonts()
    assert routes, "nenhuma rota com webfont local: o gate perdeu o alvo"
    assert not coverage_failures(), coverage_failures()


def test_the_gate_catches_a_glyph_the_subset_does_not_have() -> None:
    """A negative, so a future refactor cannot quietly turn this into a no-op."""
    fonts = [f for _, files in routes_with_subset_fonts() for f in files]
    assert fonts, "sem fonte para exercitar a negativa"
    covered = set(TTFont(str(fonts[0])).getBestCmap())
    absent = next(ch for ch in "⌀≈∞♠" if ord(ch) not in covered)
    synthetic = f"<html><body><p>medida {absent} nominal</p></body></html>"
    chars = visible_characters(synthetic)
    assert absent in chars
    assert [ch for ch in chars if ord(ch) not in covered] == [absent]


def test_hidden_decorative_glyph_is_excused_only_while_aria_hidden() -> None:
    excused = '<html><body><a>PNCP <span aria-hidden="true">\u2197</span></a></body></html>'
    assert "\u2197" not in (visible_characters(excused) - hidden_characters(excused))
    exposed = "<html><body><a>PNCP <span>\u2197</span></a></body></html>"
    assert "\u2197" in (visible_characters(exposed) - hidden_characters(exposed))


def main() -> int:
    failures = coverage_failures()
    for line in failures:
        print(f"FAIL {line}")
    if failures:
        return 1
    routes = routes_with_subset_fonts()
    print(f"FONT_GLYPH_COVERAGE_OK routes={len(routes)}")
    for html_path, fonts in routes:
        print(f"  {html_path.relative_to(ROOT).as_posix()} <- {[f.name for f in fonts]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
