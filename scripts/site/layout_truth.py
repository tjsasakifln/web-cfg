#!/usr/bin/env python3
"""Static layout/a11y truth checks that fixtures and shipped HTML share.

Browser geometry (computed overflow, sticky, focus ring) lives in
`scripts/site/test_ui_geometry.mjs`. This module catches the same defects
when they are declared in markup: offscreen focus, 42 px text columns,
useless `#` anchors, missing sticky CTA, broken or absent forms.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

MIN_TEXT_WIDTH_PX = 160
NARROW_TEXT_PX = 42

ANCHOR_RE = re.compile(r"<a\b([^>]*)>(.*?)</a>", re.I | re.S)
HREF_RE = re.compile(r"""\bhref\s*=\s*['"]([^'"]*)['"]""", re.I)
STYLE_RE = re.compile(r"""\bstyle\s*=\s*['"]([^'"]*)['"]""", re.I)
CLASS_RE = re.compile(r"""\bclass\s*=\s*['"]([^'"]*)['"]""", re.I)
TABINDEX_RE = re.compile(r"""\btabindex\s*=\s*['"]?(-?\d+)""", re.I)
FOCUSABLE_RE = re.compile(
    r"<(a|button|input|select|textarea|summary)\b([^>]*)>",
    re.I,
)
WIDTH_RE = re.compile(r"(?:max-)?width\s*:\s*(\d+(?:\.\d+)?)px", re.I)
LEFT_RE = re.compile(r"\bleft\s*:\s*(-?\d+(?:\.\d+)?)px", re.I)
POSITION_RE = re.compile(r"\bposition\s*:\s*(absolute|fixed)", re.I)
FORM_RE = re.compile(r"<form\b([^>]*)>(.*?)</form>", re.I | re.S)
CONTROL_RE = re.compile(r"<(input|select|textarea)\b", re.I)
SKIP_CLASS_RE = re.compile(r"\bskip-link\b", re.I)


def _attr(attrs: str, pattern: re.Pattern[str]) -> str:
    match = pattern.search(attrs)
    return match.group(1) if match else ""


def evaluate_layout_html(
    html: str,
    *,
    require_sticky_cta: bool = True,
    require_form: bool = True,
) -> list[str]:
    """Return findings for one HTML blob. Same function shipped pages and fixtures use."""
    findings: list[str] = []

    for match in ANCHOR_RE.finditer(html):
        attrs, inner = match.group(1), match.group(2)
        href = _attr(attrs, HREF_RE).strip()
        classes = _attr(attrs, CLASS_RE)
        text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", inner)).strip()
        if SKIP_CLASS_RE.search(classes):
            continue
        if href in {"", "#"}:
            findings.append(f"useless_anchor href={href!r} text={text[:60]!r}")
        if text.casefold() in {"clique aqui", "click here", "saiba mais", "leia mais"}:
            findings.append(f"useless_anchor_text {text!r} href={href!r}")

    for match in FOCUSABLE_RE.finditer(html):
        attrs = match.group(2)
        style = _attr(attrs, STYLE_RE)
        tabindex = _attr(attrs, TABINDEX_RE)
        left = LEFT_RE.search(style)
        if POSITION_RE.search(style) and left and float(left.group(1)) < -100:
            if tabindex != "-1":
                findings.append(f"focus_offscreen left={left.group(1)}px")

    for match in re.finditer(r"<(p|li|h1|h2|h3|span|div)\b([^>]*)>", html, re.I):
        style = _attr(match.group(2), STYLE_RE)
        width = WIDTH_RE.search(style)
        if not width:
            continue
        px = float(width.group(1))
        if px <= NARROW_TEXT_PX:
            findings.append(f"text_width_{int(px)}px (min {MIN_TEXT_WIDTH_PX}px)")
        elif px < MIN_TEXT_WIDTH_PX:
            findings.append(f"text_width_{int(px)}px (min {MIN_TEXT_WIDTH_PX}px)")

    if require_sticky_cta:
        if "contact-float" not in html and "whatsapp-float" not in html:
            findings.append("missing_sticky_cta")

    if require_form:
        forms = list(FORM_RE.finditer(html))
        if not forms:
            findings.append("missing_form")
        else:
            live = False
            for form in forms:
                attrs, body = form.group(1), form.group(2)
                if not CONTROL_RE.search(body):
                    continue
                action = re.search(r"""\baction\s*=\s*['"]([^'"]*)['"]""", attrs, re.I)
                if action and "/.netlify/functions/" in action.group(1):
                    live = True
                if re.search(r"\bdata-capture-form\b", attrs, re.I):
                    live = True
            if not live:
                findings.append("broken_form")

    return findings


def evaluate_path(path: Path, **kwargs) -> list[str]:
    return evaluate_layout_html(path.read_text(encoding="utf-8"), **kwargs)


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "index.html"
    findings = evaluate_path(target)
    if findings:
        print("FAIL layout truth", target)
        for row in findings:
            print(" -", row)
        return 1
    print("OK layout truth", target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
