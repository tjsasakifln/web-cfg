"""Focused publication contracts for ATIVACAO-20260912 campaign 03.

The pages are static inputs to the public package.  ``PUBLIC_ARTIFACT_DIR``
lets release qualification run the same assertions against the exact package,
instead of treating the source checkout as publication evidence.
"""

from __future__ import annotations

import copy
import hashlib
import json
import html as html_entities
import os
import re
import subprocess
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import pytest

from scripts.demonstrative.private_project.derive import build_sample_trail, derive, load_source


ROOT = Path(__file__).resolve().parents[3]
ARTIFACT = Path(os.environ.get("PUBLIC_ARTIFACT_DIR", ROOT)).resolve()
CANONICAL_HOST = "https://confenge.com.br"
OG_IMAGE = f"{CANONICAL_HOST}/assets/og-confenge.jpg"
ROUTES = {
    "quantitativos-orcamento-obras": ("Quantitativos e orçamento de obras", "orçamento"),
    "revisao-tecnica-projetos-engenharia": ("Revisão técnica de projetos de engenharia", "projeto"),
    "compatibilizacao-projetos-engenharia": ("Compatibilização de projetos de engenharia", "interfaces"),
    "projetos-complementares-engenharia": ("Projetos complementares de engenharia", "elaboração"),
}
PUBLIC_LABEL = "Área das paredes menos as aberturas descontáveis."
INTERNAL_FORMULA = "sum(length*height)-openings>=0.50"


class _Head(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_head = False
        self.metas: list[dict[str, str]] = []
        self.links: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "head":
            self.in_head = True
        if not self.in_head:
            return
        record = {key.lower(): value or "" for key, value in attrs}
        if tag == "meta":
            self.metas.append(record)
        elif tag == "link":
            self.links.append(record)

    def handle_endtag(self, tag: str) -> None:
        if tag == "head":
            self.in_head = False


def _read(route: str, *, root: Path = ARTIFACT) -> str:
    return (root / route / "index.html").read_text(encoding="utf-8")


def _head(html: str) -> _Head:
    parsed = _Head()
    parsed.feed(html)
    parsed.close()
    return parsed


def _property_values(parsed: _Head, property_name: str) -> list[str]:
    return [meta["content"] for meta in parsed.metas if meta.get("property") == property_name]


def _canonical(parsed: _Head) -> list[str]:
    return [link.get("href", "") for link in parsed.links if link.get("rel", "").lower() == "canonical"]


def _assert_sharing_contract(route: str, html: str, *, root: Path = ARTIFACT) -> None:
    parsed = _head(html)
    expected_url = f"{CANONICAL_HOST}/{route}/"
    expected_title, description_anchor = ROUTES[route]
    properties = ("og:type", "og:title", "og:description", "og:url", "og:image")
    for prop in properties:
        values = _property_values(parsed, prop)
        assert len(values) == 1, f"{route}: {prop} must be explicit and unique"
        assert values[0].strip(), f"{route}: {prop} is empty"
    assert _property_values(parsed, "og:type") == ["website"]
    assert _property_values(parsed, "og:url") == [expected_url]
    assert _canonical(parsed) == [expected_url]
    assert _property_values(parsed, "og:title") == [expected_title]
    description = _property_values(parsed, "og:description")[0]
    assert len(description) > 30
    assert description_anchor.casefold() in description.casefold()

    image_value = _property_values(parsed, "og:image")[0]
    assert len(_property_values(parsed, "og:image:alt")) == 1
    assert _property_values(parsed, "og:image:alt")[0].strip()
    head_html = html.split("</head>", 1)[0]
    first_script = head_html.find("<script")
    if first_script >= 0:
        for prop in properties:
            assert head_html.index(f'property="{prop}"') < first_script
    assert _property_values(parsed, "og:image:width") == ["1200"]
    assert _property_values(parsed, "og:image:height") == ["630"]
    assert _property_values(parsed, "og:image:type") == ["image/jpeg"]
    image_url = urlparse(image_value)
    expected_image_url = urlparse(OG_IMAGE)
    assert (image_url.scheme, image_url.netloc, image_url.path, image_url.fragment) == (
        expected_image_url.scheme,
        expected_image_url.netloc,
        expected_image_url.path,
        "",
    )
    image_path = root / image_url.path.lstrip("/")
    image_bytes = _assert_jpeg(image_path, expected_size=(1200, 630))
    expected_query = "" if root == ROOT else f"v={hashlib.sha256(image_bytes).hexdigest()}"
    assert image_url.query == expected_query, f"{route}: og:image version must be source-empty or the image SHA-256"


def _assert_jpeg(path: Path, *, expected_size: tuple[int, int]) -> bytes:
    """Read JPEG markers, including a start-of-frame and end marker.

    This deliberately rejects a 200-style HTML payload renamed to ``.jpg``;
    the marker walk also prevents a tag-only test from accepting arbitrary
    bytes as a social image.
    """
    data = path.read_bytes()
    assert data[:2] == b"\xff\xd8", f"{path}: expected JPEG SOI, got non-image bytes"
    assert data[-2:] == b"\xff\xd9", f"{path}: expected JPEG EOI"
    pos = 2
    dimensions: tuple[int, int] | None = None
    while pos < len(data) - 1:
        if data[pos] != 0xFF:
            break  # compressed scan data follows SOS; EOI above still required.
        while pos < len(data) and data[pos] == 0xFF:
            pos += 1
        marker = data[pos]
        pos += 1
        if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
            continue
        length = int.from_bytes(data[pos : pos + 2], "big")
        assert length >= 2 and pos + length <= len(data), f"{path}: invalid JPEG segment"
        if marker in set(range(0xC0, 0xC4)) | set(range(0xC5, 0xC8)) | set(range(0xC9, 0xCC)) | set(range(0xCD, 0xD0)):
            height = int.from_bytes(data[pos + 3 : pos + 5], "big")
            width = int.from_bytes(data[pos + 5 : pos + 7], "big")
            dimensions = (width, height)
            break
        pos += length
    assert dimensions == expected_size, f"{path}: JPEG dimensions {dimensions}, expected {expected_size}"
    return data


@pytest.mark.parametrize("route", ROUTES)
def test_priority_heads_are_static_complete_and_reference_a_real_social_image(route: str) -> None:
    _assert_sharing_contract(route, _read(route))


@pytest.mark.parametrize("route", ROUTES)
def test_removing_any_priority_og_image_fails_the_contract(route: str) -> None:
    html = _read(route)
    mutated = re.sub(r"\s*<meta\b[^>]*\bproperty=[\"']og:image[\"'][^>]*>", "", html, count=1, flags=re.I)
    assert mutated != html
    with pytest.raises(AssertionError, match="og:image"):
        _assert_sharing_contract(route, mutated)


def test_html_payload_named_as_jpeg_is_rejected(tmp_path: Path) -> None:
    copied = tmp_path / "assets"
    copied.mkdir()
    (copied / "og-confenge.jpg").write_text("<!doctype html><title>200 but not an image</title>", encoding="utf-8")
    with pytest.raises(AssertionError, match="JPEG SOI"):
        _assert_sharing_contract(
            "quantitativos-orcamento-obras",
            _read("quantitativos-orcamento-obras"),
            root=tmp_path,
        )


def _render_sample_trail(excerpt: dict[str, Any]) -> str:
    runner = """
import { readFileSync } from 'node:fs';
import { renderSampleTrail } from './quantitativos-orcamento-obras/sample-trail.mjs';
process.stdout.write(renderSampleTrail(JSON.parse(readFileSync(0, 'utf8'))));
"""
    completed = subprocess.run(
        ["node", "--input-type=module", "--eval", runner],
        cwd=ROOT,
        input=json.dumps(excerpt, ensure_ascii=False),
        text=True,
        capture_output=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    return completed.stdout


def _source_with_window_height(height: str) -> dict[str, Any]:
    source = copy.deepcopy(load_source(root=ROOT))
    next(item for item in source["elements"] if item["id"] == "WN-01")["height_by_revision"]["R01"] = height
    return source


def _visible(html: str) -> str:
    without_code = re.sub(r"<(script|style)\b[^>]*>[\s\S]*?</\1>", " ", html, flags=re.I)
    return re.sub(r"\s+", " ", html_entities.unescape(re.sub(r"<[^>]+>", " ", without_code))).strip()


def _assert_published_memory(html: str, excerpt: dict[str, Any]) -> None:
    calculation = excerpt["calculation"]
    text = _visible(html)
    assert excerpt["quantity_id"] == "Q-PAR-01"
    assert calculation["label_pt_br"] in text
    assert calculation["memory"] in text
    assert "sum(length*height)" not in text
    assert "Amostra demonstrativa" in text or "exemplo demonstrativo" in text
    assert "não são preço do serviço" in text or "nem preço da CONFENGE" in text


def test_sample_trail_renders_a_derived_client_memory_without_internal_formula() -> None:
    extracts = derive(load_source(root=ROOT))
    excerpt = build_sample_trail(extracts)
    html = _render_sample_trail(excerpt)
    assert PUBLIC_LABEL in html
    assert "21,84 m² - 1,68 m² - 0,56 m² = 19,60 m²." in html
    assert INTERNAL_FORMULA not in html
    assert 'data-trail-item-code="ORC-PAR-01"' in html
    assert 'data-trail-item-quantity="19.6" value="19.6"' in html
    assert 'data-trail-quantity="19.6" value="19.6"' in html
    assert "Amostra demonstrativa" in html
    assert "Preços hipotéticos daquele recorte não são preço do serviço" in html
    assert "m²" in html


def test_packaged_sample_and_demonstrative_render_the_current_derived_memory() -> None:
    excerpt = build_sample_trail(derive(load_source(root=ROOT)))
    _assert_published_memory(_read("quantitativos-orcamento-obras"), excerpt)
    _assert_published_memory(
        (ARTIFACT / "casos/demonstrativo-projeto-privado/index.html").read_text(encoding="utf-8"),
        excerpt,
    )


def test_old_packaged_memory_is_not_accepted_after_a_source_change() -> None:
    stale_html = _read("quantitativos-orcamento-obras")
    changed = build_sample_trail(derive(_source_with_window_height("0.75")))
    with pytest.raises(AssertionError):
        _assert_published_memory(stale_html, changed)


def test_synthetic_geometry_changes_memory_and_catches_stale_output() -> None:
    deducted = build_sample_trail(derive(_source_with_window_height("0.75")))
    assert deducted["quantity"]["value"] == 19.56
    rendered_deducted = _render_sample_trail(deducted)
    assert "21,84 m² - 1,68 m² - 0,60 m² = 19,56 m²." in rendered_deducted

    at_threshold = build_sample_trail(derive(_source_with_window_height("0.625")))
    assert at_threshold["quantity"]["value"] == 19.66
    assert "21,84 m² - 1,68 m² - 0,50 m² = 19,66 m²." in _render_sample_trail(at_threshold)

    not_deducted = build_sample_trail(derive(_source_with_window_height("0.50")))
    assert not_deducted["quantity"]["value"] == 20.16
    rendered_not_deducted = _render_sample_trail(not_deducted)
    assert "21,84 m² - 1,68 m² = 20,16 m²." in rendered_not_deducted
    assert "19,60 m²" not in rendered_not_deducted


def test_sample_trail_escapes_dynamic_presentation_copy() -> None:
    excerpt = build_sample_trail(derive(load_source(root=ROOT)))
    excerpt["calculation"]["label_pt_br"] = '<img src=x onerror="alert(1)">'
    html = _render_sample_trail(excerpt)
    assert "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;" in html
    assert '<img src=x onerror=' not in html


def test_reintroduced_escaped_internal_formula_is_rejected() -> None:
    excerpt = build_sample_trail(derive(load_source(root=ROOT)))
    html = _read("quantitativos-orcamento-obras")
    mutated = html.replace("</main>", "<p>sum(length*height)-openings&gt;=0.50</p></main>")
    assert mutated != html
    with pytest.raises(AssertionError):
        _assert_published_memory(mutated, excerpt)
