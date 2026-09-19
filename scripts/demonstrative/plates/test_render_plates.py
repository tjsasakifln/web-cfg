"""Gates for the demonstrative plates.

Every visible numeral must be traceable to the JSON sources, every paint must
come from the palette, every glyph must exist in the shipped Archivo subset,
each sheet must carry role/title/desc and the carimbo, and the versioned SVGs
must be exactly what the renderer produces.
"""

from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fontTools.ttLib import TTFont  # noqa: E402

from scripts.demonstrative.plates import render_plates as R  # noqa: E402
from scripts.demonstrative.plates import sheet as S  # noqa: E402

FONT_PATH = ROOT / "assets" / "archivo-var-latin-b19be0f7.woff2"
NS = "{http://www.w3.org/2000/svg}"
NUM_RE = re.compile(r"\d+(?:[.,]\d+)?")
PAINT_RE = re.compile(r"\b(?:fill|stroke|stop-color)=\"([^\"]+)\"")
HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")
FONT_SIZE_RE = re.compile(r"font-size=\"([0-9.]+)\"")
IGNORED = set("\n\r\t  ")

EXPECTED_NUMBERS = {
    "recorte-banheiro": {"desktop": ["19,60", "21,84", "1,68", "0,56", "2,30", "2,20", "0,10", "1,40", "2,40", "1,80", "2,60", "0,50", "ORC-PAR-01"],
                         "mobile": ["19,60", "21,84", "1,68", "0,56", "2,20", "1,40", "0,10", "ORC-PAR-01"]},
    "drenagem-perfil": {"desktop": ["12,80", "12,35", "12,50", "0,15", "20,00", "0,12", "0,04", "42,00", "33,60", "11,20", "280,00"],
                        "mobile": ["12,80", "12,35", "12,50", "0,15", "20,00"]},
    "medicao-parede": {"desktop": ["120", "90", "80", "30", "10", "projeção da parede"],
                       "mobile": ["120", "90", "80", "30", "10", "projeção da parede"]},
    "avaliacao-estrutura": {"desktop": ["Objeto", "Finalidade e data", "Método", "Dados e fontes", "Conclusão delimitada", "comparativo ou", "evolutivo"],
                            "mobile": ["Objeto", "Finalidade e data", "Método", "Dados e fontes", "Conclusão delimitada"]},
}


@pytest.fixture(scope="module")
def rendered() -> dict[str, str]:
    return R.render_all()


@pytest.fixture(scope="module")
def sources() -> dict[str, dict]:
    return R.load()


@pytest.fixture(scope="module")
def cmap() -> set[int]:
    return set(TTFont(FONT_PATH).getBestCmap())


def _split(name: str) -> tuple[str, str]:
    pid, variant = name[:-4].rsplit("-", 1)
    return pid, variant


def _texts(svg: str) -> list[str]:
    root = ET.fromstring(svg)
    out = []
    for el in root.iter():
        if el.tag in (f"{NS}text", f"{NS}tspan", f"{NS}title", f"{NS}desc"):
            if el.text:
                out.append(el.text)
            if el.tail and el.tag == f"{NS}tspan":
                out.append(el.tail)
    return out


def _json_tokens(obj, into: set[str]) -> None:
    if isinstance(obj, dict):
        for v in obj.values():
            _json_tokens(v, into)
    elif isinstance(obj, list):
        for v in obj:
            _json_tokens(v, into)
    elif isinstance(obj, (str, int, float)) and not isinstance(obj, bool):
        s = str(obj)
        into.update(NUM_RE.findall(s))
        try:
            dec = Decimal(s)
        except InvalidOperation:
            return
        for places in (0, 2, 4):
            into.add(S.br(dec, places))


def _allowed_tokens(pid: str, sources: dict[str, dict]) -> set[str]:
    allowed: set[str] = {"0", "1", "2", "3", "4", "0,00"}  # callout indices, scale-bar origin/unit, datum level
    for key in R.PLATE_SOURCES[pid]:
        _json_tokens(sources[key], allowed)
    return allowed


def test_all_eight_plates_render(rendered):
    assert sorted(rendered) == sorted(f"{pid}-{v}.svg" for pid, v in R.RENDERERS)


def test_visible_numbers_come_from_the_sources(rendered, sources):
    for name, svg in rendered.items():
        pid, variant = _split(name)
        allowed = _allowed_tokens(pid, sources)
        joined = "\n".join(_texts(svg))
        stray = sorted({tok for tok in NUM_RE.findall(joined) if tok not in allowed})
        assert not stray, f"{name}: numerals not traceable to a source JSON: {stray}"
        for expected in EXPECTED_NUMBERS.get(pid, {}).get(variant, ()):
            assert expected in joined, f"{name}: expected '{expected}' in sheet text"


def test_p1_memory_matches_consumption_trail(rendered, sources):
    trail = sources["private_consumption"]["sample_trail"]
    joined = "\n".join(_texts(rendered["recorte-banheiro-desktop.svg"]))
    assert "21,84 − 1,68 (porta D-01) − 0,56 (janela WN-01) = 19,60 m² → ORC-PAR-01" in joined
    assert trail["budget_id"] == "ORC-PAR-01" and trail["quantity"]["value"] == 19.6


def test_p3_source_contract(sources):
    src = sources["medicao"]
    assert src["schema"] == "confenge.demonstrative-plate-source/1.0"
    assert src["origin"] == "demonstrative" and src["client_name"] is None
    assert [s["area_m2"] for s in src["series"]] == ["120", "90", "80"]
    assert [b["area_m2"] for b in src["bands"]] == ["30", "10"]


def test_p4_has_no_money_and_no_norm_number(rendered):
    for variant in ("desktop", "mobile"):
        joined = "\n".join(_texts(rendered[f"avaliacao-estrutura-{variant}.svg"]))
        assert "R$" not in joined and "BRL" not in joined
        assert not re.search(r"\bNBR\b|\bABNT\b|\b\d{4,5}\b", joined), joined


def test_paints_are_palette_only(rendered):
    for name, svg in rendered.items():
        paints = {p.strip().lower() for p in PAINT_RE.findall(svg)}
        bad = {p for p in paints if p not in S.PALETTE and p != "none" and not p.startswith("url(#")}
        assert not bad, f"{name}: paints outside the palette: {bad}"
        hexes = {h.lower() for h in HEX_RE.findall(svg)}
        assert hexes <= S.PALETTE, f"{name}: hex colours outside the palette: {hexes - S.PALETTE}"
        for forbidden in ("#f59e0b", "#b45309", "#fecaca", "#b91c1c", "#0369a1", "rgb(", "hsl("):
            assert forbidden not in svg.lower(), f"{name}: {forbidden}"


def test_validate_rejects_off_palette_colour(rendered):
    svg = rendered["medicao-parede-desktop.svg"]
    tampered = svg.replace(S.GREEN, "#f59e0b", 1)
    problems = S.validate(tampered)
    assert any(p.startswith(("paint_outside_palette", "colour_outside_palette")) for p in problems), problems
    assert S.validate(svg) == []


def test_sheet_structure(rendered):
    for name, svg in rendered.items():
        pid, variant = _split(name)
        root = ET.fromstring(svg)
        assert root.get("role") == "img", name
        assert root.get("font-family") == S.FONT, name
        title = root.find(f"{NS}title")
        desc = root.find(f"{NS}desc")
        assert title is not None and desc is not None, name
        assert root.get("aria-labelledby") == f"{title.get('id')} {desc.get('id')}", name
        assert title.get("id") == f"{pid}-{variant}-title"
        # Owner decision 2026-09-18 (CONFENGE-LAPIDACAO-COMERCIAL-20260918): the
        # plate circulates alone, so it carries "Exemplo demonstrativo" in the
        # title, the description and the title block; the negative restatement
        # ("sem obra de cliente") is superseded and must not come back.
        assert "demonstrativo" in title.text and "Exemplo demonstrativo" in desc.text, name
        assert "sem obra de cliente" not in svg, name
        carimbo = next((g for g in root.iter(f"{NS}g") if g.get("id") == f"{pid}-{variant[0]}-carimbo"), None)
        assert carimbo is not None, name
        cells = "\n".join(_texts(ET.tostring(carimbo, encoding="unicode")))
        assert "rev. R0" in cells and "Exemplo demonstrativo" in cells, cells
        rects = carimbo.findall(f"{NS}rect")
        assert rects and rects[0].get("height") == str(S.TITLE_BLOCK_H), name
        assert "Exemplo demonstrativo" in svg


def test_scale_claims_are_backed_by_a_scale_bar(rendered):
    for name, svg in rendered.items():
        root = ET.fromstring(svg)
        carimbo = next(g for g in root.iter(f"{NS}g") if (g.get("id") or "").endswith("-carimbo"))
        cells = "\n".join(_texts(ET.tostring(carimbo, encoding="unicode")))
        if "Escala gráfica" in cells:
            assert 'class="escala-grafica"' in svg, f"{name}: carimbo claims a graphic scale the sheet does not draw"
    assert 'class="escala-grafica"' in rendered["recorte-banheiro-desktop.svg"]
    assert 'class="escala-grafica"' not in rendered["recorte-banheiro-mobile.svg"]


def test_ids_are_unique_across_all_plates(rendered):
    """The sheets are embedded inline, several per page: no id may repeat anywhere."""
    seen: dict[str, str] = {}
    for name, svg in rendered.items():
        ids = re.findall(r'\bid="([^"]+)"', svg)
        assert len(ids) == len(set(ids)), f"{name}: duplicate id inside the sheet"
        for i in ids:
            assert i not in seen, f"id {i!r} appears in both {seen[i]} and {name}"
            seen[i] = name
        for ref in re.findall(r'(?:href="#|url\(#)([^")]+)', svg):
            assert ref in ids, f"{name}: dangling reference #{ref}"
        pid, variant = _split(name)
        assert all(i.startswith(f"{pid}-{variant[0]}-") or i.startswith(f"{pid}-{variant}-") for i in ids), f"{name}: unprefixed id in {ids}"


def test_no_file_names_or_internal_ids_on_the_sheet(rendered):
    for name, svg in rendered.items():
        root = ET.fromstring(svg)
        visible = "\n".join(el.text or "" for el in root.iter() if el.tag in (f"{NS}text", f"{NS}tspan"))
        assert not re.search(r"\.json|\.svg|\.py|source\.v1|consumption|-pilot\b|Fonte:", visible), f"{name}: internal reference visible: {visible}"
        assert "Dados demonstrativos · revisão R0" in visible or name.endswith("-mobile.svg"), name
        desc = root.find(f"{NS}desc").text
        assert "Procedência: data/demonstrative/" in desc, name


def test_glyphs_fit_the_archivo_subset(rendered, cmap):
    for name, svg in rendered.items():
        joined = "".join(_texts(svg))
        missing = sorted({ch for ch in joined if ch not in IGNORED and ord(ch) not in cmap})
        assert not missing, f"{name}: glyphs outside the shipped subset: {missing}"
        for bad in "↓✓≠Ø":
            assert bad not in svg, f"{name}: {bad}"


def test_size_budget(rendered):
    for name, svg in rendered.items():
        size = len(svg.encode("utf-8"))
        assert size <= 12 * 1024, f"{name}: {size} B > 12 KB"


def test_mobile_is_a_recomposition_not_a_scale(rendered):
    for pid in {p for p, _ in R.RENDERERS}:
        desk = rendered[f"{pid}-desktop.svg"]
        mob = rendered[f"{pid}-mobile.svg"]
        assert ET.fromstring(mob).get("viewBox") == f"0 0 {R.MOBILE_W} {R.MOBILE_H}"
        assert ET.fromstring(desk).get("viewBox").startswith("0 0 1200 ")
        sizes = [float(v) for v in FONT_SIZE_RE.findall(mob)]
        assert sizes and min(sizes) >= R.MOBILE_MIN_FONT, f"{pid}: mobile font sizes {sorted(set(sizes))}"
        assert mob.count(f'<circle r="{S.CALLOUT_R}"') <= 2, pid
        assert desk.count(f'<circle r="{S.CALLOUT_R}"') <= 4, pid
        assert len(_texts(mob)) < len(_texts(desk)), pid
        # the mobile body must not be the desktop body with a different viewBox
        strip = lambda s: re.sub(r'viewBox="[^"]+"', "", s)  # noqa: E731
        assert strip(mob) != strip(desk)


def test_deterministic_and_versioned_files_match(rendered):
    again = R.render_all()
    assert again == rendered
    for name, svg in rendered.items():
        assert "date" not in svg.lower() or "dateModified" not in svg
        versioned = ROOT / R.OUT_DIR_REL / name
        assert versioned.exists(), f"missing {versioned}; run python3 -m scripts.demonstrative.plates.render_plates"
        assert versioned.read_text(encoding="utf-8") == svg, f"{name} drifted from the renderer"
    assert R.main(["--check"]) == 0


def test_plate_sources_are_demonstrative(sources):
    for key in ("medicao", "avaliacao"):
        src = sources[key]
        assert src["origin"] == "demonstrative"
        assert src["client_name"] is None and src["art_number"] is None and src["signature"] is None
        assert src["schema"] == "confenge.demonstrative-plate-source/1.0"
    assert json.loads((ROOT / R.SOURCES["medicao"]).read_text(encoding="utf-8"))["plate_id"] == "medicao-parede"
