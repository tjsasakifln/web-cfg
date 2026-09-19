"""A11Y-FRAGMENTOS-05: the private-project demonstrative has no duplicate ids."""

from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.demonstrative.private_project.derive import (  # noqa: E402
    PUBLIC_DIR_REL,
    derive,
    load_source,
)
from scripts.demonstrative.private_project.render import render_html, write_outputs  # noqa: E402


def _extracts() -> dict:
    return derive(load_source(root=ROOT))


def test_rendered_and_shipped_html_have_no_duplicate_ids() -> None:
    for label, html in (
        ("rendered", render_html(_extracts())),
        ("shipped", (ROOT / PUBLIC_DIR_REL / "index.html").read_text(encoding="utf-8")),
    ):
        counts = Counter(re.findall(r'\bid="([^"]+)"', html))
        duplicated = sorted(name for name, count in counts.items() if count > 1)
        assert not duplicated, f"{label}: id duplicado {duplicated}"
        for match in re.finditer(r'aria-labelledby="([^"]+)"', html):
            for ref in match.group(1).split():
                assert f'id="{ref}"' in html, f"{label}: aria-labelledby aponta para id ausente {ref}"


def test_hero_elevation_svg_keeps_its_own_accessible_name(tmp_path: Path) -> None:
    extracts = _extracts()
    html = render_html(extracts)
    hero = html.split('<figure class="plate plate--side"', 1)[1].split("</figure>", 1)[0]
    assert 'aria-labelledby="elv-R00-hero-title elv-R00-hero-desc"' in hero
    assert 'id="elv-R00-hero-title"' in hero and 'id="elv-R00-hero-desc"' in hero
    written = write_outputs(tmp_path, extracts)
    asset = written["elevacao-leste-r00"].read_text(encoding="utf-8")
    assert 'id="elv-R00-title"' in asset and "hero" not in asset
