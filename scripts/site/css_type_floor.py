#!/usr/bin/env python3
"""Parse shipped CSS for type-floor violations.

Used by test_design_gates.py against live stylesheets AND against the
historical prova-collapse fixture. Does not re-implement layout.
"""
from __future__ import annotations

import re
from pathlib import Path

FLOOR_REM = 0.8  # 12.8px at a 16px root
FLOOR_PX = 12.8
BODY_MIN_PX = 16.0

# Selectors that carry meaning for the visitor (proof, disclaimers, labels,
# captions, form hints, table headers). Decorative ::before counters are
# excluded so a 22px numbered disc can stay compact.
CRITICAL_SELECTOR = re.compile(
    r"(hero-proof|hero-micro|hero-real-proof|evidence-|disclaimer|form-hint|form-note|"
    r"form-step-legend|consent|field label|figcaption|thead th|article-meta|"
    r"table-note|technical-note|content-badge|item-meta|author-box span|"
    r"aside-card>span|lead-inline-copy span|directory-search label|"
    r"breakout-meta dt|compare-table thead|trace-matrix thead|"
    r"catalog-item__facts dt|vitrine-item__facts dt|deliverable-section-head|operating-marker)",
    re.I,
)

FONT_SIZE_RE = re.compile(
    r"(?P<selector>[^{}]+)\{[^{}]*?font-size\s*:\s*(?P<value>[^;}]+)",
    re.I,
)
REM_RE = re.compile(r"^(?P<n>0?\.\d+|\d+(?:\.\d+)?)rem$", re.I)
PX_RE = re.compile(r"^(?P<n>\d+(?:\.\d+)?)px$", re.I)
CLAMP_RE = re.compile(r"clamp\(\s*([^,]+),", re.I)


def _to_px(value: str) -> float | None:
    raw = value.strip().lower().replace("!important", "").strip()
    rem = REM_RE.match(raw)
    if rem:
        return float(rem.group("n")) * 16.0
    px = PX_RE.match(raw)
    if px:
        return float(px.group("n"))
    clamp = CLAMP_RE.match(raw)
    if clamp:
        return _to_px(clamp.group(1).strip())
    if raw.startswith("max("):
        inner = raw[4:].rstrip(")")
        parts = [p.strip() for p in inner.split(",")]
        measured = [_to_px(p) for p in parts]
        known = [m for m in measured if m is not None]
        return max(known) if known else None
    if raw.startswith("var(--text-micro)"):
        return FLOOR_PX
    if raw.startswith("var(--text-small)"):
        return 14.0
    if raw.startswith("var(--text-body"):
        return BODY_MIN_PX
    return None


def iter_font_sizes(css: str) -> list[dict]:
    found = []
    for match in FONT_SIZE_RE.finditer(css):
        selector = re.sub(r"\s+", " ", match.group("selector")).strip()
        value = match.group("value").strip()
        px = _to_px(value)
        found.append({"selector": selector, "value": value, "px": px})
    return found


def critical_font_violations(css: str, floor_px: float = FLOOR_PX) -> list[dict]:
    bad = []
    for item in iter_font_sizes(css):
        if item["px"] is None:
            continue
        if item["px"] >= floor_px:
            continue
        if not CRITICAL_SELECTOR.search(item["selector"]):
            continue
        bad.append(item)
    return bad


def raise_sub_floor_font_sizes(css: str, floor_rem: float = FLOOR_REM) -> str:
    """Rewrite font-size rem/px literals below the floor. Used on source CSS."""

    def repl(match: re.Match[str]) -> str:
        prefix, value, suffix = match.group(1), match.group(2), match.group(3)
        px = _to_px(value)
        if px is None or px >= floor_rem * 16.0:
            return match.group(0)
        raw = value.strip()
        important = ""
        if raw.lower().endswith("!important"):
            important = "!important"
            raw = raw[: -len("!important")].strip()
        rem = REM_RE.match(raw)
        if rem:
            return f"{prefix}.8rem{important}{suffix}"
        pxm = PX_RE.match(raw)
        if pxm:
            return f"{prefix}12.8px{important}{suffix}"
        return match.group(0)

    return re.sub(
        r"(font-size\s*:\s*)([^;}]+)([;}])",
        repl,
        css,
        flags=re.I,
    )


def public_css_paths(root: Path) -> list[Path]:
    paths = [
        root / "styles.css",
        root / "styles-tokens.css",
        root / "styles-tools.css",
        root / "styles-offers.css",
        root / "styles-hubs.css",
        root / "entregas" / "styles.css",
        root / "entregas" / "catalog.css",
        root / "assets" / "eight-offer-contract.css",
    ]
    return [p for p in paths if p.is_file()]
