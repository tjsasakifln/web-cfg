"""Plates of the private-service family (SALTO-INSTITUCIONAL-02, lote A).

Registered by ``render_plates._register_family_modules``. Five plates, each
with a desktop and a mobile composition, all drawn with ``sheet.py`` only:

    interferencia-verga-viga  compatibilização: WN-01 × B-01, estado R00 × R01
    revisao-conferencia       revisão técnica: RF-01 / RF-02 sobre a elevação
    drenagem-rede             projetos complementares: rede MH/DR/PV do recorte
    inspecao-fachada          inspeção: mapa de manifestações e registro por item
    pericia-fachada           assistência pericial: mesmo mapa com quesito,
                              evidência e conclusão delimitada
    sst-canteiro              SST: planta do canteiro com proteções conferidas
    pacote-entrega            projetos complementares: as quatro peças da entrega
    interfaces-versoes        projetos complementares: insumos → disciplina →
                              interfaces → versão devolvida

Every visible numeral comes from the JSON sources named in ``PLATE_SOURCES``.
No number is typed here. This module never imports ``render_plates`` (it is
imported by it) and never touches the pilot's plates.
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
    RULE,
    SOFT,
    WHITE,
    br,
    callout,
    dim_group,
    dim_h,
    dim_v,
    fmt,
    leader,
    level,
    line,
    path,
    rect,
    text,
)

SOURCES = {
    "inspecao_fachada": Path("data/demonstrative/plates/inspecao-fachada.v1.json"),
    "sst_canteiro": Path("data/demonstrative/plates/sst-canteiro.v1.json"),
    "elaboracao": Path("data/demonstrative/plates/elaboracao-complementar.v1.json"),
}
PLATE_SOURCES = {
    "interferencia-verga-viga": ("private", "private_consumption"),
    "revisao-conferencia": ("private", "private_consumption"),
    "drenagem-rede": ("infra", "infra_consumption"),
    "inspecao-fachada": ("inspecao_fachada",),
    "pericia-fachada": ("inspecao_fachada",),
    "sst-canteiro": ("sst_canteiro",),
    "pacote-entrega": ("elaboracao",),
    "interfaces-versoes": ("elaboracao",),
}
# Paths of the pilot sources, only for the provenance sentence in <desc>.
_PROVENANCE = {
    "private": "data/demonstrative/private-project-pilot/source.v1.json",
    "private_consumption": "data/demonstrative/private-project-pilot/consumption.v1.json",
    "infra": "data/demonstrative/infrastructure-pilot/source.v1.json",
    "infra_consumption": "data/demonstrative/infrastructure-pilot/consumption.v1.json",
    "inspecao_fachada": str(SOURCES["inspecao_fachada"]),
    "sst_canteiro": str(SOURCES["sst_canteiro"]),
    "elaboracao": str(SOURCES["elaboracao"]),
}
MOBILE_W, MOBILE_H = 360, 420
FS_M = 12.5
DEMO = S.DEMO_LABEL


# ---------------------------------------------------------------------------
# shared helpers (same vocabulary as the pilot's render_plates)
# ---------------------------------------------------------------------------


def _legend(x: float, y: float, heading: str, items: list[tuple], *, step: float = 18, size: float = S.FS_DIM) -> str:
    parts = [text(x, y, heading, size=S.FS_LABEL, weight=S.FW_LABEL)] if heading else []
    for i, item in enumerate(items, start=1):
        num, body = item[0], item[1]
        fill = item[2] if len(item) > 2 else MUTED
        yy = y + i * step
        if num:
            parts.append(
                f'<text x="{fmt(x)}" y="{fmt(yy)}" font-size="{fmt(size)}"><tspan font-weight="{S.FW_CALLOUT}">{num}</tspan>'
                f'<tspan x="{fmt(x + 16)}">{S.esc(body)}</tspan></text>'
            )
        else:
            parts.append(text(x, yy, body, size=size, fill=fill))
    return "".join(parts)


def _mobile_carimbo(code: str, revision: str, pid: str, scale_lines: tuple[str, str]) -> str:
    return S.title_block(
        MOBILE_W, MOBILE_H,
        ((code, f"rev. {revision}"), scale_lines, ("Exemplo demonstrativo", "sem obra de cliente")),
        widths=(64, 120), size=FS_M, id=f"{pid}-m-carimbo",
    )


def _desktop_carimbo(w: float, h: float, code: str, pid: str, revision: str, scale_text: str) -> str:
    return S.title_block(w, h, ((f"{code} · {pid} · rev. {revision}",), (scale_text,), (DEMO,)), id=f"{pid}-d-carimbo")


def _note(revision: str) -> str:
    return f"Dados demonstrativos · revisão {revision}"


def _prov(*keys: str) -> str:
    return " Procedência: " + ", ".join(_PROVENANCE[k] for k in keys) + "."


def _els(src: dict) -> dict[str, dict]:
    return {el["id"]: el for el in src["elements"]}


def _check_box(x: float, y: float, checked: bool, size: float = 9) -> str:
    """Checklist marker: filled green square = conferido, outline = pendente."""
    if checked:
        return rect(x, y - size + 1, size, size, fill=GREEN)
    return rect(x, y - size + 1, size, size, fill="none", stroke=INK, stroke_width=fmt(S.SW_OUTLINE))


# ---------------------------------------------------------------------------
# private recorte: numbers and the east elevation, drawn for a given revision
# ---------------------------------------------------------------------------


def _priv(src: dict, cons: dict) -> dict:
    els = _els(src)
    t = cons["named_totals"]
    win, beam, shaft = els["WN-01"], els["B-01"], els["HS-01"]
    n = {
        "W": Decimal(src["room"]["interior_width_m"]), "H": Decimal(src["room"]["ceiling_height_m"]),
        "win_w": Decimal(win["width_m"]), "win_off": Decimal(win["offset_m"]), "sill": Decimal(win["sill_m"]),
        "head_r00": Decimal(t["window_head_r00_m"]), "head_r01": Decimal(t["window_head_r01_m"]),
        "soffit": Decimal(t["beam_soffit_m"]), "depth": Decimal(beam["depth_m"]),
        "overlap": Decimal(t["r00_overlap_m"]), "clearance": Decimal(t["r01_clearance_m"]),
        "shaft_w": Decimal(shaft["width_m"]), "shaft_d": Decimal(shaft["depth_m"]), "shaft_off": Decimal(shaft["offset_m"]),
        "t": Decimal(src["wall_thickness_m"]),
        "cf": {c["id"]: c for c in cons["coordination_findings"]},
        "rf": {r["id"]: r for r in cons["review_findings"]},
        "revision": src["revision"],
    }
    assert n["head_r00"] - n["soffit"] == n["overlap"], "overlap_mismatch"
    assert n["soffit"] - n["head_r01"] == n["clearance"], "clearance_mismatch"
    return n


def _elevation(n: dict, X0: float, Y0: float, s: float, hid: str, *, head: Decimal, size: float = S.FS_DIM, label_size: float = S.FS_LABEL, band: bool = True) -> str:
    W, H = float(n["W"]), float(n["H"])
    sill, soffit, depth = float(n["sill"]), float(n["soffit"]), float(n["depth"])
    hd = float(head)
    win_off, win_w = float(n["win_off"]), float(n["win_w"])

    def X(m: float) -> float:
        return X0 + m * s

    def Y(m: float) -> float:
        return Y0 - m * s

    parts = [rect(X(0), Y(H), W * s, H * s, fill=WHITE, stroke=INK, stroke_width=fmt(S.SW_OUTLINE))]
    parts.append(rect(X(0), Y(H), W * s, depth * s, fill=f"url(#{hid})", stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    parts.append(rect(X(win_off), Y(hd), win_w * s, (hd - sill) * s, fill=WHITE, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    inset = 4 if s < 90 else 6
    parts.append(rect(X(win_off) + inset, Y(hd) + inset, win_w * s - 2 * inset, (hd - sill) * s - 2 * inset, fill="none", stroke=INK, stroke_width=fmt(S.SW_DIM)))
    if band and hd > soffit:
        parts.append(rect(X(win_off), Y(hd), win_w * s, (hd - soffit) * s, fill=LIME, fill_opacity=".35"))
    elif band:
        parts.append(rect(X(win_off), Y(soffit), win_w * s, (soffit - hd) * s, fill="none", stroke=GREEN, stroke_width=fmt(S.SW_DIM), stroke_dasharray="3 2"))
    parts.append(line(X(win_off), Y(soffit), X(win_off + win_w), Y(soffit), stroke=INK, stroke_width=fmt(S.SW_DIM), stroke_dasharray="4 2"))
    parts.append(text(X(win_off + win_w / 2), Y((hd + sill) / 2) + 4, "WN-01", size=label_size, weight=S.FW_LABEL, anchor="middle"))
    parts.append(text(X(W / 2), Y(soffit + depth / 2) + 4, "B-01", size=label_size, weight=S.FW_LABEL, anchor="middle"))
    parts.append(text(X(W / 2), Y(0.3), "W-02", size=label_size, weight=S.FW_LABEL, fill=GREEN, anchor="middle"))
    return "".join(parts)


# ---------------------------------------------------------------------------
# P5 · interferencia-verga-viga (compatibilização)
# ---------------------------------------------------------------------------


def p5_desktop(data: dict) -> str:
    n = _priv(data["private"], data["private_consumption"])
    W_, H_ = 1200, 620
    pid = "interferencia-verga-viga"
    hid = S.hatch_id(f"{pid}-d")
    s = 110.0
    Wd, H = float(n["W"]), float(n["H"])
    sill, soffit = float(n["sill"]), float(n["soffit"])
    win_off, win_w = float(n["win_off"]), float(n["win_w"])
    body = [S.hatch_defs(f"{pid}-d")]
    body.append(text(100, 80, "Elevação leste W-02 · R00 estado original", size=S.FS_LABEL, weight=S.FW_LABEL))
    body.append(text(560, 80, "Elevação leste W-02 · R01 versão corrigida", size=S.FS_LABEL, weight=S.FW_LABEL))
    cf = n["cf"]["CF-GEO-01"]
    for i, (X0, head) in enumerate(((160.0, n["head_r00"]), (620.0, n["head_r01"]))):
        Y0 = 396.0
        body.append(_elevation(n, X0, Y0, s, hid, head=head))
        hd = float(head)

        def X(m: float, X0=X0) -> float:
            return X0 + m * s

        def Y(m: float, Y0=Y0) -> float:
            return Y0 - m * s

        rest = Wd - win_off - win_w
        body.append(dim_group(
            dim_v(Y(sill), Y(0), X(0) - 28, f"peitoril {br(n['sill'])}", x_obj=X(0)),
            dim_v(Y(hd), Y(sill), X(0) - 28, br(Decimal(str(hd)) - n["sill"])),
            dim_v(Y(H), Y(hd), X(0) - 28, br(n["H"] - Decimal(str(hd)))),
            dim_h(X(0), X(win_off), Y0 + 24, br(n["win_off"]), y_obj=Y0, above=False),
            dim_h(X(win_off), X(win_off + win_w), Y0 + 24, br(n["win_w"]), above=False),
            dim_h(X(win_off + win_w), X(Wd), Y0 + 24, br(Decimal(str(rest))), above=False),
            dim_h(X(0), X(Wd), Y0 + 46, br(n["W"]), above=False),
            level(X(Wd) + 3, Y(H), br(n["H"]), left=False),
            level(X(Wd) + 3, Y(hd), f"{br(head)} verga", left=False),
            level(X(Wd) + 3, Y(soffit), f"{br(n['soffit'])} fundo B-01", left=False),
            level(X(Wd) + 3, Y(0), "0,00", left=False),
        ))
        cx, cy = X(Wd) + 150, Y(2.45)
        body.append(leader(cx, cy, X(win_off + win_w) + 2, Y((hd + soffit) / 2)))
        body.append(callout(cx, cy, i + 1))
    body.append(_legend(100, 476, "Registro CF-GEO-01 · interferência geométrica", [
        ("1", f"R00: verga da WN-01 em {br(n['head_r00'])} m e fundo da viga B-01 em {br(n['soffit'])} m: sobreposição de {br(n['overlap'])} m no eixo Z."),
        ("2", f"R01: verga rebaixada para {br(n['head_r01'])} m, folga de {br(n['clearance'])} m até o fundo da viga; B-01 mantida na cota original."),
        ("", "Encaminhamento ao autor do recorte arquitetônico; quem registra localiza, grava a evidência e acompanha até o aceite."),
        ("", "Localização: parede leste W-02, interface WN-01 × B-01 · documentos comparados: PR-ARQ-R00 e PR-EST-R00 · estado: corrigido na revisão R01.", INK),
    ], step=17))
    title = "Prancha PA · Interferência WN-01 × B-01 na parede leste W-02, estado R00 e R01 · exemplo demonstrativo"
    desc = (
        f"Duas elevações da parede W-02 de {br(n['W'])} por {br(n['H'])} m. No estado R00 a verga da janela WN-01 está em {br(n['head_r00'])} m e o fundo da viga B-01 em "
        f"{br(n['soffit'])} m, sobreposição de {br(n['overlap'])} m marcada em faixa. Na revisão R01 a verga desce para {br(n['head_r01'])} m, folga de {br(n['clearance'])} m. "
        f"Registro CF-GEO-01: {cf['location_pt_br']}; estado corrigido na revisão R01. Exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="desktop", width=W_, height=H_, title=title, desc=desc + _prov("private", "private_consumption"),
        heading="Compatibilização: a mesma parede em R00 e em R01, com o registro da interferência",
        source_note=_note(n["revision"]), body="\n".join(body),
        carimbo=_desktop_carimbo(W_, H_, "PA", pid, n["revision"], "Escala indicativa · cotas em m"),
    )


def p5_mobile(data: dict) -> str:
    n = _priv(data["private"], data["private_consumption"])
    pid = "interferencia-verga-viga"
    hid = S.hatch_id(f"{pid}-m")
    s = 56.0
    fs = FS_M
    body = [S.hatch_defs(f"{pid}-m")]
    Wd, H = float(n["W"]), float(n["H"])
    soffit = float(n["soffit"])
    win_off, win_w = float(n["win_off"]), float(n["win_w"])
    for i, (X0, head, lab) in enumerate(((40.0, n["head_r00"], "R00"), (206.0, n["head_r01"], "R01"))):
        Y0 = 256.0
        hd = float(head)
        body.append(text(X0, 82, f"W-02 · {lab}", size=fs, weight=S.FW_LABEL))
        body.append(_elevation(n, X0, Y0, s, hid, head=head, size=fs, label_size=fs))

        def X(m: float, X0=X0) -> float:
            return X0 + m * s

        def Y(m: float, Y0=Y0) -> float:
            return Y0 - m * s

        body.append(text(X0, Y0 + 18, f"verga {br(head)} · viga {br(n['soffit'])}", size=fs, fill=MUTED))
        cx, cy = X(Wd) + 14, Y(H) + 8
        body.append(leader(cx, cy, X(win_off + win_w) + 1, Y((hd + soffit) / 2)))
        body.append(callout(cx, cy, i + 1, size=fs))
    body.append(text(20, 318, f"1 R00: verga {br(n['head_r00'])} × fundo B-01 {br(n['soffit'])}", size=fs))
    body.append(text(20, 334, f"sobreposição de {br(n['overlap'])} m", size=fs, weight=S.FW_LABEL))
    body.append(text(20, 350, f"2 R01: verga {br(n['head_r01'])} · folga {br(n['clearance'])} m até B-01", size=fs))
    body.append(text(20, 366, "CF-GEO-01 · corrigido na revisão R01", size=fs, fill=MUTED))
    title = "Prancha PA (móvel) · Interferência WN-01 × B-01 em R00 e R01 · exemplo demonstrativo"
    desc = (
        f"Duas elevações da parede W-02: em R00 a verga da WN-01 em {br(n['head_r00'])} m sobrepõe o fundo da viga B-01 em {br(n['soffit'])} m por {br(n['overlap'])} m; "
        f"em R01 a verga passa a {br(n['head_r01'])} m com folga de {br(n['clearance'])} m. Registro CF-GEO-01 corrigido na revisão R01. Exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="mobile", width=MOBILE_W, height=MOBILE_H, title=title, desc=desc + _prov("private", "private_consumption"),
        heading="WN-01 × B-01 · R00 e R01", source_note="", body="\n".join(body),
        carimbo=_mobile_carimbo("PA-M", n["revision"], pid, ("Escala indicativa", "cotas em m")),
    )


# ---------------------------------------------------------------------------
# P6 · revisao-conferencia (revisão técnica)
# ---------------------------------------------------------------------------


def _shaft_detail(n: dict, X0: float, Y0: float, s: float, hid: str, *, size: float = S.FS_DIM, label_size: float = S.FS_LABEL) -> str:
    """Plan detail of HS-01 on wall W-04: declared contour, blank interior."""
    t, sw, sd = float(n["t"]), float(n["shaft_w"]), float(n["shaft_d"])
    parts = [rect(X0 + sd * s, Y0, t * s, (sw + 0.6) * s, fill=f"url(#{hid})", stroke=INK, stroke_width=fmt(S.SW_CUT))]
    parts.append(rect(X0, Y0 + 0.3 * s, sd * s, sw * s, fill=WHITE, stroke=INK, stroke_width=fmt(S.SW_CUT)))
    parts.append(rect(X0 + 0.06 * s, Y0 + 0.36 * s, (sd - 0.12) * s, (sw - 0.12) * s, fill="none", stroke=MUTED, stroke_width=fmt(S.SW_DIM), stroke_dasharray="3 2"))
    parts.append(text(X0 + sd * s / 2, Y0 + 0.3 * s + sw * s / 2 + 4, "HS-01", size=label_size, weight=S.FW_LABEL, anchor="middle"))
    parts.append(text(X0 + sd * s + t * s + 6, Y0 + (sw + 0.6) * s / 2 + 4, "W-04", size=label_size, weight=S.FW_LABEL, fill=GREEN))
    parts.append(dim_group(
        dim_h(X0, X0 + sd * s, Y0 + 0.3 * s - 12, br(n["shaft_d"]), y_obj=Y0 + 0.3 * s, above=True, size=size),
        dim_v(Y0 + 0.3 * s, Y0 + 0.3 * s + sw * s, X0 - 12, br(n["shaft_w"]), x_obj=X0, size=size),
    ))
    return "".join(parts)


def p6_desktop(data: dict) -> str:
    n = _priv(data["private"], data["private_consumption"])
    W_, H_ = 1200, 620
    pid = "revisao-conferencia"
    hid = S.hatch_id(f"{pid}-d")
    s = 110.0
    Wd, H = float(n["W"]), float(n["H"])
    sill, soffit, hd = float(n["sill"]), float(n["soffit"]), float(n["head_r00"])
    win_off, win_w = float(n["win_off"]), float(n["win_w"])
    rf1, rf2 = n["rf"]["RF-01"], n["rf"]["RF-02"]
    body = [S.hatch_defs(f"{pid}-d")]
    body.append(text(100, 80, "Elevação leste W-02 · documento PR-ARQ-R00 conferido", size=S.FS_LABEL, weight=S.FW_LABEL))
    body.append(text(470, 80, "Detalhe HS-01 · documento PR-HID-R00 conferido", size=S.FS_LABEL, weight=S.FW_LABEL))
    X0, Y0 = 160.0, 396.0
    body.append(_elevation(n, X0, Y0, s, hid, head=n["head_r00"]))

    def X(m: float) -> float:
        return X0 + m * s

    def Y(m: float) -> float:
        return Y0 - m * s

    body.append(dim_group(
        dim_v(Y(sill), Y(0), X(0) - 28, f"peitoril {br(n['sill'])}", x_obj=X(0)),
        dim_v(Y(hd), Y(sill), X(0) - 28, br(Decimal(str(hd)) - n["sill"])),
        dim_v(Y(H), Y(hd), X(0) - 28, br(n["H"] - Decimal(str(hd)))),
        dim_h(X(0), X(Wd), Y0 + 24, br(n["W"]), y_obj=Y0, above=False),
        level(X(Wd) + 3, Y(H), br(n["H"]), left=False),
        level(X(Wd) + 3, Y(hd), f"{br(n['head_r00'])} verga", left=False),
        level(X(Wd) + 3, Y(soffit), f"{br(n['soffit'])} fundo B-01", left=False),
        level(X(Wd) + 3, Y(0), "0,00", left=False),
    ))
    body.append(leader(X(Wd) + 150, Y(2.45), X(win_off + win_w) + 2, Y((hd + soffit) / 2)))
    body.append(callout(X(Wd) + 150, Y(2.45), 1))
    SX0, SY0, s2 = 520.0, 150.0, 150.0
    body.append(_shaft_detail(n, SX0, SY0, s2, hid))
    body.append(text(SX0 - 24, SY0 + s2 + 52, "vão livre interno: não declarado", size=S.FS_DIM, fill=MUTED))
    body.append(text(SX0 - 24, SY0 + s2 + 68, "diâmetros de tubulação: não declarados", size=S.FS_DIM, fill=MUTED))
    body.append(leader(SX0 - 50, SY0 + 0.3 * s2 + 0.2 * s2, SX0 - 1, SY0 + 0.3 * s2 + 0.2 * s2))
    body.append(callout(SX0 - 50, SY0 + 0.3 * s2 + 0.2 * s2, 2))
    body.append(_legend(790, 128, "Ficha de conferência · o que o relatório separa", [
        ("1", f"{rf1['id']} · {rf1['document_ref']} · constatação sustentada"),
        ("", f"{rf1['finding_pt_br']}", INK),
        ("", f"Base: conferência geométrica das faixas Z; verga {br(n['head_r00'])} m × fundo {br(n['soffit'])} m."),
        ("", "Norma de dimensionamento: não examinada; pergunta ao autor, não erro."),
        ("", f"Ação: {rf1['action_pt_br']}", INK),
        ("2", f"{rf2['id']} · {rf2['document_ref']} · informação faltante"),
        ("", f"{rf2['finding_pt_br']}", INK),
        ("", "Base: campo do recorte vazio; ausência de informação, não falha."),
        ("", f"Ação: {rf2['action_pt_br']}", INK),
    ], step=17))
    body.append(_legend(100, 476, "", [
        ("", "Cada constatação sai com peça e cota citadas, base da conferência e correção proposta; o que não pôde ser verificado fica como pergunta ao autor."),
        ("", "A autoria permanece com o autor do projeto: o relatório localiza e propõe, o autor decide e corrige.", INK),
    ], step=17))
    title = "Prancha PB · Conferência de revisão RF-01 e RF-02 sobre a elevação leste e o poço HS-01 · exemplo demonstrativo"
    desc = (
        f"Elevação da parede W-02 no estado R00 com a marcação RF-01: verga da WN-01 em {br(n['head_r00'])} m invade o volume da viga B-01 com fundo em {br(n['soffit'])} m; "
        f"ação proposta: rebaixar a verga para {br(n['head_r01'])} m. Detalhe do poço HS-01 de {br(n['shaft_d'])} por {br(n['shaft_w'])} m com a marcação RF-02: vão livre interno e "
        "diâmetros não declarados, pedido de informação. Exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="desktop", width=W_, height=H_, title=title, desc=desc + _prov("private", "private_consumption"),
        heading="Revisão técnica: cada constatação localizada no desenho, com base e ação",
        source_note=_note(n["revision"]), body="\n".join(body),
        carimbo=_desktop_carimbo(W_, H_, "PB", pid, n["revision"], "Escala indicativa · cotas em m"),
    )


def p6_mobile(data: dict) -> str:
    n = _priv(data["private"], data["private_consumption"])
    pid = "revisao-conferencia"
    hid = S.hatch_id(f"{pid}-m")
    fs = FS_M
    s = 52.0
    X0, Y0 = 34.0, 250.0
    Wd, H = float(n["W"]), float(n["H"])
    soffit, hd = float(n["soffit"]), float(n["head_r00"])
    win_off, win_w = float(n["win_off"]), float(n["win_w"])
    rf1, rf2 = n["rf"]["RF-01"], n["rf"]["RF-02"]
    body = [S.hatch_defs(f"{pid}-m")]
    body.append(text(X0, 82, "W-02 · PR-ARQ-R00", size=fs, weight=S.FW_LABEL))
    body.append(_elevation(n, X0, Y0, s, hid, head=n["head_r00"], size=fs, label_size=fs))

    def X(m: float) -> float:
        return X0 + m * s

    def Y(m: float) -> float:
        return Y0 - m * s

    body.append(text(X0, Y0 + 18, f"verga {br(n['head_r00'])} · viga {br(n['soffit'])}", size=fs, fill=MUTED))
    body.append(leader(X(Wd) + 22, Y(H) + 8, X(win_off + win_w) + 1, Y((hd + soffit) / 2)))
    body.append(callout(X(Wd) + 22, Y(H) + 8, 1, size=fs))
    tx = 178.0
    body.append(text(tx, 118, f"{rf1['id']} · {rf1['document_ref']}", size=fs, weight=S.FW_LABEL))
    body.append(text(tx, 134, "constatação sustentada", size=fs, fill=MUTED))
    body.append(text(tx, 150, f"verga {br(n['head_r00'])} invade a viga", size=fs))
    body.append(text(tx, 166, f"ação: verga a {br(n['head_r01'])} (R01)", size=fs))
    body.append(callout(tx - 14, 206, 2, size=fs))
    body.append(text(tx, 210, f"{rf2['id']} · {rf2['document_ref']}", size=fs, weight=S.FW_LABEL))
    body.append(text(tx, 226, "informação faltante", size=fs, fill=MUTED))
    body.append(text(tx, 242, "HS-01 sem vão livre", size=fs))
    body.append(text(tx, 258, "nem diâmetros", size=fs))
    body.append(text(tx, 274, "ação: pedido de informação", size=fs))
    body.append(text(20, 322, "Norma de dimensionamento não examinada:", size=fs, fill=MUTED))
    body.append(text(20, 338, "pergunta ao autor, não erro do projeto.", size=fs, fill=MUTED))
    body.append(text(20, 360, "O autor decide e corrige o que lhe pertence.", size=fs, weight=S.FW_LABEL))
    title = "Prancha PB (móvel) · Conferência RF-01 e RF-02 · exemplo demonstrativo"
    desc = (
        f"Elevação da parede W-02 no estado R00 com a marcação RF-01 (verga {br(n['head_r00'])} m invade a viga com fundo em {br(n['soffit'])} m; ação: verga a {br(n['head_r01'])} m em R01) "
        "e a ficha RF-02 (HS-01 sem vão livre interno nem diâmetros; pedido de informação). Exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="mobile", width=MOBILE_W, height=MOBILE_H, title=title, desc=desc + _prov("private", "private_consumption"),
        heading="Conferência RF-01 e RF-02", source_note="", body="\n".join(body),
        carimbo=_mobile_carimbo("PB-M", n["revision"], pid, ("Escala indicativa", "cotas em m")),
    )


# ---------------------------------------------------------------------------
# P7 · drenagem-rede (projetos complementares)
# ---------------------------------------------------------------------------


def _infra(src: dict, cons: dict) -> dict:
    els = _els(src)
    t = cons["named_totals"]
    pv, mh1, mh2, dr, inl = els["PV-01"], els["MH-01"], els["MH-02"], els["DR-01"], els["IN-01"]
    return {
        "L": Decimal(pv["station_end_m"]), "Wd": Decimal(pv["width_m"]),
        "sta1": Decimal(mh1["station_m"]), "sta2": Decimal(mh2["station_m"]), "sta_in": Decimal(inl["station_m"]),
        "inv1": Decimal(t["mh01_invert_m"]), "inv2": Decimal(t["mh02_invert_drawn_m"]),
        "dn": Decimal(dr["diameter_mm"]), "len": Decimal(t["pipe_length_m"]), "slope": Decimal(t["pipe_slope_drawn_m_per_m"]),
        "sub": Decimal(pv["layers"]["subbase_m"]), "base": Decimal(pv["layers"]["base_m"]), "cap": Decimal(pv["layers"]["wearing_m"]),
        "g0": Decimal(pv["grade_start_m"]), "g1": Decimal(t["pavement_grade_end_m"]), "gslope": Decimal(pv["longitudinal_slope_m_per_m"]),
        "area": Decimal(t["pavement_area_m2"]),
        "sheet_dr": dr["sheet_ref"], "sheet_pv": pv["sheet_ref"],
        "revision": src["revision"],
    }


def _network_plan(n: dict, X0: float, Y0: float, sx: float, sy: float, hid: str, *, size: float = S.FS_DIM, label_size: float = S.FS_LABEL, stations: bool = True) -> tuple[str, dict]:
    L, Wd = float(n["L"]), float(n["Wd"])
    s1, s2, si = float(n["sta1"]), float(n["sta2"]), float(n["sta_in"])

    def X(m: float) -> float:
        return X0 + m * sx

    def Y(m: float) -> float:
        return Y0 + m * sy

    cy = Y(Wd / 2)
    parts = [rect(X(0), Y(0), L * sx, Wd * sy, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE))]
    parts.append(rect(X(0), Y(0), L * sx, 0.4 * sy, fill=f"url(#{hid})"))
    parts.append(rect(X(0), Y(Wd - 0.4), L * sx, 0.4 * sy, fill=f"url(#{hid})"))
    parts.append(line(X(s1), cy, X(s2), cy, stroke=GREEN, stroke_width=fmt(S.SW_CUT)))
    r = 7 if sx < 10 else 9
    for sta, lab in ((s1, "MH-01"), (s2, "MH-02")):
        parts.append(f'<circle cx="{fmt(X(sta))}" cy="{fmt(cy)}" r="{r}" fill="{WHITE}" stroke="{INK}" stroke-width="{fmt(S.SW_OUTLINE)}"/>')
        parts.append(text(X(sta), Y(0) - 6, lab, size=label_size, weight=S.FW_LABEL, anchor="middle"))
    parts.append(rect(X(si) - 5, Y(Wd) - 0.5 * sy, 10, 0.5 * sy, fill="none", stroke=MUTED, stroke_width=fmt(S.SW_OUTLINE), stroke_dasharray="3 2"))
    parts.append(line(X(si), cy, X(si), Y(Wd) - 0.5 * sy, stroke=MUTED, stroke_width=fmt(S.SW_DIM), stroke_dasharray="3 2"))
    parts.append(text(X(si), Y(Wd) + size + 6, "IN-01", size=label_size, weight=S.FW_LABEL, fill=MUTED, anchor="middle"))
    parts.append(text(X(L / 2), Y(Wd - 0.4) - 6, "PV-01", size=label_size, weight=S.FW_LABEL, anchor="middle"))
    if stations:
        parts.append(f'<g stroke="{MUTED}" stroke-width="{fmt(S.SW_DIM)}">')
        for m in (0.0, s1, si, s2, L):
            parts.append(line(X(m), Y(Wd), X(m), Y(Wd) + 5))
        parts.append("</g>")
    return "".join(parts), {"X": X, "Y": Y, "cy": cy}


def p7_desktop(data: dict) -> str:
    n = _infra(data["infra"], data["infra_consumption"])
    W_, H_ = 1200, 600
    pid = "drenagem-rede"
    hid = S.hatch_id(f"{pid}-d")
    body = [S.hatch_defs(f"{pid}-d")]
    body.append(text(100, 80, "Planta · faixa PV-01 e rede DR-01 · elementos identificados · norte para cima", size=S.FS_LABEL, weight=S.FW_LABEL))
    plan, g = _network_plan(n, 110.0, 130.0, 15.0, 30.0, hid)
    X, Y, cy = g["X"], g["Y"], g["cy"]
    body.append(plan)
    L, Wd = float(n["L"]), float(n["Wd"])
    s1, s2, si = float(n["sta1"]), float(n["sta2"]), float(n["sta_in"])
    body.append(text((X(s1) + X(s2)) / 2, cy - 12, f"DR-01 · DN {br(n['dn'], 0)} · {br(n['len'])} m · i {br(n['slope'], 4)} m/m", size=S.FS_LABEL, weight=S.FW_LABEL, anchor="middle"))
    body.append(text(X(s1), cy + 24, f"inv. {br(n['inv1'])}", size=S.FS_DIM, anchor="middle"))
    body.append(text(X(s2), cy + 24, f"inv. {br(n['inv2'])}", size=S.FS_DIM, anchor="middle"))
    body.append(dim_group(
        dim_h(X(0), X(s1), Y(Wd) + 40, br(n["sta1"]), y_obj=Y(Wd), above=False),
        dim_h(X(s1), X(si), Y(Wd) + 40, br(n["sta_in"] - n["sta1"]), above=False),
        dim_h(X(si), X(s2), Y(Wd) + 40, br(n["sta2"] - n["sta_in"]), above=False),
        dim_h(X(s2), X(L), Y(Wd) + 40, br(n["L"] - n["sta2"]), above=False),
        dim_h(X(0), X(L), Y(Wd) + 64, f"{br(n['L'])} m · estaqueamento", above=False),
        dim_v(Y(0), Y(Wd), X(0) - 20, f"{br(n['Wd'])} m", x_obj=X(0)),
    ))
    body.append(text(X(0) + 8, Y(Wd) - 14, f"greide {br(n['g0'])}", size=S.FS_DIM, fill=MUTED))
    body.append(text(X(L) - 8, Y(Wd) - 14, f"greide {br(n['g1'])}", size=S.FS_DIM, fill=MUTED, anchor="end"))
    body.append(leader(X(s1) - 44, cy + 44, X(s1) - 7, cy + 6))
    body.append(callout(X(s1) - 44, cy + 44, 1))
    body.append(leader(X(si) + 50, Y(Wd) + 12, X(si) + 6, Y(Wd) - 8))
    body.append(callout(X(si) + 50, Y(Wd) + 12, 2))
    body.append(leader(X(L) + 40, Y(Wd / 2) + 30, X(L) - 2, Y(Wd / 2) + 30))
    body.append(callout(X(L) + 40, Y(Wd / 2) + 30, 3))
    body.append(_legend(790, 128, "Elementos da disciplina entregue", [
        ("1", f"Rede: MH-01 est. {br(n['sta1'])} (inv. {br(n['inv1'])}) → DR-01 DN {br(n['dn'], 0)}, {br(n['len'])} m,"),
        ("", f"i {br(n['slope'], 4)} m/m → MH-02 est. {br(n['sta2'])} (inv. {br(n['inv2'])}). Declive geométrico."),
        ("2", f"IN-01 est. {br(n['sta_in'])}: boca de lobo sem diâmetro nem cota declarados;"),
        ("", "permanece pedido de informação, não falha comprovada."),
        ("3", f"Faixa PV-01 {br(n['L'])} × {br(n['Wd'])} m = {br(n['area'])} m²: sub-base {br(n['sub'])},"),
        ("", f"base {br(n['base'])} e capa {br(n['cap'])} m; greide {br(n['g0'])} → {br(n['g1'])}, i {br(n['gslope'], 4)} m/m."),
        ("", f"Cada elemento tem id, cota e prancha ({n['sheet_dr']}, {n['sheet_pv']});", INK),
        ("", "quantidades e planilha saem da mesma fonte (Q-TUB-01, Q-PAV-01).", INK),
    ], step=17))
    body.append(_legend(100, 470, "", [
        ("", "Volumes e comprimentos são geométricos: espessura não é dimensionamento de pavimento e declive não é capacidade hidráulica."),
        ("", "A disciplina sai com plantas, cotas, memória e a matriz de interfaces com a arquitetura de origem, que permanece com o autor.", INK),
    ], step=17))
    title = "Prancha PC · Rede de drenagem MH-01, DR-01, MH-02 e faixa PV-01 do recorte de loteamento · exemplo demonstrativo"
    desc = (
        f"Planta da faixa PV-01 de {br(n['L'])} por {br(n['Wd'])} m com a rede DR-01 DN {br(n['dn'], 0)} de {br(n['len'])} m entre os poços MH-01 (estaca {br(n['sta1'])}, invert {br(n['inv1'])} m) "
        f"e MH-02 (estaca {br(n['sta2'])}, invert {br(n['inv2'])} m), declive geométrico {br(n['slope'], 4)} m/m. Boca de lobo IN-01 na estaca {br(n['sta_in'])} sem diâmetro nem cota declarados. "
        f"Camadas da faixa: sub-base {br(n['sub'])}, base {br(n['base'])}, capa {br(n['cap'])} m. Exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="desktop", width=W_, height=H_, title=title, desc=desc + _prov("infra", "infra_consumption"),
        heading="Projeto complementar: rede e pavimento com cada elemento identificado, cotado e ligado à planilha",
        source_note=_note(n["revision"]), body="\n".join(body),
        carimbo=_desktop_carimbo(W_, H_, "PC", pid, n["revision"], "Escala indicativa · cotas em m · DN em mm"),
    )


def p7_mobile(data: dict) -> str:
    n = _infra(data["infra"], data["infra_consumption"])
    pid = "drenagem-rede"
    hid = S.hatch_id(f"{pid}-m")
    fs = FS_M
    body = [S.hatch_defs(f"{pid}-m")]
    plan, g = _network_plan(n, 40.0, 104.0, 7.0, 10.0, hid, size=fs, label_size=fs, stations=False)
    X, Y, cy = g["X"], g["Y"], g["cy"]
    body.append(plan)
    L, Wd = float(n["L"]), float(n["Wd"])
    s1, s2, si = float(n["sta1"]), float(n["sta2"]), float(n["sta_in"])
    body.append(dim_group(
        dim_h(X(0), X(L), Y(Wd) + 40, f"{br(n['L'])} m", y_obj=Y(Wd), above=False, size=fs),
        dim_v(Y(0), Y(Wd), X(0) - 14, br(n["Wd"]), x_obj=X(0), size=fs),
    ))
    body.append(leader(X(s1) - 30, cy + 30, X(s1) - 5, cy + 5))
    body.append(callout(X(s1) - 30, cy + 30, 1, size=fs))
    body.append(leader(X(si) + 34, Y(Wd) + 22, X(si) + 5, Y(Wd) - 3))
    body.append(callout(X(si) + 34, Y(Wd) + 22, 2, size=fs))
    body.append(text(20, 250, f"1 DR-01 DN {br(n['dn'], 0)} · {br(n['len'])} m · i {br(n['slope'], 4)} m/m", size=fs))
    body.append(text(20, 266, f"inv. {br(n['inv1'])} em MH-01 → {br(n['inv2'])} em MH-02", size=fs, weight=S.FW_LABEL))
    body.append(text(20, 282, "2 IN-01: diâmetro e cota não declarados", size=fs))
    body.append(text(20, 298, "(pedido de informação, não falha)", size=fs, fill=MUTED))
    body.append(text(20, 318, f"PV-01 {br(n['L'])} × {br(n['Wd'])} m · camadas {br(n['sub'])} / {br(n['base'])} / {br(n['cap'])}", size=fs))
    body.append(text(20, 334, f"greide {br(n['g0'])} → {br(n['g1'])} · {n['sheet_dr']} · {n['sheet_pv']}", size=fs, fill=MUTED))
    body.append(text(20, 354, "Declive geométrico, não capacidade hidráulica.", size=fs, fill=MUTED))
    title = "Prancha PC (móvel) · Rede DR-01 e faixa PV-01 · exemplo demonstrativo"
    desc = (
        f"Planta da faixa PV-01 de {br(n['L'])} por {br(n['Wd'])} m com a rede DR-01 DN {br(n['dn'], 0)} de {br(n['len'])} m entre MH-01 (invert {br(n['inv1'])} m) e MH-02 (invert {br(n['inv2'])} m); "
        f"IN-01 sem diâmetro nem cota declarados. Exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="mobile", width=MOBILE_W, height=MOBILE_H, title=title, desc=desc + _prov("infra", "infra_consumption"),
        heading="Rede DR-01 e faixa PV-01", source_note="", body="\n".join(body),
        carimbo=_mobile_carimbo("PC-M", n["revision"], pid, ("Escala indicativa", "cotas em m")),
    )


# ---------------------------------------------------------------------------
# P8 · inspecao-fachada and P9 · pericia-fachada (same map, two readings)
# ---------------------------------------------------------------------------


def _fac(src: dict) -> dict:
    f = src["facade"]
    op = src["openings"]
    return {
        "W": Decimal(f["width_m"]), "H": Decimal(f["height_m"]), "levels": [Decimal(v) for v in f["floor_levels_m"]],
        "floor_labels": f["floor_labels_pt_br"], "axes": f["axes"],
        "ow": Decimal(op["width_m"]), "oh": Decimal(op["height_m"]), "sill": Decimal(op["sill_m"]),
        "ox": [Decimal(v) for v in op["x_offsets_m"]], "oids": op["ids"],
        "m": src["manifestations"], "q": src["quesitos"], "revision": src["revision"], "title": src["title"],
    }


def _facade(n: dict, X0: float, Y0: float, s: float, *, size: float = S.FS_DIM, label_size: float = S.FS_LABEL, callouts: int = 4, labels: bool = True) -> str:
    W, H = float(n["W"]), float(n["H"])

    def X(m: float) -> float:
        return X0 + m * s

    def Y(m: float) -> float:
        return Y0 - m * s

    parts = [rect(X(0), Y(H), W * s, H * s, fill=WHITE, stroke=INK, stroke_width=fmt(S.SW_CUT))]
    parts.append(line(X(0) - 10, Y(0), X(W) + 10, Y(0), stroke=INK, stroke_width=fmt(S.SW_CUT)))
    for lv in n["levels"][1:-1]:
        parts.append(line(X(0), Y(float(lv)), X(W), Y(float(lv)), stroke=MUTED, stroke_width=fmt(S.SW_DIM), stroke_dasharray="6 3"))
    ow, oh, sill = float(n["ow"]), float(n["oh"]), float(n["sill"])
    k = 0
    for fl in n["levels"][:-1]:
        for ox in n["ox"]:
            x, y = float(ox), float(fl) + sill
            parts.append(rect(X(x), Y(y + oh), ow * s, oh * s, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
            if labels:
                parts.append(text(X(x + ow / 2), Y(y + oh) - 3, n["oids"][k], size=size, fill=MUTED, anchor="middle"))
            k += 1
    if labels:
        for ax in n["axes"]:
            xx = X(float(ax["x_m"]))
            parts.append(line(xx, Y(H), xx, Y(H) - 14, stroke=MUTED, stroke_width=fmt(S.SW_DIM)))
            parts.append(text(xx, Y(H) - 18, ax["id"], size=label_size, weight=S.FW_LABEL, fill=MUTED, anchor="middle"))
        for i, lab in enumerate(n["floor_labels"]):
            parts.append(text(X(W) - 6, Y(float(n["levels"][i])) - 6, lab, size=size, fill=MUTED, anchor="end"))
    # manifestations
    for m in n["m"]:
        x, y = float(m["x_m"]), float(m["y_m"])
        if m["kind"] in ("fissura_inclinada", "fissura_horizontal"):
            ln = float(m["length_m"])
            if m["kind"] == "fissura_inclinada":
                dx = dy = ln * 0.7071
                d = f"M{fmt(X(x))} {fmt(Y(y))}l{fmt(dx * s * .3)} {fmt(-dy * s * .3)}l{fmt(dx * s * .05)} {fmt(dy * s * .02)}l{fmt(dx * s * .35)} {fmt(-dy * s * .38)}l{fmt(dx * s * .3)} {fmt(-dy * s * .34)}"
            else:
                d = f"M{fmt(X(x))} {fmt(Y(y))}h{fmt(ln * s * .35)}l{fmt(ln * s * .05)} {fmt(-1.5)}h{fmt(ln * s * .3)}l{fmt(ln * s * .05)} {fmt(1.5)}h{fmt(ln * s * .25)}"
            parts.append(path(d, fill="none", stroke=GREEN, stroke_width=fmt(S.SW_CUT)))
            ex, ey = (X(x) + dx * s, Y(y) - dy * s) if m["kind"] == "fissura_inclinada" else (X(x) + ln * s, Y(y))
            target = ((X(x) + ex) / 2, (Y(y) + ey) / 2)
        elif m["kind"] == "mancha_umidade":
            w, h = float(m["width_m"]), float(m["height_m"])
            parts.append(f'<ellipse cx="{fmt(X(x + w / 2))}" cy="{fmt(Y(y + h / 2))}" rx="{fmt(w * s / 2)}" ry="{fmt(h * s / 2)}" fill="{LIME}" fill-opacity=".35" stroke="{GREEN}" stroke-width="{fmt(S.SW_OUTLINE)}" stroke-dasharray="4 3"/>')
            target = (X(x + w), Y(y + h / 2))
        else:
            w, h = float(m["width_m"]), float(m["height_m"])
            parts.append(rect(X(x), Y(y + h), w * s, h * s, fill=LIME, fill_opacity=".35", stroke=GREEN, stroke_width=fmt(S.SW_OUTLINE)))
            target = (X(x + w), Y(y + h / 2))
        if m["n"] <= callouts:
            cx = target[0] + (34 if s >= 30 else 22)
            cy = target[1] - (22 if s >= 30 else 14)
            parts.append(leader(cx, cy, target[0], target[1]))
            parts.append(callout(cx, cy, m["n"], size=size if s < 30 else S.FS_DIM))
        elif labels:
            parts.append(text(target[0] + 4, target[1] + 4, m["id"], size=size, weight=S.FW_LABEL, fill=GREEN))
    return "".join(parts)


def _facade_dims(n: dict, X0: float, Y0: float, s: float, *, size: float = S.FS_DIM) -> str:
    W, H = float(n["W"]), float(n["H"])

    def X(m: float) -> float:
        return X0 + m * s

    def Y(m: float) -> float:
        return Y0 - m * s

    items = [dim_h(X(0), X(W), Y0 + 26, f"{br(n['W'])} m", y_obj=Y0, above=False, size=size)]
    for lv in n["levels"]:
        items.append(level(X(W) + 3, Y(float(lv)), br(lv), left=False, size=size))
    items.append(dim_v(Y(H), Y(0), X(0) - 22, f"{br(n['H'])} m", x_obj=X(0), size=size))
    return dim_group(*items)


def p8_desktop(data: dict) -> str:
    n = _fac(data["inspecao_fachada"])
    W_, H_ = 1200, 620
    pid = "inspecao-fachada"
    s = 42.0
    X0, Y0 = 120.0, 506.0
    body = [text(100, 80, "Elevação · fachada leste FA-L · manifestações numeradas na data da inspeção", size=S.FS_LABEL, weight=S.FW_LABEL)]
    body.append(_facade(n, X0, Y0, s))
    body.append(_facade_dims(n, X0, Y0, s))
    m = {x["id"]: x for x in n["m"]}
    body.append(_legend(720, 128, "Registro por item · o que foi visto, medido e o que ficou em aberto", [
        ("1", f"{m['M-01']['label_pt_br']} · {m['M-01']['location_pt_br']}"),
        ("", f"{br(m['M-01']['length_m'])} m a {br(m['M-01']['angle_deg'], 0)}°, abertura {br(m['M-01']['opening_mm'])} mm · {m['M-01']['record_pt_br']}", INK),
        ("2", f"{m['M-02']['label_pt_br']} · {m['M-02']['location_pt_br']}"),
        ("", f"{br(m['M-02']['width_m'])} × {br(m['M-02']['height_m'])} m · {m['M-02']['record_pt_br']}", INK),
        ("3", f"{m['M-03']['label_pt_br']} · {m['M-03']['location_pt_br']}"),
        ("", f"{br(m['M-03']['width_m'])} × {br(m['M-03']['height_m'])} m · {m['M-03']['record_pt_br']}", INK),
        ("4", f"{m['M-04']['label_pt_br']} · {m['M-04']['location_pt_br']}"),
        ("", f"{br(m['M-04']['length_m'])} m, abertura {br(m['M-04']['opening_mm'])} mm · {m['M-04']['record_pt_br']}", INK),
        ("", "Causa não concluída em todos os itens: hipótese não é causa única."),
        ("", "Próximo exame por item: monitoramento, ensaio de umidade, percussão ou leitura do projeto."),
        ("", "Inspeção visual com trena e fissurômetro; sem abertura, ensaio ou monitoramento.", INK),
        ("", "Registro de uma data; a fachada pode mudar depois dela.", INK),
    ], step=17))
    title = f"Prancha PD · {n['title']}: registro por item · exemplo demonstrativo"
    desc = (
        f"Elevação da fachada leste de {br(n['W'])} por {br(n['H'])} m, três pavimentos, com quatro manifestações numeradas: fissura inclinada M-01 de {br(m['M-01']['length_m'])} m, "
        f"mancha de umidade M-02 de {br(m['M-02']['width_m'])} por {br(m['M-02']['height_m'])} m, desplacamento M-03 de {br(m['M-03']['width_m'])} por {br(m['M-03']['height_m'])} m e fissura horizontal M-04 de {br(m['M-04']['length_m'])} m. "
        "Cada item com localização, medida, o que foi visto e o exame seguinte; causa não concluída. Fachada sintética; exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="desktop", width=W_, height=H_, title=title, desc=desc + _prov("inspecao_fachada"),
        heading="Inspeção: cada manifestação localizada, medida e registrada com o que ficou em aberto",
        source_note=_note(n["revision"]), body="\n".join(body),
        carimbo=_desktop_carimbo(W_, H_, "PD", pid, n["revision"], "Escala indicativa · cotas em m · aberturas em mm"),
    )


def p8_mobile(data: dict) -> str:
    n = _fac(data["inspecao_fachada"])
    pid = "inspecao-fachada"
    fs = FS_M
    s = 22.0
    X0, Y0 = 48.0, 278.0
    m = {x["id"]: x for x in n["m"]}
    body = [text(X0, 66, "Fachada leste FA-L · 4 itens", size=fs, weight=S.FW_LABEL)]
    # Aceite 2026-09-17 (B-09): o título da rota promete quatro manifestações
    # numeradas. A composição móvel guarda duas chamadas (contrato: recomposição,
    # não escala) e numera as outras duas no rótulo e na legenda.
    body.append(_facade(n, X0, Y0, s, size=fs, label_size=fs, callouts=2, labels=False))
    body.append(dim_group(
        dim_h(X0, X0 + float(n["W"]) * s, Y0 + 18, f"{br(n['W'])} m", y_obj=Y0, above=False, size=fs),
        dim_v(Y0 - float(n["H"]) * s, Y0, X0 - 16, f"{br(n['H'])} m", x_obj=X0, size=fs),
    ))
    for mid in ("M-03", "M-04"):
        mm = m[mid]
        x, y = float(mm["x_m"]), float(mm["y_m"])
        dx = -50 if mid == "M-03" else 6  # M-04 (fissura horizontal): rótulo dentro da fachada, acima do traço
        body.append(text(X0 + x * s + dx, Y0 - y * s - 5, f"{mm['n']} {mid}", size=fs, weight=S.FW_LABEL, fill=GREEN))
    body.append(text(20, 326, f"1 M-01 fissura {br(m['M-01']['length_m'])} m · {br(m['M-01']['opening_mm'])} mm · não aberta", size=fs))
    body.append(text(20, 341, f"2 M-02 mancha {br(m['M-02']['width_m'])} × {br(m['M-02']['height_m'])} m · sem ensaio", size=fs))
    body.append(text(20, 356, f"3 M-03 desplacamento {br(m['M-03']['width_m'])} × {br(m['M-03']['height_m'])} m", size=fs))
    body.append(text(20, 371, f"4 M-04 fissura {br(m['M-04']['length_m'])} m · {br(m['M-04']['opening_mm'])} mm", size=fs))
    title = f"Prancha PD (móvel) · {n['title']} · exemplo demonstrativo"
    desc = (
        f"Elevação da fachada leste de {br(n['W'])} por {br(n['H'])} m com quatro manifestações numeradas; M-01 fissura de {br(m['M-01']['length_m'])} m e M-02 mancha de "
        f"{br(m['M-02']['width_m'])} por {br(m['M-02']['height_m'])} m em destaque. Causa não concluída; registro de uma data. Exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="mobile", width=MOBILE_W, height=MOBILE_H, title=title, desc=desc + _prov("inspecao_fachada"),
        heading="Mapa de manifestações · FA-L", source_note="", body="\n".join(body),
        carimbo=_mobile_carimbo("PD-M", n["revision"], pid, ("Escala indicativa", "cotas em m")),
    )


def p9_desktop(data: dict) -> str:
    n = _fac(data["inspecao_fachada"])
    W_, H_ = 1200, 620
    pid = "pericia-fachada"
    s = 40.0
    X0, Y0 = 110.0, 500.0
    q = {x["id"]: x for x in n["q"]}
    body = [text(100, 80, "Elevação · fachada leste FA-L · o mesmo mapa lido como evidência da parte", size=S.FS_LABEL, weight=S.FW_LABEL)]
    body.append(_facade(n, X0, Y0, s))
    body.append(_facade_dims(n, X0, Y0, s))
    items = []
    for qid in ("Q-01", "Q-02", "Q-03"):
        qq = q[qid]
        items.append(("", f"{qid} · itens {', '.join(qq['manifestation_ids'])}", INK))
        items.append(("", f"Quesito: {qq['question_pt_br']}"))
        items.append(("", f"Evidência: {qq['evidence_pt_br']}"))
        items.append(("", f"Conclusão delimitada: {qq['conclusion_pt_br']}", INK))
    items.append(("", "Assistente da parte: organiza a evidência e formula o quesito."))
    items.append(("", "Perito do juízo: nomeado pelo juiz, produz o laudo. Advogado: tese e peças.", INK))
    body.append(_legend(680, 128, "Quesito · evidência · conclusão delimitada", items, step=17, size=10.5))
    title = f"Prancha PE · {n['title']}: quesito, evidência e conclusão delimitada · exemplo demonstrativo"
    desc = (
        f"Elevação da fachada leste de {br(n['W'])} por {br(n['H'])} m com as quatro manifestações M-01 a M-04 e três quesitos: Q-01 sobre as fissuras M-01 e M-04, Q-02 sobre a mancha M-02, "
        "Q-03 sobre o desplacamento M-03, cada um com a evidência disponível e a conclusão delimitada ao que a evidência sustenta. O laudo é do perito do juízo. "
        "Fachada sintética; exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="desktop", width=W_, height=H_, title=title, desc=desc + _prov("inspecao_fachada"),
        heading="Assistência técnica: o mesmo mapa, agora com quesito, evidência e conclusão delimitada",
        source_note=_note(n["revision"]), body="\n".join(body),
        carimbo=_desktop_carimbo(W_, H_, "PE", pid, n["revision"], "Escala indicativa · cotas em m"),
    )


def p9_mobile(data: dict) -> str:
    n = _fac(data["inspecao_fachada"])
    pid = "pericia-fachada"
    fs = FS_M
    s = 20.0
    X0, Y0 = 48.0, 256.0
    q = {x["id"]: x for x in n["q"]}
    m = {x["id"]: x for x in n["m"]}
    body = [text(X0, 66, "FA-L · quesitos sobre 4 itens", size=fs, weight=S.FW_LABEL)]
    # Aceite 2026-09-17 (B-03): as notas terminam com respiro antes do carimbo
    # (topo em MOBILE_H - FRAME_PAD - TITLE_BLOCK_H = 384); duas chamadas e os
    # outros dois itens numerados no rótulo, como em PD-M.
    body.append(_facade(n, X0, Y0, s, size=fs, label_size=fs, callouts=2, labels=False))
    body.append(dim_group(dim_h(X0, X0 + float(n["W"]) * s, Y0 + 18, f"{br(n['W'])} m", y_obj=Y0, above=False, size=fs)))
    for mid in ("M-03", "M-04"):
        mm = m[mid]
        dx = -50 if mid == "M-03" else 6
        body.append(text(X0 + float(mm["x_m"]) * s + dx, Y0 - float(mm["y_m"]) * s - 5, f"{mm['n']} {mid}", size=fs, weight=S.FW_LABEL, fill=GREEN))
    body.append(text(20, 308, "Q-01 · M-01, M-04 · geometria registrada;", size=fs))
    body.append(text(20, 323, "origem não afirmada sem monitoramento", size=fs, fill=MUTED))
    body.append(text(20, 338, "Q-02 · M-02 · fonte não afirmada sem ensaio", size=fs))
    body.append(text(20, 353, "Q-03 · M-03 · extensão não afirmada sem percussão", size=fs))
    body.append(text(20, 370, "Laudo: perito do juízo · quesito: assistente da parte", size=fs, weight=S.FW_LABEL))
    title = f"Prancha PE (móvel) · {n['title']}: quesitos · exemplo demonstrativo"
    desc = (
        f"Elevação da fachada leste de {br(n['W'])} por {br(n['H'])} m com as manifestações M-01 a M-04 e os quesitos Q-01 ({q['Q-01']['conclusion_pt_br']}), "
        f"Q-02 ({q['Q-02']['conclusion_pt_br']}) e Q-03 ({q['Q-03']['conclusion_pt_br']}). Exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="mobile", width=MOBILE_W, height=MOBILE_H, title=title, desc=desc + _prov("inspecao_fachada"),
        heading="Quesitos sobre o mapa · FA-L", source_note="", body="\n".join(body),
        carimbo=_mobile_carimbo("PE-M", n["revision"], pid, ("Escala indicativa", "cotas em m")),
    )


# ---------------------------------------------------------------------------
# P10 · sst-canteiro
# ---------------------------------------------------------------------------


def _sst(src: dict) -> dict:
    return {
        "W": Decimal(src["site"]["width_m"]), "D": Decimal(src["site"]["depth_m"]),
        "areas": {a["id"]: a for a in src["areas"]}, "p": src["protections"], "sum": src["checklist_summary"],
        "revision": src["revision"], "title": src["title"],
    }


def _site_plan(n: dict, X0: float, Y0: float, s: float, hid: str, *, size: float = S.FS_DIM, label_size: float = S.FS_LABEL, callouts: int = 4, labels: bool = True) -> str:
    W, D = float(n["W"]), float(n["D"])
    a = n["areas"]

    def X(m: float) -> float:
        return X0 + m * s

    def Y(m: float) -> float:
        return Y0 + (D - m) * s

    ed, ci, gr, ta = a["ED-01"], a["CI-01"], a["GR-01"], a["TA-01"]
    ex, ey, ew, edp = (float(ed[k]) for k in ("x_m", "y_m", "width_m", "depth_m"))
    cx_, cy_, cw, cd = (float(ci[k]) for k in ("x_m", "y_m", "width_m", "depth_m"))
    gx, gy, gr_ = float(gr["x_m"]), float(gr["y_m"]), float(gr["radius_m"])
    tx, ty, tw, td = (float(ta[k]) for k in ("x_m", "y_m", "width_m", "depth_m"))
    parts = [rect(X(0), Y(D), W * s, D * s, fill=WHITE, stroke=INK, stroke_width=fmt(S.SW_CUT))]
    parts.append(rect(X(cx_), Y(cy_ + cd), cw * s, cd * s, fill=SOFT, stroke=MUTED, stroke_width=fmt(S.SW_DIM)))
    parts.append(rect(X(ex), Y(ey + edp), ew * s, edp * s, fill=f"url(#{hid})", stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    # P-01 guarda-corpo: north, east and west edges of the slab (green, cut weight)
    p = {x["id"]: x for x in n["p"]}
    parts.append(path(f"M{fmt(X(ex))} {fmt(Y(ey))}V{fmt(Y(ey + edp))}H{fmt(X(ex + ew))}V{fmt(Y(ey))}", fill="none", stroke=GREEN, stroke_width=fmt(S.SW_CUT)))
    # P-02 bandeja pendente: dashed band along the south edge over the circulation
    parts.append(rect(X(ex), Y(ey) - 2, ew * s, 0.8 * s, fill="none", stroke=MUTED, stroke_width=fmt(S.SW_OUTLINE), stroke_dasharray="5 3"))
    # P-03 isolamento: crane radius, dashed green
    parts.append(f'<circle cx="{fmt(X(gx))}" cy="{fmt(Y(gy))}" r="{fmt(gr_ * s)}" fill="none" stroke="{GREEN}" stroke-width="{fmt(S.SW_OUTLINE)}" stroke-dasharray="5 3"/>')
    parts.append(f'<circle cx="{fmt(X(gx))}" cy="{fmt(Y(gy))}" r="{fmt(0.5 * s)}" fill="{INK}"/>')
    # P-04 torre de acesso
    parts.append(rect(X(tx), Y(ty + td), tw * s, td * s, fill=WHITE, stroke=GREEN, stroke_width=fmt(S.SW_CUT)))
    if labels:
        parts.append(text(X(ex + ew / 2), Y(ey + edp / 2) + 4, ed["label_pt_br"], size=label_size, weight=S.FW_LABEL, anchor="middle"))
        parts.append(text(X(cx_ + cw / 2), Y(cy_ + cd / 2) + 4, ci["label_pt_br"], size=size, fill=MUTED, anchor="middle"))
        parts.append(text(X(gx), Y(gy) - 0.9 * s, "GR-01", size=size, weight=S.FW_LABEL, anchor="middle"))
        parts.append(text(X(tx + tw / 2), Y(ty) + size + 4, "TA-01", size=size, weight=S.FW_LABEL, fill=GREEN, anchor="middle"))
    targets = {
        "P-01": (X(ex + ew), Y(ey + edp * 0.75)),
        "P-02": (X(ex), Y(ey) + 0.4 * s),
        "P-03": (X(gx), Y(gy) - gr_ * s),
        "P-04": (X(tx + tw), Y(ty + td / 2)),
    }
    offs = {"P-01": (36, -20), "P-02": (-34, 0), "P-03": (34, -16), "P-04": (30, -24)}
    for pid_, (tx_, ty_) in targets.items():
        item = p[pid_]
        if item["n"] <= callouts:
            ox, oy = offs[pid_]
            k = 1.0 if s >= 10 else 0.7
            cx, cy = tx_ + ox * k, ty_ + oy * k
            parts.append(leader(cx, cy, tx_, ty_))
            parts.append(callout(cx, cy, item["n"], size=size if s < 10 else S.FS_DIM))
    return "".join(parts)


def p10_desktop(data: dict) -> str:
    n = _sst(data["sst_canteiro"])
    W_, H_ = 1200, 580
    pid = "sst-canteiro"
    hid = S.hatch_id(f"{pid}-d")
    s = 13.0
    X0, Y0 = 110.0, 112.0
    W, D = float(n["W"]), float(n["D"])
    body = [S.hatch_defs(f"{pid}-d")]
    body.append(text(100, 80, "Planta · canteiro CT-01 · proteções coletivas numeradas · norte para cima", size=S.FS_LABEL, weight=S.FW_LABEL))
    body.append(_site_plan(n, X0, Y0, s, hid))
    body.append(dim_group(
        dim_h(X0, X0 + W * s, Y0 + D * s + 26, f"{br(n['W'])} m", y_obj=Y0 + D * s, above=False),
        dim_v(Y0, Y0 + D * s, X0 - 22, f"{br(n['D'])} m", x_obj=X0),
    ))
    x = 740.0
    y = 128.0
    body.append(text(x, y, f"Checklist · {br(n['sum']['checked'], 0)} conferidos · {br(n['sum']['pending'], 0)} pendente de {br(n['sum']['total'], 0)}", size=S.FS_LABEL, weight=S.FW_LABEL))
    for item in n["p"]:
        y += 26
        body.append(_check_box(x, y, item["checked"]))
        body.append(text(x + 16, y, f"{item['n']} {item['label_pt_br']} · {br(item['extent_m'])} m · {item['status_pt_br']}", size=S.FS_DIM, weight=S.FW_LABEL, fill=INK if item["checked"] else MUTED))
        y += 15
        body.append(text(x + 16, y, item["location_pt_br"], size=S.FS_DIM, fill=MUTED))
        y += 15
        body.append(text(x + 16, y, item["note_pt_br"], size=S.FS_DIM, fill=MUTED))
    body.append(_legend(x, y + 30, "", [
        ("", "Conferência documental e de campo do escopo informado, em uma data.", INK),
        ("", "Não é PGR, LTCAT, AET nem laudo; não substitui o programa da obra nem ato médico."),
        ("", "Item pendente volta ao responsável pela obra com localização e evidência."),
    ], step=17))
    title = f"Prancha PF · {n['title']} · exemplo demonstrativo"
    desc = (
        f"Planta de um canteiro de {br(n['W'])} por {br(n['D'])} m com a edificação em execução, a circulação de pedestres, a grua e a torre de acesso, e quatro proteções coletivas numeradas: "
        f"guarda-corpo de periferia conferido, bandeja de proteção pendente, isolamento da área de içamento conferido e torre de acesso com guarda-corpo conferida; "
        f"{br(n['sum']['checked'], 0)} conferidos e {br(n['sum']['pending'], 0)} pendente. Canteiro sintético; exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="desktop", width=W_, height=H_, title=title, desc=desc + _prov("sst_canteiro"),
        heading="Segurança do trabalho: o que foi conferido no canteiro, onde, e o que ficou pendente",
        source_note=_note(n["revision"]), body="\n".join(body),
        carimbo=_desktop_carimbo(W_, H_, "PF", pid, n["revision"], "Escala indicativa · cotas em m"),
    )


def p10_mobile(data: dict) -> str:
    n = _sst(data["sst_canteiro"])
    pid = "sst-canteiro"
    hid = S.hatch_id(f"{pid}-m")
    fs = FS_M
    s = 6.4
    X0, Y0 = 48.0, 72.0
    W, D = float(n["W"]), float(n["D"])
    body = [S.hatch_defs(f"{pid}-m")]
    body.append(_site_plan(n, X0, Y0, s, hid, size=fs, label_size=fs, callouts=2, labels=False))
    body.append(dim_group(
        dim_h(X0, X0 + W * s, Y0 + D * s + 20, f"{br(n['W'])} m", y_obj=Y0 + D * s, above=False, size=fs),
        dim_v(Y0, Y0 + D * s, X0 - 14, f"{br(n['D'])} m", x_obj=X0, size=fs),
    ))
    y = 286.0
    for item in n["p"]:
        body.append(_check_box(20, y, item["checked"], size=8))
        short = f"{item['n']} {item['label_pt_br']} · {item['status_pt_br'].lower()}"
        body.append(text(34, y, short, size=fs, fill=INK if item["checked"] else MUTED))
        y += 16
    body.append(text(20, y + 6, f"{br(n['sum']['checked'], 0)} conferidos · {br(n['sum']['pending'], 0)} pendente · não é PGR nem laudo", size=fs, weight=S.FW_LABEL))
    title = f"Prancha PF (móvel) · {n['title']} · exemplo demonstrativo"
    desc = (
        f"Planta de um canteiro de {br(n['W'])} por {br(n['D'])} m com quatro proteções coletivas: guarda-corpo conferido, bandeja pendente, isolamento da grua conferido e torre de acesso conferida; "
        f"{br(n['sum']['checked'], 0)} conferidos e {br(n['sum']['pending'], 0)} pendente. Exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="mobile", width=MOBILE_W, height=MOBILE_H, title=title, desc=desc + _prov("sst_canteiro"),
        heading="Canteiro CT-01 · proteções conferidas", source_note="", body="\n".join(body),
        carimbo=_mobile_carimbo("PF-M", n["revision"], pid, ("Escala indicativa", "cotas em m")),
    )


# ---------------------------------------------------------------------------
# PG · pacote-entrega and PH · interfaces-versoes (projetos complementares):
# structure diagrams, same vocabulary as the pilot's P4 (boxes, open arrows,
# callouts, no number outside the JSON). Desktop = one row; mobile = one column.
# ---------------------------------------------------------------------------


def _flow_row(items: list[dict], *, x0: float, y0: float, bw: float, bh: float, gap: float, focus_id: str | None, callouts: dict[str, int]) -> str:
    parts = []
    for i, it in enumerate(items):
        x = x0 + i * (bw + gap)
        focus = it["id"] == focus_id
        parts.append(rect(x, y0, bw, bh, fill=WHITE, stroke=GREEN if focus else INK, stroke_width=fmt(S.SW_CUT if focus else S.SW_OUTLINE)))
        parts.append(text(x + 14, y0 + 22, it["id"], fill=MUTED))
        parts.append(text(x + 14, y0 + 46, it["label_pt_br"], size=S.FS_LABEL + 1, weight=S.FW_LABEL, fill=GREEN if focus else INK))
        for j, ln in enumerate(it["lines_pt_br"]):
            parts.append(text(x + 14, y0 + 72 + j * 17, ln, size=S.FS_LABEL))
        if i < len(items) - 1:
            parts.append(S.arrow_h(x + bw + 4, x + bw + gap - 4, y0 + bh / 2))
        if it["id"] in callouts:
            parts.append(callout(x + bw - 2, y0 + 2, callouts[it["id"]]))
    return "\n".join(parts)


def _flow_column(items: list[dict], *, bx: float, y0: float, bw: float, bh: float, gap: float, focus_id: str | None, callouts: dict[str, int]) -> str:
    fs = FS_M
    parts = []
    for i, it in enumerate(items):
        y = y0 + i * (bh + gap)
        focus = it["id"] == focus_id
        parts.append(rect(bx, y, bw, bh, fill=WHITE, stroke=GREEN if focus else INK, stroke_width=fmt(S.SW_CUT if focus else S.SW_OUTLINE)))
        parts.append(text(bx + 12, y + bh * 0.4, f"{it['id']} · {it['label_pt_br']}", size=fs, weight=S.FW_LABEL, fill=GREEN if focus else INK))
        parts.append(text(bx + 12, y + bh * 0.4 + 18, it["short_pt_br"], size=fs, fill=MUTED))
        if i < len(items) - 1:
            parts.append(S.arrow_v(y + bh + 2, y + bh + gap - 2, bx + bw / 2))
        if it["id"] in callouts:
            parts.append(callout(bx + bw + 14, y + bh / 2, callouts[it["id"]], size=fs))
    return "\n".join(parts)


def pg_desktop(data: dict) -> str:
    src = data["elaboracao"]
    n = src["pacote"]
    W_, H_ = 1200, 400
    pid = "pacote-entrega"
    pieces = n["pieces"]
    bw, gap, bh, y0 = 240.0, 32.0, 150.0, 104.0
    x0 = (W_ - (len(pieces) * bw + (len(pieces) - 1) * gap)) / 2
    body = [text(28, 72, "Quatro peças da disciplina contratada · a arquitetura de origem fica fora da autoria · sem dimensionamento nesta prancha", size=S.FS_LABEL, weight=S.FW_LABEL)]
    body.append(_flow_row(pieces, x0=x0, y0=y0, bw=bw, bh=bh, gap=gap, focus_id=None, callouts={p["id"]: p["n"] for p in pieces}))
    # the origin, drawn outside the four pieces: it feeds the row and stays with its author
    ox, oy, ow, oh = x0, y0 + bh + 34, 300.0, 44.0
    body.append(rect(ox, oy, ow, oh, fill=SOFT, stroke=RULE))
    body.append(text(ox + 14, oy + 27, n["origin_pt_br"], size=S.FS_LABEL, weight=S.FW_LABEL, fill=MUTED))
    body.append(S.arrow_v(oy - 4, y0 + bh + 4, x0 + bw / 2))
    for j, ln in enumerate(n["note_lines_pt_br"]):
        body.append(text(ox + ow + 36, oy + 18 + j * 18, ln, fill=MUTED))
    title = f"Prancha PG · {n['title']} · exemplo demonstrativo"
    desc = (
        "Diagrama de estrutura com quatro peças: " + ", ".join(p["label_pt_br"] for p in pieces) + ". "
        + " ".join(n["note_lines_pt_br"]) + " Não representa cliente, obra executada nem dimensionamento concluído. Exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="desktop", width=W_, height=H_, title=title, desc=desc + _prov("elaboracao"),
        heading=n["title"], source_note=_note(src["revision"]), body="\n".join(body),
        carimbo=_desktop_carimbo(W_, H_, "PG", pid, src["revision"], "Sem escala · diagrama de estrutura"),
    )


def pg_mobile(data: dict) -> str:
    src = data["elaboracao"]
    n = src["pacote"]
    pid = "pacote-entrega"
    fs = FS_M
    pieces = n["pieces"]
    bx, bw, bh, gap, y0 = 24.0, 276.0, 54.0, 16.0, 60.0
    body = [_flow_column(pieces, bx=bx, y0=y0, bw=bw, bh=bh, gap=gap, focus_id=None, callouts={})]
    y_leg = y0 + len(pieces) * (bh + gap) - gap + 26
    for ln in n["mobile_note_lines_pt_br"]:
        body.append(text(20, y_leg, ln, size=fs, fill=MUTED))
        y_leg += 17
    title = f"Prancha PG (móvel) · {n['title']} · exemplo demonstrativo"
    desc = (
        "Quatro peças de cima para baixo: " + ", ".join(p["label_pt_br"] for p in pieces) + ". "
        + " ".join(n["mobile_note_lines_pt_br"]) + " Exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="mobile", width=MOBILE_W, height=MOBILE_H, title=title, desc=desc + _prov("elaboracao"),
        heading="Peças da entrega complementar", source_note="", body="\n".join(body),
        carimbo=_mobile_carimbo("PG-M", src["revision"], pid, ("Sem escala", "diagrama")),
    )


def ph_desktop(data: dict) -> str:
    src = data["elaboracao"]
    n = src["interfaces"]
    W_, H_ = 1200, 460
    pid = "interfaces-versoes"
    stages = n["stages"]
    bw, gap, bh, y0 = 240.0, 32.0, 140.0, 104.0
    x0 = (W_ - (len(stages) * bw + (len(stages) - 1) * gap)) / 2
    callouts = {c["stage_id"]: c["n"] for c in n["callouts"]}
    body = [text(28, 72, "Cada seta é uma combinação explícita · nenhuma etapa copia ou adultera o projeto de terceiro · ciclos, prazo e preço ficam na proposta", size=S.FS_LABEL, weight=S.FW_LABEL)]
    body.append(_flow_row(stages, x0=x0, y0=y0, bw=bw, bh=bh, gap=gap, focus_id=n["focus_stage_id"], callouts=callouts))
    body.append(text(x0, y0 + bh + 36, "Percurso de um ciclo: os insumos delimitam a disciplina; a disciplina nomeia as interfaces; a versão devolvida registra o que mudou e para quem cada pendência volta.", fill=MUTED))
    body.append(_legend(x0, y0 + bh + 72, "Chamadas", [(str(c["n"]), c["text_pt_br"]) for c in n["callouts"]]))
    title = f"Prancha PH · {n['title']} · exemplo demonstrativo"
    desc = (
        "Diagrama de fluxo em quatro etapas: " + " → ".join(st["label_pt_br"] for st in stages) + ". "
        + " ".join(c["text_pt_br"] for c in n["callouts"]) + " Não fixa prazo, preço, quantidade de ciclos nem cobertura de campo. Exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="desktop", width=W_, height=H_, title=title, desc=desc + _prov("elaboracao"),
        heading=n["title"], source_note=_note(src["revision"]), body="\n".join(body),
        carimbo=_desktop_carimbo(W_, H_, "PH", pid, src["revision"], "Sem escala · diagrama de fluxo"),
    )


def ph_mobile(data: dict) -> str:
    src = data["elaboracao"]
    n = src["interfaces"]
    pid = "interfaces-versoes"
    fs = FS_M
    stages = n["stages"]
    bx, bw, bh, gap, y0 = 24.0, 276.0, 46.0, 16.0, 56.0
    mobile_ids = n["mobile_callout_stage_ids"]
    callouts = {sid: i for i, sid in enumerate(mobile_ids, start=1)}
    body = [_flow_column(stages, bx=bx, y0=y0, bw=bw, bh=bh, gap=gap, focus_id=n["focus_stage_id"], callouts=callouts)]
    y_leg = y0 + len(stages) * (bh + gap) - gap + 26
    for i, ln in enumerate(n["mobile_callouts_pt_br"], start=1):
        body.append(text(20, y_leg, f"{i} {ln}", size=fs, fill=MUTED))
        y_leg += 17
    title = f"Prancha PH (móvel) · {n['title']} · exemplo demonstrativo"
    desc = (
        "Fluxo de cima para baixo em quatro etapas: " + " → ".join(st["label_pt_br"] for st in stages) + ". "
        "Ciclos, prazo e preço ficam na proposta. Exemplo demonstrativo, sem obra de cliente."
    )
    return S.sheet(
        plate_id=pid, variant="mobile", width=MOBILE_W, height=MOBILE_H, title=title, desc=desc + _prov("elaboracao"),
        heading="Insumos, disciplina, interfaces, versão", source_note="", body="\n".join(body),
        carimbo=_mobile_carimbo("PH-M", src["revision"], pid, ("Sem escala", "fluxo")),
    )


RENDERERS = {
    ("interferencia-verga-viga", "desktop"): p5_desktop,
    ("interferencia-verga-viga", "mobile"): p5_mobile,
    ("revisao-conferencia", "desktop"): p6_desktop,
    ("revisao-conferencia", "mobile"): p6_mobile,
    ("drenagem-rede", "desktop"): p7_desktop,
    ("drenagem-rede", "mobile"): p7_mobile,
    ("inspecao-fachada", "desktop"): p8_desktop,
    ("inspecao-fachada", "mobile"): p8_mobile,
    ("pericia-fachada", "desktop"): p9_desktop,
    ("pericia-fachada", "mobile"): p9_mobile,
    ("sst-canteiro", "desktop"): p10_desktop,
    ("sst-canteiro", "mobile"): p10_mobile,
    ("pacote-entrega", "desktop"): pg_desktop,
    ("pacote-entrega", "mobile"): pg_mobile,
    ("interfaces-versoes", "desktop"): ph_desktop,
    ("interfaces-versoes", "mobile"): ph_mobile,
}
