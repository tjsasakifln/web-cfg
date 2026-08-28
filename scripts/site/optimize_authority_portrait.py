#!/usr/bin/env python3
"""PERF-293: build the authority portrait close to its rendered size.

/especialista/tiago-jun-sasaki/ renders the portrait at 273 CSS px wide on the
390 px viewport Lighthouse measures, and the master is 1080x1350. Shipping the
master as the LCP element costs 529 KB and pushes mobile LCP to 4.8 s, which is
why the page scored 82 the first time #293 pointed Lighthouse at it.

This writes a 560x700 variant (same 4:5 aspect ratio, area-averaged) that covers
a 2x device pixel ratio at the 273 CSS px the portrait occupies on the 390 px
viewport Lighthouse measures, and 1x at every width above it. The
master stays on disk: JSON-LD and social cards still reference the
full-resolution PNG. Visible markup uses a <picture> with AVIF/WebP siblings
plus the PNG fallback; the master remains the widest srcset candidate.

Usage:
    python3 scripts/site/optimize_authority_portrait.py --report
    python3 scripts/site/optimize_authority_portrait.py --write

Dependency-free on purpose, like scripts/site/optimize_brand_logos.py: CI has
no Pillow or sharp, and the asset must stay reproducible from stdlib alone.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from optimize_brand_logos import encode_rgba, read_png, resize_rgba  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "assets/tiago-sasaki-foto-v11-sem-fundo.png"
TARGET = "assets/tiago-sasaki-foto-v11-sem-fundo-560.png"
TARGET_WIDTH = 560
TARGET_HEIGHT = 700


def build() -> bytes:
    width, height, pixels = read_png(ROOT / SOURCE)
    if width * TARGET_HEIGHT != height * TARGET_WIDTH:
        raise SystemExit(
            f"{SOURCE}: {width}x{height} does not share the "
            f"{TARGET_WIDTH}x{TARGET_HEIGHT} aspect ratio"
        )
    resized = resize_rgba(width, height, pixels, TARGET_WIDTH, TARGET_HEIGHT)
    return encode_rgba(TARGET_WIDTH, TARGET_HEIGHT, resized)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="write the 560 px variant")
    parser.add_argument("--report", action="store_true", help="print before/after sizes only")
    args = parser.parse_args(argv)

    before = (ROOT / SOURCE).stat().st_size
    payload = build()
    width, height, _ = read_png(ROOT / SOURCE)
    print(
        f"{SOURCE}: {width}x{height} {before}B -> "
        f"{TARGET}: {TARGET_WIDTH}x{TARGET_HEIGHT} {len(payload)}B "
        f"({100 - round(100 * len(payload) / before)}% smaller)"
    )
    if args.write:
        (ROOT / TARGET).write_bytes(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
