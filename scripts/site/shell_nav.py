#!/usr/bin/env python3
"""Task-first shell navigation: one source of truth, applied to every page.

The header is replicated on ~200 shipped HTML files. `data/site/public-ia-map.json`
(three purchase situations, ≤5 destinations + CTA) is the IA contract;
`data/site/brand.json` (`navigation.desktop` + `navigation.cta`) mirrors the
header so existing generators keep a single write path. This module renders the
desktop nav, the mobile nav and the footer discovery columns and can rewrite
the shipped HTML deterministically.

Usage:
    python3 scripts/site/shell_nav.py --check    # CI: shipped HTML == source
    python3 scripts/site/shell_nav.py --write    # regenerate shipped HTML

Design notes (CFG10X-11 / issue #183):
  * Header names the three purchase situations in visitor language, plus
    Conteúdos and Ferramentas. Destinations are real pages, never home anchors.
  * `aria-current="page"` marks the active branch on internal pages.
  * Desktop and mobile carry the same links in the same order; the footer is a
    short discovery set derived from the IA map, not a taxonomy dump.
  * Nav links carry `data-cta-position` so route choice is measurable through
    the existing click collector (no new event name, no PII).
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.public_ia import (  # noqa: E402
    active_header_href as ia_active_header_href,
    footer_columns_html,
    header_cta as ia_header_cta,
    header_items as ia_header_items,
)

BRAND_PATH = ROOT / "data" / "site" / "brand.json"

# Directories that never ship a visitor shell.
SKIP_DIR_PARTS = frozenset(
    {
        ".git",
        ".claude",
        ".worktrees",
        "_site",
        "node_modules",
        "docs",
        "scripts",
        "seo",
        "supabase",
        "netlify",
        "tests",
        "data",
        "ops",
    }
)

# BOFU pillar HTML frozen by campaign CONFENGE-WEB-BOFU-FROZEN-PILLAR-SPECS-01
# (issues #128/#226) until EARLIEST_SAFE_ACTION_AT = 2026-09-16 or evidential close.
# Their bytes are hash-pinned in data/bofu-dominance/frozen-specs/hashes.json, so the
# shell sync must skip them; once the freeze lifts, drop this set and re-run --write.
_FROZEN_FALLBACK = (
    "aditivos-obras-publicas/index.html",
    "medicoes-glosas-obras-publicas/index.html",
    "reequilibrio-obras-publicas/index.html",
    "auditoria-orcamento-licitacao/index.html",
    "diagnostico-b2g-360/index.html",
    "diagnostico-pre-licitacao/index.html",
)


def _frozen_shell_files() -> frozenset[str]:
    """Read the freeze from the campaign itself so the two can never diverge."""
    try:
        from scripts.bofu_dominance.frozen_specs.constants import (  # noqa: PLC0415
            FORBIDDEN_RELATIVE_PATHS,
        )

        frozen = {rel for rel in FORBIDDEN_RELATIVE_PATHS if rel.endswith("/index.html")}
        if frozen:
            return frozenset(frozen)
    except Exception:  # noqa: BLE001 — never let the sync depend on that package
        pass
    return frozenset(_FROZEN_FALLBACK)


FROZEN_SHELL_FILES = _frozen_shell_files()

DESKTOP_NAV_RE = re.compile(
    r'(<nav\b[^>]*\bclass="[^"]*\bdesktop-nav\b[^"]*"[^>]*>)(.*?)(</nav>)',
    re.S | re.I,
)
MOBILE_NAV_RE = re.compile(
    r'(<nav\b[^>]*\bclass="[^"]*\bmobile-nav\b[^"]*"[^>]*>)(.*?)(</nav>)',
    re.S | re.I,
)
HEADER_CTA_RE = re.compile(
    r'<a\b(?=[^>]*\bheader-cta\b)[^>]*>.*?</a>',
    re.S | re.I,
)
FOOTER_NAV_COL_RE = re.compile(
    r'(<div class="footer-links"><strong>Navegação</strong>)(.*?)(</div>)',
    re.S,
)
FOOTER_TOP_RE = re.compile(
    r'(<div class="container footer-top">\s*<div class="footer-brand">.*?</div>)'
    r'(.*?)'
    r'(\s*</div>\s*<div class="container footer-bottom">)',
    re.S,
)
LEGACY_ANCHOR_HREFS = {
    "/#ofertas": "/servicos-obras-publicas/",
    "/#jornadas": "/problemas-que-resolvemos/",
}


def load_brand() -> dict[str, Any]:
    return json.loads(BRAND_PATH.read_text(encoding="utf-8"))


def nav_items(brand: dict[str, Any] | None = None) -> list[dict[str, str]]:
    ia_items = ia_header_items()
    if ia_items:
        return ia_items
    items = ((brand or load_brand()).get("navigation") or {}).get("desktop") or []
    return [{"label": i["label"], "href": i["href"]} for i in items]


def nav_cta(brand: dict[str, Any] | None = None) -> dict[str, str]:
    cta = ia_header_cta()
    if cta.get("label") and cta.get("href"):
        return cta
    return ((brand or load_brand()).get("navigation") or {}).get("cta") or {
        "label": "Analisar meu caso",
        "href": "/#formulario-contato",
    }


def hub(brand: dict[str, Any], key: str) -> dict[str, Any]:
    return ((brand.get("navigation") or {}).get("hubs") or {}).get(key) or {}


def problem_clusters(brand: dict[str, Any]) -> list[dict[str, str]]:
    return list(brand.get("problem_clusters") or [])


def problem_stages(brand: dict[str, Any]) -> list[dict[str, str]]:
    return list(brand.get("problem_stages") or [])


def _path(value: str | None) -> str:
    """Normalize one public path for exact and descendant comparisons."""
    if not value:
        return ""
    path = value.split("#", 1)[0].split("?", 1)[0]
    if not path.startswith("/"):
        return ""
    return path.rstrip("/") or "/"


def _within(current: str, target: str) -> bool:
    return current == target or (target != "/" and current.startswith(target + "/"))


def active_nav_href(brand: dict[str, Any], current: str | None) -> str | None:
    """Return the one task-first branch that owns the current route."""
    current_path = _path(current)
    if not current_path:
        return None

    mapped = ia_active_header_href(current_path)
    if mapped:
        return mapped

    for item in nav_items(brand):
        href = item["href"]
        target = _path(href)
        if target and not href.startswith("/#") and _within(current_path, target):
            return href
    return None


def _current_flag(href: str, active: str | None) -> str:
    return ' aria-current="page"' if active and href == active else ""


def _nav_anchor(position: str, href: str, label: str, current: bool) -> str:
    aria = ' aria-current="page"' if current else ""
    return (
        f'<a data-cta-position="{position}"{aria} '
        f'href="{html_lib.escape(href, quote=True)}" style="min-height:44px">'
        f"{html_lib.escape(label)}</a>"
    )


def desktop_links(brand: dict[str, Any], current: str | None = None) -> str:
    active = active_nav_href(brand, current)
    return "\n".join(
        _nav_anchor("header_nav", i["href"], i["label"], i["href"] == active)
        for i in nav_items(brand)
    )


def mobile_links(brand: dict[str, Any], current: str | None = None) -> str:
    active = active_nav_href(brand, current)
    return "\n".join(
        _nav_anchor("mobile_nav", i["href"], i["label"], i["href"] == active)
        for i in nav_items(brand)
    )


def footer_nav_links(brand: dict[str, Any], current: str | None = None) -> str:
    """Footer discovery columns from the IA map (not a taxonomy dump)."""
    del brand, current
    return footer_columns_html()


def desktop_cta(brand: dict[str, Any]) -> str:
    cta = nav_cta(brand)
    return (
        f'<a class="button button-primary header-cta" '
        f'href="{html_lib.escape(cta["href"], quote=True)}">'
        f'{html_lib.escape(cta["label"])}</a>'
    )


def mobile_cta(brand: dict[str, Any]) -> str:
    cta = nav_cta(brand)
    return (
        f'<a class="button button-primary" '
        f'href="{html_lib.escape(cta["href"], quote=True)}">'
        f'{html_lib.escape(cta["label"])}</a>'
    )


def page_path(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    return "/" + rel


def shipped_html_files() -> list[Path]:
    out: list[Path] = []
    for path in sorted(ROOT.rglob("*.html")):
        rel = path.relative_to(ROOT)
        if any(part in SKIP_DIR_PARTS for part in rel.parts):
            continue
        if rel.as_posix() in FROZEN_SHELL_FILES:
            continue
        out.append(path)
    return out


def _replace_nav(text: str, regex: re.Pattern[str], inner: str) -> str:
    def sub(match: re.Match[str]) -> str:
        return f"{match.group(1)}\n{inner}\n{match.group(3)}"

    return regex.sub(sub, text, count=1)


def _header_cta(match: re.Match[str], brand: dict[str, Any]) -> str:
    """Keep a versioned offer action; normalize only the generic shell CTA."""
    anchor = match.group(0)
    if (
        'data-cta-kind="offer"' in anchor
        and 'data-next-action-id="' in anchor
        and 'data-offer-id="' in anchor
    ):
        return anchor
    return desktop_cta(brand)


def sync_text(text: str, brand: dict[str, Any], current: str | None) -> str:
    """Idempotently align one page's header/footer navigation with brand.json."""
    if 'class="desktop-nav"' not in text and 'class="mobile-nav"' not in text:
        return text

    if DESKTOP_NAV_RE.search(text):
        text = _replace_nav(text, DESKTOP_NAV_RE, desktop_links(brand, current))

    if HEADER_CTA_RE.search(text):
        text = HEADER_CTA_RE.sub(lambda match: _header_cta(match, brand), text, count=1)

    mobile = MOBILE_NAV_RE.search(text)
    if mobile:
        inner = f"{mobile_links(brand, current)}\n{mobile_cta(brand)}"
        text = _replace_nav(text, MOBILE_NAV_RE, inner)

    if FOOTER_TOP_RE.search(text):
        columns = footer_nav_links(brand)
        text = FOOTER_TOP_RE.sub(
            lambda m: f"{m.group(1)}\n{columns}{m.group(3)}", text, count=1
        )
    elif FOOTER_NAV_COL_RE.search(text):
        links = footer_nav_links(brand)
        text = FOOTER_NAV_COL_RE.sub(
            lambda m: f"{m.group(1)}{links}{m.group(3)}", text, count=1
        )

    # Any remaining home-anchor pointer (footer, inline links) follows the label.
    for legacy, target in LEGACY_ANCHOR_HREFS.items():
        text = text.replace(f'href="{legacy}"', f'href="{target}"')
    return text


def run(write: bool) -> int:
    brand = load_brand()
    ia_labels = [item["label"] for item in ia_header_items()]
    brand_labels = [item["label"] for item in (brand.get("navigation") or {}).get("desktop") or []]
    if ia_labels != brand_labels:
        print(
            "FAIL brand.json navigation.desktop does not match "
            f"data/site/public-ia-map.json header: {brand_labels} != {ia_labels}"
        )
        return 1
    changed: list[str] = []
    for path in shipped_html_files():
        original = path.read_text(encoding="utf-8")
        updated = sync_text(original, brand, page_path(path))
        if updated == original:
            continue
        changed.append(path.relative_to(ROOT).as_posix())
        if write:
            path.write_text(updated, encoding="utf-8")
    if write:
        print(json.dumps({"synced": len(changed), "files": changed[:20]}, ensure_ascii=False))
        return 0
    if changed:
        print("FAIL shell nav out of sync with data/site/brand.json:")
        for rel in changed[:40]:
            print("  ", rel)
        print(f"  ({len(changed)} file(s)) — run: python3 scripts/site/shell_nav.py --write")
        return 1
    print("PASS shell nav in sync with data/site/brand.json")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true")
    group.add_argument("--write", action="store_true")
    args = parser.parse_args(argv)
    return run(write=bool(args.write))


if __name__ == "__main__":
    sys.exit(main())
