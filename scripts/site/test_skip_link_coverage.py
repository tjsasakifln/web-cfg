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
  2. point it at the ``id`` of a ``<main>`` in the same document
     (no dangling or misleading skip link);
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
STYLE_BLOCK_RE = re.compile(r"<style\b[^>]*>(.*?)</style>", re.I | re.S)
LINK_TAG_RE = re.compile(r"<link\b[^>]*>", re.I)
STYLESHEET_HREF_RE = re.compile(r"\bhref=[\"']([^\"']+)[\"']", re.I)
FOCUS_RULE_RE = re.compile(
    r"\.skip-link\s*:(?:focus|focus-visible)\s*\{([^}]*)\}", re.I | re.S
)
VISIBLE_FOCUS_DECLARATION_RE = re.compile(
    r"(?:^|;)\s*(?:transform|clip|clip-path|opacity|top|left|outline|"
    r"box-shadow|background|color|border)\s*:\s*[^;{}]+",
    re.I,
)
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


def main_has_id(html: str, target: str) -> bool:
    return (
        re.search(
            rf"<main\b(?=[^>]*\s+id\s*=\s*[\"']{re.escape(target)}[\"'])[^>]*>",
            html,
            re.I,
        )
        is not None
    )


def focus_rule_makes_link_visible(css: str) -> bool:
    return any(VISIBLE_FOCUS_DECLARATION_RE.search(body) for body in FOCUS_RULE_RE.findall(css))


def has_reachable_focus_style(html: str) -> bool:
    """Verify the CSS content, not a stylesheet filename that merely looks plausible."""
    if any(focus_rule_makes_link_visible(css) for css in STYLE_BLOCK_RE.findall(html)):
        return True

    for tag in LINK_TAG_RE.findall(html):
        href = STYLESHEET_HREF_RE.search(tag)
        if not href or href.group(1).split("?", 1)[0] != "/styles.css":
            continue
        css_path = ROOT / "styles.css"
        if css_path.is_file() and focus_rule_makes_link_visible(
            css_path.read_text(encoding="utf-8")
        ):
            return True
    return False


def check_page(path: Path, html: str) -> list[str]:
    errors: list[str] = []
    anchor = SKIP_LINK_RE.search(html)
    if not anchor:
        return ['missing skip link (expected <a class="skip-link" href="#conteudo">)']

    href = HREF_RE.search(anchor.group(0))
    if not href:
        errors.append("skip link has no in-page href target")
    elif not main_has_id(html, href.group(1)):
        errors.append(
            f"skip link target must be a <main> with id={href.group(1)!r}"
        )

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

    if not has_reachable_focus_style(html):
        errors.append(
            "no reachable, non-empty .skip-link focus style "
            "(link /styles.css or define it inline)"
        )
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


def test_gate_contract() -> list[str]:
    """Negative fixtures keep the gate fail-closed as its implementation evolves."""
    good = (
        '<style>.skip-link:focus{transform:none}</style><body>'
        '<a class="skip-link" href="#conteudo">Pular</a>'
        '<main id="conteudo"><a href="/">Conteúdo</a></main></body>'
    )
    if check_page(ROOT / "fixture.html", good):
        return ["internal fixture: valid skip-link contract was rejected"]

    cases = {
        "target outside main": good.replace(
            '<main id="conteudo"><a href="/">Conteúdo</a></main>',
            '<div id="conteudo"></div><main><a href="/">Conteúdo</a></main>',
        ),
        "unverified stylesheet": good.replace(
            '<style>.skip-link:focus{transform:none}</style>',
            '<link rel="stylesheet" href="/styles-offers.css">',
        ),
        "empty focus rule": good.replace("transform:none", ""),
    }
    failures: list[str] = []
    for label, html in cases.items():
        if not check_page(ROOT / "fixture.html", html):
            failures.append(f"internal fixture unexpectedly passed: {label}")
    return failures


def main() -> int:
    failures = (
        test_gate_contract()
        + test_exclusions_are_live()
        + test_skip_link_on_every_public_page()
    )
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
