"""Pure derivation of takeoff, budget, coordination and review extracts.

The public HTML, CSV files and the consumption descriptor are rendered from
these extracts. Tests drive this module on the canonical source and on
isolated mutated copies.
"""

from __future__ import annotations

import copy
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

SOURCE_REL = Path("data/demonstrative/private-project-pilot/source.v1.json")
CONSUMPTION_REL = Path("data/demonstrative/private-project-pilot/consumption.v1.json")
PUBLIC_DIR_REL = Path("casos/demonstrativo-projeto-privado")
PUBLIC_URL = "/casos/demonstrativo-projeto-privado/"
CANONICAL_URL = "https://confenge.com.br/casos/demonstrativo-projeto-privado/"
PROOF_ID = "demo-private-project-pilot-2026-09"
SCHEMA = "confenge.demonstrative-sample-descriptor/1.0"

Q2 = Decimal("0.01")
Q4 = Decimal("0.0001")

PROBLEM_DIMENSION_MISMATCH = "quantity_does_not_match_geometry"
PROBLEM_BROKEN_ELEMENT_ID = "quantity_element_id_missing"
PROBLEM_SUBTOTAL_ADULTERATED = "budget_subtotal_mismatch"
PROBLEM_ORIGIN_NOT_DEMONSTRATIVE = "origin_not_demonstrative"
PROBLEM_PRESENTED_AS_CLIENT = "presented_as_client_case"
PROBLEM_HYPOTHETICAL_AS_OFFICIAL = "hypothetical_price_labeled_official"
PROBLEM_REVISION_DRIFT = "revision_mismatch"
PROBLEM_UNIT_INCONSISTENT = "unit_inconsistent"
PROBLEM_COORDINATION_REVIEW_CONTRADICTION = "coordination_review_contradiction"
PROBLEM_MISSING_INFO_AS_FAILURE = "missing_information_treated_as_proven_failure"
PROBLEM_CLIENT_IDENTITY = "fictional_client_identity"
PROBLEM_OFFICIAL_STANDARD_CLAIM = "invented_normative_compliance"

_OFFICIAL_PRICE_MARKERS = ("sinapi", "cotação vigente", "cotacao vigente", "tabela oficial")
_CLIENT_MARKERS = ("cliente real", "caso de cliente", "case de cliente", "contratante")


def D(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if value is None:
        raise ValueError("decimal value is missing")
    return Decimal(str(value))


def q2(value: Any) -> Decimal:
    return D(value).quantize(Q2, rounding=ROUND_HALF_UP)


def q4(value: Any) -> Decimal:
    return D(value).quantize(Q4, rounding=ROUND_HALF_UP)


def money(value: Any) -> Decimal:
    return q2(value)


def load_source(path: Path | None = None, *, root: Path | None = None) -> dict[str, Any]:
    if path is None:
        if root is None:
            root = Path(__file__).resolve().parents[3]
        path = root / SOURCE_REL
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("source must be an object")
    return payload


def element_by_id(source: dict[str, Any], element_id: str) -> dict[str, Any]:
    for item in source.get("elements") or []:
        if item.get("id") == element_id:
            return item
    raise KeyError(element_id)


def window_height(source: dict[str, Any], revision: str) -> Decimal:
    window = element_by_id(source, "WN-01")
    by_rev = window.get("height_by_revision") or {}
    if revision not in by_rev:
        raise KeyError(f"window height missing for {revision}")
    return D(by_rev[revision])


def window_head(source: dict[str, Any], revision: str) -> Decimal:
    window = element_by_id(source, "WN-01")
    return D(window["sill_m"]) + window_height(source, revision)


def opening_area(width: Decimal, height: Decimal) -> Decimal:
    return q4(width * height)


def _dec_str(value: Decimal, places: int) -> str:
    quant = Q2 if places == 2 else Q4
    return format(value.quantize(quant, rounding=ROUND_HALF_UP), "f")


def _br(value: Decimal, places: int = 2) -> str:
    return _dec_str(value, places).replace(".", ",")


def derive(source: dict[str, Any]) -> dict[str, Any]:
    """Build all extracts from a source dict. Does not touch the filesystem."""
    revision = str(source["revision"])
    criteria = source["takeoff_criteria"]
    room = source["room"]
    length = D(room["interior_length_m"])
    width = D(room["interior_width_m"])
    height = D(room["ceiling_height_m"])
    min_open = D(criteria["opening_deduction_min_m2"])
    upstand = D(criteria["waterproofing_upstand_m"])
    screed_t = D(criteria["screed_thickness_m"])
    basis_rev = str(criteria["quantity_basis_revision"])

    walls = [el for el in source["elements"] if el["type"] == "wall"]
    door = element_by_id(source, "D-01")
    window = element_by_id(source, "WN-01")
    beam = element_by_id(source, "B-01")
    shaft = element_by_id(source, "HS-01")
    floor = element_by_id(source, "SL-01")
    ceiling = element_by_id(source, "CL-01")

    win_h = window_height(source, basis_rev)
    win_area = opening_area(D(window["width_m"]), win_h)
    door_area = opening_area(D(door["width_m"]), D(door["height_m"]))
    floor_area = q2(length * width)
    ceiling_area = q2(D(ceiling["length_m"]) * D(ceiling["width_m"]))
    perimeter = q2(Decimal(2) * (length + width))

    wall_rows = []
    wall_gross = Decimal("0")
    wall_deduction = Decimal("0")
    for wall in walls:
        gross = q2(D(wall["length_m"]) * D(wall["height_m"]))
        wall_gross += gross
        deducted = Decimal("0")
        refs: list[str] = []
        if door["host_wall_id"] == wall["id"] and door_area >= min_open:
            deducted += door_area
            refs.append(door["id"])
        if window["host_wall_id"] == wall["id"] and win_area >= min_open:
            deducted += win_area
            refs.append(window["id"])
        deducted = q2(deducted)
        wall_deduction += deducted
        net = q2(gross - deducted)
        wall_rows.append(
            {
                "element_id": wall["id"],
                "gross_m2": _dec_str(gross, 2),
                "deduction_m2": _dec_str(deducted, 2),
                "net_m2": _dec_str(net, 2),
                "opening_ids": refs,
            }
        )
    wall_net = q2(wall_gross - wall_deduction)
    waterproofing = q2(floor_area + perimeter * upstand)
    screed_vol = q4(floor_area * screed_t)
    skirting = q2(perimeter - D(door["width_m"]))

    r00_head = window_head(source, "R00")
    r01_head = window_head(source, "R01")
    soffit = D(beam["soffit_m"])
    beam_top = soffit + D(beam["depth_m"])
    if r00_head <= soffit:
        r00_overlap = Decimal("0.00")
    else:
        r00_overlap = q2(min(r00_head, beam_top) - soffit)
    r01_clearance = q2(soffit - r01_head)

    quantity_rows = [
        {
            "id": "Q-PISO-01",
            "description_pt_br": "Revestimento cerâmico de piso",
            "unit": "m2",
            "quantity": _dec_str(floor_area, 2),
            "formula": f"{_dec_str(length, 2)}*{_dec_str(width, 2)}",
            "element_ids": [floor["id"]],
            "sheet_ref": floor["sheet_ref"],
            "discount_rule": "sem desconto de abertura no piso",
        },
        {
            "id": "Q-PAR-01",
            "description_pt_br": "Revestimento cerâmico de parede",
            "unit": "m2",
            "quantity": _dec_str(wall_net, 2),
            "formula": "sum(length*height)-openings>=0.50",
            "element_ids": [w["id"] for w in walls] + [door["id"], window["id"]],
            "sheet_ref": "PR-ARQ-R01",
            "discount_rule": criteria["opening_deduction_rule_pt_br"],
        },
        {
            "id": "Q-IMP-01",
            "description_pt_br": "Impermeabilização de piso e rodapé",
            "unit": "m2",
            "quantity": _dec_str(waterproofing, 2),
            "formula": f"{_dec_str(floor_area, 2)}+{ _dec_str(perimeter, 2)}*{_dec_str(upstand, 2)}",
            "element_ids": [floor["id"], "W-01", "W-02", "W-03", "W-04"],
            "sheet_ref": "PR-ARQ-R01",
            "discount_rule": "rodapé contínuo; porta não reduz a faixa molhada do piso",
        },
        {
            "id": "Q-CTR-01",
            "description_pt_br": "Contrpiso de regularização",
            "unit": "m3",
            "quantity": _dec_str(screed_vol, 4),
            "formula": f"{_dec_str(floor_area, 2)}*{_dec_str(screed_t, 2)}",
            "element_ids": [floor["id"]],
            "sheet_ref": "PR-ARQ-R01",
            "discount_rule": "espessura constante no recorte",
        },
        {
            "id": "Q-PRT-01",
            "description_pt_br": "Porta de giro",
            "unit": "un",
            "quantity": "1",
            "formula": "count(D-01)",
            "element_ids": [door["id"]],
            "sheet_ref": door["sheet_ref"],
            "discount_rule": "não se aplica",
        },
        {
            "id": "Q-JAN-01",
            "description_pt_br": "Janela do recorte",
            "unit": "un",
            "quantity": "1",
            "formula": "count(WN-01)",
            "element_ids": [window["id"]],
            "sheet_ref": (window.get("sheet_ref_by_revision") or {}).get(basis_rev, "PR-ARQ-R01"),
            "discount_rule": "não se aplica",
        },
        {
            "id": "Q-ROD-01",
            "description_pt_br": "Rodapé cerâmico",
            "unit": "m",
            "quantity": _dec_str(skirting, 2),
            "formula": f"{_dec_str(perimeter, 2)}-{_dec_str(D(door['width_m']), 2)}",
            "element_ids": [door["id"], "W-01", "W-02", "W-03", "W-04"],
            "sheet_ref": "PR-ARQ-R01",
            "discount_rule": "desconto da largura da porta",
        },
    ]

    qty_by_id = {row["id"]: row for row in quantity_rows}
    price_class = str(source["prices"]["class"])
    price_items = source["prices"]["items"]
    budget_rows = []
    subtotal = Decimal("0.00")
    for spec in source["service_rows"]:
        qty_row = qty_by_id[spec["quantity_id"]]
        qty = D(qty_row["quantity"])
        unit_price = money(price_items[spec["quantity_id"]])
        amount = money(qty * unit_price)
        subtotal += amount
        budget_rows.append(
            {
                "id": spec["id"],
                "quantity_id": spec["quantity_id"],
                "service_pt_br": spec["service_pt_br"],
                "unit": qty_row["unit"],
                "quantity": qty_row["quantity"],
                "unit_price": _dec_str(unit_price, 2),
                "amount": _dec_str(amount, 2),
                "price_class": price_class,
                "element_ids": list(qty_row["element_ids"]),
                "sheet_ref": qty_row["sheet_ref"],
            }
        )
    subtotal = money(subtotal)

    coordination = [
        {
            "id": "CF-GEO-01",
            "kind": "geometric",
            "state": "resolved_in_R01",
            "location_pt_br": "Parede leste W-02, interface WN-01 × B-01",
            "evidence_pt_br": (
                f"No estado original R00 a verga da janela está em {_br(r00_head)} m "
                f"e o fundo da viga B-01 em {_br(soffit)} m, com sobreposição de "
                f"{_br(r00_overlap)} m no eixo Z."
            ),
            "forwarding_pt_br": (
                f"No recorte R01 a verga desce para {_br(r01_head)} m, com folga de "
                f"{_br(r01_clearance)} m até o fundo da viga. Encaminhamento: autor "
                "do recorte arquitetônico demonstrativo."
            ),
            "element_ids": ["WN-01", "B-01", "W-02"],
            "sheet_refs": ["PR-ARQ-R00", "PR-ARQ-R01", "PR-EST-R00"],
            "proven_failure": True,
            "original_state": "R00",
            "corrected_state": "R01",
        },
        {
            "id": "CF-INFO-01",
            "kind": "missing_information",
            "state": "information_requested",
            "location_pt_br": "Poço hidrossanitário HS-01 na parede oeste W-04",
            "evidence_pt_br": (
                "O recorte declara o contorno externo 0,40 m × 0,40 m e deixa em branco "
                "vão livre interno e diâmetros de tubulação."
            ),
            "forwarding_pt_br": (
                "Pedir ao projetista hidrossanitário de origem as dimensões internas e os "
                "diâmetros. Enquanto esses dados não chegam, o item permanece pedido de "
                "informação, não falha comprovada."
            ),
            "element_ids": ["HS-01", "W-04"],
            "sheet_refs": [shaft["sheet_ref"]],
            "proven_failure": False,
            "original_state": "R00",
            "corrected_state": None,
        },
    ]

    review_findings = [
        {
            "id": "RF-01",
            "document_ref": "PR-ARQ-R00",
            "finding_pt_br": "A verga da janela WN-01 invade o volume da viga B-01 no estado original.",
            "basis_pt_br": (
                "Conferência geométrica das faixas Z dos dois elementos no recorte, "
                "sem exame de norma de dimensionamento."
            ),
            "action_pt_br": (
                f"Rebaixar a verga para {_br(r01_head)} m no recorte R01 e manter a "
                "viga na cota original."
            ),
            "check_kind": "arithmetic_documental_coherence",
            "related_finding_id": "CF-GEO-01",
            "element_ids": ["WN-01", "B-01"],
        },
        {
            "id": "RF-02",
            "document_ref": "PR-HID-R00",
            "finding_pt_br": "O poço hidrossanitário HS-01 não declara vão livre interno nem diâmetros.",
            "basis_pt_br": (
                "Campo do recorte vazio. Ausência de informação, não conformidade com "
                "norma não examinada."
            ),
            "action_pt_br": "Registrar pedido de informação; não converter a lacuna em falha comprovada.",
            "check_kind": "documental_coherence",
            "related_finding_id": "CF-INFO-01",
            "element_ids": ["HS-01"],
        },
    ]

    elements_out = []
    for el in source["elements"]:
        item = {
            "id": el["id"],
            "type": el["type"],
            "label_pt_br": el["label_pt_br"],
            "sheet_ref": el.get("sheet_ref")
            or (el.get("sheet_ref_by_revision") or {}).get(revision),
        }
        if el["type"] == "window":
            item["height_m"] = _dec_str(win_h, 2)
            item["head_m"] = _dec_str(r01_head, 2)
            item["sill_m"] = str(el["sill_m"])
            item["width_m"] = str(el["width_m"])
            item["height_by_revision"] = dict(el["height_by_revision"])
        elif el["type"] == "beam":
            item["soffit_m"] = str(el["soffit_m"])
            item["depth_m"] = str(el["depth_m"])
        elif el["type"] == "shaft":
            item["internal_clear_width_m"] = el.get("internal_clear_width_m")
            item["internal_clear_depth_m"] = el.get("internal_clear_depth_m")
            item["pipe_diameters_mm"] = el.get("pipe_diameters_mm")
        elif el["type"] in {"wall", "floor", "ceiling", "door"}:
            for key in ("length_m", "width_m", "height_m", "thickness_m"):
                if key in el:
                    item[key] = str(el[key])
        elements_out.append(item)

    named_totals = {
        "floor_area_m2": _dec_str(floor_area, 2),
        "wall_net_m2": _dec_str(wall_net, 2),
        "waterproofing_m2": _dec_str(waterproofing, 2),
        "screed_m3": _dec_str(screed_vol, 4),
        "skirting_m": _dec_str(skirting, 2),
        "budget_subtotal_brl": _dec_str(subtotal, 2),
        "r00_overlap_m": _dec_str(r00_overlap, 2),
        "r01_clearance_m": _dec_str(r01_clearance, 2),
        "window_head_r00_m": _dec_str(r00_head, 2),
        "window_head_r01_m": _dec_str(r01_head, 2),
        "beam_soffit_m": _dec_str(soffit, 2),
        "window_area_r01_m2": _dec_str(win_area, 2),
        "door_area_m2": _dec_str(door_area, 2),
    }

    return {
        "schema": SCHEMA,
        "proof_id": str(source["id"]),
        "origin": str(source["origin"]),
        "revision": revision,
        "date_modified": str(source["date_modified"]),
        "label_pt_br": str(source["label_pt_br"]),
        "url": PUBLIC_URL,
        "canonical": CANONICAL_URL,
        "type": "private_project_demonstrative_excerpt",
        "units": dict(source["units"]),
        "takeoff_criteria": dict(criteria),
        "room": dict(room),
        "states": copy.deepcopy(source["states"]),
        "elements": elements_out,
        "wall_breakdown": wall_rows,
        "quantity_rows": quantity_rows,
        "budget_rows": budget_rows,
        "budget_subtotal": _dec_str(subtotal, 2),
        "price_class": price_class,
        "price_disclaimer_pt_br": source["prices"]["disclaimer_pt_br"],
        "coordination_findings": coordination,
        "review_findings": review_findings,
        "review_check_kind": "arithmetic_documental_coherence",
        "review_attribution_pt_br": (
            "Conferência aritmética, documental e de coerência executada pelo "
            "gerador deste demonstrativo. Não é revisão profissional independente, "
            "nem revisão por cliente, equipe ou responsável técnico nomeado."
        ),
        "named_totals": named_totals,
        "client_name": source.get("client_name"),
        "address": source.get("address"),
        "art_number": source.get("art_number"),
        "signature": source.get("signature"),
        "source_paths": [SOURCE_REL.as_posix()],
        "assets": [
            {
                "id": "html",
                "path": f"{PUBLIC_DIR_REL.as_posix()}/index.html",
                "url": PUBLIC_URL,
                "type": "html",
            },
            {
                "id": "quantitativos-csv",
                "path": f"{PUBLIC_DIR_REL.as_posix()}/data/quantitativos.csv",
                "url": f"{PUBLIC_URL}data/quantitativos.csv",
                "type": "csv",
            },
            {
                "id": "orcamento-csv",
                "path": f"{PUBLIC_DIR_REL.as_posix()}/data/orcamento.csv",
                "url": f"{PUBLIC_URL}data/orcamento.csv",
                "type": "csv",
            },
            {
                "id": "coordenacao-csv",
                "path": f"{PUBLIC_DIR_REL.as_posix()}/data/coordenacao.csv",
                "url": f"{PUBLIC_URL}data/coordenacao.csv",
                "type": "csv",
            },
            {
                "id": "revisao-csv",
                "path": f"{PUBLIC_DIR_REL.as_posix()}/data/revisao.csv",
                "url": f"{PUBLIC_URL}data/revisao.csv",
                "type": "csv",
            },
            {
                "id": "planta-r00",
                "path": f"{PUBLIC_DIR_REL.as_posix()}/assets/planta-r00.svg",
                "url": f"{PUBLIC_URL}assets/planta-r00.svg",
                "type": "svg",
            },
            {
                "id": "planta-r01",
                "path": f"{PUBLIC_DIR_REL.as_posix()}/assets/planta-r01.svg",
                "url": f"{PUBLIC_URL}assets/planta-r01.svg",
                "type": "svg",
            },
            {
                "id": "elevacao-leste-r00",
                "path": f"{PUBLIC_DIR_REL.as_posix()}/assets/elevacao-leste-r00.svg",
                "url": f"{PUBLIC_URL}assets/elevacao-leste-r00.svg",
                "type": "svg",
            },
            {
                "id": "elevacao-leste-r01",
                "path": f"{PUBLIC_DIR_REL.as_posix()}/assets/elevacao-leste-r01.svg",
                "url": f"{PUBLIC_URL}assets/elevacao-leste-r01.svg",
                "type": "svg",
            },
        ],
    }


def _as_number(value: str) -> float | int:
    number = D(value)
    if number == number.to_integral_value():
        return int(number)
    return float(number)


def build_sample_trail(extracts: dict[str, Any]) -> dict[str, Any]:
    """One conferable wall trail derived from the same extracts as the CSVs."""
    qty = next(row for row in extracts["quantity_rows"] if row["id"] == "Q-PAR-01")
    budget = next(row for row in extracts["budget_rows"] if row["quantity_id"] == "Q-PAR-01")
    rf1 = next(item for item in extracts["review_findings"] if item["id"] == "RF-01")
    named = extracts["named_totals"]
    criteria = extracts["takeoff_criteria"]
    walls = {row["element_id"]: row for row in extracts["wall_breakdown"]}
    elements = {el["id"]: el for el in extracts["elements"]}
    room = extracts["room"]

    wall_order = ["W-01", "W-02", "W-03", "W-04"]
    inputs = []
    memory_parts = []
    for wall_id in wall_order:
        wall = elements[wall_id]
        length = D(wall["length_m"])
        height = D(wall["height_m"])
        gross = D(walls[wall_id]["gross_m2"])
        inputs.append(
            {
                "label": f"{wall['label_pt_br']} ({wall_id})",
                "value": _as_number(_dec_str(length, 2)),
                "unit": "m",
            }
        )
        memory_parts.append(f"{wall_id} {_br(length)} × {_br(height)} = {_br(gross)} m²")
    inputs.append(
        {
            "label": "vão da porta D-01",
            "value": _as_number(named["door_area_m2"]),
            "unit": "m2",
        }
    )
    inputs.append(
        {
            "label": "vão da janela WN-01",
            "value": _as_number(named["window_area_r01_m2"]),
            "unit": "m2",
        }
    )
    gross_sum = sum((D(walls[wid]["gross_m2"]) for wid in wall_order), Decimal("0"))
    net = D(qty["quantity"])
    # Consume the rounded deductions already applied by the takeoff authority.
    # Grouping by wall also preserves its rounding when openings share a host.
    deductions = sorted(
        (row for row in walls.values() if D(row["deduction_m2"]) > 0),
        key=lambda row: row["opening_ids"],
    )
    discounts = " e ".join(
        f"{' + '.join(row['opening_ids'])} {_br(D(row['deduction_m2']))} m²"
        for row in deductions
    ) or "nenhum"
    equation = " - ".join(
        [f"{_br(gross_sum)} m²"]
        + [f"{_br(D(row['deduction_m2']))} m²" for row in deductions]
    ) + f" = {_br(net)} m²."
    memory = (
        f"{'; '.join(memory_parts)}. "
        f"Aberturas medidas: D-01 {_br(D(named['door_area_m2']))} m² e "
        f"WN-01 {_br(D(named['window_area_r01_m2']))} m². "
        f"Descontos aplicados: {discounts}. {equation}"
    )
    return {
        "schema": "confenge.quantity-takeoff-excerpt/1.0",
        "status": "canonical",
        "quantity_id": qty["id"],
        "budget_id": budget["id"],
        "disclaimer": (
            "Amostra demonstrativa do recorte de banheiro. Não é orçamento para "
            "executar obra, não representa cliente, não é preço da CONFENGE e "
            "não é SINAPI real."
        ),
        "demonstrative_url": extracts["url"],
        "demonstrative_href": f"{extracts['url']}#quantitativos",
        "element": {
            "id": "W-02",
            "name": qty["description_pt_br"],
            "source": (
                f"Planta {qty['sheet_ref']}, recorte {room['id']}, "
                "paredes W-01 a W-04 com aberturas D-01 e WN-01"
            ),
            "location": (
                f"Recorte de banheiro {room['id']}, planta PR-ARQ e elevação leste W-02"
            ),
        },
        "criterion": {
            "unit": "m²" if qty["unit"] == "m2" else qty["unit"],
            "rule": criteria["opening_deduction_rule_pt_br"],
        },
        "calculation": {
            "formula": qty["formula"],
            "label_pt_br": "Área das paredes menos as aberturas descontáveis.",
            "inputs": inputs,
            "memory": memory,
        },
        "quantity": {
            "value": _as_number(qty["quantity"]),
            "unit": "m²" if qty["unit"] == "m2" else qty["unit"],
        },
        "spreadsheet_item": {
            "code": budget["id"],
            "description": budget["service_pt_br"],
            "unit": "m²" if budget["unit"] == "m2" else budget["unit"],
            "quantity": _as_number(budget["quantity"]),
        },
        "review_reference": {
            "id": rf1["id"],
            "label": "Referência de revisão",
            "text": (
                f"{rf1['id']}: {rf1['finding_pt_br']} "
                "A janela WN-01 entra neste desconto de parede."
            ),
            "href": "/revisao-tecnica-projetos-engenharia/#extrato-demonstrativo",
            "document_ref": rf1["document_ref"],
        },
    }


def consumption_descriptor(extracts: dict[str, Any]) -> dict[str, Any]:
    """Stable contract for campaigns 03/04/05/11/12. Not a commercial schema."""
    return {
        "schema": SCHEMA,
        "proof_id": extracts["proof_id"],
        "url": extracts["url"],
        "canonical": extracts["canonical"],
        "type": extracts["type"],
        "origin": extracts["origin"],
        "revision": extracts["revision"],
        "date_modified": extracts["date_modified"],
        "label_pt_br": extracts["label_pt_br"],
        "source_paths": list(extracts["source_paths"]),
        "elements": [
            {"id": el["id"], "type": el["type"], "sheet_ref": el.get("sheet_ref")}
            for el in extracts["elements"]
        ],
        "units": dict(extracts["units"]),
        "quantity_rows": [
            {
                "id": row["id"],
                "unit": row["unit"],
                "quantity": row["quantity"],
                "element_ids": list(row["element_ids"]),
                "formula": row["formula"],
                "sheet_ref": row["sheet_ref"],
            }
            for row in extracts["quantity_rows"]
        ],
        "budget_rows": [
            {
                "id": row["id"],
                "quantity_id": row["quantity_id"],
                "unit": row["unit"],
                "quantity": row["quantity"],
                "amount": row["amount"],
                "price_class": row["price_class"],
                "element_ids": list(row["element_ids"]),
            }
            for row in extracts["budget_rows"]
        ],
        "budget_subtotal": extracts["budget_subtotal"],
        "price_class": extracts["price_class"],
        "coordination_findings": [
            {
                "id": item["id"],
                "kind": item["kind"],
                "state": item["state"],
                "element_ids": list(item["element_ids"]),
                "proven_failure": item["proven_failure"],
                "location_pt_br": item["location_pt_br"],
                "evidence_pt_br": item["evidence_pt_br"],
                "forwarding_pt_br": item["forwarding_pt_br"],
            }
            for item in extracts["coordination_findings"]
        ],
        "review_findings": [
            {
                "id": item["id"],
                "document_ref": item["document_ref"],
                "related_finding_id": item["related_finding_id"],
                "check_kind": item["check_kind"],
                "element_ids": list(item["element_ids"]),
                "finding_pt_br": item["finding_pt_br"],
                "basis_pt_br": item["basis_pt_br"],
                "action_pt_br": item["action_pt_br"],
            }
            for item in extracts["review_findings"]
        ],
        "sample_trail": build_sample_trail(extracts),
        "named_totals": dict(extracts["named_totals"]),
        "assets": list(extracts["assets"]),
        "review_check_kind": extracts["review_check_kind"],
        "consumer_rule_pt_br": (
            "Ler quantity_rows, coordination_findings, review_findings e assets. "
            "Não inventar subtotais. Mudança geométrica exige regenerar os extratos."
        ),
    }


def _blob(extracts: dict[str, Any]) -> str:
    return json.dumps(extracts, ensure_ascii=False, sort_keys=True).lower()


def verify(source: dict[str, Any], extracts: dict[str, Any]) -> list[str]:
    """Fail-closed coherence check used by generation and by tests."""
    problems: list[str] = []
    expected = derive(source)
    element_ids = {el["id"] for el in source.get("elements") or []}

    if str(extracts.get("origin") or "") != "demonstrative":
        problems.append(PROBLEM_ORIGIN_NOT_DEMONSTRATIVE)
    if extracts.get("client_name") or extracts.get("address") or extracts.get("art_number") or extracts.get("signature"):
        problems.append(PROBLEM_CLIENT_IDENTITY)
    if source.get("client_name") or source.get("address") or source.get("art_number") or source.get("signature"):
        problems.append(PROBLEM_CLIENT_IDENTITY)

    blob = _blob(extracts)
    if any(marker in blob for marker in _CLIENT_MARKERS) and "exemplo demonstrativo" not in blob:
        problems.append(PROBLEM_PRESENTED_AS_CLIENT)
    if str(extracts.get("origin") or "") in {"client", "cliente", "published_client"}:
        problems.append(PROBLEM_PRESENTED_AS_CLIENT)

    if extracts.get("revision") != source.get("revision"):
        problems.append(PROBLEM_REVISION_DRIFT)
    if extracts.get("revision") != expected.get("revision"):
        problems.append(PROBLEM_REVISION_DRIFT)

    allowed_units = set((source.get("units") or {}).values()) | {"m", "m2", "m3", "un", "BRL"}
    qty_by_id = {row["id"]: row for row in expected["quantity_rows"]}
    for row in extracts.get("quantity_rows") or []:
        if row.get("unit") not in allowed_units:
            problems.append(PROBLEM_UNIT_INCONSISTENT)
        for eid in row.get("element_ids") or []:
            if eid not in element_ids:
                problems.append(PROBLEM_BROKEN_ELEMENT_ID)
        expected_row = qty_by_id.get(row.get("id"))
        if expected_row and D(row.get("quantity") or "0") != D(expected_row["quantity"]):
            problems.append(PROBLEM_DIMENSION_MISMATCH)

    for row in expected["quantity_rows"]:
        got = next((r for r in extracts.get("quantity_rows") or [] if r.get("id") == row["id"]), None)
        if got is None:
            problems.append(PROBLEM_DIMENSION_MISMATCH)
            continue
        if D(got["quantity"]) != D(row["quantity"]):
            problems.append(PROBLEM_DIMENSION_MISMATCH)

    named = extracts.get("named_totals") or {}
    exp_named = expected["named_totals"]
    for key in ("floor_area_m2", "wall_net_m2", "waterproofing_m2", "screed_m3"):
        if key not in named or D(named[key]) != D(exp_named[key]):
            problems.append(PROBLEM_DIMENSION_MISMATCH)

    amounts = [money(row.get("amount") or "0") for row in extracts.get("budget_rows") or []]
    declared = money(extracts.get("budget_subtotal") or "0")
    if amounts and money(sum(amounts, Decimal("0"))) != declared:
        problems.append(PROBLEM_SUBTOTAL_ADULTERATED)
    if declared != money(expected["budget_subtotal"]):
        problems.append(PROBLEM_SUBTOTAL_ADULTERATED)

    official_blob = blob
    if extracts.get("price_class") == "hypothetical" or source.get("prices", {}).get("class") == "hypothetical":
        if any(marker in official_blob for marker in _OFFICIAL_PRICE_MARKERS):
            # The disclaimer may mention SINAPI to deny it. Only fail when a
            # budget row claims an official source.
            for row in extracts.get("budget_rows") or []:
                row_blob = json.dumps(row, ensure_ascii=False).lower()
                if any(marker in row_blob for marker in _OFFICIAL_PRICE_MARKERS):
                    problems.append(PROBLEM_HYPOTHETICAL_AS_OFFICIAL)
            price_source = str(extracts.get("price_source") or source.get("prices", {}).get("official_source") or "")
            if price_source.lower() in {"sinapi", "cotacao vigente", "cotação vigente"}:
                problems.append(PROBLEM_HYPOTHETICAL_AS_OFFICIAL)

    coord = {item["id"]: item for item in extracts.get("coordination_findings") or []}
    for finding in extracts.get("review_findings") or []:
        related = coord.get(finding.get("related_finding_id"))
        if related is None:
            problems.append(PROBLEM_COORDINATION_REVIEW_CONTRADICTION)
            continue
        for eid in finding.get("element_ids") or []:
            if eid not in related.get("element_ids") or []:
                problems.append(PROBLEM_COORDINATION_REVIEW_CONTRADICTION)
        if related.get("kind") == "missing_information" and related.get("proven_failure"):
            problems.append(PROBLEM_MISSING_INFO_AS_FAILURE)
        if related.get("kind") == "missing_information" and related.get("state") == "proven_failure":
            problems.append(PROBLEM_MISSING_INFO_AS_FAILURE)
        if "nbr" in json.dumps(finding, ensure_ascii=False).lower() and "não examin" not in json.dumps(finding, ensure_ascii=False).lower():
            problems.append(PROBLEM_OFFICIAL_STANDARD_CLAIM)

    info_findings = [c for c in extracts.get("coordination_findings") or [] if c.get("kind") == "missing_information"]
    for item in info_findings:
        if item.get("proven_failure") or item.get("state") in {"proven_failure", "clash_confirmed"}:
            problems.append(PROBLEM_MISSING_INFO_AS_FAILURE)

    geo = coord.get("CF-GEO-01")
    if geo and geo.get("state") == "resolved_in_R01":
        rf = next((r for r in extracts.get("review_findings") or [] if r.get("id") == "RF-01"), None)
        if rf and "r01" not in json.dumps(rf, ensure_ascii=False).lower():
            problems.append(PROBLEM_COORDINATION_REVIEW_CONTRADICTION)

    # Identity of named totals vs geometry (third-party recalculation).
    room = source["room"]
    floor_from_geom = q2(D(room["interior_length_m"]) * D(room["interior_width_m"]))
    if D(named.get("floor_area_m2") or "0") != floor_from_geom:
        problems.append(PROBLEM_DIMENSION_MISMATCH)

    return sorted(set(problems))
