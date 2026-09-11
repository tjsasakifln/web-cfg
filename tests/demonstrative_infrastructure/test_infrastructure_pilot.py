"""Drive the shipped infrastructure demonstrative and an independent reference."""

from __future__ import annotations

import copy
import json
import re
import sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.demonstrative.infrastructure_pilot.derive import (  # noqa: E402
    PROBLEM_BROKEN_ELEMENT_ID,
    PROBLEM_DIMENSION_MISMATCH,
    PROBLEM_HYPOTHETICAL_AS_OFFICIAL,
    PROBLEM_OMITTED_PUBLIC_RESOURCE,
    PROBLEM_ORIGIN_NOT_DEMONSTRATIVE,
    PROBLEM_PRESENTED_AS_CLIENT,
    PROBLEM_REVISION_DRIFT,
    PROBLEM_SUBTOTAL_ADULTERATED,
    PROBLEM_UNIT_INCONSISTENT,
    PUBLIC_DIR_REL,
    consumption_descriptor,
    derive,
    load_source,
    verify,
    verify_declared_assets,
)
from scripts.demonstrative.infrastructure_pilot.generate import generate  # noqa: E402
from scripts.demonstrative.infrastructure_pilot.render import (  # noqa: E402
    PAGE_H1,
    br_number,
    render_html,
    write_outputs,
)
from tests.demonstrative_infrastructure.reference import compute  # noqa: E402

ADVERSARIAL = Path(__file__).parent / "fixtures" / "adversarial"
REFERENCE_FILE = Path(__file__).parent / "reference.py"


def _source() -> dict:
    return load_source(root=ROOT)


def test_reference_module_does_not_import_generator() -> None:
    text = REFERENCE_FILE.read_text(encoding="utf-8")
    import_lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip().startswith(("import ", "from "))
    ]
    joined = "\n".join(import_lines)
    assert "scripts.demonstrative" not in joined
    assert "infrastructure_pilot.derive" not in joined
    assert compute is not derive


def test_quantities_match_independent_reference_and_drawings() -> None:
    source = _source()
    extracts = derive(source)
    expected = compute(source)
    problems = verify(source, extracts)
    assert problems == []
    named = extracts["named_totals"]
    assert Decimal(named["pavement_area_m2"]) == expected["pavement_area_m2"]
    assert Decimal(named["subbase_m3"]) == expected["subbase_m3"]
    assert Decimal(named["base_m3"]) == expected["base_m3"]
    assert Decimal(named["wearing_m3"]) == expected["wearing_m3"]
    assert Decimal(named["pipe_length_m"]) == expected["pipe_length_m"]
    assert Decimal(named["mh02_mismatch_r00_m"]) == expected["mh02_mismatch_r00_m"]
    assert Decimal(named["mh02_mismatch_r01_m"]) == Decimal("0.00")
    assert Decimal(extracts["budget_subtotal"]) == expected["budget_subtotal_brl"]
    qty = {row["id"]: Decimal(row["quantity"]) for row in extracts["quantity_rows"]}
    for qid, value in expected["quantities"].items():
        assert qty[qid] == Decimal(str(value)), qid
    pav_row = next(row for row in extracts["quantity_rows"] if row["id"] == "Q-PAV-01")
    assert pav_row["formula"] == "40.00*7.00"
    pipe_row = next(row for row in extracts["quantity_rows"] if row["id"] == "Q-TUB-01")
    assert pipe_row["formula"] == "30.00-10.00"
    html = render_html(extracts)
    compact = html.replace(" ", "")
    assert "40,00*7,00" in compact or "40,00×7,00" in html
    assert "Q-PAV-01" in html and "Q-TUB-01" in html
    assert "CF-GEO-01" in html


def test_pavement_and_network_chains_expose_formula_to_spreadsheet() -> None:
    extracts = derive(_source())
    pav = next(row for row in extracts["quantity_rows"] if row["id"] == "Q-PAV-01")
    pipe = next(row for row in extracts["quantity_rows"] if row["id"] == "Q-TUB-01")
    assert pav["chain"] == "drawing_dimension_formula_quantity_spreadsheet"
    assert pipe["chain"] == "drawing_dimension_formula_quantity_spreadsheet"
    budget_ids = {row["quantity_id"] for row in extracts["budget_rows"]}
    assert "Q-SUB-01" in budget_ids
    assert "Q-TUB-01" in budget_ids
    assert any(row["quantity_id"] == "Q-TUB-01" for row in extracts["budget_rows"])


def test_every_row_cites_existing_element_and_units_are_consistent() -> None:
    source = _source()
    extracts = derive(source)
    ids = {el["id"] for el in source["elements"]}
    allowed = set(source["units"].values()) | {"m", "m2", "m3", "un", "BRL", "mm", "m/m"}
    for row in extracts["quantity_rows"] + extracts["budget_rows"]:
        assert row["unit"] in allowed, row
        for eid in row["element_ids"]:
            assert eid in ids, (row["id"], eid)


def test_incompatible_units_are_refused() -> None:
    source = _source()
    extracts = copy.deepcopy(derive(source))
    extracts["quantity_rows"][0]["unit"] = "ft"
    problems = verify(source, extracts)
    assert PROBLEM_UNIT_INCONSISTENT in problems


def test_html_csv_svg_and_consumption_share_revision() -> None:
    result = generate(ROOT)
    extracts = result["extracts"]
    rev = extracts["revision"]
    html = (ROOT / PUBLIC_DIR_REL / "index.html").read_text(encoding="utf-8")
    consumption = json.loads(
        (ROOT / "data/demonstrative/infrastructure-pilot/consumption.v1.json").read_text(encoding="utf-8")
    )
    assert consumption["revision"] == rev
    assert consumption["origin"] == "demonstrative"
    assert consumption["proof_id"] == extracts["proof_id"]
    assert consumption["consumer_sections"]["02"]
    assert consumption["consumer_sections"]["05"]
    assert consumption["consumer_sections"]["07"]
    assert html.count(rev) >= 4
    for name in ("quantitativos.csv", "orcamento.csv", "coordenacao.csv", "revisao.csv"):
        text = (ROOT / PUBLIC_DIR_REL / "data" / name).read_text(encoding="utf-8")
        assert f"revisao={rev}" in text
        assert "exemplo demonstrativo" in text
    for svg_name in (
        "planta-r00.svg",
        "planta-r01.svg",
        "perfil-drenagem-r00.svg",
        "perfil-drenagem-r01.svg",
        "secao-pavimento.svg",
    ):
        svg = (ROOT / PUBLIC_DIR_REL / "assets" / svg_name).read_text(encoding="utf-8")
        assert "exemplo demonstrativo" in svg.lower()
        assert "PV-01" in svg or "DR-01" in svg or "Q-SUB-01" in svg
    descriptor = consumption_descriptor(extracts)
    assert descriptor["revision"] == rev
    assert descriptor["url"] == "/casos/demonstrativo-infraestrutura/"


def test_sample_hrefs_resolve_to_generated_files() -> None:
    generate(ROOT)
    html = (ROOT / PUBLIC_DIR_REL / "index.html").read_text(encoding="utf-8")
    public = ROOT / PUBLIC_DIR_REL
    hrefs = re.findall(r'href="((?:assets|data)/[^"]+)"', html)
    assert hrefs, "expected relative sample links"
    for href in hrefs:
        path = public / href
        assert path.is_file(), href
        assert path.stat().st_size > 40, href
    extracts = derive(_source())
    assert verify_declared_assets(ROOT, extracts) == []


def test_omitted_declared_resource_fails(tmp_path: Path) -> None:
    source = _source()
    extracts = derive(source)
    written = write_outputs(tmp_path, extracts)
    target = written["quantitativos-csv"]
    target.unlink()
    problems = verify_declared_assets(tmp_path, extracts)
    assert PROBLEM_OMITTED_PUBLIC_RESOURCE in problems


def test_revision_change_propagates_to_every_extract(tmp_path: Path) -> None:
    source = copy.deepcopy(_source())
    source["revision"] = "R02"
    extracts = derive(source)
    assert extracts["revision"] == "R02"
    written = write_outputs(tmp_path, extracts)
    html = written["html"].read_text(encoding="utf-8")
    assert "R02" in html
    consumption = json.loads(written["consumption"].read_text(encoding="utf-8"))
    assert consumption["revision"] == "R02"
    for key in ("quantitativos-csv", "orcamento-csv", "coordenacao-csv", "revisao-csv"):
        text = written[key].read_text(encoding="utf-8")
        assert "revisao=R02" in text
    secao = written["secao-pavimento"].read_text(encoding="utf-8")
    assert "R02" in secao
    problems = verify(source, extracts)
    assert problems == []
    drifted = copy.deepcopy(extracts)
    drifted["revision"] = "R01"
    assert PROBLEM_REVISION_DRIFT in verify(source, drifted)


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
    assert "capacidade hidráulica comprovada" not in json.dumps(extracts).lower()
    assert verify(_source(), extracts) == []


def test_hypothetical_price_is_clearly_labeled() -> None:
    extracts = derive(_source())
    html = render_html(extracts).lower()
    for row in extracts["budget_rows"]:
        blob = json.dumps(row).lower()
        assert row["price_class"] == "hypothetical"
        assert "sinapi" not in blob
        assert "cotação vigente" not in blob
    assert "hipotétic" in html
    assert "não são sinapi" in html
    assert "preço de mercado universal" in html


def test_page_is_demonstrative_not_client_and_has_required_title() -> None:
    generate(ROOT)
    html = (ROOT / PUBLIC_DIR_REL / "index.html").read_text(encoding="utf-8")
    assert PAGE_H1 in html
    assert f"<h1>{PAGE_H1}</h1>" in html
    assert "não servem para execução" in html.lower()
    assert 'rel="canonical"' in html
    assert "https://confenge.com.br/casos/demonstrativo-infraestrutura/" in html
    assert "exemplo demonstrativo" in html.lower()
    assert 'data-permission-class="demonstrativo"' in html
    lowered = html.lower()
    assert "art nº" not in lowered and "art n°" not in lowered
    assert not re.search(r"\bcrea\s+\d", lowered)
    assert "loteadora horizonte" not in lowered
    assert "cliente real" not in lowered
    assert "economia obtida" not in lowered
    assert "wa.me/" in html
    assert "/triagem-tecnica/" in html
    assert "utm_" not in html
    assert "\u2014" not in html
    assert br_number(derive(_source())["named_totals"]["pavement_area_m2"]) in html
    assert "CF-GEO-01" in html
    assert "para-parceiros" in html
    assert "para-comprador" in html


def test_generate_stdout_matches_source_observables() -> None:
    result = generate(ROOT)
    extracts = result["extracts"]
    expected = compute(_source())
    html = (ROOT / PUBLIC_DIR_REL / "index.html").read_text(encoding="utf-8")
    assert extracts["named_totals"]["pavement_area_m2"] == format(expected["pavement_area_m2"], "f")
    assert extracts["named_totals"]["pipe_length_m"] == format(expected["pipe_length_m"], "f")
    assert "PV-01" in html
    assert "DR-01" in html
    assert extracts["revision"] == "R01"


def test_mutation_dimension_fails() -> None:
    source = _source()
    extracts = derive(source)
    mutated_source = copy.deepcopy(source)
    for el in mutated_source["elements"]:
        if el["id"] == "PV-01":
            el["station_end_m"] = "48.00"
    problems = verify(mutated_source, extracts)
    assert PROBLEM_DIMENSION_MISMATCH in problems


def test_mutation_broken_id_fails() -> None:
    source = _source()
    extracts = copy.deepcopy(derive(source))
    extracts["quantity_rows"][0]["element_ids"] = ["PV-99"]
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
    extracts["client_name"] = "Loteadora Horizonte"
    problems = verify(source, extracts)
    assert PROBLEM_PRESENTED_AS_CLIENT in problems or PROBLEM_ORIGIN_NOT_DEMONSTRATIVE in problems
    fixture = json.loads((ADVERSARIAL / "as-client.json").read_text(encoding="utf-8"))
    extracts2 = copy.deepcopy(derive(source))
    extracts2.update(fixture)
    problems2 = verify(source, extracts2)
    assert PROBLEM_PRESENTED_AS_CLIENT in problems2 or PROBLEM_ORIGIN_NOT_DEMONSTRATIVE in problems2


def test_adversarial_fixture_is_not_a_public_route() -> None:
    generate(ROOT)
    public_html = list((ROOT / "casos").rglob("index.html"))
    for path in public_html:
        text = path.read_text(encoding="utf-8")
        assert "Loteadora Horizonte" not in text
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
    assert compute(source)["pavement_area_m2"] == Decimal(a["named_totals"]["pavement_area_m2"])
