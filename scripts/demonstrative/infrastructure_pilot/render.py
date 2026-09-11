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


def _plan_svg(extracts: dict[str, Any], revision: str) -> str:
    """Plan of the 40 m access strip and the 20 m drainage stretch, metres."""
    totals = extracts["named_totals"]
    length = float(totals["pavement_length_m"])
    width = float(totals["pavement_width_m"])
    scale_x = 14
    scale_y = 28
    pad_l, pad_t, pad_r, pad_b = 64, 48, 48, 56
    svg_w = int(length * scale_x + pad_l + pad_r)
    svg_h = int(width * scale_y + pad_t + pad_b + 24)

    def X(m: float) -> float:
        return pad_l + m * scale_x

    def Y(m: float) -> float:
        return pad_t + (width - m) * scale_y

    def px(m: float, axis: str = "x") -> float:
        return m * (scale_x if axis == "x" else scale_y)

    state = extracts["states"][revision]
    title = f"Planta do acesso PV-01 · {state['label_pt_br']} · {revision}"
    if revision == "R00":
        note = (
            f"R00: cota desenhada de MH-02 {br_number(totals['mh02_invert_drawn_m'])} m; "
            f"planilha {br_number(totals['mh02_invert_sheet_r00_m'])} m."
        )
        mh2_fill = "#fecaca"
    else:
        note = (
            f"R01: cota de MH-02 alinhada em {br_number(totals['mh02_invert_drawn_m'])} m "
            "no desenho e na planilha."
        )
        mh2_fill = "#bbf7d0"

    desc = (
        f"Faixa PV-01 de {br_number(length)} m por {br_number(width)} m. "
        f"Poço MH-01 em E0+010, boca IN-01 em E0+020, poço MH-02 em E0+030, "
        f"trecho DR-01 com {br_number(totals['pipe_length_m'])} m. {note} "
        f"Exemplo demonstrativo, revisão {revision}."
    )
    # stations
    mh1_s, in_s, mh2_s = 10.0, 20.0, 30.0
    center = width / 2

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_w} {svg_h}" role="img" aria-labelledby="plan-{revision}-title plan-{revision}-desc">
<title id="plan-{revision}-title">{e(title)}</title>
<desc id="plan-{revision}-desc">{e(desc)}</desc>
<rect x="{X(0):.1f}" y="{Y(width):.1f}" width="{px(length):.1f}" height="{px(width, 'y'):.1f}" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/>
<rect x="{X(0):.1f}" y="{Y(width - 0.4):.1f}" width="{px(length):.1f}" height="{px(0.4, 'y'):.1f}" fill="#94a3b8"/>
<rect x="{X(0):.1f}" y="{Y(0.4):.1f}" width="{px(length):.1f}" height="{px(0.4, 'y'):.1f}" fill="#94a3b8"/>
<text x="{X(length / 2):.1f}" y="{Y(center) + 4:.1f}" text-anchor="middle" font-size="13" fill="#0f172a">PV-01 · {br_number(length)} m × {br_number(width)} m</text>
<line x1="{X(mh1_s):.1f}" y1="{Y(center):.1f}" x2="{X(mh2_s):.1f}" y2="{Y(center):.1f}" stroke="#0369a1" stroke-width="4"/>
<text x="{X((mh1_s + mh2_s) / 2):.1f}" y="{Y(center) - 14:.1f}" text-anchor="middle" font-size="11" fill="#0c4a6e">DR-01 · {br_number(totals['pipe_length_m'])} m · Ø {br_number(totals['pipe_diameter_mm'])} mm</text>
<circle cx="{X(mh1_s):.1f}" cy="{Y(center):.1f}" r="10" fill="#bae6fd" stroke="#0c4a6e"/>
<text x="{X(mh1_s):.1f}" y="{Y(center) + 32:.1f}" text-anchor="middle" font-size="11" fill="#0c4a6e">MH-01 E0+010</text>
<rect x="{X(in_s) - 8:.1f}" y="{Y(0.9):.1f}" width="16" height="{px(0.9, 'y'):.1f}" fill="#fde68a" stroke="#92400e"/>
<text x="{X(in_s):.1f}" y="{Y(-0.15) + 4:.1f}" text-anchor="middle" font-size="11" fill="#78350f">IN-01 E0+020</text>
<circle cx="{X(mh2_s):.1f}" cy="{Y(center):.1f}" r="10" fill="{mh2_fill}" stroke="#0c4a6e"/>
<text x="{X(mh2_s):.1f}" y="{Y(center) + 32:.1f}" text-anchor="middle" font-size="11" fill="#0c4a6e">MH-02 E0+030</text>
<text x="{X(0):.1f}" y="{Y(width) - 10:.1f}" font-size="11" fill="#0f172a">E0+000</text>
<text x="{X(length):.1f}" y="{Y(width) - 10:.1f}" text-anchor="end" font-size="11" fill="#0f172a">E0+040</text>
<text x="{X(length / 2):.1f}" y="{svg_h - 16}" text-anchor="middle" font-size="11" fill="#334155">{e(note)} Exemplo demonstrativo.</text>
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
    scale_x = 18
    scale_y = 220
    pad_l, pad_t, pad_r, pad_b = 72, 36, 36, 52
    svg_w = int((x1 - x0) * scale_x + pad_l + pad_r)
    svg_h = int((y_max - y_min) * scale_y + pad_t + pad_b)

    def X(sta: float) -> float:
        return pad_l + (sta - x0) * scale_x

    def Y(elev: float) -> float:
        return pad_t + (y_max - elev) * scale_y

    state = extracts["states"][revision]
    title = f"Perfil de invert DR-01 · {state['label_pt_br']} · {revision}"
    clash = revision == "R00"
    if clash:
        note = (
            f"R00: desenho {br_number(y_drawn)} m versus planilha {br_number(y_sheet)} m "
            f"em MH-02, diferença {br_number(totals['mh02_mismatch_r00_m'])} m."
        )
        sheet_stroke = "#b91c1c"
    else:
        note = (
            f"R01: desenho e planilha em {br_number(y_drawn)} m na conexão MH-02."
        )
        sheet_stroke = "#15803d"
    desc = (
        f"Trecho DR-01 de E0+010 a E0+030. Invert de montante {br_number(y_up)} m. {note} "
        "Declive geométrico, não capacidade hidráulica. Exemplo demonstrativo."
    )

    sheet_line = ""
    if clash:
        sheet_line = (
            f'<line x1="{X(x0):.1f}" y1="{Y(y_up):.1f}" x2="{X(x1):.1f}" y2="{Y(y_sheet):.1f}" '
            f'stroke="{sheet_stroke}" stroke-width="2" stroke-dasharray="6 4"/>'
            f'<circle cx="{X(x1):.1f}" cy="{Y(y_sheet):.1f}" r="5" fill="#fecaca" stroke="{sheet_stroke}"/>'
            f'<text x="{X(x1) + 8:.1f}" y="{Y(y_sheet) + 4:.1f}" font-size="11" fill="{sheet_stroke}">planilha {br_number(y_sheet)} m</text>'
        )
    else:
        sheet_line = (
            f'<text x="{X(x1) + 8:.1f}" y="{Y(y_drawn) - 10:.1f}" font-size="11" fill="{sheet_stroke}">desenho e planilha {br_number(y_drawn)} m</text>'
        )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_w} {svg_h}" role="img" aria-labelledby="prf-{revision}-title prf-{revision}-desc">
<title id="prf-{revision}-title">{e(title)}</title>
<desc id="prf-{revision}-desc">{e(desc)}</desc>
<line x1="{X(x0):.1f}" y1="{Y(y_min):.1f}" x2="{X(x1):.1f}" y2="{Y(y_min):.1f}" stroke="#0f172a" stroke-width="1"/>
<line x1="{X(x0):.1f}" y1="{Y(y_max):.1f}" x2="{X(x0):.1f}" y2="{Y(y_min):.1f}" stroke="#0f172a" stroke-width="1"/>
<line x1="{X(x0):.1f}" y1="{Y(y_up):.1f}" x2="{X(x1):.1f}" y2="{Y(y_drawn):.1f}" stroke="#0369a1" stroke-width="3"/>
<circle cx="{X(x0):.1f}" cy="{Y(y_up):.1f}" r="6" fill="#bae6fd" stroke="#0c4a6e"/>
<circle cx="{X(x1):.1f}" cy="{Y(y_drawn):.1f}" r="6" fill="#bbf7d0" stroke="#0c4a6e"/>
{sheet_line}
<text x="{X(x0) - 8:.1f}" y="{Y(y_up) + 4:.1f}" text-anchor="end" font-size="11" fill="#0f172a">{br_number(y_up)}</text>
<text x="{X(x1) + 8:.1f}" y="{Y(y_drawn) + 16:.1f}" font-size="11" fill="#0c4a6e">desenho {br_number(y_drawn)} m</text>
<text x="{X(x0):.1f}" y="{Y(y_min) + 18:.1f}" font-size="11" fill="#0f172a">E0+010 MH-01</text>
<text x="{X(x1):.1f}" y="{Y(y_min) + 18:.1f}" text-anchor="end" font-size="11" fill="#0f172a">E0+030 MH-02</text>
<text x="{pad_l}" y="{svg_h - 12}" font-size="11" fill="#334155">{e(note)} Exemplo demonstrativo.</text>
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
    scale_x = 70
    scale_y = 280
    pad_l, pad_t, pad_r, pad_b = 56, 28, 28, 48
    svg_w = int(width * scale_x + pad_l + pad_r)
    svg_h = int(total_t * scale_y + pad_t + pad_b)

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
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_w} {svg_h}" role="img" aria-labelledby="sec-title sec-desc">
<title id="sec-title">{e(title)}</title>
<desc id="sec-desc">{e(desc)}</desc>
<rect x="{X(0):.1f}" y="{Y(0):.1f}" width="{px(width):.1f}" height="{px(t_wear, 'y'):.1f}" fill="#334155" stroke="#0f172a"/>
<text x="{X(width / 2):.1f}" y="{Y(t_wear / 2) + 4:.1f}" text-anchor="middle" font-size="11" fill="#f8fafc">capa {br_number(t_wear)} m · Q-CAP-01</text>
<rect x="{X(0):.1f}" y="{Y(t_wear):.1f}" width="{px(width):.1f}" height="{px(t_base, 'y'):.1f}" fill="#a8a29e" stroke="#0f172a"/>
<text x="{X(width / 2):.1f}" y="{Y(t_wear + t_base / 2) + 4:.1f}" text-anchor="middle" font-size="11" fill="#0f172a">base {br_number(t_base)} m · Q-BASE-01</text>
<rect x="{X(0):.1f}" y="{Y(t_wear + t_base):.1f}" width="{px(width):.1f}" height="{px(t_sub, 'y'):.1f}" fill="#d6d3d1" stroke="#0f172a"/>
<text x="{X(width / 2):.1f}" y="{Y(t_wear + t_base + t_sub / 2) + 4:.1f}" text-anchor="middle" font-size="11" fill="#0f172a">sub-base {br_number(t_sub)} m · Q-SUB-01</text>
<text x="{X(width / 2):.1f}" y="{svg_h - 14}" text-anchor="middle" font-size="11" fill="#334155">{br_number(width)} m · revisão {e(rev)} · exemplo demonstrativo</text>
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
        f"""<article class="n-card" id="{e(item['id'])}">
<h3>{e(item['id'])} · {"Interface geométrica" if item["kind"] == "geometric" else "Informação faltante"}</h3>
<p><strong>Local:</strong> {e(item["location_pt_br"])}</p>
<p><strong>Evidência:</strong> {e(item["evidence_pt_br"])}</p>
<p><strong>Encaminhamento:</strong> {e(item["forwarding_pt_br"])}</p>
<p><strong>Estado:</strong> {e(state_pt.get(item["state"], item["state"]))} · elementos {e(" ".join(item["element_ids"]))}</p>
</article>"""
        for item in extracts["coordination_findings"]
    )
    review_html = "".join(
        f"""<article class="n-card" id="{e(item['id'])}">
<h3>{e(item['id'])} · {e(item["document_ref"])}</h3>
<p><strong>Constatação:</strong> {e(item["finding_pt_br"])}</p>
<p><strong>Base:</strong> {e(item["basis_pt_br"])}</p>
<p><strong>Ação:</strong> {e(item["action_pt_br"])}</p>
</article>"""
        for item in extracts["review_findings"]
    )

    extra_head = """<style>
.n-wrap{max-width:46rem;margin:0 auto;padding:2rem 1rem 4rem}
.n-card{border:1px solid rgba(15,23,42,.1);border-radius:12px;padding:1.25rem;margin:1rem 0;background:#f8fafc}
.case-badge{display:inline-block;background:#fef3c7;color:#92400e;font-size:.75rem;font-weight:700;padding:.2rem .5rem;border-radius:4px}
.demo-figure{margin:1rem 0}
.demo-figure svg{width:100%;height:auto;max-width:40rem;border:1px solid #e2e8f0;border-radius:8px;background:#fff}
.demo-actions{display:flex;flex-wrap:wrap;gap:.75rem;margin:1.25rem 0}
.demo-actions a{min-height:44px}
</style>"""

    body = f"""
{html_shell.breadcrumbs_html([("Início", "/"), ("Casos", "/casos/"), ("Infraestrutura e loteamentos", None)])}
<div class="container n-wrap">
<p class="case-badge" data-permission-class="demonstrativo">exemplo demonstrativo · revisão {e(rev)}</p>
<h1>{PAGE_H1}</h1>
<p class="authority-byline">Responsável técnico pelo conteúdo: <a href="/especialista/tiago-jun-sasaki/">Engº Tiago Sasaki</a> · Atualizado em <time datetime="{e(extracts["date_modified"])}">11 de setembro de 2026</time> · <a href="/casos/">Outros exemplos demonstrativos</a> · <a href="/triagem-tecnica/#corrigir-o-site">Como corrigir</a></p>
<p class="content-lead">Este recorte ilustrativo de acesso viário e drenagem de loteamento mostra a mesma cadeia de rastreabilidade usada em edificação: desenho, dimensão, fórmula, quantidade e item de planilha, com IDs e revisão únicos. Os dados e as soluções são ilustrativos e não servem para execução. Não há contratante, terreno, sondagem, chuva de projeto, topografia, assinatura nem número de ART.</p>

<section aria-labelledby="para-comprador">
<h2 id="para-comprador">O que o comprador confere aqui</h2>
<p>Problema: a construtora, o loteador ou a equipe de infraestrutura precisa ver, antes de contratar, se quantitativos, orçamento, revisão e compatibilização de um acesso e de uma rede saem da mesma fonte e podem ser refeitos.</p>
<p>Entrega deste exemplo: uma faixa PV-01 de {br_number(totals["pavement_length_m"])} m por {br_number(totals["pavement_width_m"])} m e um trecho DR-01 de {br_number(totals["pipe_length_m"])} m, com estaqueamento, camadas, cotas e unidades declarados.</p>
<p>Benefício concreto: o mesmo método de rastreabilidade fica visível numa natureza de obra diferente de uma pequena edificação, para você julgar a entrega antes de pedir proposta.</p>
<p>Próximo passo: traga o que você já tem, mesmo incompleto. A proposta recorta o serviço real depois da conferência de escopo e de responsabilidade técnica.</p>
</section>

<section aria-labelledby="para-parceiros">
<h2 id="para-parceiros">O que o parceiro confere aqui</h2>
<p>O exemplo ajuda a avaliar a entrega porque cada ID do desenho reaparece na memória, na planilha e no apontamento. A revisão {e(rev)} está escrita em todos os extratos públicos. Um parceiro pode reabrir o CSV e o SVG sem pedir uma planilha paralela e sem tratar este recorte como obra de cliente.</p>
</section>

<section aria-labelledby="o-que-e">
<h2 id="o-que-e">O recorte</h2>
<p>{e(extracts["cut_pt_br"])} Pergunta de compra atendida: {e(extracts["purchase_question_pt_br"])}</p>
<p>Identificadores: faixa PV-01 (E0+000 a E0+040), poços MH-01 (E0+010) e MH-02 (E0+030), trecho DR-01 e boca de lobo IN-01 (E0+020). {e(extracts["datums"]["pavement_grade_pt_br"])} {e(extracts["datums"]["pipe_invert_pt_br"])}</p>
<p><strong>Entrada escolhida:</strong> {e(extracts["information_classes"]["chosen_input"])} Comprimentos de estaqueamento, largura, espessuras de camada, diâmetro de DR-01 e cotas declaradas.</p>
<p><strong>Cálculo derivado:</strong> {e(extracts["information_classes"]["derived"])} Área, volumes de camada, comprimento do trecho, declive geométrico e subtotal aritmético.</p>
<p><strong>Informação ausente:</strong> {e(extracts["information_classes"]["absent"])} Diâmetro e cota de IN-01; cliente, terreno, sondagem, chuva de projeto, topografia e autorização técnica.</p>
<p><strong>Estado original (R00):</strong> {e(extracts["states"]["R00"]["note_pt_br"])}</p>
<p><strong>Versão demonstrativa corrigida (R01):</strong> {e(extracts["states"]["R01"]["note_pt_br"])} A revisão publicada desta página é {e(rev)}.</p>
</section>

<section aria-labelledby="desenhos">
<h2 id="desenhos">Desenhos</h2>
<figure class="demo-figure">
{_plan_svg(extracts, "R00")}
<figcaption>Planta R00. Faixa PV-01, trecho DR-01, poços MH-01 e MH-02, boca IN-01. A cota de MH-02 ainda diverge da planilha.</figcaption>
</figure>
<figure class="demo-figure">
{_plan_svg(extracts, "R01")}
<figcaption>Planta R01. A geometria em planta é a mesma; o alinhamento de cota aparece no perfil e na planilha.</figcaption>
</figure>
<figure class="demo-figure">
{_profile_svg(extracts, "R00")}
<figcaption>Perfil R00: invert desenhada de MH-02 em {br_number(totals["mh02_invert_drawn_m"])} m e planilha em {br_number(totals["mh02_invert_sheet_r00_m"])} m. Diferença {br_number(totals["mh02_mismatch_r00_m"])} m (CF-GEO-01).</figcaption>
</figure>
<figure class="demo-figure">
{_profile_svg(extracts, "R01")}
<figcaption>Perfil R01: desenho e planilha na mesma cota {br_number(totals["mh02_invert_drawn_m"])} m.</figcaption>
</figure>
<figure class="demo-figure">
{_section_svg(extracts)}
<figcaption>Seção da faixa PV-01: capa, base e sub-base com espessuras declaradas. Volume = área × espessura, sem dimensionar pavimento.</figcaption>
</figure>
<p>Arquivos da mesma revisão {e(rev)}: <a href="assets/planta-r00.svg">planta R00</a>, <a href="assets/planta-r01.svg">planta R01</a>, <a href="assets/perfil-drenagem-r00.svg">perfil R00</a>, <a href="assets/perfil-drenagem-r01.svg">perfil R01</a>, <a href="assets/secao-pavimento.svg">seção da faixa</a>.</p>
</section>

<section aria-labelledby="quantitativos">
<h2 id="quantitativos">Quantitativos</h2>
<p>Base: revisão {e(criteria["quantity_basis_revision"])}. Faixa PV-01: {br_number(totals["pavement_length_m"])} × {br_number(totals["pavement_width_m"])} = {br_number(totals["pavement_area_m2"])} m² (Q-PAV-01). Sub-base = {br_number(totals["pavement_area_m2"])} × 0,15 = {br_number(totals["subbase_m3"])} m³. Base = {br_number(totals["pavement_area_m2"])} × 0,12 = {br_number(totals["base_m3"])} m³. Capa = {br_number(totals["pavement_area_m2"])} × 0,04 = {br_number(totals["wearing_m3"])} m³. Trecho DR-01: 30,00 − 10,00 = {br_number(totals["pipe_length_m"])} m (Q-TUB-01). {e(criteria["pavement_area_rule_pt_br"])} {e(criteria["layer_volume_rule_pt_br"])} {e(criteria["pipe_length_rule_pt_br"])} {e(criteria["geometric_slope_rule_pt_br"])}</p>
{_table(["ID", "Serviço", "Un.", "Qtd.", "Fórmula", "Elementos", "Prancha"], qty_rows, "Memória de quantitativos, revisão " + rev)}
<p><a href="data/quantitativos.csv">Baixar quantitativos.csv</a>, mesma revisão {e(rev)}.</p>
</section>

<section aria-labelledby="orcamento">
<h2 id="orcamento">Orçamento</h2>
<p>{e(extracts["price_disclaimer_pt_br"])} Classe de preço: hipotético. Subtotal aritmético: R$ {br_number(extracts["budget_subtotal"])}. Estimativa aritmética do recorte; o valor contratado depende do caso.</p>
{_table(["ID", "Serviço", "Un.", "Qtd.", "Preço un.", "Valor", "Classe", "Qtd. ID"], budget_rows, "Extrato de orçamento hipotético, revisão " + rev)}
<p><a href="data/orcamento.csv">Baixar orcamento.csv</a>, mesma revisão {e(rev)}.</p>
</section>

<section aria-labelledby="compatibilizacao">
<h2 id="compatibilizacao">Compatibilização</h2>
<p>Dois achados didáticos no mesmo recorte: uma incompatibilidade conferível entre cota desenhada e planilha, e uma informação que simplesmente não foi declarada. Falta de cota ou diâmetro não vira falha comprovada nem risco comprovado.</p>
{coord_html}
{_table(["ID", "Tipo", "Estado", "Local", "Evidência", "Encaminhamento", "Elementos"], coord_rows, "Registro de compatibilização, revisão " + rev)}
<p><a href="data/coordenacao.csv">Baixar coordenacao.csv</a>, mesma revisão {e(rev)}.</p>
</section>

<section aria-labelledby="revisao">
<h2 id="revisao">Revisão</h2>
<p>{e(extracts["review_attribution_pt_br"])} Este recorte não é parecer para executar obra.</p>
{review_html}
{_table(["ID", "Documento", "Constatação", "Base", "Ação", "Tipo"], review_rows, "Extrato de revisão, revisão " + rev)}
<p><a href="data/revisao.csv">Baixar revisao.csv</a>, mesma revisão {e(rev)}.</p>
</section>

<section aria-labelledby="contratar">
<h2 id="contratar">Pedir o mesmo tipo de entrega no seu recorte</h2>
<p>O recorte cabe em qualquer porte e aceita contexto inicial incompleto. Elaboração, revisão, compatibilização, quantitativos e orçamento são compras distintas: o pedido descreve a necessidade, a proposta recorta o serviço. Autoria, atribuição, visita, logística e ART, quando couberem, são confirmadas antes do aceite técnico.</p>
<p>Veja o escopo em <a href="/quantitativos-orcamento-obras/">quantitativos e orçamento</a> e em <a href="/revisao-tecnica-projetos-engenharia/">revisão técnica de projetos</a>. Traga o que você já tem.</p>
<div class="demo-actions">
<a class="button button-primary" data-journey="contrato" data-cta-position="inline_cta" href="{e(wa)}" rel="noopener" target="_blank">Pedir proposta pelo WhatsApp</a>
<a class="button button-secondary" data-journey="contrato" href="/triagem-tecnica/#projetos">Pedir pela triagem técnica</a>
<a class="text-link" href="/casos/">Ver outros exemplos demonstrativos</a>
</div>
</section>
</div>
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
                "sem contratante, endereço, assinatura ou ART. Números do recorte são conferíveis; "
                "preços unitários são hipotéticos e não servem para execução."
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
