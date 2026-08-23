#!/usr/bin/env python3
"""Task-first shell navigation: one source of truth, applied to every page.

The header is replicated on ~200 shipped HTML files. `data/site/brand.json`
(`navigation.desktop` + `navigation.cta`) is the source; this module renders the
desktop nav, the mobile nav and the footer navigation column from it and can
rewrite the shipped HTML deterministically.

Usage:
    python3 scripts/site/shell_nav.py --check    # CI: shipped HTML == source
    python3 scripts/site/shell_nav.py --write    # regenerate shipped HTML

Design notes (issue #183):
  * "Serviços" and "Problemas que resolvemos" point at real hubs, never at a
    home anchor, so an internal page keeps the visitor in context.
  * `aria-current="page"` marks the active branch on internal pages.
  * Desktop and mobile carry the same links in the same order; the footer
    navigation column is generated from the same list.
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
        if str(ROOT) not in sys.path:
            sys.path.insert(0, str(ROOT))
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
FOOTER_NAV_COL_RE = re.compile(
    r'(<div class="footer-links"><strong>Navegação</strong>)(.*?)(</div>)',
    re.S,
)
LEGACY_ANCHOR_HREFS = {
    "/#ofertas": "/servicos-obras-publicas/",
    "/#jornadas": "/problemas-que-resolvemos/",
}


def load_brand() -> dict[str, Any]:
    return json.loads(BRAND_PATH.read_text(encoding="utf-8"))


def nav_items(brand: dict[str, Any]) -> list[dict[str, str]]:
    items = (brand.get("navigation") or {}).get("desktop") or []
    return [{"label": i["label"], "href": i["href"]} for i in items]


def nav_cta(brand: dict[str, Any]) -> dict[str, str]:
    return (brand.get("navigation") or {}).get("cta") or {
        "label": "Analisar meu caso",
        "href": "/#formulario-contato",
    }


def hub(brand: dict[str, Any], key: str) -> dict[str, Any]:
    return ((brand.get("navigation") or {}).get("hubs") or {}).get(key) or {}


def problem_clusters(brand: dict[str, Any]) -> list[dict[str, str]]:
    return list(brand.get("problem_clusters") or [])


def problem_stages(brand: dict[str, Any]) -> list[dict[str, str]]:
    return list(brand.get("problem_stages") or [])


def _current_flag(href: str, current: str | None) -> str:
    if not current:
        return ""
    if href.startswith("/#") or href.startswith("#"):
        return ""
    return ' aria-current="page"' if href.rstrip("/") == current.rstrip("/") else ""


def desktop_links(brand: dict[str, Any], current: str | None = None) -> str:
    return "\n".join(
        f'<a data-cta-position="header_nav" href="{i["href"]}"'
        f'{_current_flag(i["href"], current)}>{i["label"]}</a>'
        for i in nav_items(brand)
    )


def mobile_links(brand: dict[str, Any], current: str | None = None) -> str:
    return "".join(
        f'<a data-cta-position="mobile_nav" href="{i["href"]}"'
        f'{_current_flag(i["href"], current)}>{i["label"]}</a>'
        for i in nav_items(brand)
    )


def footer_nav_links(brand: dict[str, Any], current: str | None = None) -> str:
    """Footer navigation column: same taxonomy and order as the header."""
    parts = ['<a href="/">Início</a>']
    seen = {"/"}
    for item in nav_items(brand):
        href = (item.get("href") or "").strip()
        label = (item.get("label") or "").strip()
        if not href or href in seen:
            continue
        seen.add(href)
        parts.append(
            f'<a href="{html_lib.escape(href)}"'
            f'{_current_flag(href, current)}>{html_lib.escape(label)}</a>'
        )
    parts.append('<a href="/#contato">Contato</a>')
    return "".join(parts)


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


def _mobile_cta(match_inner: str) -> str:
    cta = re.search(r'<a\b[^>]*\bbutton-primary\b[^>]*>.*?</a>', match_inner, re.S)
    return cta.group(0) if cta else ""


def sync_text(text: str, brand: dict[str, Any], current: str | None) -> str:
    """Idempotently align one page's header/footer navigation with brand.json."""
    if 'class="desktop-nav"' not in text and 'class="mobile-nav"' not in text:
        return text

    if DESKTOP_NAV_RE.search(text):
        text = _replace_nav(text, DESKTOP_NAV_RE, desktop_links(brand, current))

    mobile = MOBILE_NAV_RE.search(text)
    if mobile:
        cta = _mobile_cta(mobile.group(2))
        inner = mobile_links(brand, current)
        if cta:
            inner = f"{inner}\n{cta}"
        text = _replace_nav(text, MOBILE_NAV_RE, inner)

    if FOOTER_NAV_COL_RE.search(text):
        # aria-current stays on the header/mobile nav only — one active mark per page.
        links = footer_nav_links(brand)
        text = FOOTER_NAV_COL_RE.sub(
            lambda m: f"{m.group(1)}{links}{m.group(3)}", text, count=1
        )

    services = hub(brand, "services")
    problems = hub(brand, "problems")
    if services.get("url"):
        text = text.replace(
            '<div class="footer-links"><strong>Ofertas</strong>',
            '<div class="footer-links"><strong>Serviços</strong>'
            f'<a href="{services["url"]}">Todos os serviços</a>',
        )
    if problems.get("url"):
        text = text.replace(
            "<strong>Problemas técnicos</strong>",
            "<strong>Problemas que resolvemos</strong>"
            f'<a href="{problems["url"]}">Todos os problemas</a>',
        )

    # Any remaining home-anchor pointer (footer, inline links) follows the label.
    for legacy, target in LEGACY_ANCHOR_HREFS.items():
        text = text.replace(f'href="{legacy}"', f'href="{target}"')
    return text


def run(write: bool) -> int:
    brand = load_brand()
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
