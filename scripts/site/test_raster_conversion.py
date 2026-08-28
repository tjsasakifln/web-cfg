#!/usr/bin/env python3
"""Assert AVIF/WebP siblings, <picture> markup, dimensions and smaller payloads."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.optimize_brand_logos import read_png  # noqa: E402
from scripts.site.responsive_raster import (  # noqa: E402
    AUTHOR_PICTURE,
    AUTHOR_PNG,
    HOME_PICTURE,
    PORTRAIT_560_PNG,
    PORTRAIT_PNG,
    RASTER_FILES,
    SPECIALIST_PICTURE,
    avif_dimensions,
    expected_converted,
    picture_has_sources,
    png_dimensions,
    sibling,
    webp_dimensions,
)


def test_converted_files_exist_and_are_smaller() -> None:
    for png_rel in RASTER_FILES:
        png = ROOT / png_rel
        avif = ROOT / sibling(png_rel, ".avif")
        webp = ROOT / sibling(png_rel, ".webp")
        assert png.is_file(), png_rel
        assert avif.is_file(), avif
        assert webp.is_file(), webp
        png_size = png.stat().st_size
        assert avif.stat().st_size < png_size, (png_rel, avif.stat().st_size, png_size)
        assert webp.stat().st_size < png_size, (png_rel, webp.stat().st_size, png_size)
        assert avif.stat().st_size > 32, avif
        assert webp.stat().st_size > 32, webp


def test_converted_dimensions_match_png_aspect() -> None:
    for png_rel in RASTER_FILES:
        png_bytes = (ROOT / png_rel).read_bytes()
        width, height = png_dimensions(png_bytes)
        decoded_w, decoded_h, _ = read_png(ROOT / png_rel)
        assert (width, height) == (decoded_w, decoded_h)
        avif_w, avif_h = avif_dimensions((ROOT / sibling(png_rel, ".avif")).read_bytes())
        webp_w, webp_h = webp_dimensions((ROOT / sibling(png_rel, ".webp")).read_bytes())
        assert (avif_w, avif_h) == (width, height), (png_rel, avif_w, avif_h, width, height)
        assert (webp_w, webp_h) == (width, height), (png_rel, webp_w, webp_h, width, height)
        assert width * 5 == height * 4 or width == height, (png_rel, width, height)


def test_home_and_specialist_ship_picture_markup() -> None:
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    specialist = (ROOT / "especialista" / "tiago-jun-sasaki" / "index.html").read_text(
        encoding="utf-8"
    )
    assert HOME_PICTURE in home
    assert picture_has_sources(home, PORTRAIT_560_PNG)
    assert 'width="560"' in home and 'height="700"' in home
    assert 560 * 5 == 700 * 4
    assert SPECIALIST_PICTURE in specialist
    assert picture_has_sources(specialist, PORTRAIT_560_PNG)
    assert picture_has_sources(specialist, PORTRAIT_PNG)
    assert 'width="1080"' in specialist and 'height="1350"' in specialist
    assert 1080 * 5 == 1350 * 4
    picture = home[home.index("<picture>") : home.index("</picture>") + len("</picture>")]
    assert f'src="{PORTRAIT_560_PNG}"' in picture
    assert f'src="{PORTRAIT_PNG}"' not in picture
    assert PORTRAIT_PNG.lstrip("/") in home  # JSON-LD / social keep the master PNG


def test_author_box_template_uses_picture() -> None:
    from scripts.pseo.html_shell import author_box

    html = author_box()
    assert AUTHOR_PICTURE in html
    assert picture_has_sources(html, AUTHOR_PNG)
    sample = ROOT / "conteudos" / "reequilibrio-economico-financeiro-obra-publica" / "index.html"
    if sample.is_file():
        body = sample.read_text(encoding="utf-8")
        assert AUTHOR_PICTURE in body
        assert picture_has_sources(body, AUTHOR_PNG)


def test_expected_converted_inventory() -> None:
    files = expected_converted(ROOT)
    assert len(files) == 6
    assert all(path.is_file() for path in files), files


def run_all() -> int:
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print("OK", test.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", test.__name__, exc)
    if not failed:
        print("RASTER_CONVERSION_OK")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run_all())
