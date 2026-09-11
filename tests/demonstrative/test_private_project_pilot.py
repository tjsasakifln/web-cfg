"""Drive the shipped private-project demonstrative derivation and mutations."""

from __future__ import annotations

import copy
import json
import re
import sys
from decimal import Decimal
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.demonstrative.private_project.derive import (  # noqa: E402
    PROBLEM_BROKEN_ELEMENT_ID,
    PROBLEM_DIMENSION_MISMATCH,
    PROBLEM_HYPOTHETICAL_AS_OFFICIAL,
    PROBLEM_ORIGIN_NOT_DEMONSTRATIVE,
    PROBLEM_PRESENTED_AS_CLIENT,
    PROBLEM_SUBTOTAL_ADULTERATED,
    PUBLIC_DIR_REL,
    SOURCE_REL,
    consumption_descriptor,
    derive,
    load_source,
    q2,
    verify,
)
from scripts.demonstrative.private_project.generate import generate  # noqa: E402
from scripts.demonstrative.private_project.render import (  # noqa: E402
    br_number,
    render_html,
)

ADVERSARIAL = Path(__file__).parent / "fixtures" / "adversarial"


def _source() -> dict:
    return load_source(root=ROOT)


def test_quantity_totals_match_geometry_and_criteria() -> None:
    source = _source()
    extracts = derive(source)
    problems = verify(source, extracts)
    assert problems == []
    room = source["room"]
    length = Decimal(str(room["interior_length_m"]))
    width = Decimal(str(room["interior_width_m"]))
    height = Decimal(str(room["ceiling_height_m"]))
    min_open = Decimal(str(source["takeoff_criteria"]["opening_deduction_min_m2"]))
    floor = q2(length * width)
    assert Decimal(extracts["named_totals"]["floor_area_m2"]) == floor
    walls = [el for el in source["elements"] if el["type"] == "wall"]
    gross = sum((Decimal(str(w["length_m"])) * Decimal(str(w["height_m"])) for w in walls), Decimal("0"))
    window = next(el for el in source["elements"] if el["id"] == "WN-01")
    door = next(el for el in source["elements"] if el["id"] == "D-01")
    win_h = Decimal(str(window["height_by_revision"][source["takeoff_criteria"]["quantity_basis_revision"]]))
    win_area = Decimal(str(window["width_m"])) * win_h
    door_area = Decimal(str(door["width_m"])) * Decimal(str(door["height_m"]))
    deducted = Decimal("0")
    if win_area >= min_open:
        deducted += win_area
    if door_area >= min_open:
        deducted += door_area
    assert Decimal(extracts["named_totals"]["wall_net_m2"]) == q2(gross - deducted)
    upstand = Decimal(str(source["takeoff_criteria"]["waterproofing_upstand_m"]))
    perimeter = q2(Decimal(2) * (length + width))
    assert Decimal(extracts["named_totals"]["waterproofing_m2"]) == q2(floor + perimeter * upstand)
    screed_t = Decimal(str(source["takeoff_criteria"]["screed_thickness_m"]))
    assert Decimal(extracts["named_totals"]["screed_m3"]) == (floor * screed_t).quantize(Decimal("0.0001"))
    assert height == Decimal(str(room["ceiling_height_m"]))


def test_every_row_cites_existing_element_and_units_are_consistent() -> None:
    source = _source()
    extracts = derive(source)
    ids = {el["id"] for el in source["elements"]}
    allowed = set(source["units"].values()) | {"m", "m2", "m3", "un", "BRL"}
    for row in extracts["quantity_rows"] + extracts["budget_rows"]:
        assert row["unit"] in allowed, row
        for eid in row["element_ids"]:
            assert eid in ids, (row["id"], eid)
    for item in extracts["coordination_findings"] + extracts["review_findings"]:
        for eid in item["element_ids"]:
            assert eid in ids, (item["id"], eid)


def test_html_csv_and_consumption_share_revision(tmp_path: Path) -> None:
    result = generate(ROOT)
    extracts = result["extracts"]
    rev = extracts["revision"]
    html = (ROOT / PUBLIC_DIR_REL / "index.html").read_text(encoding="utf-8")
    consumption = json.loads((ROOT / "data/demonstrative/private-project-pilot/consumption.v1.json").read_text(encoding="utf-8"))
    assert consumption["revision"] == rev
    assert consumption["origin"] == "demonstrative"
    assert consumption["proof_id"] == extracts["proof_id"]
    assert "quantity_rows" in consumption
    assert "coordination_findings" in consumption
    assert "review_findings" in consumption
    assert "assets" in consumption
    assert "source_paths" in consumption
    assert html.count(rev) >= 4
    for name in ("quantitativos.csv", "orcamento.csv", "coordenacao.csv", "revisao.csv"):
        text = (ROOT / PUBLIC_DIR_REL / "data" / name).read_text(encoding="utf-8")
        assert f"revisao={rev}" in text
        assert "exemplo demonstrativo" in text
    descriptor = consumption_descriptor(extracts)
    assert descriptor["revision"] == rev
    assert descriptor["url"] == "/casos/demonstrativo-projeto-privado/"


def test_sample_hrefs_resolve_to_generated_files() -> None:
    html = (ROOT / PUBLIC_DIR_REL / "index.html").read_text(encoding="utf-8")
    public = ROOT / PUBLIC_DIR_REL
    hrefs = re.findall(r'href="((?:assets|data)/[^"]+)"', html)
    assert hrefs, "expected relative sample links"
    for href in hrefs:
        path = public / href
        assert path.is_file(), href
        assert path.stat().st_size > 40, href


def test_coordination_and_review_do_not_contradict() -> None:
    extracts = derive(_source())
    geo = next(item for item in extracts["coordination_findings"] if item["id"] == "CF-GEO-01")
    info = next(item for item in extracts["coordination_findings"] if item["id"] == "CF-INFO-01")
    rf1 = next(item for item in extracts["review_findings"] if item["id"] == "RF-01")
    rf2 = next(item for item in extracts["review_findings"] if item["id"] == "RF-02")
    assert geo["kind"] == "geometric"
    assert info["kind"] == "missing_information"
    assert info["proven_failure"] is False
    assert info["state"] == "information_requested"
    assert rf1["related_finding_id"] == "CF-GEO-01"
    assert rf2["related_finding_id"] == "CF-INFO-01"
    assert "nbr" not in json.dumps(extracts["review_findings"]).lower()
    assert verify(_source(), extracts) == []


def test_hypothetical_price_is_not_labeled_official() -> None:
    extracts = derive(_source())
    html = render_html(extracts).lower()
    for row in extracts["budget_rows"]:
        blob = json.dumps(row).lower()
        assert row["price_class"] == "hypothetical"
        assert "sinapi" not in blob
        assert "cotação vigente" not in blob
        assert "cotacao vigente" not in blob
    assert "hipotétic" in html
    assert "sinapi" in html  # disclaimer denies it
    assert "não são sinapi" in html


def test_page_is_demonstrative_not_client_and_has_canonical() -> None:
    html = (ROOT / PUBLIC_DIR_REL / "index.html").read_text(encoding="utf-8")
    assert 'rel="canonical"' in html
    assert "https://confenge.com.br/casos/demonstrativo-projeto-privado/" in html
    assert "exemplo demonstrativo" in html.lower()
    assert 'data-permission-class="demonstrativo"' in html
    assert "estado original" in html.lower()
    assert "versão demonstrativa corrigida" in html.lower()
    lowered = html.lower()
    assert "art nº" not in lowered and "art n°" not in lowered
    assert not re.search(r"\bcrea\s+\d", lowered)
    assert "construtora horizonte" not in lowered
    assert "wa.me/" in html
    assert "/triagem-tecnica/" in html
    assert "utm_" not in html
    assert "\u2014" not in html
    assert extracts_named_total_in_html(html)


def extracts_named_total_in_html(html: str) -> bool:
    extracts = derive(_source())
    floor = br_number(extracts["named_totals"]["floor_area_m2"])
    wall = br_number(extracts["named_totals"]["wall_net_m2"])
    finding = "CF-GEO-01"
    return floor in html and wall in html and finding in html and extracts["revision"] in html


def test_generate_stdout_matches_source_observables() -> None:
    result = generate(ROOT)
    extracts = result["extracts"]
    html = (ROOT / PUBLIC_DIR_REL / "index.html").read_text(encoding="utf-8")
    assert extracts["named_totals"]["floor_area_m2"] == "4.32"
    assert extracts["named_totals"]["wall_net_m2"] == "19.60"
    assert "WN-01" in html
    assert "CF-GEO-01" in html
    assert extracts["revision"] == "R01"
    assert br_number("4.32") in html
    assert br_number("19.60") in html


def test_mutation_dimension_fails() -> None:
    source = _source()
    extracts = derive(source)
    mutated_source = copy.deepcopy(source)
    mutated_source["room"]["interior_length_m"] = "3.10"
    problems = verify(mutated_source, extracts)
    assert PROBLEM_DIMENSION_MISMATCH in problems


def test_mutation_broken_id_fails() -> None:
    source = _source()
    extracts = copy.deepcopy(derive(source))
    extracts["quantity_rows"][0]["element_ids"] = ["W-99"]
    problems = verify(source, extracts)
    assert PROBLEM_BROKEN_ELEMENT_ID in problems


def test_mutation_subtotal_fails() -> None:
    source = _source()
    extracts = copy.deepcopy(derive(source))
    extracts["budget_subtotal"] = "99999.00"
    problems = verify(source, extracts)
    assert PROBLEM_SUBTOTAL_ADULTERATED in problems


def test_mutation_as_client_fails() -> None:
    source = _source()
    extracts = copy.deepcopy(derive(source))
    extracts["origin"] = "client"
    extracts["client_name"] = "Construtora Horizonte"
    problems = verify(source, extracts)
    assert PROBLEM_PRESENTED_AS_CLIENT in problems or PROBLEM_ORIGIN_NOT_DEMONSTRATIVE in problems
    fixture = json.loads((ADVERSARIAL / "as-client.json").read_text(encoding="utf-8"))
    extracts2 = copy.deepcopy(derive(source))
    extracts2.update(fixture)
    problems2 = verify(source, extracts2)
    assert PROBLEM_PRESENTED_AS_CLIENT in problems2 or PROBLEM_ORIGIN_NOT_DEMONSTRATIVE in problems2


def test_adversarial_fixture_is_not_a_public_route() -> None:
    public_html = list((ROOT / "casos").rglob("index.html"))
    for path in public_html:
        text = path.read_text(encoding="utf-8")
        assert "Construtora Horizonte" not in text
    assert not (ROOT / PUBLIC_DIR_REL / "fixtures").exists()
    assert ADVERSARIAL.is_dir()
    assert "casos/" not in ADVERSARIAL.as_posix()


def test_official_price_label_on_hypothetical_row_fails() -> None:
    source = _source()
    extracts = copy.deepcopy(derive(source))
    extracts["budget_rows"][0]["price_class"] = "hypothetical"
    extracts["budget_rows"][0]["official_source"] = "SINAPI"
    problems = verify(source, extracts)
    assert PROBLEM_HYPOTHETICAL_AS_OFFICIAL in problems


def test_derive_is_deterministic() -> None:
    source = _source()
    a = derive(source)
    b = derive(source)
    assert a == b
    assert verify(source, a) == []
    assert verify(source, b) == []
