"""Plates of the safe-execution pillars (lote B, onda 2, SALTO-INSTITUCIONAL-02).

Same contract as ``family_b2g.py``: one plate per route, rendered from a
demonstrative JSON under ``data/demonstrative/plates/``; every numeral on a
sheet comes from its source JSON, desktop and mobile are distinct compositions,
palette, strokes and title block come from ``sheet.py``.

    P10 risco-margem      risk matrix per contract event (defesa de margem)
    P11 matriz-alegacoes  allegation matrix of a notification (defesa técnica)
    P12 janela-causal     causal window on the critical path (atrasos)
"""

from __future__ import annotations

from pathlib import Path

from scripts.demonstrative.plates import sheet as S
from scripts.demonstrative.plates.sheet import (
    GREEN,
    INK,
    LIME,
    MUTED,
    SOFT,
    WHITE,
    callout,
    dim_group,
    dim_h,
    fmt,
    leader,
    line,
    path,
    rect,
    text,
)

SOURCES = {
    "risco_margem": Path("data/demonstrative/plates/risco-margem.v1.json"),
    "matriz_alegacoes": Path("data/demonstrative/plates/matriz-alegacoes.v1.json"),
    "janela_causal": Path("data/demonstrative/plates/janela-causal.v1.json"),
}
PLATE_SOURCES = {
    "risco-margem": ("risco_margem",),
    "matriz-alegacoes": ("matriz_alegacoes",),
    "janela-causal": ("janela_causal",),
}
MOBILE_W, MOBILE_H = 360, 420
FS_M = 12.5
DESK_W = 1200


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


def _mark(x: float, y: float, w: float, h: float, state: str, hid: str) -> str:
    """Three states: solid green (documented), hatched (partial), dashed empty (missing)."""
    if state in ("SIM", "CONTROVERTIDO"):
        return rect(x, y, w, h, fill=GREEN)
    if state in ("PARCIAL", "ADMITIDO_PARTE"):
        return rect(x, y, w, h, fill=f"url(#{hid})", stroke=MUTED, stroke_width=fmt(S.SW_DIM))
    return rect(x, y, w, h, fill=WHITE, stroke=INK, stroke_width=fmt(S.SW_OUTLINE), stroke_dasharray="4 3")


# ---------------------------------------------------------------------------
# P10 · risco-margem
# ---------------------------------------------------------------------------


def _p10_numbers(src: dict) -> dict:
    ev = src["events"]
    t = src["totals"]
    impacts = {e["id"]: int(e["impact_brl_thousand"]) for e in ev}
    assert len(ev) == int(t["events"])
    assert sum(impacts.values()) == int(t["impact_total_brl_thousand"])
    assert sum(int(e["impact_brl_thousand"]) for e in ev if e["proof"] == "SIM") == int(t["impact_with_proof_brl_thousand"])
    assert sum(int(e["impact_brl_thousand"]) for e in ev if e["proof"] == "PARCIAL") == int(t["impact_partial_brl_thousand"])
    assert sum(int(e["impact_brl_thousand"]) for e in ev if e["proof"] == "NAO") == int(t["impact_without_proof_brl_thousand"])
    assert min(int(e["deadline_days"]) for e in ev) == int(t["shortest_deadline_days"])
    focus = next(e for e in ev if e["focus"])
    assert focus["impact_brl_thousand"] == str(max(impacts.values()))
    return {"events": ev, "totals": t, "focus": focus, "decisions": {d["id"]: d["label_pt_br"] for d in src["decisions"]},
            "proofs": src["proof_states"], "revision": src["revision"], "code": src["sheet_code"]}


def p10_desktop(data: dict) -> str:
    src = data["risco_margem"]
    n = _p10_numbers(src)
    pid, H = "risco-margem", 560
    hid = S.hatch_id(f"{pid}-d")
    body = [S.hatch_defs(f"{pid}-d")]
    t = n["totals"]
    body.append(text(28, 72, f"{t['events']} eventos de um contrato hipotético · prazo em dias corridos · impacto potencial em R$ mil · prova = registro contemporâneo", size=S.FS_LABEL, weight=S.FW_LABEL))
    XM, XE, XP, XB, BW, XPR, XD = 40.0, 78.0, 330.0, 420.0, 300.0, 780.0, 990.0
    yh = 104
    for x, lab in ((XE, "Evento"), (XP, "Prazo"), (XB, "Impacto potencial (R$ mil)"), (XPR, "Prova e lacuna"), (XD, "Decisão")):
        body.append(text(x, yh, lab, size=S.FS_LABEL, weight=S.FW_LABEL, fill=MUTED))
    body.append(line(28, yh + 8, DESK_W - 28, yh + 8, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    y0, pitch = 124, 56
    maxi = max(int(e["impact_brl_thousand"]) for e in n["events"])
    ys: dict[str, float] = {}
    for i, e in enumerate(n["events"]):
        y = y0 + i * pitch
        ys[e["id"]] = y
        if e["focus"]:
            body.append(rect(20, y - 10, DESK_W - 40, pitch - 4, fill=LIME, fill_opacity=".35"))
        body.append(_mark(XM, y + 2, 16, 16, e["proof"], hid))
        col = GREEN if e["focus"] else INK
        body.append(text(XE, y + 14, e["label_pt_br"], size=S.FS_LABEL, weight=S.FW_LABEL, fill=col))
        body.append(text(XE, y + 30, e["id"], fill=MUTED))
        body.append(text(XP, y + 14, f"{e['deadline_days']} dias", size=S.FS_LABEL, weight=S.FW_LABEL, fill=GREEN if e["deadline_days"] == t["shortest_deadline_days"] else INK))
        w = BW * int(e["impact_brl_thousand"]) / maxi
        body.append(rect(XB, y + 4, BW, 10, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
        body.append(rect(XB, y + 4, w, 10, fill=GREEN if e["proof"] == "SIM" else (f"url(#{hid})" if e["proof"] == "PARCIAL" else WHITE)))
        body.append(text(XB + BW + 12, y + 14, f"{e['impact_brl_thousand']}", size=S.FS_LABEL, weight=S.FW_LABEL))
        body.append(text(XPR, y + 14, next(p["label_pt_br"] for p in n["proofs"] if p["id"] == e["proof"]), size=S.FS_LABEL, weight=S.FW_LABEL))
        body.append(text(XPR, y + 30, f"Lacuna: {e['gap_pt_br']}", fill=MUTED))
        body.append(text(XD, y + 14, n["decisions"][e["decision"]].upper(), size=S.FS_LABEL, weight=S.FW_LABEL, fill=col))
        body.append(line(28, y + pitch - 12, DESK_W - 28, y + pitch - 12, stroke=S.RULE, stroke_width="1"))
    f = n["focus"]
    yf = ys[f["id"]]
    c1 = (XD + 150, yf + 8)
    body.append(leader(*c1, XD + 90, yf + 10))
    body.append(callout(*c1, 1))
    reg = next(e for e in n["events"] if e["decision"] == "REGISTRAR")
    c2 = (XP + 60, ys[reg["id"]] + 8)
    body.append(leader(*c2, XP + 44, ys[reg["id"]] + 10))
    body.append(callout(*c2, 2))
    npl = next(e for e in n["events"] if e["decision"] == "NAO_PLEITEAR")
    c3 = (XM + 8, ys[npl["id"]] + 40)
    body.append(leader(*c3, XM + 8, ys[npl["id"]] + 20))
    body.append(callout(*c3, 3))
    body.append(_legend(28, 424, "Chamadas", [
        ("1", f"Evento priorizado: {f['label_pt_br']} concentra R$ {f['impact_brl_thousand']} mil com registro contemporâneo; a direção decide primeiro por ele. Com prova: R$ {t['impact_with_proof_brl_thousand']} mil ({t['formula']})."),
        ("2", f"Prazo mais curto: {reg['label_pt_br']} tem {reg['deadline_days']} dias e registro parcial; a decisão é registrar (falta {reg['gap_pt_br']}), não quantificar antes da prova."),
        ("3", f"Não pleitear: {npl['label_pt_br']} soma R$ {npl['impact_brl_thousand']} mil sem registro e sem critério; entra como lacuna declarada, não como estimativa. Total potencial: R$ {t['impact_total_brl_thousand']} mil."),
    ]))
    title = f"Prancha {n['code']} · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Matriz de {t['events']} eventos de um contrato hipotético: prazo, impacto potencial em R$ mil, prova e decisão por evento. {f['label_pt_br']} (R$ {f['impact_brl_thousand']} mil, com registro) é priorizado; "
        f"R$ {t['impact_with_proof_brl_thousand']} mil têm registro contemporâneo, R$ {t['impact_partial_brl_thousand']} mil registro parcial e R$ {t['impact_without_proof_brl_thousand']} mil nenhum. Valores sintéticos; exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "desktop", H, title=title, desc=desc + _prov("risco_margem"), heading=src["title"] + ": o que priorizar, registrar, quantificar ou não pleitear", note=_note(n["revision"]), body=body,
                  carimbo=_desktop_carimbo(H, n["code"], pid, n["revision"], "Matriz eventos × decisão · barra proporcional em R$ mil"))


def p10_mobile(data: dict) -> str:
    src = data["risco_margem"]
    n = _p10_numbers(src)
    pid = "risco-margem"
    hid = S.hatch_id(f"{pid}-m")
    body = [S.hatch_defs(f"{pid}-m")]
    t = n["totals"]
    XM, XE, XB, BW = 20.0, 44.0, 44.0, 136.0
    y0, pitch = 64, 50
    maxi = max(int(e["impact_brl_thousand"]) for e in n["events"])
    yf = None
    for i, e in enumerate(n["events"]):
        y = y0 + i * pitch
        if e["focus"]:
            body.append(rect(14, y - 6, MOBILE_W - 28, pitch - 2, fill=LIME, fill_opacity=".35"))
            yf = y
        body.append(_mark(XM, y + 1, 14, 14, e["proof"], hid))
        body.append(text(XE, y + 12, f"{e['short_pt_br']} · {e['deadline_days']} dias", size=FS_M, weight=S.FW_LABEL, fill=GREEN if e["focus"] else INK))
        w = BW * int(e["impact_brl_thousand"]) / maxi
        body.append(rect(XB, y + 20, BW, 6, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
        body.append(rect(XB, y + 20, w, 6, fill=GREEN if e["proof"] == "SIM" else (f"url(#{hid})" if e["proof"] == "PARCIAL" else WHITE)))
        body.append(text(XB + BW + 8, y + 27, f"{e['impact_brl_thousand']}", size=FS_M, weight=S.FW_LABEL))
        body.append(text(XB + BW + 40, y + 27, n["decisions"][e["decision"]].upper(), size=FS_M, fill=GREEN if e["focus"] else MUTED))
    f = n["focus"]
    c1 = (MOBILE_W - 30, yf - 4)
    body.append(leader(*c1, XB + BW - 10, yf + 23))
    body.append(callout(*c1, 1, size=FS_M))
    body.append(text(20, 324, f"1 Priorizar {f['short_pt_br']}: R$ {f['impact_brl_thousand']} mil com registro", size=FS_M))
    body.append(text(20, 342, f"Com prova R$ {t['impact_with_proof_brl_thousand']} mil · parcial R$ {t['impact_partial_brl_thousand']} mil", size=FS_M, fill=MUTED))
    body.append(text(20, 360, f"Sem prova R$ {t['impact_without_proof_brl_thousand']} mil · total R$ {t['impact_total_brl_thousand']} mil", size=FS_M, fill=MUTED))
    body.append(text(20, 378, "Impacto potencial não é valor devido", size=FS_M, fill=MUTED))
    title = f"Prancha {n['code']} (móvel) · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Matriz de {t['events']} eventos: {f['short_pt_br']} priorizado (R$ {f['impact_brl_thousand']} mil, com registro); R$ {t['impact_with_proof_brl_thousand']} mil com prova, R$ {t['impact_partial_brl_thousand']} mil parcial, R$ {t['impact_without_proof_brl_thousand']} mil sem prova. Exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "mobile", MOBILE_H, title=title, desc=desc + _prov("risco_margem"), heading=src["title"], note="", body=body,
                  carimbo=_mobile_carimbo(f"{n['code']}-M", pid, n["revision"], ("Eventos × decisão", "R$ mil")), heading_size=14)


# ---------------------------------------------------------------------------
# P11 · matriz-alegacoes
# ---------------------------------------------------------------------------


def _p11_numbers(src: dict) -> dict:
    al = src["allegations"]
    s = src["summary"]
    st = [a["status"] for a in al]
    assert len(al) == int(s["allegations"]) and st.count("CONTROVERTIDO") == int(s["controverted"]) and st.count("ADMITIDO_PARTE") == int(s["admitted_in_part"]) and st.count("SEM_REGISTRO") == int(s["without_record"])
    focus = next(a for a in al if a["focus"])
    assert int(focus["days_alleged"]) - int(focus["days_documented"]) == int(s["days_gap_focus"])
    d = src["deadline"]
    assert int(d["remaining_business_days"]) >= int(d["minimum_accept_business_days"])
    return {"allegations": al, "summary": s, "focus": focus, "deadline": d, "statuses": src["statuses"], "revision": src["revision"], "code": src["sheet_code"]}


def p11_desktop(data: dict) -> str:
    src = data["matriz_alegacoes"]
    n = _p11_numbers(src)
    pid, H = "matriz-alegacoes", 560
    hid = S.hatch_id(f"{pid}-d")
    body = [S.hatch_defs(f"{pid}-d")]
    d = n["deadline"]
    body.append(text(28, 72, f"Notificação hipotética com {n['summary']['allegations']} alegações · prazo de resposta {d['response_business_days']} dias úteis, restam {d['remaining_business_days']} · cada linha confronta alegação, obrigação, fato, medida e prova", size=S.FS_LABEL, weight=S.FW_LABEL))
    XM, XA, XO, XF, XP, XS = 40.0, 78.0, 300.0, 520.0, 760.0, 990.0
    yh = 104
    for x, lab in ((XA, "Alegação"), (XO, "Obrigação"), (XF, "Fato registrado"), (XP, "Prova e lacuna"), (XS, "Situação")):
        body.append(text(x, yh, lab, size=S.FS_LABEL, weight=S.FW_LABEL, fill=MUTED))
    body.append(line(28, yh + 8, DESK_W - 28, yh + 8, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    y0, pitch, extra = 124, 58, 42
    slabel = {s["id"]: s["label_pt_br"] for s in n["statuses"]}
    ys: dict[str, float] = {}
    y = y0
    for a in n["allegations"]:
        row_h = pitch + (extra if a["focus"] else 0)
        ys[a["id"]] = y
        if a["focus"]:
            body.append(rect(20, y - 10, DESK_W - 40, row_h - 4, fill=LIME, fill_opacity=".35"))
        body.append(_mark(XM, y + 2, 16, 16, a["status"], hid))
        col = GREEN if a["focus"] else INK
        body.append(text(XA, y + 14, a["label_pt_br"], size=S.FS_LABEL, weight=S.FW_LABEL, fill=col))
        body.append(text(XA, y + 30, a["id"], fill=MUTED))
        body.append(text(XO, y + 14, a["obligation_pt_br"]))
        body.append(text(XF, y + 14, a["fact_pt_br"]))
        body.append(text(XF, y + 30, f"Medida: {a['measure_pt_br']}", fill=MUTED))
        body.append(text(XP, y + 14, a["proof_pt_br"]))
        body.append(text(XP, y + 30, f"Lacuna: {a['gap_pt_br']}", fill=MUTED))
        body.append(text(XS, y + 14, slabel[a["status"]], size=S.FS_LABEL, weight=S.FW_LABEL, fill=col))
        if a["focus"]:
            # proportional bar: days alleged vs days documented as caused by the órgão
            alleged, doc = int(a["days_alleged"]), int(a["days_documented"])
            BX0, BW = XO, 400.0
            by = y + 44
            body.append(rect(BX0, by, BW, 8, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
            body.append(rect(BX0, by, BW * doc / alleged, 8, fill=GREEN))
            body.append(rect(BX0 + BW * doc / alleged, by, BW - BW * doc / alleged, 8, fill=f"url(#{hid})"))
            body.append(dim_group(dim_h(BX0 + BW * doc / alleged, BX0 + BW, by + 22, f"{n['summary']['days_gap_focus']} dias sem causa alheia documentada", above=False)))
            body.append(text(BX0 + BW + 12, by + 8, f"{doc} de {alleged} dias com registro", size=S.FS_LABEL, weight=S.FW_LABEL, fill=GREEN))
            bar_y = by
        body.append(line(28, y + row_h - 12, DESK_W - 28, y + row_h - 12, stroke=S.RULE, stroke_width="1"))
        y += row_h
    f = n["focus"]
    c1 = (XO - 40, bar_y + 4)
    body.append(leader(*c1, XO + 6, bar_y + 4))
    body.append(callout(*c1, 1))
    sem = next(a for a in n["allegations"] if a["status"] == "SEM_REGISTRO")
    c2 = (XM + 8, ys[sem["id"]] + 40)
    body.append(leader(*c2, XM + 8, ys[sem["id"]] + 20))
    body.append(callout(*c2, 2))
    adm = next(a for a in n["allegations"] if a["status"] == "ADMITIDO_PARTE")
    c3 = (XS + 170, ys[adm["id"]] + 8)
    body.append(leader(*c3, XS + 130, ys[adm["id"]] + 10))
    body.append(callout(*c3, 3))
    s = n["summary"]
    body.append(_legend(28, 430, "Chamadas", [
        ("1", f"Alegação principal: {f['label_pt_br']}; o diário e o ofício documentam {f['days_documented']} dias de frente bloqueada pelo órgão. Restam {s['days_gap_focus']} dias ({s['formula']}) que a resposta precisa explicar ou admitir."),
        ("2", f"Sem registro localizado: {sem['label_pt_br']}. A lacuna ({sem['gap_pt_br']}) entra declarada na matriz; a resposta não afirma o que não tem prova."),
        ("3", f"Admitido em parte: {adm['label_pt_br']}, {adm['fact_pt_br']}, com a medida adotada ({adm['measure_pt_br']}) e a prova ({adm['proof_pt_br']}). {s['allegations']} alegações · {s['controverted']} controvertidas · {s['admitted_in_part']} admitida em parte · {s['without_record']} sem registro."),
    ]))
    title = f"Prancha {n['code']} · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Matriz de {s['allegations']} alegações de uma notificação hipotética: {s['controverted']} controvertidas com prova, {s['admitted_in_part']} admitida em parte, {s['without_record']} sem registro localizado. "
        f"Na alegação principal, {f['days_documented']} de {f['days_alleged']} dias têm registro de frente bloqueada pelo órgão; {s['days_gap_focus']} dias ficam para explicar. Prazo de {d['response_business_days']} dias úteis, restam {d['remaining_business_days']}. Notificação sintética; exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "desktop", H, title=title, desc=desc + _prov("matriz_alegacoes"), heading=src["title"] + ": o que é controvertido, admitido ou sem registro", note=_note(n["revision"]), body=body,
                  carimbo=_desktop_carimbo(H, n["code"], pid, n["revision"], "Matriz alegação × prova · barra proporcional em dias"))


def p11_mobile(data: dict) -> str:
    src = data["matriz_alegacoes"]
    n = _p11_numbers(src)
    pid = "matriz-alegacoes"
    hid = S.hatch_id(f"{pid}-m")
    body = [S.hatch_defs(f"{pid}-m")]
    XM, XA = 22.0, 50.0
    y0, pitch, extra = 70, 52, 30
    sshort = {"CONTROVERTIDO": "controvertido", "ADMITIDO_PARTE": "admitido em parte", "SEM_REGISTRO": "sem registro"}
    y = y0
    c1 = None
    for a in n["allegations"]:
        row_h = pitch + (extra if a["focus"] else 0)
        if a["focus"]:
            body.append(rect(14, y - 6, MOBILE_W - 28, row_h - 2, fill=LIME, fill_opacity=".35"))
        body.append(_mark(XM, y + 2, 14, 14, a["status"], hid))
        body.append(text(XA, y + 13, f"{a['short_pt_br']} · {sshort[a['status']]}", size=FS_M, weight=S.FW_LABEL, fill=GREEN if a["focus"] else INK))
        body.append(text(XA, y + 30, f"Prova: {a['proof_pt_br']}", size=FS_M, fill=MUTED))
        if a["focus"]:
            alleged, doc = int(a["days_alleged"]), int(a["days_documented"])
            BW = 150.0
            body.append(rect(XA, y + 40, BW, 6, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
            body.append(rect(XA, y + 40, BW * doc / alleged, 6, fill=GREEN))
            body.append(rect(XA + BW * doc / alleged, y + 40, BW - BW * doc / alleged, 6, fill=f"url(#{hid})"))
            body.append(text(XA + BW + 8, y + 47, f"{doc} de {alleged} dias", size=FS_M, fill=GREEN, weight=S.FW_LABEL))
            c1 = (XA + BW - 20, y + 68)
            body.append(leader(*c1, XA + BW * doc / alleged + (BW - BW * doc / alleged) / 2, y + 46))
        y += row_h
    body.append(callout(*c1, 1, size=FS_M))
    s, d = n["summary"], n["deadline"]
    body.append(text(20, 318, f"1 Restam {s['days_gap_focus']} dias sem causa alheia documentada", size=FS_M))
    body.append(text(20, 336, f"{s['allegations']} alegações · {s['controverted']} controvertidas · {s['admitted_in_part']} admitida em parte", size=FS_M, fill=MUTED))
    body.append(text(20, 354, f"{s['without_record']} sem registro · prazo {d['response_business_days']} dias úteis, restam {d['remaining_business_days']}", size=FS_M, fill=MUTED))
    body.append(text(20, 372, "Subsídio técnico, não defesa jurídica", size=FS_M, fill=MUTED))
    title = f"Prancha {n['code']} (móvel) · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Matriz de {s['allegations']} alegações: {s['controverted']} controvertidas, {s['admitted_in_part']} admitida em parte, {s['without_record']} sem registro; na principal, {n['focus']['days_documented']} de {n['focus']['days_alleged']} dias têm registro. Exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "mobile", MOBILE_H, title=title, desc=desc + _prov("matriz_alegacoes"), heading=src["title"], note="", body=body,
                  carimbo=_mobile_carimbo(f"{n['code']}-M", pid, n["revision"], ("Alegação × prova", "dias")), heading_size=14)


# ---------------------------------------------------------------------------
# P12 · janela-causal
# ---------------------------------------------------------------------------


def _p12_numbers(src: dict) -> dict:
    acts = src["activities"]
    causes = {c["id"]: c for c in src["causes"]}
    r = src["result"]
    win = causes["C-01"]
    con = causes["C-02"]
    assert int(win["end_day"]) - int(win["start_day"]) == int(win["days"]) == int(r["window_days"])
    assert int(con["end_day"]) - int(con["start_day"]) == int(con["days"]) == int(r["concurrent_days"])
    assert int(r["window_days"]) - int(r["concurrent_days"]) == int(r["attributable_days"])
    last = acts[-1]
    assert int(last["actual_end"]) - int(src["contract"]["term_days"]) == int(src["contract"]["observed_delay_days"])
    assert int(src["contract"]["observed_delay_days"]) - int(r["window_days"]) == int(r["remaining_delay_days"])
    for a in acts:
        assert int(a["baseline_end"]) - int(a["baseline_start"]) <= int(a["actual_end"]) - int(a["actual_start"]), a["id"]
    return {"activities": acts, "window": win, "concurrent": con, "result": r, "contract": src["contract"], "revision": src["revision"], "code": src["sheet_code"]}


def p12_desktop(data: dict) -> str:
    src = data["janela_causal"]
    n = _p12_numbers(src)
    pid, H = "janela-causal", 560
    hid = S.hatch_id(f"{pid}-d")
    body = [S.hatch_defs(f"{pid}-d")]
    c, r = n["contract"], n["result"]
    body.append(text(28, 72, f"Obra hipotética · linha de base contra o executado, em dias corridos desde a ordem de serviço · prazo contratual {c['term_days']} dias · atraso observado {c['observed_delay_days']} dias", size=S.FS_LABEL, weight=S.FW_LABEL))
    X0, X1 = 200.0, 1130.0
    dmax = int(n["activities"][-1]["actual_end"])
    X = lambda day: X0 + (X1 - X0) * int(day) / dmax  # noqa: E731
    yh = 100
    for lab in ("Atividade",):
        body.append(text(40, yh, lab, size=S.FS_LABEL, weight=S.FW_LABEL, fill=MUTED))
    for day in (n["window"]["start_day"], n["window"]["end_day"], c["term_days"], n["activities"][-1]["actual_end"]):
        body.append(line(X(day), yh + 6, X(day), 330, stroke=S.RULE, stroke_width="1"))
        body.append(text(X(day), yh, f"dia {day}", size=S.FS_DIM, fill=MUTED, anchor="middle"))
    body.append(line(28, yh + 8, DESK_W - 28, yh + 8, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    # causal window and concurrent cause bands
    w = n["window"]
    body.append(rect(X(w["start_day"]), yh + 10, X(w["end_day"]) - X(w["start_day"]), 320 - yh - 10, fill=LIME, fill_opacity=".35"))
    k = n["concurrent"]
    body.append(rect(X(k["start_day"]), yh + 10, X(k["end_day"]) - X(k["start_day"]), 320 - yh - 10, fill=f"url(#{hid})"))
    y0, pitch = 128, 48
    for i, a in enumerate(n["activities"]):
        y = y0 + i * pitch
        body.append(text(40, y + 12, a["label_pt_br"], size=S.FS_LABEL, weight=S.FW_LABEL))
        body.append(text(40, y + 28, a["id"], fill=MUTED))
        body.append(rect(X(a["baseline_start"]), y, X(a["baseline_end"]) - X(a["baseline_start"]), 9, fill=WHITE, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
        body.append(rect(X(a["actual_start"]), y + 14, X(a["actual_end"]) - X(a["actual_start"]), 9, fill=GREEN))
    # dimensions: window, concurrent, attributable, observed delay
    yd = 336
    body.append(dim_group(
        dim_h(X(w["start_day"]), X(w["end_day"]), yd, f"janela causal {w['days']} dias (órgão)", above=False),
        line(X(k["start_day"]), yd + 26, X(k["end_day"]), yd + 26), S.tick(X(k["start_day"]), yd + 26), S.tick(X(k["end_day"]), yd + 26),
        dim_h(X(c["term_days"]), X(n["activities"][-1]["actual_end"]), yd, f"atraso observado {c['observed_delay_days']} dias", above=False),
    ))
    body.append(text(X(k["end_day"]) + 8, yd + 30, f"concorrente {k['days']} dias (contratada)", fill=MUTED))
    body.append(text(X0, yd + 60, f"Dias imputáveis ao órgão: {r['attributable_days']} ({r['formula']}) · restam {r['remaining_delay_days']} dias da contratada ({r['observed_formula']})", size=S.FS_LABEL, weight=S.FW_LABEL, fill=GREEN))
    body.append(rect(X0, yd + 72, 18, 9, fill=WHITE, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    body.append(text(X0 + 26, yd + 80, "linha de base", fill=MUTED))
    body.append(rect(X0 + 120, yd + 72, 18, 9, fill=GREEN))
    body.append(text(X0 + 146, yd + 80, "executado", fill=MUTED))
    body.append(rect(X0 + 220, yd + 72, 18, 9, fill=LIME, fill_opacity=".35"))
    body.append(text(X0 + 246, yd + 80, "janela causal alheia à contratada", fill=MUTED))
    body.append(rect(X0 + 440, yd + 72, 18, 9, fill=f"url(#{hid})"))
    body.append(text(X0 + 466, yd + 80, "causa concorrente da contratada", fill=MUTED))
    a2 = n["activities"][1]
    c1 = (X(w["start_day"]) - 40, y0 + pitch + 4)
    body.append(leader(*c1, X(a2["actual_start"]) - 4, y0 + pitch + 18))
    body.append(callout(*c1, 1))
    c2 = (X(k["end_day"]) + 40, y0 - 14)
    body.append(leader(*c2, X(k["end_day"]) - 6, y0 + 6))
    body.append(callout(*c2, 2))
    a4 = n["activities"][-1]
    c3 = (X(a4["actual_end"]) + 34, y0 + 3 * pitch - 2)
    body.append(leader(*c3, X(a4["actual_end"]) - 2, y0 + 3 * pitch + 16))
    body.append(callout(*c3, 3))
    body.append(_legend(28, 440, "Chamadas", [
        ("1", f"Janela causal: {w['label_pt_br']} do dia {w['start_day']} ao dia {w['end_day']} ({w['days']} dias), no caminho crítico, com {w['record_pt_br']}. Fundações só começam quando a frente é liberada."),
        ("2", f"Causa concorrente: {k['label_pt_br']} do dia {k['start_day']} ao {k['end_day']} ({k['days']} dias) dentro da janela; entra na conta contra a contratada. Dias imputáveis ao órgão: {r['attributable_days']} ({r['formula']})."),
        ("3", f"Atraso observado de {c['observed_delay_days']} dias no fim: {w['days']} explicados pela janela e {r['remaining_delay_days']} da própria execução ({r['observed_formula']}). O pedido de prorrogação pede os {r['attributable_days']} dias, não os {c['observed_delay_days']}."),
    ]))
    title = f"Prancha {n['code']} · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Cronograma de base e executado de uma obra hipotética com prazo de {c['term_days']} dias: uma janela causal de {w['days']} dias (frente indisponível, órgão) sobre o caminho crítico, {k['days']} dias concorrentes da contratada, "
        f"{r['attributable_days']} dias imputáveis ({r['formula']}); atraso observado de {c['observed_delay_days']} dias, {r['remaining_delay_days']} da própria execução. Datas sintéticas; exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "desktop", H, title=title, desc=desc + _prov("janela_causal"), heading=src["title"] + ": quantos dias são imputáveis", note=_note(n["revision"]), body=body,
                  carimbo=_desktop_carimbo(H, n["code"], pid, n["revision"], "Cronograma base × executado · dias corridos"))


def p12_mobile(data: dict) -> str:
    src = data["janela_causal"]
    n = _p12_numbers(src)
    pid = "janela-causal"
    hid = S.hatch_id(f"{pid}-m")
    body = [S.hatch_defs(f"{pid}-m")]
    c, r, w, k = n["contract"], n["result"], n["window"], n["concurrent"]
    X0, X1 = 126.0, 340.0
    dmax = int(n["activities"][-1]["actual_end"])
    X = lambda day: X0 + (X1 - X0) * int(day) / dmax  # noqa: E731
    yt = 70
    body.append(rect(X(w["start_day"]), yt, X(w["end_day"]) - X(w["start_day"]), 200, fill=LIME, fill_opacity=".35"))
    body.append(rect(X(k["start_day"]), yt, X(k["end_day"]) - X(k["start_day"]), 200, fill=f"url(#{hid})"))
    body.append(line(X(c["term_days"]), yt, X(c["term_days"]), 270, stroke=MUTED, stroke_width=fmt(S.SW_DIM), stroke_dasharray="4 3"))
    body.append(text(X(c["term_days"]), yt - 6, f"prazo {c['term_days']}", size=FS_M, fill=MUTED, anchor="middle"))
    y0, pitch = 84, 44
    for i, a in enumerate(n["activities"]):
        y = y0 + i * pitch
        body.append(text(20, y + 10, a["label_pt_br"], size=FS_M, weight=S.FW_LABEL))
        body.append(rect(X(a["baseline_start"]), y, X(a["baseline_end"]) - X(a["baseline_start"]), 7, fill=WHITE, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
        body.append(rect(X(a["actual_start"]), y + 12, X(a["actual_end"]) - X(a["actual_start"]), 7, fill=GREEN))
    body.append(dim_group(dim_h(X(w["start_day"]), X(w["end_day"]), 276, f"janela {w['days']} dias", above=False, size=FS_M)))
    c1 = (X(w["end_day"]) + 30, y0 + pitch - 12)
    body.append(leader(*c1, X(n["activities"][1]["actual_start"]) + 4, y0 + pitch + 15))
    body.append(callout(*c1, 1, size=FS_M))
    body.append(text(20, 318, f"1 Imputáveis ao órgão: {r['attributable_days']} dias ({r['formula']})", size=FS_M))
    body.append(text(20, 336, f"Janela {w['days']} dias (órgão) · concorrente {k['days']} dias (contratada)", size=FS_M, fill=MUTED))
    body.append(text(20, 354, f"Atraso observado {c['observed_delay_days']} dias · {r['remaining_delay_days']} da própria execução", size=FS_M, fill=MUTED))
    body.append(text(20, 372, "Leitura técnica, não conclusão jurídica", size=FS_M, fill=MUTED))
    title = f"Prancha {n['code']} (móvel) · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Janela causal de {w['days']} dias no caminho crítico, {k['days']} concorrentes, {r['attributable_days']} imputáveis ao órgão; atraso observado de {c['observed_delay_days']} dias sobre o prazo de {c['term_days']}. Exemplo demonstrativo, sem obra de cliente."
    )
    return _sheet(pid, "mobile", MOBILE_H, title=title, desc=desc + _prov("janela_causal"), heading=src["title"], note="", body=body,
                  carimbo=_mobile_carimbo(f"{n['code']}-M", pid, n["revision"], ("Base × executado", "dias corridos")), heading_size=14)


RENDERERS = {
    ("risco-margem", "desktop"): p10_desktop,
    ("risco-margem", "mobile"): p10_mobile,
    ("matriz-alegacoes", "desktop"): p11_desktop,
    ("matriz-alegacoes", "mobile"): p11_mobile,
    ("janela-causal", "desktop"): p12_desktop,
    ("janela-causal", "mobile"): p12_mobile,
}
