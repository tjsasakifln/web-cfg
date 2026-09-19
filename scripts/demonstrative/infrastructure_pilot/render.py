"""Render HTML, CSV and SVG from derived extracts. Import html_shell only."""

from __future__ import annotations

import csv
import html
import json
from decimal import Decimal
from io import StringIO
from pathlib import Path
from typing import Any

from scripts.demonstrative.infrastructure_pilot.derive import (
    CANONICAL_URL,
    CONSUMPTION_REL,
    PUBLIC_DIR_REL,
    PUBLIC_URL,
    consumption_descriptor,
)
from scripts.pseo import html_shell

SITE = html_shell.SITE
WA_MESSAGE = (
    "Olá, vi o exemplo demonstrativo de quantitativos e revisão para "
    "infraestrutura e loteamentos e quero pedir a mesma entrega no meu recorte."
)
PAGE_H1 = "Exemplo demonstrativo de quantitativos e revisão para infraestrutura"
PAGE_TITLE = f"{PAGE_H1} | CONFENGE"
PAGE_DESCRIPTION = (
    "Exemplo demonstrativo de quantitativos e revisão para infraestrutura: "
    "faixa de acesso viário e trecho de drenagem de loteamento, com desenho, "
    "memória e planilha da mesma fonte. Dados ilustrativos, não servem para execução."
)


# Plate vocabulary (styles-tokens.css; same palette as scripts/demonstrative/plates/sheet.py).
INK = "#071a31"
MUTED = "#5d6a7a"
RULE = "#dfe4e6"
SOFT = "#f3f4f5"
WHITE = "#ffffff"
GREEN = "#2d6f2d"
LIME = "#ced62a"
GREEN_100 = "#edf5ec"
FONT = "Archivo Var, Arial, Helvetica, sans-serif"


def br_number(value: str | Decimal, places: int = 2) -> str:
    quant = Decimal("0.01") if places == 2 else Decimal("0.0001")
    number = Decimal(str(value)).quantize(quant)
    sign, digits, exp = number.as_tuple()
    if exp >= 0:
        raw = "".join(str(d) for d in digits) + ("0" * exp)
        whole, frac = raw, "0" * places
    else:
        raw = "".join(str(d) for d in digits).zfill(-exp + 1)
        whole, frac = raw[:exp], raw[exp:]
        frac = (frac + "0" * places)[:places]
        if not whole:
            whole = "0"
    parts = []
    while whole:
        parts.append(whole[-3:])
        whole = whole[:-3]
    whole_fmt = ".".join(reversed(parts))
    formatted = f"{whole_fmt},{frac}"
    return ("-" if sign else "") + formatted


def e(text: Any) -> str:
    return html.escape("" if text is None else str(text), quote=True)


def _csv_text(headers: list[str], rows: list[list[str]], revision: str) -> str:
    buf = StringIO()
    buf.write(f"# exemplo demonstrativo; revisao={revision}\n")
    writer = csv.writer(buf, delimiter=";", lineterminator="\n")
    writer.writerow(headers)
    writer.writerows(rows)
    return buf.getvalue()


def quantitativos_csv(extracts: dict[str, Any]) -> str:
    rows = []
    for row in extracts["quantity_rows"]:
        rows.append(
            [
                row["id"],
                row["description_pt_br"],
                row["unit"],
                row["quantity"],
                " ".join(row["element_ids"]),
                row["sheet_ref"],
                row["formula"],
                row["discount_rule"],
                extracts["revision"],
            ]
        )
    return _csv_text(
        ["id", "descricao", "unidade", "quantidade", "elementos", "prancha", "formula", "desconto", "revisao"],
        rows,
        extracts["revision"],
    )


def orcamento_csv(extracts: dict[str, Any]) -> str:
    rows = []
    for row in extracts["budget_rows"]:
        rows.append(
            [
                row["id"],
                row["quantity_id"],
                row["service_pt_br"],
                row["unit"],
                row["quantity"],
                row["unit_price"],
                row["amount"],
                row["price_class"],
                " ".join(row["element_ids"]),
                extracts["revision"],
            ]
        )
    rows.append(
        [
            "ORC-SUBTOTAL",
            "",
            "Subtotal do recorte",
            "BRL",
            "",
            "",
            extracts["budget_subtotal"],
            extracts["price_class"],
            "",
            extracts["revision"],
        ]
    )
    return _csv_text(
        ["id", "quantidade_id", "servico", "unidade", "quantidade", "preco_unitario", "valor", "classe_preco", "elementos", "revisao"],
        rows,
        extracts["revision"],
    )


def coordenacao_csv(extracts: dict[str, Any]) -> str:
    rows = []
    for item in extracts["coordination_findings"]:
        rows.append(
            [
                item["id"],
                item["kind"],
                item["state"],
                item["location_pt_br"],
                item["evidence_pt_br"],
                item["forwarding_pt_br"],
                " ".join(item["element_ids"]),
                "true" if item["proven_failure"] else "false",
                extracts["revision"],
            ]
        )
    return _csv_text(
        ["id", "tipo", "estado", "local", "evidencia", "encaminhamento", "elementos", "falha_comprovada", "revisao"],
        rows,
        extracts["revision"],
    )


def revisao_csv(extracts: dict[str, Any]) -> str:
    rows = []
    for item in extracts["review_findings"]:
        rows.append(
            [
                item["id"],
                item["document_ref"],
                item["finding_pt_br"],
                item["basis_pt_br"],
                item["action_pt_br"],
                item["check_kind"],
                item["related_finding_id"],
                " ".join(item["element_ids"]),
                extracts["revision"],
            ]
        )
    return _csv_text(
        ["id", "documento", "constatacao", "base", "acao", "tipo_conferencia", "achado_relacionado", "elementos", "revisao"],
        rows,
        extracts["revision"],
    )


# The figures are drawn in a compact viewBox (360 wide, the width of a phone column):
# in the ~470 px desktop column they scale up, on a 390 px phone they render at 1:1, so
# every label (font 12.5 and 13) stays legible. Labels sit outside the element they name
# whenever the element is thinner than the type (the wearing course, the DR-01 line).
FS = 12.5
FS_LABEL = 13


def _plan_svg(extracts: dict[str, Any], revision: str) -> str:
    """Plan of the 40 m access strip and the 20 m drainage stretch, metres."""
    totals = extracts["named_totals"]
    length = float(totals["pavement_length_m"])
    width = float(totals["pavement_width_m"])
    scale_x = 7
    scale_y = 18
    pad_l, pad_t, pad_r = 40, 44, 40
    svg_w = int(length * scale_x + pad_l + pad_r)
    svg_h = 252

    def X(m: float) -> float:
        return pad_l + m * scale_x

    def Y(m: float) -> float:
        return pad_t + (width - m) * scale_y

    def px(m: float, axis: str = "x") -> float:
        return m * (scale_x if axis == "x" else scale_y)

    state = extracts["states"][revision]
    title = f"Planta do acesso PV-01 · {state['label_pt_br']} · {revision}"
    if revision == "R00":
        note_1 = f"R00: cota de MH-02 desenhada {br_number(totals['mh02_invert_drawn_m'])} m;"
        note_2 = f"planilha {br_number(totals['mh02_invert_sheet_r00_m'])} m. Exemplo demonstrativo."
        mh2_fill, mh2_stroke = LIME, INK
    else:
        note_1 = f"R01: cota de MH-02 alinhada em {br_number(totals['mh02_invert_drawn_m'])} m"
        note_2 = "no desenho e na planilha. Exemplo demonstrativo."
        mh2_fill, mh2_stroke = GREEN_100, GREEN

    desc = (
        f"Faixa PV-01 de {br_number(length)} m por {br_number(width)} m. "
        f"Poço MH-01 em E0+010, boca IN-01 em E0+020, poço MH-02 em E0+030, "
        f"trecho DR-01 com {br_number(totals['pipe_length_m'])} m. {note_1} {note_2} Revisão {revision}."
    )
    # stations
    mh1_s, in_s, mh2_s = 10.0, 20.0, 30.0
    center = width / 2
    hid = f"plan-{revision}-hatch"
    y_bottom = Y(0)

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_w} {svg_h}" role="img" font-family="{FONT}" aria-labelledby="plan-{revision}-title plan-{revision}-desc">
<title id="plan-{revision}-title">{e(title)}</title>
<desc id="plan-{revision}-desc">{e(desc)}</desc>
<defs><pattern id="{hid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V6" stroke="{MUTED}" stroke-width="0.5"/></pattern></defs>
<text x="{X(0):.1f}" y="{Y(width) - 10:.1f}" font-size="{FS}" fill="{MUTED}">E0+000</text>
<text x="{X(length):.1f}" y="{Y(width) - 10:.1f}" text-anchor="end" font-size="{FS}" fill="{MUTED}">E0+040</text>
<rect x="{X(0):.1f}" y="{Y(width):.1f}" width="{px(length):.1f}" height="{px(width, 'y'):.1f}" fill="{SOFT}" stroke="{INK}" stroke-width="1.6"/>
<rect x="{X(0):.1f}" y="{Y(width):.1f}" width="{px(length):.1f}" height="{px(0.4, 'y'):.1f}" fill="url(#{hid})"/>
<rect x="{X(0):.1f}" y="{Y(0.4):.1f}" width="{px(length):.1f}" height="{px(0.4, 'y'):.1f}" fill="url(#{hid})"/>
<text x="{X((mh1_s + mh2_s) / 2):.1f}" y="{Y(center) - 12:.1f}" text-anchor="middle" font-size="{FS}" font-weight="650" fill="{GREEN}">DR-01 · {br_number(totals['pipe_length_m'])} m · diâm. {br_number(totals['pipe_diameter_mm'])} mm</text>
<line x1="{X(mh1_s):.1f}" y1="{Y(center):.1f}" x2="{X(mh2_s):.1f}" y2="{Y(center):.1f}" stroke="{GREEN}" stroke-width="2"/>
<circle cx="{X(mh1_s):.1f}" cy="{Y(center):.1f}" r="8" fill="{WHITE}" stroke="{INK}" stroke-width="1.2"/>
<text x="{X(mh1_s):.1f}" y="{Y(center) + 24:.1f}" text-anchor="middle" font-size="{FS}" fill="{INK}">MH-01 E0+010</text>
<circle cx="{X(mh2_s):.1f}" cy="{Y(center):.1f}" r="8" fill="{mh2_fill}" stroke="{mh2_stroke}" stroke-width="1.2"/>
<text x="{X(mh2_s):.1f}" y="{Y(center) + 24:.1f}" text-anchor="middle" font-size="{FS}" fill="{INK}">MH-02 E0+030</text>
<rect x="{X(in_s) - 7:.1f}" y="{Y(0.9):.1f}" width="14" height="{px(0.9, 'y'):.1f}" fill="{WHITE}" stroke="{MUTED}" stroke-width="1.2" stroke-dasharray="3 2"/>
<text x="{X(in_s) + 12:.1f}" y="{Y(0.35):.1f}" font-size="{FS}" fill="{MUTED}">IN-01 E0+020</text>
<text x="{X(0):.1f}" y="{y_bottom + 18:.1f}" font-size="{FS_LABEL}" font-weight="650" fill="{INK}">PV-01 · {br_number(length)} m × {br_number(width)} m</text>
<text x="{X(0):.1f}" y="{y_bottom + 40:.1f}" font-size="{FS}" fill="{MUTED}">{e(note_1)}</text>
<text x="{X(0):.1f}" y="{y_bottom + 57:.1f}" font-size="{FS}" fill="{MUTED}">{e(note_2)}</text>
</svg>
"""


def _profile_svg(extracts: dict[str, Any], revision: str) -> str:
    """Longitudinal invert profile of DR-01. Metres."""
    totals = extracts["named_totals"]
    x0, x1 = 10.0, 30.0
    y_up = float(totals["mh01_invert_m"])
    y_drawn = float(totals["mh02_invert_drawn_m"])
    y_sheet = float(totals["mh02_invert_sheet_r00_m"] if revision == "R00" else totals["mh02_invert_sheet_r01_m"])
    y_min, y_max = 12.20, 13.00
    scale_x = 11
    scale_y = 200
    pad_l, pad_t, pad_r = 56, 30, 84
    svg_w = int((x1 - x0) * scale_x + pad_l + pad_r)
    svg_h = 268

    def X(sta: float) -> float:
        return pad_l + (sta - x0) * scale_x

    def Y(elev: float) -> float:
        return pad_t + (y_max - elev) * scale_y

    state = extracts["states"][revision]
    title = f"Perfil de invert DR-01 · {state['label_pt_br']} · {revision}"
    clash = revision == "R00"
    if clash:
        note_1 = f"R00: desenho {br_number(y_drawn)} m versus planilha {br_number(y_sheet)} m"
        note_2 = f"em MH-02, diferença {br_number(totals['mh02_mismatch_r00_m'])} m. Exemplo demonstrativo."
    else:
        note_1 = f"R01: desenho e planilha em {br_number(y_drawn)} m"
        note_2 = "na conexão MH-02. Exemplo demonstrativo."
    desc = (
        f"Trecho DR-01 de E0+010 a E0+030. Invert de montante {br_number(y_up)} m. {note_1} {note_2} "
        "Declive geométrico, não capacidade hidráulica."
    )

    if clash:
        sheet_line = (
            f'<path d="M{X(x0):.1f} {Y(y_up):.1f}L{X(x1):.1f} {Y(y_sheet):.1f}V{Y(y_drawn):.1f}Z" fill="{LIME}" fill-opacity="0.35"/>'
            f'<line x1="{X(x0):.1f}" y1="{Y(y_up):.1f}" x2="{X(x1):.1f}" y2="{Y(y_sheet):.1f}" '
            f'stroke="{MUTED}" stroke-width="1.2" stroke-dasharray="6 4"/>'
            f'<circle cx="{X(x1):.1f}" cy="{Y(y_sheet):.1f}" r="5" fill="{WHITE}" stroke="{MUTED}" stroke-width="1.2"/>'
            f'<text x="{X(x1) + 9:.1f}" y="{Y(y_sheet) - 4:.1f}" font-size="{FS}" fill="{MUTED}">planilha</text>'
            f'<text x="{X(x1) + 9:.1f}" y="{Y(y_sheet) + 11:.1f}" font-size="{FS}" fill="{MUTED}">{br_number(y_sheet)} m</text>'
            f'<text x="{X(x1) + 9:.1f}" y="{Y(y_drawn) + 12:.1f}" font-size="{FS}" fill="{GREEN}">desenho</text>'
            f'<text x="{X(x1) + 9:.1f}" y="{Y(y_drawn) + 27:.1f}" font-size="{FS}" fill="{GREEN}">{br_number(y_drawn)} m</text>'
        )
    else:
        sheet_line = (
            f'<text x="{X(x1) + 9:.1f}" y="{Y(y_drawn) - 4:.1f}" font-size="{FS}" fill="{GREEN}">desenho e</text>'
            f'<text x="{X(x1) + 9:.1f}" y="{Y(y_drawn) + 11:.1f}" font-size="{FS}" fill="{GREEN}">planilha</text>'
            f'<text x="{X(x1) + 9:.1f}" y="{Y(y_drawn) + 26:.1f}" font-size="{FS}" fill="{GREEN}">{br_number(y_drawn)} m</text>'
        )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_w} {svg_h}" role="img" font-family="{FONT}" aria-labelledby="prf-{revision}-title prf-{revision}-desc">
<title id="prf-{revision}-title">{e(title)}</title>
<desc id="prf-{revision}-desc">{e(desc)}</desc>
<line x1="{X(x0):.1f}" y1="{Y(y_min):.1f}" x2="{X(x1):.1f}" y2="{Y(y_min):.1f}" stroke="{RULE}" stroke-width="1"/>
<line x1="{X(x0):.1f}" y1="{Y(y_max):.1f}" x2="{X(x0):.1f}" y2="{Y(y_min):.1f}" stroke="{RULE}" stroke-width="1"/>
{sheet_line}
<line x1="{X(x0):.1f}" y1="{Y(y_up):.1f}" x2="{X(x1):.1f}" y2="{Y(y_drawn):.1f}" stroke="{INK}" stroke-width="2.4"/>
<circle cx="{X(x0):.1f}" cy="{Y(y_up):.1f}" r="6" fill="{WHITE}" stroke="{INK}" stroke-width="1.4"/>
<circle cx="{X(x1):.1f}" cy="{Y(y_drawn):.1f}" r="6" fill="{GREEN_100}" stroke="{GREEN}" stroke-width="1.4"/>
<text x="{X(x0) - 8:.1f}" y="{Y(y_up) + 4:.1f}" text-anchor="end" font-size="{FS}" fill="{INK}">{br_number(y_up)}</text>
<text x="{X((x0 + x1) / 2):.1f}" y="{Y(y_up) - 18:.1f}" text-anchor="middle" font-size="{FS_LABEL}" font-weight="650" fill="{INK}">DR-01 · invert de montante a jusante</text>
<text x="{X(x0):.1f}" y="{Y(y_min) + 18:.1f}" font-size="{FS}" fill="{INK}">E0+010 MH-01</text>
<text x="{X(x1):.1f}" y="{Y(y_min) + 18:.1f}" text-anchor="end" font-size="{FS}" fill="{INK}">E0+030 MH-02</text>
<text x="{X(x0) - 8:.1f}" y="{Y(y_min) + 40:.1f}" font-size="{FS}" fill="{MUTED}">{e(note_1)}</text>
<text x="{X(x0) - 8:.1f}" y="{Y(y_min) + 57:.1f}" font-size="{FS}" fill="{MUTED}">{e(note_2)}</text>
</svg>
"""


def _section_svg(extracts: dict[str, Any]) -> str:
    """Pavement strip cross-section with declared layer thicknesses."""
    totals = extracts["named_totals"]
    width = float(totals["pavement_width_m"])
    t_sub = 0.15
    t_base = 0.12
    t_wear = 0.04
    total_t = t_sub + t_base + t_wear
    scale_x = 30
    scale_y = 560
    pad_l, pad_t = 24, 40
    svg_w = 360
    svg_h = int(total_t * scale_y + pad_t + 83)  # three note lines below the strip

    def X(m: float) -> float:
        return pad_l + m * scale_x

    def Y(from_top: float) -> float:
        return pad_t + from_top * scale_y

    def px(m: float, axis: str = "x") -> float:
        return m * (scale_x if axis == "x" else scale_y)

    rev = extracts["revision"]
    title = f"Seção da faixa PV-01 · revisão {rev}"
    desc = (
        f"Largura {br_number(width)} m. Capa {br_number(t_wear)} m, base {br_number(t_base)} m, "
        f"sub-base {br_number(t_sub)} m. Volumes geométricos, não dimensionamento de pavimento. "
        f"Exemplo demonstrativo, revisão {rev}."
    )
    lx = X(width) + 12  # labels to the right of the layers, with a short leader each
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_w} {svg_h}" role="img" font-family="{FONT}" aria-labelledby="sec-title sec-desc">
<title id="sec-title">{e(title)}</title>
<desc id="sec-desc">{e(desc)}</desc>
<defs><pattern id="sec-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V6" stroke="{MUTED}" stroke-width="0.5"/></pattern></defs>
<text x="{X(width / 2):.1f}" y="{Y(0) - 12:.1f}" text-anchor="middle" font-size="{FS_LABEL}" font-weight="650" fill="{INK}">PV-01 · {br_number(width)} m</text>
<rect x="{X(0):.1f}" y="{Y(0):.1f}" width="{px(width):.1f}" height="{px(t_wear, 'y'):.1f}" fill="{MUTED}" stroke="{INK}" stroke-width="1.2"/>
<line x1="{X(width):.1f}" y1="{Y(t_wear / 2):.1f}" x2="{lx - 3:.1f}" y2="{Y(t_wear / 2):.1f}" stroke="{MUTED}" stroke-width="0.6"/>
<text x="{lx:.1f}" y="{Y(t_wear / 2) + 4:.1f}" font-size="{FS}" fill="{INK}">capa {br_number(t_wear)} m</text>
<text x="{lx:.1f}" y="{Y(t_wear / 2) + 20:.1f}" font-size="{FS}" fill="{MUTED}">Q-CAP-01</text>
<rect x="{X(0):.1f}" y="{Y(t_wear):.1f}" width="{px(width):.1f}" height="{px(t_base, 'y'):.1f}" fill="{SOFT}" stroke="{INK}" stroke-width="1.2"/>
<line x1="{X(width):.1f}" y1="{Y(t_wear + t_base / 2):.1f}" x2="{lx - 3:.1f}" y2="{Y(t_wear + t_base / 2):.1f}" stroke="{MUTED}" stroke-width="0.6"/>
<text x="{lx:.1f}" y="{Y(t_wear + t_base / 2) + 4:.1f}" font-size="{FS}" fill="{INK}">base {br_number(t_base)} m</text>
<text x="{lx:.1f}" y="{Y(t_wear + t_base / 2) + 20:.1f}" font-size="{FS}" fill="{MUTED}">Q-BASE-01</text>
<rect x="{X(0):.1f}" y="{Y(t_wear + t_base):.1f}" width="{px(width):.1f}" height="{px(t_sub, 'y'):.1f}" fill="url(#sec-hatch)" stroke="{INK}" stroke-width="1.2"/>
<line x1="{X(width):.1f}" y1="{Y(t_wear + t_base + t_sub / 2):.1f}" x2="{lx - 3:.1f}" y2="{Y(t_wear + t_base + t_sub / 2):.1f}" stroke="{MUTED}" stroke-width="0.6"/>
<text x="{lx:.1f}" y="{Y(t_wear + t_base + t_sub / 2) + 4:.1f}" font-size="{FS}" fill="{INK}">sub-base {br_number(t_sub)} m</text>
<text x="{lx:.1f}" y="{Y(t_wear + t_base + t_sub / 2) + 20:.1f}" font-size="{FS}" fill="{MUTED}">Q-SUB-01</text>
<text x="{X(0):.1f}" y="{svg_h - 47:.1f}" font-size="{FS}" fill="{MUTED}">Espessuras declaradas; volume geométrico,</text>
<text x="{X(0):.1f}" y="{svg_h - 30:.1f}" font-size="{FS}" fill="{MUTED}">não dimensionamento.</text>
<text x="{X(0):.1f}" y="{svg_h - 13:.1f}" font-size="{FS}" fill="{MUTED}">Exemplo demonstrativo · revisão {e(rev)}</text>
</svg>
"""


def _table(headers: list[str], rows: list[list[Any]], caption: str) -> str:
    return html_shell.table_html(headers, rows, caption=caption)


def render_html(extracts: dict[str, Any]) -> str:
    totals = extracts["named_totals"]
    rev = extracts["revision"]
    wa = html_shell.wa_link(WA_MESSAGE)
    criteria = extracts["takeoff_criteria"]

    qty_rows = [
        [
            row["id"],
            row["description_pt_br"],
            row["unit"],
            br_number(row["quantity"], 4 if row["unit"] == "m/m" else 2),
            row["formula"].replace(".", ","),
            " ".join(row["element_ids"]),
            row["sheet_ref"],
        ]
        for row in extracts["quantity_rows"]
    ]
    budget_rows = [
        [
            row["id"],
            row["service_pt_br"],
            row["unit"],
            br_number(row["quantity"]),
            "R$ " + br_number(row["unit_price"]),
            "R$ " + br_number(row["amount"]),
            "hipotético",
            row["quantity_id"],
        ]
        for row in extracts["budget_rows"]
    ]
    budget_rows.append(
        ["", "Subtotal do recorte", "BRL", "", "", "R$ " + br_number(extracts["budget_subtotal"]), "hipotético", ""]
    )

    state_pt = {
        "resolved_in_R01": "resolvido em R01",
        "information_requested": "informação pedida",
    }
    check_pt = {
        "arithmetic_documental_coherence": "conferência aritmética, documental e de coerência",
        "documental_coherence": "conferência documental",
    }
    coord_rows = [
        [
            item["id"],
            "geométrica" if item["kind"] == "geometric" else "informação faltante",
            state_pt.get(item["state"], item["state"]),
            item["location_pt_br"],
            item["evidence_pt_br"],
            item["forwarding_pt_br"],
            " ".join(item["element_ids"]),
        ]
        for item in extracts["coordination_findings"]
    ]
    review_rows = [
        [
            item["id"],
            item["document_ref"],
            item["finding_pt_br"],
            item["basis_pt_br"],
            item["action_pt_br"],
            check_pt.get(item["check_kind"], item["check_kind"]),
        ]
        for item in extracts["review_findings"]
    ]

    coord_html = "".join(
        f"""<article class="coord-finding" id="{e(item['id'])}">
<p class="coord-finding-kicker">{e(item['id'])} · {"Interface geométrica" if item["kind"] == "geometric" else "Informação faltante"}</p>
<h3>{e(item["location_pt_br"])}</h3>
<dl class="coord-finding-dl">
<dt>Evidência</dt><dd>{e(item["evidence_pt_br"])}</dd>
<dt>Encaminhamento</dt><dd>{e(item["forwarding_pt_br"])}</dd>
<dt>Estado</dt><dd>{e(state_pt.get(item["state"], item["state"]))} · elementos {e(" ".join(item["element_ids"]))}</dd>
</dl>
</article>"""
        for item in extracts["coordination_findings"]
    )
    review_html = "".join(
        f"""<article class="rv-extract-item" id="{e(item['id'])}">
<span class="rv-class">{e(item['id'])} · {e(item["document_ref"])}</span>
<h3>{e(item["finding_pt_br"])}</h3>
<dl>
<dt>Base</dt><dd>{e(item["basis_pt_br"])}</dd>
<dt>Ação</dt><dd>{e(item["action_pt_br"])}</dd>
</dl>
</article>"""
        for item in extracts["review_findings"]
    )

    # Composition comes from assets/editorial.css and css/components.css (plate,
    # page index, ruled findings, table-scroll); no inline stylesheet.
    extra_head = '<link href="/assets/editorial.css" rel="stylesheet"/>'

    body = f"""
{html_shell.breadcrumbs_html([("Início", "/"), ("Casos", "/casos/"), ("Infraestrutura e loteamentos", None)])}
<section class="svc-open" aria-labelledby="case-title">
<div class="container">
<div class="svc-open__grid">
<div class="svc-open__copy">
<p class="case-badge t-kicker" data-permission-class="demonstrativo">Acesso viário e drenagem · revisão {e(rev)}</p>
<h1 class="t-service" id="case-title">{PAGE_H1}</h1>
<p class="authority-byline">Responsável técnico pelo conteúdo: <a href="/especialista/tiago-jun-sasaki/">Engº Tiago Sasaki</a> · Atualizado em <time datetime="{e(extracts["date_modified"])}">11 de setembro de 2026</time> · <a href="/casos/">Outros exemplos demonstrativos</a> · <a href="/triagem-tecnica/#corrigir-o-site">Como corrigir</a></p>
<p class="content-lead">Este recorte ilustrativo de acesso viário e drenagem de loteamento mostra a mesma cadeia de rastreabilidade usada em edificação: desenho, dimensão, fórmula, quantidade e item de planilha, com IDs e revisão únicos. Sem terreno, sondagem, chuva de projeto nem topografia, os dados e as soluções são ilustrativos e não servem para execução.</p>
<dl class="svc-chain">
<div><dt>Necessidade</dt><dd>Orçar ou conferir pavimento, drenagem e obras lineares antes de contratar, com base própria.</dd></div>
<div><dt>Trabalho</dt><dd>Levantar, orçar, compatibilizar e revisar o mesmo recorte, com memória aberta e revisão única.</dd></div>
<div><dt>Documento</dt><dd><b>Planilha com memória, extrato de orçamento, registro de interferências e extrato de revisão</b>, na mesma revisão {e(rev)}.</dd></div>
</dl>
</div>
<figure class="plate plate--side" aria-labelledby="case-plate-cap">
<div class="plate__sheet">
{_profile_svg(extracts, "R00")}
</div>
<figcaption class="plate__caption" id="case-plate-cap">Perfil R00: o invert desenhado de MH-02 em {br_number(totals["mh02_invert_drawn_m"])} m e a planilha em {br_number(totals["mh02_invert_sheet_r00_m"])} m, diferença de {br_number(totals["mh02_mismatch_r00_m"])} m. É a interferência CF-GEO-01, resolvida em R01.</figcaption>
</figure>
</div>
<nav class="page-index" aria-label="Nesta página">
<span class="page-index__label">Nesta página</span>
<ol>
<li><a href="#o-que-e"><span>01</span>O recorte</a></li>
<li><a href="#desenhos"><span>02</span>Desenhos</a></li>
<li><a href="#quantitativos"><span>03</span>Quantitativos</a></li>
<li><a href="#orcamento"><span>04</span>Orçamento</a></li>
<li><a href="#compatibilizacao"><span>05</span>Compatibilização</a></li>
<li><a href="#revisao"><span>06</span>Revisão</a></li>
<li><a href="#contratar"><span>07</span>Levar para o seu recorte</a></li>
</ol>
</nav>
</div>
</section>

<section class="sec sec--tight" aria-labelledby="o-que-e">
<div class="container">
<span class="t-kicker">Objeto</span>
<h2 class="t-editorial" id="o-que-e">O recorte</h2>
<div class="grid-2">
<div>
<p>{e(extracts["cut_pt_br"])} Pergunta de compra atendida: {e(extracts["purchase_question_pt_br"])}</p>
<p>Identificadores: faixa PV-01 (E0+000 a E0+040), poços MH-01 (E0+010) e MH-02 (E0+030), trecho DR-01 e boca de lobo IN-01 (E0+020). {e(extracts["datums"]["pavement_grade_pt_br"])} {e(extracts["datums"]["pipe_invert_pt_br"])}</p>
<p><strong>Estado original (R00):</strong> {e(extracts["states"]["R00"]["note_pt_br"])}</p>
<p><strong>Versão demonstrativa corrigida (R01):</strong> {e(extracts["states"]["R01"]["note_pt_br"])} A revisão publicada desta página é {e(rev)}.</p>
</div>
<dl class="svc-chain svc-chain--uses">
<div><dt>Entrada escolhida</dt><dd>{e(extracts["information_classes"]["chosen_input"])} Comprimentos de estaqueamento, largura, espessuras de camada, diâmetro de DR-01 e cotas declaradas.</dd></div>
<div><dt>Cálculo derivado</dt><dd>{e(extracts["information_classes"]["derived"])} Área, volumes de camada, comprimento do trecho, declive geométrico e subtotal aritmético.</dd></div>
<div><dt>Informação ausente</dt><dd>{e(extracts["information_classes"]["absent"])} Diâmetro e cota de IN-01; cliente, terreno, sondagem, chuva de projeto, topografia e autorização técnica.</dd></div>
</dl>
</div>
<div class="grid-2" id="para-comprador">
<div>
<h3>O que o comprador confere aqui</h3>
<p>Problema: a construtora, o loteador ou a equipe de infraestrutura precisa ver, antes de contratar, se quantitativos, orçamento, revisão e compatibilização de um acesso e de uma rede saem da mesma fonte e podem ser refeitos. Entrega deste exemplo: uma faixa PV-01 de {br_number(totals["pavement_length_m"])} m por {br_number(totals["pavement_width_m"])} m e um trecho DR-01 de {br_number(totals["pipe_length_m"])} m, com estaqueamento, camadas, cotas e unidades declarados. O mesmo método de rastreabilidade fica visível numa natureza de obra diferente de uma pequena edificação, para você julgar a entrega antes de pedir proposta. Traga o que você já tem, mesmo incompleto: a proposta recorta o serviço real depois da conferência de escopo e de responsabilidade técnica.</p>
</div>
<div id="para-parceiros">
<h3>O que o parceiro confere aqui</h3>
<p>O exemplo ajuda a avaliar a entrega porque cada ID do desenho reaparece na memória, na planilha e no apontamento. A revisão {e(rev)} está escrita em todos os extratos públicos. Um parceiro pode reabrir o CSV e o SVG sem pedir uma planilha paralela e sem tratar este recorte como obra de cliente.</p>
</div>
</div>
</div>
</section>

<section class="sec sec--tight sec--soft" aria-labelledby="desenhos">
<div class="container">
<span class="t-kicker">Desenhos</span>
<h2 class="t-editorial" id="desenhos">Planta, perfil e seção</h2>
<div class="grid-2">
<figure class="plate">
<div class="plate__sheet">{_plan_svg(extracts, "R00")}</div>
<figcaption class="plate__caption">Planta R00. Faixa PV-01, trecho DR-01, poços MH-01 e MH-02, boca IN-01. A cota de MH-02 ainda diverge da planilha.</figcaption>
</figure>
<figure class="plate">
<div class="plate__sheet">{_plan_svg(extracts, "R01")}</div>
<figcaption class="plate__caption">Planta R01. A geometria em planta é a mesma; o alinhamento de cota aparece no perfil e na planilha.</figcaption>
</figure>
<figure class="plate">
<div class="plate__sheet">{_profile_svg(extracts, "R00")}</div>
<figcaption class="plate__caption">Perfil R00: invert desenhada de MH-02 em {br_number(totals["mh02_invert_drawn_m"])} m e planilha em {br_number(totals["mh02_invert_sheet_r00_m"])} m. Diferença {br_number(totals["mh02_mismatch_r00_m"])} m (CF-GEO-01).</figcaption>
</figure>
<figure class="plate">
<div class="plate__sheet">{_profile_svg(extracts, "R01")}</div>
<figcaption class="plate__caption">Perfil R01: desenho e planilha na mesma cota {br_number(totals["mh02_invert_drawn_m"])} m.</figcaption>
</figure>
<figure class="plate">
<div class="plate__sheet">{_section_svg(extracts)}</div>
<figcaption class="plate__caption">Seção da faixa PV-01: capa, base e sub-base com espessuras declaradas. Volume = área × espessura, sem dimensionar pavimento.</figcaption>
</figure>
<p>Arquivos da mesma revisão {e(rev)}: <a href="assets/planta-r00.svg">planta R00</a>, <a href="assets/planta-r01.svg">planta R01</a>, <a href="assets/perfil-drenagem-r00.svg">perfil R00</a>, <a href="assets/perfil-drenagem-r01.svg">perfil R01</a>, <a href="assets/secao-pavimento.svg">seção da faixa</a>.</p>
</div>
</div>
</section>

<section class="sec sec--tight" aria-labelledby="quantitativos">
<div class="container">
<span class="t-kicker">Memória</span>
<h2 class="t-editorial" id="quantitativos">Quantitativos</h2>
<p>Base: revisão {e(criteria["quantity_basis_revision"])}. Faixa PV-01: {br_number(totals["pavement_length_m"])} × {br_number(totals["pavement_width_m"])} = {br_number(totals["pavement_area_m2"])} m² (Q-PAV-01). Sub-base = {br_number(totals["pavement_area_m2"])} × 0,15 = {br_number(totals["subbase_m3"])} m³. Base = {br_number(totals["pavement_area_m2"])} × 0,12 = {br_number(totals["base_m3"])} m³. Capa = {br_number(totals["pavement_area_m2"])} × 0,04 = {br_number(totals["wearing_m3"])} m³. Trecho DR-01: 30,00 − 10,00 = {br_number(totals["pipe_length_m"])} m (Q-TUB-01). {e(criteria["pavement_area_rule_pt_br"])} {e(criteria["layer_volume_rule_pt_br"])} {e(criteria["pipe_length_rule_pt_br"])} {e(criteria["geometric_slope_rule_pt_br"])}</p>
{_table(["ID", "Serviço", "Un.", "Qtd.", "Fórmula", "Elementos", "Prancha"], qty_rows, "Memória de quantitativos, revisão " + rev)}
<p><a href="data/quantitativos.csv">Baixar quantitativos.csv</a>, mesma revisão {e(rev)}.</p>
</div>
</section>

<section class="sec sec--tight sec--rule-top" aria-labelledby="orcamento">
<div class="container">
<span class="t-kicker">Extrato</span>
<h2 class="t-editorial" id="orcamento">Orçamento</h2>
<p>{e(extracts["price_disclaimer_pt_br"])} Subtotal aritmético: R$ {br_number(extracts["budget_subtotal"])}.</p>
{_table(["ID", "Serviço", "Un.", "Qtd.", "Preço un.", "Valor", "Classe", "Qtd. ID"], budget_rows, "Extrato de orçamento hipotético, revisão " + rev)}
<p><a href="data/orcamento.csv">Baixar orcamento.csv</a>, mesma revisão {e(rev)}.</p>
</div>
</section>

<section class="sec sec--tight sec--soft" aria-labelledby="compatibilizacao">
<div class="container">
<span class="t-kicker">Interferências</span>
<h2 class="t-editorial" id="compatibilizacao">Compatibilização</h2>
<p>Dois achados didáticos no mesmo recorte: uma incompatibilidade conferível entre cota desenhada e planilha, e uma informação que simplesmente não foi declarada. Falta de cota ou diâmetro não vira falha comprovada nem risco comprovado.</p>
<div class="rv-extract">{coord_html}</div>
{_table(["ID", "Tipo", "Estado", "Local", "Evidência", "Encaminhamento", "Elementos"], coord_rows, "Registro de compatibilização, revisão " + rev)}
<p><a href="data/coordenacao.csv">Baixar coordenacao.csv</a>, mesma revisão {e(rev)}.</p>
</div>
</section>

<section class="sec sec--tight" aria-labelledby="revisao">
<div class="container">
<span class="t-kicker">Conferência</span>
<h2 class="t-editorial" id="revisao">Revisão</h2>
<p>{e(extracts["review_attribution_pt_br"])}</p>
<div class="rv-extract">{review_html}</div>
{_table(["ID", "Documento", "Constatação", "Base", "Ação", "Tipo"], review_rows, "Extrato de revisão, revisão " + rev)}
<p><a href="data/revisao.csv">Baixar revisao.csv</a>, mesma revisão {e(rev)}.</p>
</div>
</section>

<section class="sec sec--dark" aria-labelledby="contratar">
<div class="container">
<span class="t-kicker">Próximo passo</span>
<h2 class="t-editorial" id="contratar">Pedir o mesmo tipo de entrega no seu recorte</h2>
<p>O recorte cabe em qualquer porte e aceita contexto inicial incompleto. Elaboração, revisão, compatibilização, quantitativos e orçamento são trabalhos com nome próprio que a proposta combina conforme a necessidade: o pedido descreve o problema, a proposta organiza as etapas. Autoria, atribuição, visita, logística e ART, quando couberem, são confirmadas antes do aceite técnico.</p>
<p>Veja o escopo em <a href="/quantitativos-orcamento-obras/">quantitativos e orçamento</a>, em <a href="/revisao-tecnica-projetos-engenharia/">revisão técnica de projetos</a> e em <a href="/projetos-complementares-engenharia/">projetos complementares</a>. Traga o que você já tem; o que for sensível segue depois, por canal seguro.</p>
<div class="contact-primary">
<a class="button button-primary" data-journey="contrato" data-cta-position="inline_cta" href="{e(wa)}" rel="noopener" target="_blank">Pedir proposta pelo WhatsApp</a>
<ul class="contact-alt">
<li><a data-journey="contrato" href="/triagem-tecnica/#projetos">Pedir pela triagem técnica</a></li>
<li><a href="/casos/">Ver outros exemplos demonstrativos</a></li>
</ul>
</div>
</div>
</section>
"""

    jsonld = [
        html_shell.ORG_JSONLD,
        html_shell.PERSON_JSONLD,
        html_shell.breadcrumb_jsonld([("Início", "/"), ("Casos", "/casos/"), ("Infraestrutura e loteamentos", None)]),
        {
            "@type": "TechArticle",
            "@id": f"{CANONICAL_URL}#article",
            "headline": PAGE_H1,
            "description": PAGE_DESCRIPTION,
            "disambiguatingDescription": (
                "Página de exemplo demonstrativo: recorte didático de infraestrutura e loteamento "
                "com números conferíveis; preços unitários são hipotéticos e não servem para execução."
            ),
            "inLanguage": "pt-BR",
            "url": CANONICAL_URL,
            "mainEntityOfPage": CANONICAL_URL,
            "dateModified": extracts["date_modified"],
            "isAccessibleForFree": True,
            "author": {"@id": f"{SITE}/#tiago"},
            "publisher": {"@id": f"{SITE}/#organization"},
        },
    ]

    return html_shell.page_shell(
        title=PAGE_TITLE,
        description=PAGE_DESCRIPTION,
        canonical_path=PUBLIC_URL,
        robots="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
        jsonld_graph=jsonld,
        body_main=body,
        wa_message=WA_MESSAGE,
        extra_head=extra_head,
        data_attrs={
            "route-family": "casos",
            "source": "CONFENGE_WEB",
            "asset-id": extracts["proof_id"],
        },
    )


def write_outputs(root: Path, extracts: dict[str, Any]) -> dict[str, Path]:
    public = root / PUBLIC_DIR_REL
    (public / "data").mkdir(parents=True, exist_ok=True)
    (public / "assets").mkdir(parents=True, exist_ok=True)
    written: dict[str, Path] = {}

    html_path = public / "index.html"
    html_path.write_text(render_html(extracts), encoding="utf-8")
    written["html"] = html_path

    mapping = {
        "quantitativos-csv": (public / "data" / "quantitativos.csv", quantitativos_csv(extracts)),
        "orcamento-csv": (public / "data" / "orcamento.csv", orcamento_csv(extracts)),
        "coordenacao-csv": (public / "data" / "coordenacao.csv", coordenacao_csv(extracts)),
        "revisao-csv": (public / "data" / "revisao.csv", revisao_csv(extracts)),
        "planta-r00": (public / "assets" / "planta-r00.svg", _plan_svg(extracts, "R00")),
        "planta-r01": (public / "assets" / "planta-r01.svg", _plan_svg(extracts, "R01")),
        "perfil-r00": (public / "assets" / "perfil-drenagem-r00.svg", _profile_svg(extracts, "R00")),
        "perfil-r01": (public / "assets" / "perfil-drenagem-r01.svg", _profile_svg(extracts, "R01")),
        "secao-pavimento": (public / "assets" / "secao-pavimento.svg", _section_svg(extracts)),
    }
    for key, (path, text) in mapping.items():
        path.write_text(text, encoding="utf-8")
        written[key] = path

    cons_path = root / CONSUMPTION_REL
    cons_path.parent.mkdir(parents=True, exist_ok=True)
    cons_path.write_text(
        json.dumps(consumption_descriptor(extracts), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    written["consumption"] = cons_path
    return written
