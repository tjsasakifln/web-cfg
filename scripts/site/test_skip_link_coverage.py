#!/usr/bin/env python3
"""Fail-closed skip-link gate for the public surface (#296).

Why this exists
---------------
axe-core emits no violation for a page that simply has no skip link, so
``npm run audit:axe`` stayed green while ten public pages -- every conversion
"obrigado", the three checkout state pages, both legal pages and /404.html --
shipped without one. A keyboard visitor landing there had to tab through the
whole header and navigation before reaching the content.

Shape of the gate
-----------------
This sweep is deliberately **fail-closed and enumerated from the published
surface**, not from an allowlist of routes already covered: it reads the same
``PUBLIC_TOP_DIRS`` / ``PUBLIC_ROOT_FILES`` contract that assembles ``_site``,
so a public page added tomorrow is checked the day it lands. An allowlist of
covered routes would silently age; this cannot.

Every public HTML document must:
  1. carry an ``<a class="skip-link" href="#id">`` anchor;
  2. point it at an ``id`` that actually exists in the same document
     (no dangling skip link);
  3. place it before any other focusable element in ``<body>`` so it is the
     first stop of the keyboard tab order;
  4. keep a focus style for ``.skip-link:focus`` reachable from the document
     (site stylesheet or an inline ``<style>``), so activation is visible.

Exclusions are declared below **with a reason** and are themselves policed:
an excluded tree must stay fully ``noindex``. The moment a page under it
becomes indexable, this gate fails and the exclusion has to be revisited.

Run: python3 scripts/site/test_skip_link_coverage.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.public_artifact import (  # noqa: E402
    PUBLIC_ROOT_FILES,
    PUBLIC_TOP_DIRS,
)

# Declared, justified exclusions. Key = path prefix relative to the repo root.
# Each excluded tree must remain entirely noindex (enforced below).
EXCLUSIONS: dict[str, str] = {
    "piloto/": (
        "headless pilot shell, noindex,nofollow on every page: not a visitor "
        "surface, kept published only as a deliberate fixture tree"
    ),
    "ops/": (
        "internal RevOps console, noindex + robots Disallow: staff-only "
        "surface published for operators, not part of the visitor journey"
    ),
    "assets/data-desk/": (
        "generated citation-kit permalinks, noindex,follow: a machine-facing "
        "file listing emitted by scripts/data_desk/publish.py with no header, "
        "no navigation and therefore nothing for a skip link to skip"
    ),
}

SKIP_LINK_RE = re.compile(
    r"<a\b[^>]*\bclass=[\"'][^\"']*\bskip-link\b[^\"']*[\"'][^>]*>", re.I
)
HREF_RE = re.compile(r"\bhref=[\"']#([^\"']+)[\"']", re.I)
BODY_RE = re.compile(r"<body\b[^>]*>", re.I)
FOCUSABLE_RE = re.compile(r"<(?:a\b[^>]*\bhref=|button\b|input\b|select\b|textarea\b)", re.I)
NOINDEX_RE = re.compile(
    r"<meta\b[^>]*\bname=[\"']robots[\"'][^>]*\bcontent=[\"'][^\"']*noindex", re.I
)


def public_html_files() -> list[Path]:
    """Every HTML document that reaches the published artifact."""
    found: list[Path] = []
    for name in sorted(PUBLIC_ROOT_FILES):
        if name.endswith(".html") and (ROOT / name).is_file():
            found.append(ROOT / name)
    for top in sorted(PUBLIC_TOP_DIRS):
        base = ROOT / top
        if not base.is_dir():
            continue
        found.extend(sorted(base.rglob("*.html")))
    return sorted(set(found))


def excluded_reason(rel: str) -> str | None:
    for prefix, reason in EXCLUSIONS.items():
        if rel.startswith(prefix):
            return reason
    return None


def has_id(html: str, target: str) -> bool:
    return re.search(rf"\bid=[\"']{re.escape(target)}[\"']", html) is not None


def check_page(path: Path, html: str) -> list[str]:
    errors: list[str] = []
    anchor = SKIP_LINK_RE.search(html)
    if not anchor:
        return ['missing skip link (expected <a class="skip-link" href="#conteudo">)']

    href = HREF_RE.search(anchor.group(0))
    if not href:
        errors.append("skip link has no in-page href target")
    elif not has_id(html, href.group(1)):
        errors.append(f"dangling skip link: no element with id={href.group(1)!r}")

    body = BODY_RE.search(html)
    if not body:
        errors.append("no <body> element")
    else:
        if anchor.start() < body.end():
            errors.append("skip link must live inside <body>")
        else:
            first = FOCUSABLE_RE.search(html, body.end())
            if first and first.start() < anchor.start():
                errors.append(
                    "skip link is not the first focusable element in <body> "
                    f"(preceded by {html[first.start():first.start() + 40]!r})"
                )

    styled = "<style" in html.lower() and ".skip-link:focus" in html
    linked = re.search(r"<link\b[^>]*\bhref=[\"']/styles(?:-[a-z]+)?\.css", html, re.I)
    if not (styled or linked):
        errors.append("no reachable .skip-link:focus style (link styles.css or inline it)")
    return errors


def test_skip_link_on_every_public_page() -> list[str]:
    failures: list[str] = []
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    if ".skip-link:focus" not in css:
        failures.append("styles.css: missing .skip-link:focus rule (focus must be visible)")

    checked = 0
    for path in public_html_files():
        rel = path.relative_to(ROOT).as_posix()
        html = path.read_text(encoding="utf-8")
        reason = excluded_reason(rel)
        if reason:
            # Policed exclusion: the tree may only stay excluded while noindex.
            if not NOINDEX_RE.search(html):
                failures.append(
                    f"{rel}: excluded as {reason!r} but is indexable -- "
                    "either add a skip link or fix the exclusion"
                )
            continue
        checked += 1
        for err in check_page(path, html):
            failures.append(f"{rel}: {err}")

    if checked < 200:
        failures.append(
            f"only {checked} public pages swept; the public surface contract "
            "looks broken (expected the full published artifact)"
        )
    return failures


def test_exclusions_are_live() -> list[str]:
    """A stale exclusion is a silent hole: every prefix must still exist."""
    return [
        f"exclusion {prefix!r} points at no directory; drop it from EXCLUSIONS"
        for prefix in EXCLUSIONS
        if not (ROOT / prefix.rstrip("/")).is_dir()
    ]


def main() -> int:
    failures = test_exclusions_are_live() + test_skip_link_on_every_public_page()
    if failures:
        print("FAIL skip-link coverage")
        for f in failures:
            print(" -", f)
        return 1
    total = len(public_html_files())
    excluded = sum(1 for p in public_html_files() if excluded_reason(p.relative_to(ROOT).as_posix()))
    print("OK test:skip-link")
    print(f"public HTML swept: {total - excluded} (declared exclusions: {excluded})")
    for prefix, reason in EXCLUSIONS.items():
        print(f"excluded {prefix} -- {reason}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
