"""Render HTML, CSV and SVG from derived extracts. Import html_shell only."""

from __future__ import annotations

import csv
import html
from decimal import Decimal
from io import StringIO
from pathlib import Path
from typing import Any

from scripts.demonstrative.private_project.derive import (
    CANONICAL_URL,
    build_sample_trail,
    PUBLIC_DIR_REL,
    PUBLIC_URL,
)
from scripts.pseo import html_shell

SITE = html_shell.SITE
WA_MESSAGE = (
    "Olá, vi o exemplo demonstrativo de recorte de projeto privado e quero "
    "pedir quantitativos, orçamento, revisão ou compatibilização do meu projeto."
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
    # thousands
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
    """Plan view in metres, scaled. Geometry matches the source room."""
    room = extracts["room"]
    L = float(room["interior_length_m"])
    W = float(room["interior_width_m"])
    t = 0.15
    scale = 120
    pad = 48
    # elements
    els = {el["id"]: el for el in extracts["elements"]}
    door_off = 0.50
    door_w = 0.80
    win_off = 0.50
    win_w = 0.80
    shaft_off = 0.70
    shaft_w = 0.40
    shaft_d = 0.40

    outer_w = L + 2 * t
    outer_h = W + 2 * t
    svg_w = int(outer_w * scale + pad * 2)
    svg_h = int(outer_h * scale + pad * 2 + 36)

    def X(m: float) -> float:
        return pad + (m + t) * scale

    def Y(m: float) -> float:
        # SVG y grows down; plan y grows north
        return pad + (outer_h - (m + t)) * scale

    def px(m: float) -> float:
        return m * scale

    state = extracts["states"][revision]
    title = f"Planta do recorte · {state['label_pt_br']} · {revision}"
    clash_note = ""
    if revision == "R00":
        clash_note = (
            f"R00: verga WN-01 em {br_number(extracts['named_totals']['window_head_r00_m'])} m "
            f"sobreposta à viga B-01."
        )
    else:
        clash_note = (
            f"R01: verga WN-01 em {br_number(extracts['named_totals']['window_head_r01_m'])} m, "
            f"folga de {br_number(extracts['named_totals']['r01_clearance_m'])} m até B-01."
        )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_w} {svg_h}" role="img" aria-labelledby="plan-{revision}-title plan-{revision}-desc">
<title id="plan-{revision}-title">{e(title)}</title>
<desc id="plan-{revision}-desc">Banheiro {br_number(L)} m por {br_number(W)} m. Porta D-01 na parede norte, janela WN-01 na parede leste, poço hidrossanitário HS-01 na parede oeste, viga B-01 na parede leste. {e(clash_note)} Exemplo demonstrativo, revisão {e(revision)}.</desc>
<rect x="{X(-t):.1f}" y="{Y(W):.1f}" width="{px(outer_w):.1f}" height="{px(outer_h):.1f}" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/>
<rect x="{X(0):.1f}" y="{Y(W):.1f}" width="{px(L):.1f}" height="{px(W):.1f}" fill="#fff" stroke="#0f172a" stroke-width="1.5"/>
<!-- door opening north -->
<rect x="{X(door_off):.1f}" y="{Y(W + t):.1f}" width="{px(door_w):.1f}" height="{px(t):.1f}" fill="#fff" stroke="#0f172a"/>
<text x="{X(door_off + door_w / 2):.1f}" y="{Y(W + t) - 6:.1f}" text-anchor="middle" font-size="11" fill="#0f172a">D-01</text>
<!-- window east -->
<rect x="{X(L):.1f}" y="{Y(win_off + win_w):.1f}" width="{px(t):.1f}" height="{px(win_w):.1f}" fill="#bae6fd" stroke="#0369a1"/>
<text x="{X(L + t) + 4:.1f}" y="{Y(win_off + win_w / 2):.1f}" font-size="11" fill="#0c4a6e">WN-01</text>
<!-- beam along east interior -->
<rect x="{X(L - 0.12):.1f}" y="{Y(W):.1f}" width="{px(0.12):.1f}" height="{px(W):.1f}" fill="none" stroke="#b45309" stroke-dasharray="4 3"/>
<text x="{X(L - 0.18):.1f}" y="{Y(W / 2):.1f}" font-size="11" fill="#b45309" transform="rotate(-90 {X(L - 0.18):.1f} {Y(W / 2):.1f})">B-01</text>
<!-- shaft west exterior -->
<rect x="{X(-shaft_d):.1f}" y="{Y(shaft_off + shaft_w):.1f}" width="{px(shaft_d):.1f}" height="{px(shaft_w):.1f}" fill="#fde68a" stroke="#92400e"/>
<text x="{X(-shaft_d / 2):.1f}" y="{Y(shaft_off + shaft_w / 2) + 4:.1f}" text-anchor="middle" font-size="11" fill="#78350f">HS-01</text>
<text x="{X(L / 2):.1f}" y="{Y(W / 2):.1f}" text-anchor="middle" font-size="12" fill="#334155">RM-01</text>
<text x="{X(L / 2):.1f}" y="{Y(-t) + 28:.1f}" text-anchor="middle" font-size="11" fill="#0f172a">{br_number(L)} m</text>
<text x="{X(-t) - 8:.1f}" y="{Y(W / 2):.1f}" text-anchor="middle" font-size="11" fill="#0f172a" transform="rotate(-90 {X(-t) - 8:.1f} {Y(W / 2):.1f})">{br_number(W)} m</text>
<text x="{pad}" y="{svg_h - 12}" font-size="11" fill="#334155">{e(clash_note)} Exemplo demonstrativo.</text>
</svg>
"""


def _elevation_svg(extracts: dict[str, Any], revision: str) -> str:
    """East wall elevation: window vs beam, metres."""
    room = extracts["room"]
    wall_len = float(room["interior_width_m"])
    wall_h = float(room["ceiling_height_m"])
    win_w = 0.80
    win_off = 0.50
    sill = 1.40
    head = float(extracts["named_totals"]["window_head_r00_m" if revision == "R00" else "window_head_r01_m"])
    soffit = float(extracts["named_totals"]["beam_soffit_m"])
    beam_depth = 0.40
    scale = 110
    pad_l, pad_t, pad_r, pad_b = 56, 36, 28, 48
    svg_w = int(wall_len * scale + pad_l + pad_r)
    svg_h = int(wall_h * scale + pad_t + pad_b)

    def X(m: float) -> float:
        return pad_l + m * scale

    def Y(m: float) -> float:
        return pad_t + (wall_h - m) * scale

    def px(m: float) -> float:
        return m * scale

    overlap = revision == "R00"
    win_fill = "#fecaca" if overlap else "#bbf7d0"
    title = f"Elevação leste W-02 · {extracts['states'][revision]['label_pt_br']} · {revision}"
    desc = (
        f"Parede de {br_number(wall_len)} m por {br_number(wall_h)} m. Janela WN-01 de peitoril "
        f"{br_number(sill)} m até verga {br_number(head)} m. Viga B-01 com fundo em {br_number(soffit)} m."
    )
    if overlap:
        desc += f" Sobreposição de {br_number(extracts['named_totals']['r00_overlap_m'])} m."
    else:
        desc += f" Folga de {br_number(extracts['named_totals']['r01_clearance_m'])} m."

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_w} {svg_h}" role="img" aria-labelledby="elv-{revision}-title elv-{revision}-desc">
<title id="elv-{revision}-title">{e(title)}</title>
<desc id="elv-{revision}-desc">{e(desc)} Exemplo demonstrativo.</desc>
<rect x="{X(0):.1f}" y="{Y(wall_h):.1f}" width="{px(wall_len):.1f}" height="{px(wall_h):.1f}" fill="#f8fafc" stroke="#0f172a" stroke-width="2"/>
<rect x="{X(0):.1f}" y="{Y(wall_h):.1f}" width="{px(wall_len):.1f}" height="{px(beam_depth):.1f}" fill="#f59e0b" fill-opacity="0.35" stroke="#b45309"/>
<text x="{X(wall_len / 2):.1f}" y="{Y(soffit + beam_depth / 2) + 4:.1f}" text-anchor="middle" font-size="11" fill="#78350f">B-01 fundo {br_number(soffit)} m</text>
<rect x="{X(win_off):.1f}" y="{Y(head):.1f}" width="{px(win_w):.1f}" height="{px(head - sill):.1f}" fill="{win_fill}" stroke="#0f172a"/>
<text x="{X(win_off + win_w / 2):.1f}" y="{Y((head + sill) / 2) + 4:.1f}" text-anchor="middle" font-size="11" fill="#0f172a">WN-01</text>
<text x="{X(0) - 8:.1f}" y="{Y(head) + 4:.1f}" text-anchor="end" font-size="10" fill="#0f172a">{br_number(head)}</text>
<text x="{X(0) - 8:.1f}" y="{Y(sill) + 4:.1f}" text-anchor="end" font-size="10" fill="#0f172a">{br_number(sill)}</text>
<text x="{X(0) - 8:.1f}" y="{Y(soffit) + 4:.1f}" text-anchor="end" font-size="10" fill="#b45309">{br_number(soffit)}</text>
<text x="{X(0) - 8:.1f}" y="{Y(0) + 4:.1f}" text-anchor="end" font-size="10" fill="#0f172a">0,00</text>
<text x="{pad_l}" y="{svg_h - 14}" font-size="11" fill="#334155">{e(desc)} Exemplo demonstrativo.</text>
</svg>
"""


def _table(headers: list[str], rows: list[list[Any]], caption: str) -> str:
    return html_shell.table_html(headers, rows, caption=caption)


def render_html(extracts: dict[str, Any]) -> str:
    totals = extracts["named_totals"]
    rev = extracts["revision"]
    wa = html_shell.wa_link(WA_MESSAGE)
    room = extracts["room"]
    criteria = extracts["takeoff_criteria"]

    calculation = build_sample_trail(extracts)["calculation"]
    qty_rows = [
        [
            row["id"],
            row["description_pt_br"],
            row["unit"],
            br_number(row["quantity"], 4 if row["unit"] == "m3" else 2),
            (calculation["label_pt_br"] + " " + calculation["memory"])
            if row["id"] == "Q-PAR-01" else row["formula"].replace(".", ","),
            " ".join(row["element_ids"]),
            row["sheet_ref"],
        ]
        for row in extracts["quantity_rows"]
    ]
    wall_rows = [
        [
            row["element_id"],
            br_number(row["gross_m2"]),
            br_number(row["deduction_m2"]),
            br_number(row["net_m2"]),
            " ".join(row["opening_ids"]) or "-",
        ]
        for row in extracts["wall_breakdown"]
    ]
    budget_rows = [
        [
            row["id"],
            row["service_pt_br"],
            row["unit"],
            br_number(row["quantity"], 4 if row["unit"] == "m3" else 2),
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
        "resolved_in_R01": "Corrigido na revisão R01",
        "information_requested": "Pedido de informação",
    }

    def public_state(code: str) -> str:
        if code in state_pt:
            return state_pt[code]
        raise SystemExit(f"unpublished_public_state:{code}")
    check_pt = {
        "arithmetic_documental_coherence": "conferência aritmética, documental e de coerência",
        "documental_coherence": "conferência documental",
    }
    coord_rows = [
        [
            item["id"],
            "geométrica" if item["kind"] == "geometric" else "informação faltante",
            public_state(item["state"]),
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
<p><strong>Estado:</strong> {e(public_state(item["state"]))} · elementos {e(" ".join(item["element_ids"]))}</p>
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
.demo-figure svg{width:100%;height:auto;max-width:36rem;border:1px solid #e2e8f0;border-radius:8px;background:#fff}
.demo-actions{display:flex;flex-wrap:wrap;gap:.75rem;margin:1.25rem 0}
.demo-actions a{min-height:44px}
</style>"""

    body = f"""
{html_shell.breadcrumbs_html([("Início", "/"), ("Casos", "/casos/"), ("Recorte de banheiro", None)])}
<div class="container n-wrap">
<p class="case-badge" data-permission-class="demonstrativo">exemplo demonstrativo · revisão {e(rev)}</p>
<h1>Demonstrativo. Recorte de banheiro com quantitativos, orçamento, revisão e compatibilização</h1>
<p class="authority-byline">Responsável técnico pelo conteúdo: <a href="/especialista/tiago-jun-sasaki/">Engº Tiago Sasaki</a> · Atualizado em <time datetime="{e(extracts["date_modified"])}">11 de setembro de 2026</time> · <a href="/casos/">Outros exemplos demonstrativos</a> · <a href="/triagem-tecnica/#corrigir-o-site">Como corrigir</a></p>
<p class="content-lead">Este recorte didático de um banheiro residencial mostra como a CONFENGE levanta quantidades, monta um extrato de orçamento, registra interferências e documenta uma revisão. Os números saem de uma fonte só: você pode refazer a conta na página, no CSV ou na planta. Não há contratante, endereço, assinatura nem número de ART.</p>

<section aria-labelledby="o-que-e">
<h2 id="o-que-e">O recorte</h2>
<p>Interior {br_number(room["interior_length_m"])} m × {br_number(room["interior_width_m"])} m, pé-direito {br_number(room["ceiling_height_m"])} m. Identificadores: RM-01, paredes W-01 a W-04, piso SL-01, forro CL-01, porta D-01, janela WN-01, viga B-01 e poço hidrossanitário HS-01.</p>
<p><strong>Estado original (R00):</strong> {e(extracts["states"]["R00"]["note_pt_br"])}</p>
<p><strong>Versão demonstrativa corrigida (R01):</strong> {e(extracts["states"]["R01"]["note_pt_br"])} A revisão publicada desta página é {e(rev)}.</p>
</section>

<section aria-labelledby="plantas">
<h2 id="plantas">Planta e elevação</h2>
<figure class="demo-figure">
{_plan_svg(extracts, "R00")}
<figcaption>Planta R00, estado original. Janela WN-01 na parede leste, viga B-01 no mesmo alinhamento, poço HS-01 a oeste.</figcaption>
</figure>
<figure class="demo-figure">
{_plan_svg(extracts, "R01")}
<figcaption>Planta R01, versão demonstrativa corrigida. A planta baixa é a mesma; a correção aparece na elevação.</figcaption>
</figure>
<figure class="demo-figure">
{_elevation_svg(extracts, "R00")}
<figcaption>Elevação leste R00: a verga de WN-01 em {br_number(totals["window_head_r00_m"])} m invade o fundo da viga B-01 em {br_number(totals["beam_soffit_m"])} m. Sobreposição {br_number(totals["r00_overlap_m"])} m.</figcaption>
</figure>
<figure class="demo-figure">
{_elevation_svg(extracts, "R01")}
<figcaption>Elevação leste R01: verga em {br_number(totals["window_head_r01_m"])} m, folga {br_number(totals["r01_clearance_m"])} m até B-01.</figcaption>
</figure>
<p>Arquivos da mesma revisão: <a href="assets/planta-r00.svg">planta R00</a>, <a href="assets/planta-r01.svg">planta R01</a>, <a href="assets/elevacao-leste-r00.svg">elevação R00</a>, <a href="assets/elevacao-leste-r01.svg">elevação R01</a>.</p>
</section>

<section aria-labelledby="quantitativos">
<h2 id="quantitativos">Quantitativos</h2>
<p>Base: revisão {e(criteria["quantity_basis_revision"])}. Piso: {br_number(room["interior_length_m"])} × {br_number(room["interior_width_m"])} = {br_number(totals["floor_area_m2"])} m² (SL-01). Paredes: soma dos vãos internos menos aberturas ≥ {br_number(criteria["opening_deduction_min_m2"])} m². {e(criteria["opening_deduction_rule_pt_br"])} Porta D-01 = {br_number(totals["door_area_m2"])} m²; janela WN-01 em R01 = {br_number(totals["window_area_r01_m2"])} m². Parede líquida = {br_number(totals["wall_net_m2"])} m². Impermeabilização = piso + perímetro × {br_number(criteria["waterproofing_upstand_m"])} m = {br_number(totals["waterproofing_m2"])} m². Contrpiso = {br_number(totals["floor_area_m2"])} × {br_number(criteria["screed_thickness_m"])} = {br_number(totals["screed_m3"], 4)} m³.</p>
{_table(["Parede", "Bruto m²", "Desconto m²", "Líquido m²", "Aberturas"], wall_rows, "Descontos de abertura por parede, revisão " + rev)}
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
<p>Dois achados didáticos no mesmo recorte: uma interferência geométrica conferível e uma informação que simplesmente não foi declarada. Falta de dado não vira falha comprovada.</p>
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
<h2 id="contratar">Pedir o mesmo tipo de entrega no seu projeto</h2>
<p>O recorte cabe em qualquer porte e aceita contexto inicial incompleto. Elaboração, revisão, compatibilização, quantitativos e orçamento são compras distintas: o pedido descreve a necessidade, a proposta recorta o serviço. Autoria, atribuição, visita, logística e ART, quando couberem, são confirmadas antes do aceite técnico.</p>
<p>Peça a entrega que corresponde ao recorte: <a href="/quantitativos-orcamento-obras/">quantitativos e orçamento</a>, <a href="/revisao-tecnica-projetos-engenharia/">revisão técnica</a> ou <a href="/compatibilizacao-projetos-engenharia/">compatibilização</a>. Traga o que você já tem.</p>
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
        html_shell.breadcrumb_jsonld([("Início", "/"), ("Casos", "/casos/"), ("Recorte de banheiro", None)]),
        {
            "@type": "TechArticle",
            "@id": f"{CANONICAL_URL}#article",
            "headline": "Demonstrativo. Recorte de banheiro com quantitativos, orçamento, revisão e compatibilização",
            "description": "Exemplo demonstrativo de recorte de banheiro com memória de quantitativos, extrato de orçamento hipotético, registro de compatibilização e revisão aritmética.",
            "disambiguatingDescription": "Página de exemplo demonstrativo: recorte didático sem contratante, endereço, assinatura ou ART. Números do recorte são conferíveis; preços unitários são hipotéticos.",
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
        title="Demonstrativo. Recorte de banheiro: quantitativos, orçamento, revisão e compatibilização | CONFENGE",
        description="Exemplo demonstrativo de um recorte de banheiro com quantitativos conferíveis, orçamento hipotético, revisão e compatibilização. Sem contratante e sem ART.",
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
        "elevacao-leste-r00": (public / "assets" / "elevacao-leste-r00.svg", _elevation_svg(extracts, "R00")),
        "elevacao-leste-r01": (public / "assets" / "elevacao-leste-r01.svg", _elevation_svg(extracts, "R01")),
    }
    for key, (path, text) in mapping.items():
        path.write_text(text, encoding="utf-8")
        written[key] = path

    from scripts.demonstrative.private_project.derive import CONSUMPTION_REL, consumption_descriptor
    import json

    cons_path = root / CONSUMPTION_REL
    cons_path.parent.mkdir(parents=True, exist_ok=True)
    cons_path.write_text(
        json.dumps(consumption_descriptor(extracts), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    written["consumption"] = cons_path
    return written
