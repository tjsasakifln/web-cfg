#!/usr/bin/env python3
"""Fail if ferramentas public HTML loses full brand footer markers.

Drives shipped HTML under ferramentas/**/index.html (same markers as
test:nurture-pages brand_shell). Prevents stub footers from landing again.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MARKERS = (
    "footer-top",
    "logo-confenge-white-500-1677038e.png",
    "52.407.089/0001-09",
    'class="brand"',
    "logo-confenge-500-f8a83f6d.png",
    "desktop-nav",
)


def main() -> int:
    pages = sorted((ROOT / "ferramentas").rglob("index.html"))
    if not pages:
        print("FAIL no ferramentas pages")
        return 1
    bad = 0
    for p in pages:
        html = p.read_text(encoding="utf-8", errors="replace")
        missing = [m for m in MARKERS if m not in html]
        rel = p.relative_to(ROOT).as_posix()
        if missing:
            bad += 1
            print(f"FAIL {rel} missing={missing}")
        else:
            print(f"OK {rel}")
    if bad:
        print(f"FERRAMENTAS_BRAND_FOOTER_FAIL count={bad}")
        return 1
    print(f"FERRAMENTAS_BRAND_FOOTER_OK pages={len(pages)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
