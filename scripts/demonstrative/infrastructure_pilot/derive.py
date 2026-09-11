"""Pure derivation of takeoff, budget, coordination and review extracts.

Public HTML, CSV, SVG and the consumption descriptor are rendered from these
extracts. Tests drive this module on the canonical source and on isolated
mutated copies. Quantity arithmetic lives here; independent reference
arithmetic used by tests lives in tests/demonstrative_infrastructure/reference.py
and must not import this module.
"""

from __future__ import annotations

import copy
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

SOURCE_REL = Path("data/demonstrative/infrastructure-pilot/source.v1.json")
CONSUMPTION_REL = Path("data/demonstrative/infrastructure-pilot/consumption.v1.json")
PUBLIC_DIR_REL = Path("casos/demonstrativo-infraestrutura")
PUBLIC_URL = "/casos/demonstrativo-infraestrutura/"
CANONICAL_URL = "https://confenge.com.br/casos/demonstrativo-infraestrutura/"
PROOF_ID = "demo-infrastructure-pilot-2026-09"
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
PROBLEM_OMITTED_PUBLIC_RESOURCE = "declared_public_resource_omitted"
PROBLEM_GEOMETRIC_AS_DESIGN = "geometric_quantity_presented_as_design"

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


def _dec_str(value: Decimal, places: int) -> str:
    quant = Q2 if places == 2 else Q4
    return format(value.quantize(quant, rounding=ROUND_HALF_UP), "f")


def _br(value: Decimal, places: int = 2) -> str:
    return _dec_str(value, places).replace(".", ",")


def mh02_spreadsheet_invert(source: dict[str, Any], revision: str) -> Decimal:
    mh2 = element_by_id(source, "MH-02")
    by_rev = mh2.get("invert_spreadsheet_by_revision") or {}
    if revision not in by_rev:
        raise KeyError(f"spreadsheet invert missing for {revision}")
    return D(by_rev[revision])


def derive(source: dict[str, Any]) -> dict[str, Any]:
    """Build all extracts from a source dict. Does not touch the filesystem."""
    revision = str(source["revision"])
    criteria = source["takeoff_criteria"]
    basis_rev = str(criteria["quantity_basis_revision"])
    pav = element_by_id(source, "PV-01")
    mh1 = element_by_id(source, "MH-01")
    mh2 = element_by_id(source, "MH-02")
    pipe = element_by_id(source, "DR-01")
    inlet = element_by_id(source, "IN-01")

    length = q2(D(pav["station_end_m"]) - D(pav["station_start_m"]))
    width = D(pav["width_m"])
    area = q2(length * width)
    t_sub = D(pav["layers"]["subbase_m"])
    t_base = D(pav["layers"]["base_m"])
    t_wear = D(pav["layers"]["wearing_m"])
    vol_sub = q2(area * t_sub)
    vol_base = q2(area * t_base)
    vol_wear = q2(area * t_wear)
    slope = D(pav["longitudinal_slope_m_per_m"])
    grade_start = D(pav["grade_start_m"])
    grade_drop = q2(length * slope)
    grade_end = q2(grade_start - grade_drop)

    pipe_len = q2(D(mh2["station_m"]) - D(mh1["station_m"]))
    invert_up = D(mh1["invert_m"])
    invert_drawn = D(mh2["invert_drawn_m"])
    invert_sheet_basis = mh02_spreadsheet_invert(source, basis_rev)
    invert_sheet_r00 = mh02_spreadsheet_invert(source, "R00")
    invert_sheet_r01 = mh02_spreadsheet_invert(source, "R01")
    mismatch_r00 = q2(abs(invert_drawn - invert_sheet_r00))
    mismatch_r01 = q2(abs(invert_drawn - invert_sheet_r01))
    slope_drawn = q4((invert_up - invert_drawn) / pipe_len)
    slope_sheet_r00 = q4((invert_up - invert_sheet_r00) / pipe_len)
    slope_sheet_r01 = q4((invert_up - invert_sheet_r01) / pipe_len)
    manhole_count = Decimal("2")
    inlet_count = Decimal("1")
    diameter = D(pipe["diameter_mm"])

    pav_sheet = str(pav["sheet_ref"])
    pipe_sheet = str(pipe["sheet_ref"]) if revision != "R00" else str(
        (mh2.get("sheet_ref_by_revision") or {}).get(revision, pipe["sheet_ref"])
    )
    mh2_sheet = (mh2.get("sheet_ref_by_revision") or {}).get(revision) or (mh2.get("sheet_ref_by_revision") or {}).get(basis_rev)

    quantity_rows = [
        {
            "id": "Q-PAV-01",
            "description_pt_br": "Área da faixa de acesso PV-01",
            "unit": "m2",
            "quantity": _dec_str(area, 2),
            "formula": f"{_dec_str(length, 2)}*{_dec_str(width, 2)}",
            "element_ids": [pav["id"]],
            "sheet_ref": pav_sheet,
            "chain": "drawing_dimension_formula_quantity_spreadsheet",
            "kind": "geometric_area",
            "discount_rule": criteria["pavement_area_rule_pt_br"],
        },
        {
            "id": "Q-SUB-01",
            "description_pt_br": "Volume geométrico da sub-base",
            "unit": "m3",
            "quantity": _dec_str(vol_sub, 2),
            "formula": f"{_dec_str(area, 2)}*{_dec_str(t_sub, 2)}",
            "element_ids": [pav["id"]],
            "sheet_ref": pav_sheet,
            "chain": "drawing_dimension_formula_quantity_spreadsheet",
            "kind": "geometric_volume",
            "discount_rule": criteria["layer_volume_rule_pt_br"],
        },
        {
            "id": "Q-BASE-01",
            "description_pt_br": "Volume geométrico da base",
            "unit": "m3",
            "quantity": _dec_str(vol_base, 2),
            "formula": f"{_dec_str(area, 2)}*{_dec_str(t_base, 2)}",
            "element_ids": [pav["id"]],
            "sheet_ref": pav_sheet,
            "chain": "drawing_dimension_formula_quantity_spreadsheet",
            "kind": "geometric_volume",
            "discount_rule": criteria["layer_volume_rule_pt_br"],
        },
        {
            "id": "Q-CAP-01",
            "description_pt_br": "Volume geométrico da capa de rolamento",
            "unit": "m3",
            "quantity": _dec_str(vol_wear, 2),
            "formula": f"{_dec_str(area, 2)}*{_dec_str(t_wear, 2)}",
            "element_ids": [pav["id"]],
            "sheet_ref": pav_sheet,
            "chain": "drawing_dimension_formula_quantity_spreadsheet",
            "kind": "geometric_volume",
            "discount_rule": criteria["layer_volume_rule_pt_br"],
        },
        {
            "id": "Q-TUB-01",
            "description_pt_br": "Comprimento geométrico do trecho DR-01",
            "unit": "m",
            "quantity": _dec_str(pipe_len, 2),
            "formula": f"{_dec_str(D(mh2['station_m']), 2)}-{_dec_str(D(mh1['station_m']), 2)}",
            "element_ids": [pipe["id"], mh1["id"], mh2["id"]],
            "sheet_ref": pipe_sheet,
            "chain": "drawing_dimension_formula_quantity_spreadsheet",
            "kind": "geometric_length",
            "discount_rule": criteria["pipe_length_rule_pt_br"],
        },
        {
            "id": "Q-PV-01",
            "description_pt_br": "Poços de visita do recorte",
            "unit": "un",
            "quantity": "2",
            "formula": "count(MH-01,MH-02)",
            "element_ids": [mh1["id"], mh2["id"]],
            "sheet_ref": str(mh1["sheet_ref"]),
            "chain": "drawing_dimension_formula_quantity_spreadsheet",
            "kind": "count",
            "discount_rule": "não se aplica",
        },
        {
            "id": "Q-BOC-01",
            "description_pt_br": "Boca de lobo do recorte",
            "unit": "un",
            "quantity": "1",
            "formula": "count(IN-01)",
            "element_ids": [inlet["id"]],
            "sheet_ref": str(inlet["sheet_ref"]),
            "chain": "drawing_dimension_formula_quantity_spreadsheet",
            "kind": "count",
            "discount_rule": "contagem do elemento declarado; diâmetro e cota permanecem ausentes",
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
            "location_pt_br": "Conexão de jusante MH-02 no trecho DR-01, estaqueamento E0+030",
            "evidence_pt_br": (
                f"No estado original R00 o desenho declara invert de MH-02 em {_br(invert_drawn)} m "
                f"e a planilha registra {_br(invert_sheet_r00)} m, diferença de {_br(mismatch_r00)} m. "
                f"Declive geométrico do desenho: {_br(slope_drawn, 4)} m/m; da planilha R00: "
                f"{_br(slope_sheet_r00, 4)} m/m. Isso é diferença de cota, não capacidade hidráulica."
            ),
            "forwarding_pt_br": (
                f"No recorte R01 a planilha passa a {_br(invert_sheet_r01)} m, igual ao desenho. "
                "Encaminhamento: autor do recorte de drenagem demonstrativo, para alinhar a cota "
                "de conexão entre desenho e planilha."
            ),
            "element_ids": ["MH-02", "DR-01"],
            "sheet_refs": ["INF-DR-R00", "INF-DR-R01"],
            "proven_failure": True,
            "original_state": "R00",
            "corrected_state": "R01",
        },
        {
            "id": "CF-INFO-01",
            "kind": "missing_information",
            "state": "information_requested",
            "location_pt_br": "Boca de lobo IN-01 no acesso PV-01, estaqueamento E0+020",
            "evidence_pt_br": (
                "O recorte declara a posição da boca de lobo e deixa em branco diâmetro e cota de invert."
            ),
            "forwarding_pt_br": (
                "Pedir ao projetista de drenagem de origem o diâmetro e a cota. Enquanto esses dados "
                "não chegam, o item permanece pedido de informação, não falha comprovada nem risco comprovado."
            ),
            "element_ids": ["IN-01", "PV-01"],
            "sheet_refs": [str(inlet["sheet_ref"])],
            "proven_failure": False,
            "original_state": "R00",
            "corrected_state": None,
        },
    ]

    review_findings = [
        {
            "id": "RF-01",
            "document_ref": "INF-DR-R00",
            "finding_pt_br": (
                "A cota de conexão de MH-02 desenhada não coincide com a cota da planilha no estado original."
            ),
            "basis_pt_br": (
                "Conferência geométrica e documental das cotas de invert no mesmo estaqueamento, "
                "sem exame de norma de drenagem e sem verificação de capacidade hidráulica."
            ),
            "action_pt_br": (
                f"Alinhar a planilha à cota desenhada {_br(invert_drawn)} m no recorte R01."
            ),
            "check_kind": "arithmetic_documental_coherence",
            "related_finding_id": "CF-GEO-01",
            "element_ids": ["MH-02", "DR-01"],
        },
        {
            "id": "RF-02",
            "document_ref": "INF-DR-R00",
            "finding_pt_br": "A boca de lobo IN-01 não declara diâmetro nem cota de invert.",
            "basis_pt_br": (
                "Campo do recorte vazio. Ausência de informação, não conformidade com norma não examinada."
            ),
            "action_pt_br": "Registrar pedido de informação; não converter a lacuna em falha comprovada.",
            "check_kind": "documental_coherence",
            "related_finding_id": "CF-INFO-01",
            "element_ids": ["IN-01"],
        },
    ]

    elements_out = []
    for el in source["elements"]:
        item = {
            "id": el["id"],
            "type": el["type"],
            "label_pt_br": el["label_pt_br"],
            "role": el.get("role"),
            "sheet_ref": el.get("sheet_ref")
            or (el.get("sheet_ref_by_revision") or {}).get(revision),
        }
        if el["type"] == "pavement_strip":
            item["station_start_m"] = str(el["station_start_m"])
            item["station_end_m"] = str(el["station_end_m"])
            item["length_m"] = _dec_str(length, 2)
            item["width_m"] = str(el["width_m"])
            item["layers"] = dict(el["layers"])
            item["longitudinal_slope_m_per_m"] = str(el["longitudinal_slope_m_per_m"])
            item["grade_start_m"] = str(el["grade_start_m"])
            item["grade_end_m"] = _dec_str(grade_end, 2)
        elif el["type"] == "manhole":
            item["station_m"] = str(el["station_m"])
            if "invert_m" in el:
                item["invert_m"] = str(el["invert_m"])
            if "invert_drawn_m" in el:
                item["invert_drawn_m"] = str(el["invert_drawn_m"])
                item["invert_spreadsheet_m"] = _dec_str(invert_sheet_basis, 2)
                item["invert_spreadsheet_by_revision"] = dict(el["invert_spreadsheet_by_revision"])
        elif el["type"] == "pipe_stretch":
            item["from_id"] = el["from_id"]
            item["to_id"] = el["to_id"]
            item["length_m"] = _dec_str(pipe_len, 2)
            item["diameter_mm"] = str(el["diameter_mm"])
        elif el["type"] == "inlet":
            item["station_m"] = str(el["station_m"])
            item["diameter_mm"] = el.get("diameter_mm")
            item["invert_m"] = el.get("invert_m")
            item["host_strip_id"] = el.get("host_strip_id")
        elements_out.append(item)

    named_totals = {
        "pavement_length_m": _dec_str(length, 2),
        "pavement_width_m": _dec_str(width, 2),
        "pavement_area_m2": _dec_str(area, 2),
        "subbase_m3": _dec_str(vol_sub, 2),
        "base_m3": _dec_str(vol_base, 2),
        "wearing_m3": _dec_str(vol_wear, 2),
        "pipe_length_m": _dec_str(pipe_len, 2),
        "pipe_diameter_mm": _dec_str(diameter, 2),
        "manhole_count": _dec_str(manhole_count, 2),
        "inlet_count": _dec_str(inlet_count, 2),
        "budget_subtotal_brl": _dec_str(subtotal, 2),
        "mh02_invert_drawn_m": _dec_str(invert_drawn, 2),
        "mh02_invert_sheet_r00_m": _dec_str(invert_sheet_r00, 2),
        "mh02_invert_sheet_r01_m": _dec_str(invert_sheet_r01, 2),
        "mh02_mismatch_r00_m": _dec_str(mismatch_r00, 2),
        "mh02_mismatch_r01_m": _dec_str(mismatch_r01, 2),
        "pipe_slope_drawn_m_per_m": _dec_str(slope_drawn, 4),
        "pipe_slope_sheet_r00_m_per_m": _dec_str(slope_sheet_r00, 4),
        "pipe_slope_sheet_r01_m_per_m": _dec_str(slope_sheet_r01, 4),
        "pavement_grade_drop_m": _dec_str(grade_drop, 2),
        "pavement_grade_end_m": _dec_str(grade_end, 2),
        "mh01_invert_m": _dec_str(invert_up, 2),
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
        "type": "infrastructure_demonstrative_excerpt",
        "purchase_question_pt_br": source["purchase_question_pt_br"],
        "cut_pt_br": source["cut_pt_br"],
        "units": dict(source["units"]),
        "information_classes": dict(source["information_classes"]),
        "absent_real_inputs": list(source["absent_real_inputs"]),
        "datums": dict(source["datums"]),
        "takeoff_criteria": dict(criteria),
        "states": copy.deepcopy(source["states"]),
        "elements": elements_out,
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
        "consumer_sections": {
            "02": ["#quantitativos", "#orcamento", "#compatibilizacao", "#revisao"],
            "05": ["#para-parceiros", "#contratar"],
            "07": ["#o-que-e", "#para-comprador"],
        },
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
                "id": "perfil-r00",
                "path": f"{PUBLIC_DIR_REL.as_posix()}/assets/perfil-drenagem-r00.svg",
                "url": f"{PUBLIC_URL}assets/perfil-drenagem-r00.svg",
                "type": "svg",
            },
            {
                "id": "perfil-r01",
                "path": f"{PUBLIC_DIR_REL.as_posix()}/assets/perfil-drenagem-r01.svg",
                "url": f"{PUBLIC_URL}assets/perfil-drenagem-r01.svg",
                "type": "svg",
            },
            {
                "id": "secao-pavimento",
                "path": f"{PUBLIC_DIR_REL.as_posix()}/assets/secao-pavimento.svg",
                "url": f"{PUBLIC_URL}assets/secao-pavimento.svg",
                "type": "svg",
            },
        ],
    }


def consumption_descriptor(extracts: dict[str, Any]) -> dict[str, Any]:
    """Stable contract for campaigns 02/03/05/07/10. Not a commercial schema."""
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
        "purchase_question_pt_br": extracts["purchase_question_pt_br"],
        "cut_pt_br": extracts["cut_pt_br"],
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
                "chain": row.get("chain"),
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
            }
            for item in extracts["review_findings"]
        ],
        "named_totals": dict(extracts["named_totals"]),
        "assets": list(extracts["assets"]),
        "consumer_sections": dict(extracts["consumer_sections"]),
        "review_check_kind": extracts["review_check_kind"],
        "consumer_rule_pt_br": (
            "Ler quantity_rows, coordination_findings, review_findings, consumer_sections e assets. "
            "Não inventar subtotais. Mudança geométrica exige regenerar os extratos. "
            "Declive, área e volume deste recorte são geométricos, não adequação de projeto."
        ),
    }


def _blob(extracts: dict[str, Any]) -> str:
    return json.dumps(extracts, ensure_ascii=False, sort_keys=True).lower()


def verify_declared_assets(root: Path, extracts: dict[str, Any]) -> list[str]:
    """Fail when a declared public resource is missing from disk."""
    problems: list[str] = []
    for asset in extracts.get("assets") or []:
        rel = asset.get("path")
        if not rel:
            problems.append(PROBLEM_OMITTED_PUBLIC_RESOURCE)
            continue
        path = root / rel
        if not path.is_file() or path.stat().st_size < 40:
            problems.append(PROBLEM_OMITTED_PUBLIC_RESOURCE)
    return sorted(set(problems))


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

    allowed_units = set((source.get("units") or {}).values()) | {"m", "m2", "m3", "un", "BRL", "mm", "m/m"}
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
        if got.get("unit") != row["unit"]:
            problems.append(PROBLEM_UNIT_INCONSISTENT)

    named = extracts.get("named_totals") or {}
    exp_named = expected["named_totals"]
    for key in ("pavement_area_m2", "subbase_m3", "base_m3", "wearing_m3", "pipe_length_m"):
        if key not in named or D(named[key]) != D(exp_named[key]):
            problems.append(PROBLEM_DIMENSION_MISMATCH)

    amounts = [money(row.get("amount") or "0") for row in extracts.get("budget_rows") or []]
    declared = money(extracts.get("budget_subtotal") or "0")
    if amounts and money(sum(amounts, Decimal("0"))) != declared:
        problems.append(PROBLEM_SUBTOTAL_ADULTERATED)
    if declared != money(expected["budget_subtotal"]):
        problems.append(PROBLEM_SUBTOTAL_ADULTERATED)

    if extracts.get("price_class") == "hypothetical" or source.get("prices", {}).get("class") == "hypothetical":
        for row in extracts.get("budget_rows") or []:
            row_blob = json.dumps(row, ensure_ascii=False).lower()
            if any(marker in row_blob for marker in _OFFICIAL_PRICE_MARKERS):
                problems.append(PROBLEM_HYPOTHETICAL_AS_OFFICIAL)
        price_source = str(extracts.get("price_source") or source.get("prices", {}).get("official_source") or "")
        if price_source.lower() in {"sinapi", "cotacao vigente", "cotação vigente"}:
            problems.append(PROBLEM_HYPOTHETICAL_AS_OFFICIAL)

    for row in extracts.get("quantity_rows") or []:
        kind = str(row.get("kind") or "")
        if kind in {"pavement_design", "hydraulic_design", "foundation_design"}:
            problems.append(PROBLEM_GEOMETRIC_AS_DESIGN)
        if kind and not kind.startswith(("geometric", "count")):
            problems.append(PROBLEM_GEOMETRIC_AS_DESIGN)

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
        finding_blob = json.dumps(finding, ensure_ascii=False).lower()
        if "nbr" in finding_blob and "não examin" not in finding_blob:
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

    pav = element_by_id(source, "PV-01")
    area_from_geom = q2((D(pav["station_end_m"]) - D(pav["station_start_m"])) * D(pav["width_m"]))
    if D(named.get("pavement_area_m2") or "0") != area_from_geom:
        problems.append(PROBLEM_DIMENSION_MISMATCH)

    mh1 = element_by_id(source, "MH-01")
    mh2 = element_by_id(source, "MH-02")
    pipe_from_geom = q2(D(mh2["station_m"]) - D(mh1["station_m"]))
    if D(named.get("pipe_length_m") or "0") != pipe_from_geom:
        problems.append(PROBLEM_DIMENSION_MISMATCH)

    return sorted(set(problems))
