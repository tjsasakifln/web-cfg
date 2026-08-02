#!/usr/bin/env python3
"""Inventory CSS class selectors used vs unused against generated _site (or source)."""
from __future__ import annotations
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    site = ROOT / "_site"
    base = site if site.exists() else ROOT
    css_path = base / "styles.css"
    if not css_path.exists():
        css_path = ROOT / "styles.css"
    css = css_path.read_text(encoding="utf-8", errors="ignore")
    classes = sorted(set(re.findall(r"\.([a-zA-Z][a-zA-Z0-9_-]*)", css)))
    html_blob = ""
    roots = [base] if base == site else [ROOT]
    for root in roots:
        for p in root.rglob("*.html"):
            if "node_modules" in str(p):
                continue
            try:
                html_blob += p.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                pass
    js = ""
    for jp in (base / "script.js", ROOT / "script.js"):
        if jp.exists():
            js += jp.read_text(encoding="utf-8", errors="ignore")
    unused = []
    used = []
    for c in classes:
        if re.search(rf"\b{re.escape(c)}\b", html_blob) or re.search(rf"\b{re.escape(c)}\b", js):
            used.append(c)
        else:
            unused.append(c)
    print(f"css_bytes={len(css.encode())}")
    print(f"class_selectors={len(classes)}")
    print(f"used={len(used)} unused={len(unused)}")
    for c in unused[:80]:
        print(f"UNUSED {c}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
