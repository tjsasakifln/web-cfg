"""Plates of the public-works family (lote B, SALTO-INSTITUCIONAL-02).

One plate per B2G pillar, rendered from a demonstrative JSON under
``data/demonstrative/plates/``. ``render_plates.py`` folds this module in
through ``SOURCES``, ``PLATE_SOURCES`` and ``RENDERERS``; every numeral on a
sheet comes from its source JSON (the plate tests prove it), desktop and mobile
are distinct compositions, and the palette, strokes and title block come from
``sheet.py``.

    P5  aditivo-limite         contract timeline against the art. 125 limits
    P6  orcamento-comparativo  reference budget vs proposal, item by item
    P7  carteira-eventos       contract portfolio x contract events
    P8  edital-checklist       the tender read as a technical checklist
    P9  reequilibrio-curva     cost index vs base date, imbalance hatched
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from scripts.demonstrative.plates import sheet as S
from scripts.demonstrative.plates.sheet import (
    GREEN,
    INK,
    LIME,
    MUTED,
    SOFT,
    WHITE,
    br,
    callout,
    dim_group,
    dim_h,
    dim_v,
    fmt,
    leader,
    line,
    path,
    rect,
    text,
)

SOURCES = {
    "aditivo_limite": Path("data/demonstrative/plates/aditivo-limite.v1.json"),
    "orcamento_comparativo": Path("data/demonstrative/plates/orcamento-comparativo.v1.json"),
    "carteira_eventos": Path("data/demonstrative/plates/carteira-eventos.v1.json"),
    "edital_checklist": Path("data/demonstrative/plates/edital-checklist.v1.json"),
    "reequilibrio_curva": Path("data/demonstrative/plates/reequilibrio-curva.v1.json"),
}
PLATE_SOURCES = {
    "aditivo-limite": ("aditivo_limite",),
    "orcamento-comparativo": ("orcamento_comparativo",),
    "carteira-eventos": ("carteira_eventos",),
    "edital-checklist": ("edital_checklist",),
    "reequilibrio-curva": ("reequilibrio_curva",),
}
MOBILE_W, MOBILE_H = 360, 420
FS_M = 12.5  # mobile minimum font
DESK_W = 1200


def _d(v: str | Decimal) -> float:
    return float(Decimal(str(v).replace(".", "").replace(",", ".")) if "," in str(v) else Decimal(str(v)))


def _legend(x: float, y: float, heading: str, items: list[tuple[str, str]], *, step: float = 18, size: float = S.FS_DIM) -> str:
    parts = [text(x, y, heading, size=S.FS_LABEL, weight=S.FW_LABEL)]
    for i, (num, body) in enumerate(items, start=1):
        yy = y + i * step
        parts.append(
            f'<text x="{fmt(x)}" y="{fmt(yy)}" font-size="{fmt(size)}"><tspan font-weight="{S.FW_CALLOUT}">{num}</tspan>'
            f'<tspan x="{fmt(x + 16)}">{S.esc(body)}</tspan></text>'
        )
    return "".join(parts)


def _desktop_carimbo(height: float, code: str, pid: str, revision: str, scale_text: str) -> str:
    return S.title_block(
        DESK_W, height, ((f"{code} · {pid} · rev. {revision}",), (scale_text,), (S.DEMO_LABEL,)), id=f"{pid}-d-carimbo"
    )


def _mobile_carimbo(code: str, pid: str, revision: str, scale_lines: tuple[str, str]) -> str:
    return S.title_block(
        MOBILE_W,
        MOBILE_H,
        ((code, f"rev. {revision}"), scale_lines, ("Exemplo demonstrativo", "sem obra de cliente")),
        widths=(64, 120),
        size=FS_M,
        id=f"{pid}-m-carimbo",
    )


def _note(revision: str) -> str:
    return f"Dados demonstrativos · revisão {revision}"


def _prov(key: str) -> str:
    return f" Procedência: {SOURCES[key]}."


def _sheet(pid: str, variant: str, height: float, *, title: str, desc: str, heading: str, note: str, body: list[str], carimbo: str, heading_size: float = S.FS_TITLE) -> str:
    return S.sheet(
        plate_id=pid,
        variant=variant,
        width=DESK_W if variant == "desktop" else MOBILE_W,
        height=height,
        title=title,
        desc=desc,
        heading=heading,
        source_note=note,
        body="\n".join(body),
        carimbo=carimbo,
        heading_size=heading_size,
    )


# ---------------------------------------------------------------------------
# P5 · aditivo-limite
# ---------------------------------------------------------------------------


def _p5_numbers(src: dict) -> dict:
    events = src["events"]
    cum = Decimal("0")
    for ev in events:
        cum += Decimal(ev["increment_percent"])
        assert cum == Decimal(ev["cumulative_percent"]), ev["id"]
    last = Decimal(events[-1]["cumulative_percent"])
    lim = {lm["id"]: lm for lm in src["limits"]}
    assert last - Decimal(lim["LIM-25"]["percent"]) == Decimal(src["excess"]["percent"])
    return {"events": events, "limits": src["limits"], "excess": src["excess"], "axis": src["axis"], "contract": src["contract"], "revision": src["revision"], "legal": src["legal_reference_pt_br"], "code": src["sheet_code"]}


def _p5_step(n: dict, X, Y) -> tuple[str, str]:
    """Stepped cumulative line: formalised part solid ink, proposed part dashed green."""
    ev = n["events"]
    pts_solid = [(X(ev[0]["month"]), Y(ev[0]["cumulative_percent"]))]
    for e in ev[1:]:
        if e["state"] != "formalizado":
            break
        pts_solid.append((X(e["month"]), pts_solid[-1][1]))
        pts_solid.append((X(e["month"]), Y(e["cumulative_percent"])))
    prop = ev[-1]
    x_prev, y_prev = pts_solid[-1]
    d_solid = "M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in pts_solid)
    d_prop = f"M{fmt(x_prev)} {fmt(y_prev)}L{fmt(X(prop['month']))} {fmt(y_prev)}L{fmt(X(prop['month']))} {fmt(Y(prop['cumulative_percent']))}L{fmt(X(n['contract']['term_months']))} {fmt(Y(prop['cumulative_percent']))}"
    return d_solid, d_prop


def p5_desktop(data: dict) -> str:
    src = data["aditivo_limite"]
    n = _p5_numbers(src)
    pid, H = "aditivo-limite", 560
    hid = S.hatch_id(f"{pid}-d")
    X0, XMAX, YB, YT = 120.0, 1040.0, 400.0, 120.0
    tmax, pmax = _d(n["contract"]["term_months"]), _d(n["axis"]["percent_max"])
    X = lambda m: X0 + _d(m) / tmax * (XMAX - X0)  # noqa: E731
    Y = lambda p: YB - _d(p) / pmax * (YB - YT)  # noqa: E731
    lim25, lim50 = n["limits"][0], n["limits"][1]
    body = [S.hatch_defs(f"{pid}-d")]
    body.append(text(28, 72, f"{n['contract']['label_pt_br']} · valor inicial atualizado {n['contract']['initial_value_brl_text']} · vigência {n['contract']['term_months']} meses · percentuais acumulados", size=S.FS_LABEL, weight=S.FW_LABEL))
    # band between the two limits: only a reform reaches it
    body.append(rect(X0, Y(lim50["percent"]), XMAX - X0, Y(lim25["percent"]) - Y(lim50["percent"]), fill=LIME, fill_opacity=".35"))
    body.append(line(X0, Y(lim25["percent"]), XMAX, Y(lim25["percent"]), stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    body.append(line(X0, Y(lim50["percent"]), XMAX, Y(lim50["percent"]), stroke=MUTED, stroke_width=fmt(S.SW_DIM), stroke_dasharray="4 3"))
    body.append(text(X0 + 8, Y(lim25["percent"]) + 16, f"{lim25['percent']}% · limite para {lim25['applies_pt_br']}", size=S.FS_LABEL, weight=S.FW_LABEL))
    body.append(text(X0 + 8, Y(lim50["percent"]) + 16, f"{lim50['percent']}% · só para {lim50['applies_pt_br']}", fill=MUTED))
    # axes
    body.append(line(X0, YB, XMAX, YB, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    body.append(line(X0, YB, X0, YT - 10, stroke=MUTED, stroke_width=fmt(S.SW_DIM)))
    for m in n["axis"]["months"]:
        body.append(line(X(m), YB, X(m), YB + 6, stroke=INK, stroke_width=fmt(S.SW_DIM)))
        body.append(text(X(m), YB + 20, m, fill=MUTED, anchor="middle"))
    body.append(text(XMAX, YB + 36, "meses desde a assinatura", fill=MUTED, anchor="end"))
    for p in n["axis"]["percent_ticks"]:
        body.append(line(X0 - 6, Y(p), X0, Y(p), stroke=MUTED, stroke_width=fmt(S.SW_DIM)))
        body.append(text(X0 - 10, Y(p) + 4, f"{p}%", fill=MUTED, anchor="end"))
    # excess over the limit, hatched
    prop = n["events"][-1]
    body.append(rect(X(prop["month"]), Y(prop["cumulative_percent"]), X(n["contract"]["term_months"]) - X(prop["month"]), Y(lim25["percent"]) - Y(prop["cumulative_percent"]), fill=f"url(#{hid})", stroke=MUTED, stroke_width=fmt(S.SW_DIM)))
    d_solid, d_prop = _p5_step(n, X, Y)
    body.append(path(d_solid, fill="none", stroke=INK, stroke_width=fmt(S.SW_CUT)))
    body.append(path(d_prop, fill="none", stroke=GREEN, stroke_width=fmt(S.SW_CUT), stroke_dasharray="6 4"))
    for e in n["events"][1:]:
        x, y = X(e["month"]), Y(e["cumulative_percent"])
        body.append(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="4" fill="{GREEN if e["state"] != "formalizado" else INK}"/>')
        body.append(text(x + 8, y - 24, f"{e['id']} · +{e['increment_percent']}% = {e['cumulative_percent']}%", size=S.FS_LABEL, weight=S.FW_LABEL, fill=GREEN if e["state"] != "formalizado" else INK))
        body.append(text(x + 8, y - 9, f"mês {e['month']} · {e['value_brl_text']}", fill=MUTED))
    # The excess band (27% - 25%) is 11 px tall on this scale: a vertical
    # dimension there is illegible, so callout 2 carries the number (revisão
    # do lote B, preferência do revisor).
    # callouts
    c1 = (X(prop["month"]) - 40, Y(prop["cumulative_percent"]) - 30)
    body.append(leader(*c1, X(prop["month"]), Y(prop["cumulative_percent"])))
    body.append(callout(*c1, 1))
    exc_mid = ((X(prop["month"]) + X(n["contract"]["term_months"])) / 2, (Y(prop["cumulative_percent"]) + Y(lim25["percent"])) / 2)
    c2 = (exc_mid[0] + 40, Y(prop["cumulative_percent"]) - 50)
    body.append(leader(*c2, *exc_mid))
    body.append(callout(*c2, 2))
    c3 = (X0 + 300, Y(lim25["percent"]) - 26)
    body.append(leader(*c3, X0 + 300, Y(lim25["percent"])))
    body.append(callout(*c3, 3))
    body.append(_legend(28, 446, "Chamadas", [
        ("1", f"{prop['label_pt_br']} ({prop['id']}): {n['events'][-2]['cumulative_percent']}% formalizados + {prop['increment_percent']}% pedidos = {prop['cumulative_percent']}% do valor inicial atualizado. Não é direito automático a termo."),
        ("2", f"{n['excess']['label_pt_br']}: {prop['cumulative_percent']} − {lim25['percent']} = {n['excess']['percent']}% ({n['excess']['value_brl_text']}). O dossiê registra o excesso e pede revisão de escopo ou de enquadramento, não força o termo."),
        ("3", f"Limites do {n['legal']}: {lim25['percent']}% para {lim25['applies_pt_br']}; {lim50['percent']}% só para {lim50['applies_pt_br']}. Acréscimos e supressões em trilhas separadas."),
    ]))
    title = f"Prancha {n['code']} · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Linha do tempo de {n['contract']['term_months']} meses de um contrato hipotético de {n['contract']['initial_value_brl_text']}: "
        f"{n['events'][1]['id']} no mês {n['events'][1]['month']} ({n['events'][1]['cumulative_percent']}%), {n['events'][2]['id']} no mês {n['events'][2]['month']} ({n['events'][2]['cumulative_percent']}%) e um aditivo proposto no mês {prop['month']} que levaria o acumulado a {prop['cumulative_percent']}%, "
        f"{n['excess']['percent']}% acima do limite de {lim25['percent']}% para obra nova; a faixa até {lim50['percent']}% só vale para reforma. Premissas sintéticas; exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "desktop", H, title=title, desc=desc + _prov("aditivo_limite"), heading=src["title"], note=_note(n["revision"]), body=body,
                  carimbo=_desktop_carimbo(H, n["code"], pid, n["revision"], "Meses × percentual acumulado"))


def p5_mobile(data: dict) -> str:
    src = data["aditivo_limite"]
    n = _p5_numbers(src)
    pid = "aditivo-limite"
    hid = S.hatch_id(f"{pid}-m")
    X0, XMAX, YB, YT = 52.0, 330.0, 262.0, 92.0
    tmax, pmax = _d(n["contract"]["term_months"]), _d(n["axis"]["percent_max"])
    X = lambda m: X0 + _d(m) / tmax * (XMAX - X0)  # noqa: E731
    Y = lambda p: YB - _d(p) / pmax * (YB - YT)  # noqa: E731
    lim25, lim50 = n["limits"][0], n["limits"][1]
    prop = n["events"][-1]
    body = [S.hatch_defs(f"{pid}-m")]
    body.append(rect(X0, Y(lim50["percent"]), XMAX - X0, Y(lim25["percent"]) - Y(lim50["percent"]), fill=LIME, fill_opacity=".35"))
    body.append(line(X0, Y(lim25["percent"]), XMAX, Y(lim25["percent"]), stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    body.append(line(X0, Y(lim50["percent"]), XMAX, Y(lim50["percent"]), stroke=MUTED, stroke_width=fmt(S.SW_DIM), stroke_dasharray="4 3"))
    body.append(text(XMAX - 4, Y(lim25["percent"]) + 14, f"{lim25['percent']}% obra nova", size=FS_M, weight=S.FW_LABEL, anchor="end"))
    body.append(text(X0 + 4, Y(lim50["percent"]) + 14, f"{lim50['percent']}% reforma", size=FS_M, fill=MUTED))
    body.append(line(X0, YB, XMAX, YB, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    for m in n["axis"]["months"]:
        body.append(line(X(m), YB, X(m), YB + 5, stroke=INK, stroke_width=fmt(S.SW_DIM)))
        body.append(text(X(m), YB + 18, m, size=FS_M, fill=MUTED, anchor="middle"))
    for p in ("0", "25", "50"):
        body.append(text(X0 - 6, Y(p) + 4, f"{p}%", size=FS_M, fill=MUTED, anchor="end"))
    body.append(rect(X(prop["month"]), Y(prop["cumulative_percent"]), X(n["contract"]["term_months"]) - X(prop["month"]), Y(lim25["percent"]) - Y(prop["cumulative_percent"]), fill=f"url(#{hid})", stroke=MUTED, stroke_width=fmt(S.SW_DIM)))
    d_solid, d_prop = _p5_step(n, X, Y)
    body.append(path(d_solid, fill="none", stroke=INK, stroke_width=fmt(S.SW_CUT)))
    body.append(path(d_prop, fill="none", stroke=GREEN, stroke_width=fmt(S.SW_CUT), stroke_dasharray="6 4"))
    for e in n["events"][1:]:
        x, y = X(e["month"]), Y(e["cumulative_percent"])
        body.append(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="3.5" fill="{GREEN if e["state"] != "formalizado" else INK}"/>')
        body.append(text(x - 6, y - 6, f"{e['id']} {e['cumulative_percent']}%", size=FS_M, weight=S.FW_LABEL, anchor="end", fill=GREEN if e["state"] != "formalizado" else INK))
    c1 = (X(prop["month"]) + 30, Y(prop["cumulative_percent"]) - 40)
    body.append(leader(*c1, X(prop["month"]), Y(prop["cumulative_percent"])))
    body.append(callout(*c1, 1, size=FS_M))
    exc_mid = ((X(prop["month"]) + X(n["contract"]["term_months"])) / 2, (Y(prop["cumulative_percent"]) + Y(lim25["percent"])) / 2)
    c2 = (exc_mid[0] + 10, Y(lim50["percent"]) + 44)
    body.append(leader(*c2, *exc_mid))
    body.append(callout(*c2, 2, size=FS_M))
    body.append(text(20, 310, f"1 Aditivo proposto: {n['events'][-2]['cumulative_percent']} + {prop['increment_percent']} = {prop['cumulative_percent']}% do valor inicial", size=FS_M))
    body.append(text(20, 328, f"2 Excesso sobre {lim25['percent']}%: {n['excess']['percent']}% · {n['excess']['value_brl_text']} · sem direito a termo", size=FS_M))
    body.append(text(20, 346, f"Meses desde a assinatura · {n['legal']}", size=FS_M, fill=MUTED))
    body.append(text(20, 364, "Premissas sintéticas · o órgão decide o termo", size=FS_M, fill=MUTED))
    title = f"Prancha {n['code']} (móvel) · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Percentual acumulado de aditivos ao longo de {n['contract']['term_months']} meses: {n['events'][1]['cumulative_percent']}%, {n['events'][2]['cumulative_percent']}% e um aditivo proposto que chegaria a {prop['cumulative_percent']}%, "
        f"{n['excess']['percent']}% acima do limite de {lim25['percent']}% para obra nova. Exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "mobile", MOBILE_H, title=title, desc=desc + _prov("aditivo_limite"), heading="Contrato e o limite do art. 125", note="", body=body,
                  carimbo=_mobile_carimbo(f"{n['code']}-M", pid, n["revision"], ("Meses × percentual", "acumulado")), heading_size=14)


# ---------------------------------------------------------------------------
# P6 · orcamento-comparativo
# ---------------------------------------------------------------------------


def _p6_numbers(src: dict) -> dict:
    for it in src["items"]:
        assert Decimal(it["reference_brl_thousand"]) - Decimal(it["proposal_brl_thousand"]) == Decimal(it["difference_brl_thousand"]), it["id"]
    return {"items": src["items"], "axis": src["axis"], "columns": src["columns"], "revision": src["revision"], "code": src["sheet_code"]}


def p6_desktop(data: dict) -> str:
    src = data["orcamento_comparativo"]
    n = _p6_numbers(src)
    pid, H = "orcamento-comparativo", 560
    hid = S.hatch_id(f"{pid}-d")
    X0, XMAX = 380.0, 960.0
    vmax = _d(n["axis"]["max_brl_thousand"])
    X = lambda v: X0 + _d(v) / vmax * (XMAX - X0)  # noqa: E731
    body = [S.hatch_defs(f"{pid}-d")]
    body.append(text(28, 72, "Três itens da mesma planilha · valores em R$ mil · o deságio global esconde onde o risco se concentra", size=S.FS_LABEL, weight=S.FW_LABEL))
    body.append(rect(X0, 92, 14, 10, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    body.append(text(X0 + 20, 101, n["columns"][0]["label_pt_br"], fill=MUTED))
    body.append(rect(X0 + 200, 92, 14, 10, fill=GREEN))
    body.append(text(X0 + 220, 101, n["columns"][1]["label_pt_br"], fill=MUTED))
    y0, pitch, bar_h = 118, 92, 22
    focus = None
    for i, it in enumerate(n["items"]):
        y = y0 + i * pitch
        if it["focus"]:
            body.append(rect(20, y - 12, DESK_W - 40, pitch - 4, fill=LIME, fill_opacity=".35"))
            focus = (it, y)
        body.append(text(X0 - 20, y + 8, it["label_pt_br"], size=S.FS_LABEL, weight=S.FW_LABEL, anchor="end", fill=GREEN if it["focus"] else INK))
        body.append(text(X0 - 20, y + 24, f"{it['id']} · quantidade × preço por {it['unit_pt_br']}", fill=MUTED, anchor="end"))
        body.append(rect(X0, y, X(it["reference_brl_thousand"]) - X0, bar_h, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
        body.append(text(X(it["reference_brl_thousand"]) + 8, y + 15, f"{br(it['reference_brl_thousand'], 0)}", size=S.FS_LABEL, weight=S.FW_LABEL))
        y2 = y + bar_h + 6
        body.append(rect(X0, y2, X(it["proposal_brl_thousand"]) - X0, bar_h, fill=GREEN))
        body.append(rect(X(it["proposal_brl_thousand"]), y2, X(it["reference_brl_thousand"]) - X(it["proposal_brl_thousand"]), bar_h, fill=f"url(#{hid})", stroke=MUTED, stroke_width=fmt(S.SW_DIM)))
        body.append(text(X(it["reference_brl_thousand"]) + 8, y2 + 15, f"{br(it['proposal_brl_thousand'], 0)} · −{it['difference_percent']}% · −{br(it['difference_brl_thousand'], 0)} mil", size=S.FS_LABEL, weight=S.FW_LABEL, fill=GREEN if it["focus"] else INK))
    yr = y0 + 3 * pitch - 16
    body.append(line(X0, yr, XMAX, yr, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    for t in n["axis"]["ticks_brl_thousand"]:
        body.append(line(X(t), yr, X(t), yr + 6, stroke=INK, stroke_width=fmt(S.SW_DIM)))
        body.append(text(X(t), yr + 20, f"R$ {br(t, 0)} mil" if t == n["axis"]["max_brl_thousand"] else br(t, 0), fill=MUTED, anchor="middle"))
    it, yf = focus
    c1 = (X(it["proposal_brl_thousand"]) + 60, yf - 40)
    body.append(leader(*c1, (X(it["proposal_brl_thousand"]) + X(it["reference_brl_thousand"])) / 2, yf + bar_h + 6 + bar_h / 2))
    body.append(callout(*c1, 1))
    c2 = (X0 - 30, 97)
    body.append(leader(*c2, X0 - 2, 97))
    body.append(callout(*c2, 2))
    c3 = (X0 + 170, 97)
    body.append(leader(*c3, X0 + 198, 97))
    body.append(callout(*c3, 3))
    body.append(_legend(28, 446, "Chamadas", [
        ("1", f"{it['label_pt_br']}: {br(it['reference_brl_thousand'], 0)} na referência, {br(it['proposal_brl_thousand'], 0)} na proposta, −{it['difference_percent']}% (−{br(it['difference_brl_thousand'], 0)} mil). É o item que concentra o risco: {it['reading_pt_br']}."),
        ("2", f"{n['columns'][0]['label_pt_br']}: quantidade × preço unitário da planilha do edital, na data-base do certame."),
        ("3", f"{n['columns'][1]['label_pt_br']}: o mesmo item com o preço proposto; a diferença hachurada é o desconto por item, não o deságio global."),
    ]))
    title = f"Prancha {n['code']} · {src['title']} · exemplo demonstrativo"
    items = n["items"]
    desc = (
        "Barras proporcionais, item a item, do orçamento de referência e da proposta: "
        + "; ".join(f"{x['label_pt_br']} {br(x['reference_brl_thousand'], 0)} contra {br(x['proposal_brl_thousand'], 0)} (−{x['difference_percent']}%)" for x in items)
        + f". O item em foco, {it['label_pt_br']}, concentra o risco de exequibilidade. Premissas sintéticas; exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "desktop", H, title=title, desc=desc + _prov("orcamento_comparativo"), heading=src["title"] + ": onde o deságio pesa", note=_note(n["revision"]), body=body,
                  carimbo=_desktop_carimbo(H, n["code"], pid, n["revision"], "Barras proporcionais em R$ mil"))


def p6_mobile(data: dict) -> str:
    src = data["orcamento_comparativo"]
    n = _p6_numbers(src)
    pid = "orcamento-comparativo"
    hid = S.hatch_id(f"{pid}-m")
    X0, XMAX = 24.0, 336.0
    vmax = _d(n["axis"]["max_brl_thousand"])
    X = lambda v: X0 + _d(v) / vmax * (XMAX - X0)  # noqa: E731
    body = [S.hatch_defs(f"{pid}-m")]
    y0, pitch, bar_h = 84, 78, 14
    focus = None
    for i, it in enumerate(n["items"]):
        y = y0 + i * pitch
        if it["focus"]:
            body.append(rect(14, y - 18, MOBILE_W - 28, pitch - 6, fill=LIME, fill_opacity=".35"))
            focus = (it, y)
        body.append(text(X0, y - 4, f"{it['label_pt_br']} · −{it['difference_percent']}%", size=FS_M, weight=S.FW_LABEL, fill=GREEN if it["focus"] else INK))
        body.append(rect(X0, y, X(it["reference_brl_thousand"]) - X0, bar_h, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
        body.append(text(X(it["reference_brl_thousand"]) + 5, y + 11, br(it["reference_brl_thousand"], 0), size=FS_M))
        y2 = y + bar_h + 4
        body.append(rect(X0, y2, X(it["proposal_brl_thousand"]) - X0, bar_h, fill=GREEN))
        body.append(rect(X(it["proposal_brl_thousand"]), y2, X(it["reference_brl_thousand"]) - X(it["proposal_brl_thousand"]), bar_h, fill=f"url(#{hid})", stroke=MUTED, stroke_width=fmt(S.SW_DIM)))
        body.append(text(X(it["reference_brl_thousand"]) + 5, y2 + 11, br(it["proposal_brl_thousand"], 0), size=FS_M, fill=GREEN))
    it, yf = focus
    c1 = (X(it["reference_brl_thousand"]) + 70, yf + 8)
    body.append(leader(*c1, (X(it["proposal_brl_thousand"]) + X(it["reference_brl_thousand"])) / 2, yf + bar_h + 4 + bar_h / 2))
    body.append(callout(*c1, 1, size=FS_M))
    body.append(text(20, 322, f"1 {it['label_pt_br']}: −{it['difference_percent']}% (−{br(it['difference_brl_thousand'], 0)} mil), o item de risco", size=FS_M))
    body.append(text(20, 340, "Barra clara: referência · verde: proposta · R$ mil", size=FS_M, fill=MUTED))
    body.append(text(20, 358, "Premissas sintéticas · sem edital de cliente", size=FS_M, fill=MUTED))
    title = f"Prancha {n['code']} (móvel) · {src['title']} · exemplo demonstrativo"
    desc = (
        "Barras empilhadas por item, referência sobre proposta: "
        + "; ".join(f"{x['label_pt_br']} −{x['difference_percent']}%" for x in n["items"])
        + f". Item em foco: {it['label_pt_br']}. Exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "mobile", MOBILE_H, title=title, desc=desc + _prov("orcamento_comparativo"), heading=src["title"], note="", body=body,
                  carimbo=_mobile_carimbo(f"{n['code']}-M", pid, n["revision"], ("Barras em R$ mil", "proporcionais")), heading_size=14)


# ---------------------------------------------------------------------------
# P7 · carteira-eventos
# ---------------------------------------------------------------------------


def _p7_numbers(src: dict) -> dict:
    cells = [c for ct in src["contracts"] for c in ct["cells"].values()]
    t = src["totals"]
    assert len(cells) == int(t["cells"]) and cells.count("OK") == int(t["cells_ok"]) and cells.count("PEND") == int(t["cells_pending"]) and cells.count("LAC") == int(t["cells_gap"])
    return {"contracts": src["contracts"], "events": src["events"], "states": src["states"], "totals": t, "revision": src["revision"], "code": src["sheet_code"]}


def _cell(x: float, y: float, w: float, h: float, state: str, hid: str) -> str:
    if state == "OK":
        return rect(x, y, w, h, fill=GREEN)
    if state == "PEND":
        return rect(x, y, w, h, fill=f"url(#{hid})", stroke=MUTED, stroke_width=fmt(S.SW_DIM))
    return rect(x, y, w, h, fill=WHITE, stroke=INK, stroke_width=fmt(S.SW_OUTLINE), stroke_dasharray="4 3")


def p7_desktop(data: dict) -> str:
    src = data["carteira_eventos"]
    n = _p7_numbers(src)
    pid, H = "carteira-eventos", 560
    hid = S.hatch_id(f"{pid}-d")
    body = [S.hatch_defs(f"{pid}-d")]
    body.append(text(28, 72, f"{n['totals']['contracts']} contratos × {n['totals']['events_per_contract']} eventos · valor contratado em R$ milhões · cada célula é o estado do registro daquele evento", size=S.FS_LABEL, weight=S.FW_LABEL))
    CX0, CW, CG, RY0, RH, RG = 300.0, 110.0, 24.0, 124.0, 46.0, 18.0
    for j, ev in enumerate(n["events"]):
        body.append(text(CX0 + j * (CW + CG) + CW / 2, 108, ev["label_pt_br"], size=S.FS_LABEL, weight=S.FW_LABEL, anchor="middle"))
    focus = None
    for i, ct in enumerate(n["contracts"]):
        y = RY0 + i * (RH + RG)
        if ct["focus"]:
            body.append(rect(20, y - 8, DESK_W - 40, RH + 16, fill=LIME, fill_opacity=".35"))
            focus = (ct, y)
        body.append(text(CX0 - 24, y + 20, ct["label_pt_br"], size=S.FS_LABEL, weight=S.FW_LABEL, anchor="end", fill=GREEN if ct["focus"] else INK))
        body.append(text(CX0 - 24, y + 36, f"{ct['id']} · R$ {ct['value_brl_million']} mi", fill=MUTED, anchor="end"))
        for j, ev in enumerate(n["events"]):
            body.append(_cell(CX0 + j * (CW + CG), y, CW, RH, ct["cells"][ev["id"]], hid))
    # legend of states, right of the matrix
    LX = CX0 + 4 * (CW + CG) + 10
    body.append(text(LX, 108, "Estado", size=S.FS_LABEL, weight=S.FW_LABEL))
    for k, st in enumerate(n["states"]):
        yy = 124 + k * 26
        body.append(_cell(LX, yy, 22, 14, st["id"], hid))
        body.append(text(LX + 30, yy + 11, st["label_pt_br"], fill=MUTED))
    t = n["totals"]
    body.append(text(LX, 220, f"{t['cells']} células", size=S.FS_LABEL, weight=S.FW_LABEL))
    body.append(text(LX, 238, f"{t['cells_ok']} em dia · {t['cells_pending']} abertas · {t['cells_gap']} lacunas", fill=MUTED))
    ct, yf = focus
    body.append(text(LX, 268, f"{ct['label_pt_br']}: {t['focus_share_of_portfolio_percent']}% do valor", size=S.FS_LABEL, weight=S.FW_LABEL, fill=GREEN))
    body.append(text(LX, 286, "da carteira e as duas lacunas", fill=MUTED))
    c1 = (CX0 - 190, yf - 30)
    body.append(leader(*c1, CX0 - 140, yf + 4))
    body.append(callout(*c1, 1))
    c2 = (CX0 + CW + CG / 2, yf + RH / 2)
    body.append(leader(*c2, CX0 + CW, yf + RH / 2))
    body.append(callout(*c2, 2))
    pend_row = next(k for k, c in enumerate(n["contracts"]) if c["cells"]["PRZ"] == "PEND")
    px, py = CX0 + 3 * (CW + CG) + CW / 2, RY0 + pend_row * (RH + RG)
    c3 = (px + 40, py - 30)
    body.append(leader(*c3, px, py))
    body.append(callout(*c3, 3))
    body.append(_legend(28, 446, "Chamadas", [
        ("1", f"Contrato em foco: {ct['label_pt_br']} concentra {t['focus_share_of_portfolio_percent']}% do valor contratado ({t['focus_formula']}) e as únicas células sem registro. É por ele que o plano de 90 dias começa."),
        ("2", f"Lacuna de registro: medição e aditivo do {ct['label_pt_br']} não têm registro contemporâneo. Lacuna entra no diagnóstico como lacuna, não como estimativa."),
        ("3", "Evento aberto sem decisão: prazo ou aditivo identificado, sem posição formal da empresa. O mapa ordena o que decidir primeiro."),
    ]))
    title = f"Prancha {n['code']} · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Matriz de {t['contracts']} contratos hipotéticos por {t['events_per_contract']} eventos contratuais (medição, aditivo, reequilíbrio, prazo): {t['cells_ok']} células com registro em dia, {t['cells_pending']} eventos abertos sem decisão e {t['cells_gap']} lacunas de registro, "
        f"as duas no {ct['label_pt_br']} de R$ {ct['value_brl_million']} mi, {t['focus_share_of_portfolio_percent']}% da carteira. Carteira sintética; exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "desktop", H, title=title, desc=desc + _prov("carteira_eventos"), heading=src["title"] + ": onde a carteira perde controle", note=_note(n["revision"]), body=body,
                  carimbo=_desktop_carimbo(H, n["code"], pid, n["revision"], "Matriz contratos × eventos"))


def p7_mobile(data: dict) -> str:
    src = data["carteira_eventos"]
    n = _p7_numbers(src)
    pid = "carteira-eventos"
    hid = S.hatch_id(f"{pid}-m")
    body = [S.hatch_defs(f"{pid}-m")]
    CX0, CW, CG, RY0, RH, RG = 118.0, 44.0, 8.0, 96.0, 34.0, 12.0
    for j, ev in enumerate(n["events"]):
        body.append(text(CX0 + j * (CW + CG) + CW / 2, 84, ev["short_pt_br"], size=FS_M, weight=S.FW_LABEL, anchor="middle"))
    focus = None
    for i, ct in enumerate(n["contracts"]):
        y = RY0 + i * (RH + RG)
        if ct["focus"]:
            body.append(rect(14, y - 6, MOBILE_W - 28, RH + 12, fill=LIME, fill_opacity=".35"))
            focus = (ct, y)
        body.append(text(CX0 - 10, y + 14, ct["label_pt_br"], size=FS_M, weight=S.FW_LABEL, anchor="end", fill=GREEN if ct["focus"] else INK))
        body.append(text(CX0 - 10, y + 29, f"R$ {ct['value_brl_million']} mi", size=FS_M, fill=MUTED, anchor="end"))
        for j, ev in enumerate(n["events"]):
            body.append(_cell(CX0 + j * (CW + CG), y, CW, RH, ct["cells"][ev["id"]], hid))
    ct, yf = focus
    c1 = (CX0 + 4 * (CW + CG) - CG + 22, yf + RH / 2)
    body.append(leader(*c1, CX0 + 4 * (CW + CG) - CG, yf + RH / 2))
    body.append(callout(*c1, 1, size=FS_M))
    t = n["totals"]
    body.append(text(20, 300, f"1 {ct['label_pt_br']}: {t['focus_share_of_portfolio_percent']}% da carteira, {t['cells_gap']} lacunas de registro", size=FS_M))
    ly = 320
    for k, st in enumerate(n["states"]):
        body.append(_cell(20, ly + k * 18 - 10, 18, 12, st["id"], hid))
        body.append(text(44, ly + k * 18, st["label_pt_br"], size=FS_M, fill=MUTED))
    title = f"Prancha {n['code']} (móvel) · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Matriz de {t['contracts']} contratos por {t['events_per_contract']} eventos: {t['cells_ok']} em dia, {t['cells_pending']} abertos, {t['cells_gap']} lacunas, ambas no {ct['label_pt_br']} ({t['focus_share_of_portfolio_percent']}% da carteira). Exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "mobile", MOBILE_H, title=title, desc=desc + _prov("carteira_eventos"), heading=src["title"], note="", body=body,
                  carimbo=_mobile_carimbo(f"{n['code']}-M", pid, n["revision"], ("Matriz contratos", "× eventos")), heading_size=14)


# ---------------------------------------------------------------------------
# P8 · edital-checklist
# ---------------------------------------------------------------------------


def _p8_numbers(src: dict) -> dict:
    items = src["items"]
    s = src["summary"]
    verdicts = [it["verdict"] for it in items]
    assert len(items) == int(s["items"]) and verdicts.count("CRITICO") == int(s["critical"]) and verdicts.count("CONFIRMAR") == int(s["to_confirm"]) and verdicts.count("ATENDE") == int(s["meets"])
    crit = next(it for it in items if it["verdict"] == "CRITICO")
    assert Decimal(crit["requirement_m2"].replace(".", "")) - Decimal(crit["company_m2"].replace(".", "")) == Decimal(crit["gap_m2"].replace(".", ""))
    return {"items": items, "summary": s, "verdicts": src["verdicts"], "critical": crit, "revision": src["revision"], "code": src["sheet_code"]}


def _mark(x: float, y: float, size: float, verdict: str, hid: str) -> str:
    if verdict == "ATENDE":
        return rect(x, y, size, size, fill=GREEN) + path(f"M{fmt(x + size * 0.25)} {fmt(y + size * 0.52)}L{fmt(x + size * 0.44)} {fmt(y + size * 0.72)}L{fmt(x + size * 0.78)} {fmt(y + size * 0.3)}", fill="none", stroke=WHITE, stroke_width="1.6")
    if verdict == "CONFIRMAR":
        return rect(x, y, size, size, fill=f"url(#{hid})", stroke=MUTED, stroke_width=fmt(S.SW_DIM))
    return rect(x, y, size, size, fill=WHITE, stroke=GREEN, stroke_width=fmt(S.SW_CUT))


def p8_desktop(data: dict) -> str:
    src = data["edital_checklist"]
    n = _p8_numbers(src)
    pid, H = "edital-checklist", 560
    hid = S.hatch_id(f"{pid}-d")
    body = [S.hatch_defs(f"{pid}-d")]
    body.append(text(28, 72, "Edital sintético lido em quatro itens · o que o edital exige, o que a empresa tem, o que decide antes do preço", size=S.FS_LABEL, weight=S.FW_LABEL))
    XM, XI, XR, XC, XV = 40.0, 78.0, 400.0, 720.0, 985.0
    yh = 104
    for x, lab in ((XI, "Item"), (XR, "O edital exige"), (XC, "A empresa tem"), (XV, "Leitura")):
        body.append(text(x, yh, lab, size=S.FS_LABEL, weight=S.FW_LABEL, fill=MUTED))
    body.append(line(28, yh + 8, DESK_W - 28, yh + 8, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    y0, pitch, extra = 124, 60, 44
    vlabel = {v["id"]: v["label_pt_br"] for v in n["verdicts"]}
    crit_y = None
    conf_y = None
    y = y0
    for it in n["items"]:
        row_h = pitch + (extra if it["verdict"] == "CRITICO" else 0)
        if it["verdict"] == "CRITICO":
            body.append(rect(20, y - 10, DESK_W - 40, row_h - 4, fill=LIME, fill_opacity=".35"))
            crit_y = y
        if it["verdict"] == "CONFIRMAR" and conf_y is None:
            conf_y = y
        body.append(_mark(XM, y + 2, 16, it["verdict"], hid))
        body.append(text(XI, y + 14, it["label_pt_br"], size=S.FS_LABEL, weight=S.FW_LABEL, fill=GREEN if it["verdict"] == "CRITICO" else INK))
        body.append(text(XI, y + 30, it["id"], fill=MUTED))
        body.append(text(XR, y + 14, it["requirement_pt_br"]))
        body.append(text(XC, y + 14, it["company_pt_br"]))
        body.append(text(XV, y + 14, vlabel[it["verdict"]], size=S.FS_LABEL, weight=S.FW_LABEL, fill=GREEN if it["verdict"] == "CRITICO" else INK))
        body.append(line(28, y + row_h - 12, DESK_W - 28, y + row_h - 12, stroke=S.RULE, stroke_width="1"))
        y += row_h
    # proportional bars for the critical item: requirement vs company acervo
    crit = n["critical"]
    req, comp = _d(crit["requirement_m2"]), _d(crit["company_m2"])
    BX0, BW = XR, 300.0
    by = crit_y + 40
    body.append(rect(BX0, by, BW, 8, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    body.append(rect(BX0, by, BW * comp / req, 8, fill=GREEN))
    body.append(rect(BX0 + BW * comp / req, by, BW - BW * comp / req, 8, fill=f"url(#{hid})"))
    body.append(dim_group(dim_h(BX0 + BW * comp / req, BX0 + BW, by + 24, f"{crit['gap_m2']} m² faltantes", above=False)))
    body.append(text(BX0 + BW + 12, by + 8, f"{crit['company_m2']} de {crit['requirement_m2']} m²", size=S.FS_LABEL, weight=S.FW_LABEL, fill=GREEN))
    c1 = (XM + 8, crit_y + 46)
    body.append(leader(*c1, XM + 8, crit_y + 18))
    body.append(callout(*c1, 1))
    c2 = (BX0 - 40, by + 4)
    body.append(leader(*c2, BX0 + BW * comp / req + 6, by + 4))
    body.append(callout(*c2, 2))
    c3 = (XV - 24, conf_y + 10)
    body.append(leader(*c3, XV - 4, conf_y + 10))
    body.append(callout(*c3, 3))
    s = n["summary"]
    body.append(_legend(28, 424, "Chamadas", [
        ("1", f"Item crítico: o edital exige {crit['requirement_pt_br']}; {crit['company_pt_br']}. Decide antes do preço: sem consórcio, subcontratação admitida ou esclarecimento, a proposta não passa da habilitação."),
        ("2", f"Diferença de acervo: {crit['requirement_m2']} − {crit['company_m2']} = {crit['gap_m2']} m². O diagnóstico registra o número e a pergunta que cabe ao órgão, não promete habilitação."),
        ("3", f"Confirmar antes do preço: {s['to_confirm']} itens dependem de leitura do orçamento de referência e do cronograma. {s['items']} itens lidos · {s['critical']} crítico · {s['meets']} atende."),
    ]))
    title = f"Prancha {n['code']} · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Checklist de {s['items']} itens de um edital sintético: habilitação jurídica atende; acervo técnico é o item crítico ({crit['company_m2']} m² contra {crit['requirement_m2']} m² exigidos, {crit['gap_m2']} m² faltantes); "
        f"orçamento de referência e prazo de execução ficam para confirmar antes do preço. Edital sintético; exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "desktop", H, title=title, desc=desc + _prov("edital_checklist"), heading=src["title"] + ": o item crítico decide antes do preço", note=_note(n["revision"]), body=body,
                  carimbo=_desktop_carimbo(H, n["code"], pid, n["revision"], "Checklist · barra proporcional em m²"))


def p8_mobile(data: dict) -> str:
    src = data["edital_checklist"]
    n = _p8_numbers(src)
    pid = "edital-checklist"
    hid = S.hatch_id(f"{pid}-m")
    body = [S.hatch_defs(f"{pid}-m")]
    XM, XI = 22.0, 50.0
    y0, pitch, extra = 72, 54, 26
    vshort = {"ATENDE": "atende", "CONFIRMAR": "confirmar", "CRITICO": "crítico"}
    crit = n["critical"]
    crit_y = None
    y = y0
    for it in n["items"]:
        row_h = pitch + (extra if it["verdict"] == "CRITICO" else 0)
        if it["verdict"] == "CRITICO":
            body.append(rect(14, y - 6, MOBILE_W - 28, row_h - 2, fill=LIME, fill_opacity=".35"))
            crit_y = y
        body.append(_mark(XM, y + 2, 14, it["verdict"], hid))
        body.append(text(XI, y + 13, f"{it['label_pt_br']} · {vshort[it['verdict']]}", size=FS_M, weight=S.FW_LABEL, fill=GREEN if it["verdict"] == "CRITICO" else INK))
        body.append(text(XI, y + 30, it["requirement_pt_br"], size=FS_M, fill=MUTED))
        if it["verdict"] == "CRITICO":
            req, comp = _d(it["requirement_m2"]), _d(it["company_m2"])
            BW = 150.0
            body.append(rect(XI, y + 40, BW, 6, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
            body.append(rect(XI, y + 40, BW * comp / req, 6, fill=GREEN))
            body.append(rect(XI + BW * comp / req, y + 40, BW - BW * comp / req, 6, fill=f"url(#{hid})"))
            body.append(text(XI + BW + 8, y + 47, f"{it['company_m2']} de {it['requirement_m2']} m²", size=FS_M, fill=GREEN, weight=S.FW_LABEL))
            c1 = (XI + BW - 20, y + 66)
            body.append(leader(*c1, XI + BW * comp / req + (BW - BW * comp / req) / 2, y + 46))
        y += row_h
    body.append(callout(*c1, 1, size=FS_M))
    s = n["summary"]
    body.append(text(20, 322, f"1 Crítico: faltam {crit['gap_m2']} m² de acervo; decide antes do preço", size=FS_M))
    body.append(text(20, 340, f"{s['items']} itens · {s['critical']} crítico · {s['to_confirm']} a confirmar · {s['meets']} atende", size=FS_M, fill=MUTED))
    body.append(text(20, 358, "Edital sintético · não promete habilitação", size=FS_M, fill=MUTED))
    title = f"Prancha {n['code']} (móvel) · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Checklist de {s['items']} itens: o acervo técnico é o item crítico ({crit['company_m2']} de {crit['requirement_m2']} m², faltam {crit['gap_m2']} m²); {s['to_confirm']} itens a confirmar e {s['meets']} atende. Exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "mobile", MOBILE_H, title=title, desc=desc + _prov("edital_checklist"), heading=src["title"], note="", body=body,
                  carimbo=_mobile_carimbo(f"{n['code']}-M", pid, n["revision"], ("Checklist técnico", "do edital")), heading_size=14)


# ---------------------------------------------------------------------------
# P9 · reequilibrio-curva
# ---------------------------------------------------------------------------


def _p9_numbers(src: dict) -> dict:
    series = src["cost_series"]
    ms = {m["id"]: m for m in src["milestones"]}
    by_month = {p["month"]: p["index"] for p in series}
    for m in src["milestones"]:
        assert by_month[m["month"]] == m["index"], m["id"]
    exp = src["expected_series"]["points"]
    imb = src["imbalance"]
    assert Decimal(by_month[imb["to_month"]]) - Decimal(exp[-1]["index"]) == Decimal(imb["peak_points"])
    return {"series": series, "ms": ms, "exp": exp, "imb": imb, "axis": src["axis"], "step": src["expected_series"]["monthly_step"], "revision": src["revision"], "code": src["sheet_code"]}


def _p9_geometry(n: dict, X, Y) -> dict:
    pts = [(X(p["month"]), Y(p["index"])) for p in n["series"]]
    exp = [(X(p["month"]), Y(p["index"])) for p in n["exp"]]
    d_cost = "M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in pts)
    d_exp = f"M{fmt(exp[0][0])} {fmt(exp[0][1])}L{fmt(exp[1][0])} {fmt(exp[1][1])}"
    seg = [(x, y) for (x, y), p in zip(pts, n["series"]) if int(n["imb"]["from_month"]) <= int(p["month"]) <= int(n["imb"]["to_month"])]
    d_area = "M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in seg) + f"L{fmt(exp[1][0])} {fmt(exp[1][1])}L{fmt(exp[0][0])} {fmt(exp[0][1])}Z"
    return {"pts": pts, "exp": exp, "d_cost": d_cost, "d_exp": d_exp, "d_area": d_area}


def p9_desktop(data: dict) -> str:
    src = data["reequilibrio_curva"]
    n = _p9_numbers(src)
    pid, H = "reequilibrio-curva", 560
    hid = S.hatch_id(f"{pid}-d")
    X0, XMAX, YB, YT = 110.0, 1000.0, 396.0, 110.0
    imin, imax = _d(n["axis"]["index_min"]), _d(n["axis"]["index_max"])
    tmax = _d(n["series"][-1]["month"])
    X = lambda m: X0 + _d(m) / tmax * (XMAX - X0)  # noqa: E731
    Y = lambda v: YB - (_d(v) - imin) / (imax - imin) * (YB - YT)  # noqa: E731
    g = _p9_geometry(n, X, Y)
    body = [S.hatch_defs(f"{pid}-d")]
    body.append(text(28, 72, "Série sintética de custo de um insumo, base 100 na data-base da proposta · o que o dossiê precisa demonstrar por item e período", size=S.FS_LABEL, weight=S.FW_LABEL))
    body.append(path(g["d_area"], fill=LIME, fill_opacity=".35"))
    body.append(path(g["d_area"], fill=f"url(#{hid})", stroke="none"))
    # axes
    body.append(line(X0, YB, XMAX, YB, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    body.append(line(X0, YB, X0, YT - 10, stroke=MUTED, stroke_width=fmt(S.SW_DIM)))
    for m in n["axis"]["months"]:
        body.append(line(X(m), YB, X(m), YB + 6, stroke=INK, stroke_width=fmt(S.SW_DIM)))
        body.append(text(X(m), YB + 20, m, fill=MUTED, anchor="middle"))
    body.append(text(XMAX, YB + 36, "meses desde a data-base", fill=MUTED, anchor="end"))
    for t in n["axis"]["index_ticks"]:
        body.append(line(X0 - 6, Y(t), X0, Y(t), stroke=MUTED, stroke_width=fmt(S.SW_DIM)))
        body.append(text(X0 - 10, Y(t) + 4, t, fill=MUTED, anchor="end"))
        body.append(line(X0, Y(t), XMAX, Y(t), stroke=S.RULE, stroke_width="1"))
    # milestones
    short = {"DB": "Data-base da proposta", "EVT": "Evento: alta atípica do insumo", "PLT": "Protocolo do pedido", "ANV": "Aniversário: reajuste ordinário"}
    for key in ("DB", "EVT", "PLT", "ANV"):
        m = n["ms"][key]
        body.append(line(X(m["month"]), YT - 4, X(m["month"]), YB, stroke=MUTED, stroke_width=fmt(S.SW_DIM), stroke_dasharray="4 3"))
        if key == "PLT":
            body.append(text(X(m["month"]) - 5, YB - 8, f"{short[key]} · mês {m['month']}", size=S.FS_DIM, fill=MUTED, anchor="end"))
        else:
            body.append(text(X(m["month"]) + (5 if key == "DB" else -5), YT - 8, f"{short[key]} · mês {m['month']}", size=S.FS_DIM, fill=MUTED, anchor="start" if key == "DB" else "end"))
    body.append(path(g["d_exp"], fill="none", stroke=MUTED, stroke_width=fmt(S.SW_OUTLINE), stroke_dasharray="6 4"))
    body.append(path(g["d_cost"], fill="none", stroke=INK, stroke_width=fmt(S.SW_CUT)))
    for (x, y), p in zip(g["pts"], n["series"]):
        if p["month"] in (n["ms"]["EVT"]["month"], n["ms"]["ANV"]["month"], n["ms"]["DB"]["month"]):
            body.append(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="4" fill="{INK}"/>')
            is_anv = p["month"] == n["ms"]["ANV"]["month"]
            is_evt = p["month"] == n["ms"]["EVT"]["month"]
            body.append(text(x + (8 if not is_anv else -8), y + (20 if is_evt else -8), f"índice {p['index']}", size=S.FS_LABEL, weight=S.FW_LABEL, anchor="end" if is_anv else "start"))
    body.append(text(g["exp"][1][0] - 6, g["exp"][1][1] + 16, f"tendência {n['exp'][1]['index']}", fill=MUTED, anchor="end"))
    body.append(dim_group(dim_v(g["pts"][-1][1], g["exp"][1][1], XMAX + 70, f"{n['imb']['peak_points']} pontos", left=False)))
    evt = n["ms"]["EVT"]
    c1 = (X(evt["month"]) - 60, Y(evt["index"]) - 50)
    body.append(leader(*c1, X(evt["month"]), Y(evt["index"])))
    body.append(callout(*c1, 1))
    mid_m = (int(n["imb"]["from_month"]) + int(n["imb"]["to_month"])) / 2
    mid_y = (Y(n["series"][int(mid_m)]["index"]) + (g["exp"][0][1] + g["exp"][1][1]) / 2) / 2
    c2 = (X(mid_m) - 90, mid_y + 70)
    body.append(leader(*c2, X(mid_m), mid_y))
    body.append(callout(*c2, 2))
    anv = n["ms"]["ANV"]
    c3 = (XMAX + 30, Y(anv["index"]) + 34)
    body.append(leader(*c3, X(anv["month"]), Y(anv["index"])))
    body.append(callout(*c3, 3))
    body.append(_legend(28, 446, "Chamadas", [
        ("1", f"{evt['label_pt_br']} no mês {evt['month']} (índice {evt['index']}): é o fato posterior à proposta. Sem evento, matriz de riscos e nexo, aumento genérico de custo não é reequilíbrio."),
        ("2", f"{n['imb']['label_pt_br']}: {n['imb']['note_pt_br']}; no mês {n['imb']['to_month']} a diferença chega a {n['imb']['peak_points']} pontos ({n['imb']['peak_formula']})."),
        ("3", f"{anv['label_pt_br']} no mês {anv['month']}: atualiza pela fórmula da cláusula na data-base e não recompõe o que aconteceu antes dele. Não é o mesmo instituto."),
    ]))
    title = f"Prancha {n['code']} · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Curva sintética do índice de custo de um insumo, base {n['ms']['DB']['index']} na data-base: sobe {n['step']} ponto por mês até o evento do mês {evt['month']} (índice {evt['index']}) e chega a {anv['index']} no mês {anv['month']}; "
        f"a tendência anterior chegaria a {n['exp'][1]['index']}. A área hachurada entre as duas linhas, do mês {n['imb']['from_month']} ao {n['imb']['to_month']}, é o desequilíbrio a demonstrar, com pico de {n['imb']['peak_points']} pontos. "
        "Série sintética; exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "desktop", H, title=title, desc=desc + _prov("reequilibrio_curva"), heading=src["title"], note=_note(n["revision"]), body=body,
                  carimbo=_desktop_carimbo(H, n["code"], pid, n["revision"], "Meses × índice de custo (base 100)"))


def p9_mobile(data: dict) -> str:
    src = data["reequilibrio_curva"]
    n = _p9_numbers(src)
    pid = "reequilibrio-curva"
    hid = S.hatch_id(f"{pid}-m")
    X0, XMAX, YB, YT = 50.0, 322.0, 262.0, 88.0
    imin, imax = _d(n["axis"]["index_min"]), _d(n["axis"]["index_max"])
    tmax = _d(n["series"][-1]["month"])
    X = lambda m: X0 + _d(m) / tmax * (XMAX - X0)  # noqa: E731
    Y = lambda v: YB - (_d(v) - imin) / (imax - imin) * (YB - YT)  # noqa: E731
    g = _p9_geometry(n, X, Y)
    body = [S.hatch_defs(f"{pid}-m")]
    body.append(path(g["d_area"], fill=LIME, fill_opacity=".35"))
    body.append(path(g["d_area"], fill=f"url(#{hid})", stroke="none"))
    body.append(line(X0, YB, XMAX, YB, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    for m in n["axis"]["months"]:
        body.append(line(X(m), YB, X(m), YB + 5, stroke=INK, stroke_width=fmt(S.SW_DIM)))
        body.append(text(X(m), YB + 18, m, size=FS_M, fill=MUTED, anchor="middle"))
    for t in n["axis"]["index_ticks"]:
        body.append(text(X0 - 6, Y(t) + 4, t, size=FS_M, fill=MUTED, anchor="end"))
        body.append(line(X0, Y(t), XMAX, Y(t), stroke=S.RULE, stroke_width="1"))
    evt, anv = n["ms"]["EVT"], n["ms"]["ANV"]
    for m in (evt, anv):
        body.append(line(X(m["month"]), YT - 4, X(m["month"]), YB, stroke=MUTED, stroke_width=fmt(S.SW_DIM), stroke_dasharray="4 3"))
    body.append(path(g["d_exp"], fill="none", stroke=MUTED, stroke_width=fmt(S.SW_OUTLINE), stroke_dasharray="6 4"))
    body.append(path(g["d_cost"], fill="none", stroke=INK, stroke_width=fmt(S.SW_CUT)))
    body.append(f'<circle cx="{fmt(X(evt["month"]))}" cy="{fmt(Y(evt["index"]))}" r="3.5" fill="{INK}"/>')
    body.append(f'<circle cx="{fmt(X(anv["month"]))}" cy="{fmt(Y(anv["index"]))}" r="3.5" fill="{INK}"/>')
    body.append(text(X(anv["month"]) - 6, Y(anv["index"]) - 6, f"índice {anv['index']}", size=FS_M, weight=S.FW_LABEL, anchor="end"))
    body.append(text(X(anv["month"]) - 6, g["exp"][1][1] + 32, f"tendência {n['exp'][1]['index']}", size=FS_M, fill=MUTED, anchor="end"))
    c1 = (X(evt["month"]) - 30, Y(evt["index"]) - 34)
    body.append(leader(*c1, X(evt["month"]), Y(evt["index"])))
    body.append(callout(*c1, 1, size=FS_M))
    mid_m = (int(n["imb"]["from_month"]) + int(n["imb"]["to_month"])) / 2
    mid_y = (Y(n["series"][int(mid_m)]["index"]) + (g["exp"][0][1] + g["exp"][1][1]) / 2) / 2
    c2 = (X(mid_m) + 30, mid_y + 58)
    body.append(leader(*c2, X(mid_m), mid_y))
    body.append(callout(*c2, 2, size=FS_M))
    body.append(text(20, 306, f"1 Evento no mês {evt['month']}: alta atípica do insumo (índice {evt['index']})", size=FS_M))
    body.append(text(20, 324, f"2 Desequilíbrio a demonstrar: até {n['imb']['peak_points']} pontos no mês {anv['month']}", size=FS_M))
    body.append(text(20, 342, f"Aniversário no mês {anv['month']}: reajuste não recompõe o antes", size=FS_M, fill=MUTED))
    body.append(text(20, 360, "Série sintética · base 100 · sem promessa de deferimento", size=FS_M, fill=MUTED))
    title = f"Prancha {n['code']} (móvel) · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Índice de custo base {n['ms']['DB']['index']}: evento no mês {evt['month']} (índice {evt['index']}), {anv['index']} no mês {anv['month']} contra tendência {n['exp'][1]['index']}; desequilíbrio hachurado de até {n['imb']['peak_points']} pontos. Exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "mobile", MOBILE_H, title=title, desc=desc + _prov("reequilibrio_curva"), heading="Índice de custo × data-base", note="", body=body,
                  carimbo=_mobile_carimbo(f"{n['code']}-M", pid, n["revision"], ("Meses × índice", "base 100")), heading_size=14)


RENDERERS = {
    ("aditivo-limite", "desktop"): p5_desktop,
    ("aditivo-limite", "mobile"): p5_mobile,
    ("orcamento-comparativo", "desktop"): p6_desktop,
    ("orcamento-comparativo", "mobile"): p6_mobile,
    ("carteira-eventos", "desktop"): p7_desktop,
    ("carteira-eventos", "mobile"): p7_mobile,
    ("edital-checklist", "desktop"): p8_desktop,
    ("edital-checklist", "mobile"): p8_mobile,
    ("reequilibrio-curva", "desktop"): p9_desktop,
    ("reequilibrio-curva", "mobile"): p9_mobile,
}
