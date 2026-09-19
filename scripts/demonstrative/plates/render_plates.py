"""Render the demonstrative plates (pranchas) from the demonstrative sources.

    python3 -m scripts.demonstrative.plates.render_plates          # write assets/pranchas/*.svg
    python3 -m scripts.demonstrative.plates.render_plates --check  # fail if versioned files differ

Every number and every piece of geometry comes from a JSON under
`data/demonstrative/`. The renderer is deterministic: no timestamps, no
randomness, fixed float formatting. Desktop and mobile are separate
compositions, never the same drawing scaled.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
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

ROOT = Path(__file__).resolve().parents[3]
OUT_DIR_REL = Path("assets/pranchas")
SOURCES = {
    "private": Path("data/demonstrative/private-project-pilot/source.v1.json"),
    "private_consumption": Path("data/demonstrative/private-project-pilot/consumption.v1.json"),
    "infra": Path("data/demonstrative/infrastructure-pilot/source.v1.json"),
    "infra_consumption": Path("data/demonstrative/infrastructure-pilot/consumption.v1.json"),
    "medicao": Path("data/demonstrative/plates/medicao-parede.v1.json"),
    "avaliacao": Path("data/demonstrative/plates/avaliacao-estrutura.v1.json"),
}
PLATE_SOURCES = {
    "recorte-banheiro": ("private", "private_consumption"),
    "drenagem-perfil": ("infra", "infra_consumption"),
    "medicao-parede": ("medicao",),
    "avaliacao-estrutura": ("avaliacao",),
}
MOBILE_W, MOBILE_H = 360, 420
MOBILE_MIN_FONT = 12.5
DEMO = S.DEMO_LABEL


def load(root: Path = ROOT) -> dict[str, dict]:
    return {key: json.loads((root / rel).read_text(encoding="utf-8")) for key, rel in SOURCES.items()}


def _elements(source: dict) -> dict[str, dict]:
    return {el["id"]: el for el in source["elements"]}


def _legend(x: float, y: float, heading: str, items: list[tuple], *, step: float = 18, size: float = S.FS_DIM) -> str:
    """Heading plus one line per item; numbered items get a bold numeral prefix.

    Items are (numeral, text) or (numeral, text, fill); unnumbered lines default to muted.
    """
    parts = [text(x, y, heading, size=S.FS_LABEL, weight=S.FW_LABEL)]
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


def _mobile_carimbo(code: str, revision: str, plate_id: str, scale_lines: tuple[str, str]) -> str:
    return S.title_block(
        MOBILE_W,
        MOBILE_H,
        ((code, f"rev. {revision}"), scale_lines, ("Exemplo demonstrativo",)),
        widths=(64, 120),
        size=MOBILE_MIN_FONT,
        id=f"{plate_id}-m-carimbo",
    )


def _desktop_carimbo(width: float, height: float, code: str, plate_id: str, revision: str, scale_text: str) -> str:
    return S.title_block(
        width,
        height,
        ((f"{code} · {plate_id} · rev. {revision}",), (scale_text,), (DEMO,)),
        id=f"{plate_id}-d-carimbo",
    )


def _public_note(revision: str) -> str:
    """Top-right note on desktop sheets. Public text only: no file names or internal ids."""
    return f"Dados demonstrativos · revisão {revision}"


def _provenance(*rels: str) -> str:
    return " Procedência: " + ", ".join(str(SOURCES[r]) for r in rels) + "."


# ---------------------------------------------------------------------------
# P1 · recorte-banheiro
# ---------------------------------------------------------------------------


def _p1_numbers(src: dict, cons: dict) -> dict:
    els = _elements(src)
    room = src["room"]
    totals = cons["named_totals"]
    L = Decimal(room["interior_length_m"])
    W = Decimal(room["interior_width_m"])
    H = Decimal(room["ceiling_height_m"])
    t = Decimal(src["wall_thickness_m"])
    walls = [els[i] for i in ("W-01", "W-02", "W-03", "W-04")]
    areas = {w["id"]: Decimal(w["length_m"]) * Decimal(w["height_m"]) for w in walls}
    gross = sum(areas.values())
    door = els["D-01"]
    win = els["WN-01"]
    beam = els["B-01"]
    shaft = els["HS-01"]
    memory = cons["sample_trail"]["calculation"]["memory"]
    for wid, area in areas.items():
        assert f"{wid} " in memory and br(area) in memory, f"wall_area_not_in_source_memory:{wid}"
    assert br(gross) in memory, "gross_area_not_in_source_memory"
    net = Decimal(totals["wall_net_m2"])
    assert gross - Decimal(totals["door_area_m2"]) - Decimal(totals["window_area_r01_m2"]) == net, "net_area_mismatch"
    return {
        "L": L, "W": W, "H": H, "t": t,
        "areas": areas, "gross": gross, "net": net,
        "door_w": Decimal(door["width_m"]), "door_h": Decimal(door["height_m"]), "door_off": Decimal(door["offset_m"]),
        "door_area": Decimal(totals["door_area_m2"]),
        "win_w": Decimal(win["width_m"]), "win_off": Decimal(win["offset_m"]), "sill": Decimal(win["sill_m"]),
        "head_r00": Decimal(totals["window_head_r00_m"]), "head_r01": Decimal(totals["window_head_r01_m"]),
        "win_area": Decimal(totals["window_area_r01_m2"]),
        "soffit": Decimal(totals["beam_soffit_m"]), "beam_depth": Decimal(beam["depth_m"]),
        "overlap": Decimal(totals["r00_overlap_m"]), "clearance": Decimal(totals["r01_clearance_m"]),
        "shaft_w": Decimal(shaft["width_m"]), "shaft_d": Decimal(shaft["depth_m"]), "shaft_off": Decimal(shaft["offset_m"]),
        "min_opening": Decimal(src["takeoff_criteria"]["opening_deduction_min_m2"]),
        "budget_id": cons["sample_trail"]["budget_id"],
        "quantity_id": cons["sample_trail"]["quantity_id"],
        "service": cons["sample_trail"]["spreadsheet_item"]["description"],
        "revision": src["revision"],
        "basis": src["takeoff_criteria"]["quantity_basis_revision"],
        "room_id": room["id"],
    }


def _p1_plan(n: dict, X0: float, Y0: float, s: float, hid: str, hid_g: str) -> str:
    L, W, t = float(n["L"]), float(n["W"]), float(n["t"])

    def X(m: float) -> float:
        return X0 + m * s

    def Y(m: float) -> float:
        return Y0 - m * s

    door_off, door_w = float(n["door_off"]), float(n["door_w"])
    win_off, win_w = float(n["win_off"]), float(n["win_w"])
    sh_off, sh_w, sh_d = float(n["shaft_off"]), float(n["shaft_w"]), float(n["shaft_d"])
    parts = []
    # wall ring, cut and hatched
    ring = (
        f"M{fmt(X(-t))} {fmt(Y(W + t))}H{fmt(X(L + t))}V{fmt(Y(-t))}H{fmt(X(-t))}Z"
        f"M{fmt(X(0))} {fmt(Y(W))}V{fmt(Y(0))}H{fmt(X(L))}V{fmt(Y(W))}Z"
    )
    parts.append(path(ring, fill=f"url(#{hid})", fill_rule="evenodd", stroke=INK, stroke_width=fmt(S.SW_CUT)))
    # W-02 in focus (east wall)
    parts.append(rect(X(L), Y(W + t), t * s, (W + 2 * t) * s, fill=f"url(#{hid_g})", stroke=GREEN, stroke_width=fmt(S.SW_CUT)))
    # beam B-01 projection on the east wall axis
    parts.append(line(X(L + t / 2), Y(W + t), X(L + t / 2), Y(-t), stroke=MUTED, stroke_width=fmt(S.SW_OUTLINE), stroke_dasharray="6 3"))
    # door D-01 on W-03 (north), leaf and swing
    parts.append(rect(X(door_off), Y(W + t) - 1.5, door_w * s, t * s + 3, fill=WHITE))
    parts.append(f'<g stroke="{INK}" stroke-width="{fmt(S.SW_OUTLINE)}">')
    parts.append(line(X(door_off), Y(W + t), X(door_off), Y(W)))
    parts.append(line(X(door_off + door_w), Y(W + t), X(door_off + door_w), Y(W)))
    parts.append(line(X(door_off), Y(W), X(door_off), Y(W - door_w)))
    parts.append("</g>")
    r = door_w * s
    parts.append(path(f"M{fmt(X(door_off))} {fmt(Y(W - door_w))}A{fmt(r)} {fmt(r)} 0 0 0 {fmt(X(door_off + door_w))} {fmt(Y(W))}", fill="none", stroke=MUTED, stroke_width=fmt(S.SW_DIM)))
    # window WN-01 on W-02 (east)
    parts.append(rect(X(L) - 1.5, Y(win_off + win_w), t * s + 3, win_w * s, fill=WHITE))
    parts.append(f'<g stroke="{INK}" stroke-width="{fmt(S.SW_OUTLINE)}">')
    parts.append(line(X(L), Y(win_off + win_w), X(L + t), Y(win_off + win_w)))
    parts.append(line(X(L), Y(win_off), X(L + t), Y(win_off)))
    parts.append("</g>")
    parts.append(f'<g stroke="{INK}" stroke-width="{fmt(S.SW_DIM)}">')
    parts.append(line(X(L + t / 3), Y(win_off + win_w), X(L + t / 3), Y(win_off)))
    parts.append(line(X(L + 2 * t / 3), Y(win_off + win_w), X(L + 2 * t / 3), Y(win_off)))
    parts.append("</g>")
    # shaft HS-01 outside W-04 (west)
    parts.append(rect(X(-t - sh_d), Y(sh_off + sh_w), sh_d * s, sh_w * s, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    parts.append(text(X(-t - sh_d / 2), Y(sh_off + sh_w / 2) + 4, "HS-01", anchor="middle"))
    # labels
    parts.append(f'<g font-size="{S.FS_LABEL}" font-weight="{S.FW_LABEL}">')
    parts.append(text(X(L / 2), Y(0) - 7, "W-01", size=S.FS_LABEL, anchor="middle"))
    parts.append(text(X(L) - 8, Y(W / 2), "W-02", size=S.FS_LABEL, fill=GREEN, anchor="middle", rotate=-90))
    parts.append(text(X(L - 0.5), Y(W) + 15, "W-03", size=S.FS_LABEL, anchor="middle"))
    parts.append(text(X(0) + 12, Y(W / 2), "W-04", size=S.FS_LABEL, anchor="middle", rotate=-90))
    parts.append(text(X(door_off + door_w / 2), Y(W + t) - 7, "D-01", size=S.FS_LABEL, anchor="middle"))
    parts.append(text(X(L + t) + 8, Y(win_off + win_w / 2) + 4, "WN-01", size=S.FS_LABEL))
    parts.append(text(X(L + t / 2), Y(W + t) - 7, "B-01", size=S.FS_LABEL, fill=MUTED, anchor="middle"))
    parts.append("</g>")
    parts.append(text(X(L - 0.9), Y(0.45), f"{n['room_id']} · {br(n['L'])} × {br(n['W'])} m", fill=MUTED))
    # dimensions
    parts.append(dim_group(
        dim_h(X(0), X(L), Y(-t) + 26, f"{br(n['L'])}", y_obj=Y(-t), above=False),
        dim_v(Y(W), Y(0), X(-t - sh_d) - 22, f"{br(n['W'])}", x_obj=X(-t)),
    ))
    return "".join(parts)


def _p1_elevation(n: dict, X0: float, Y0: float, s: float, hid: str, *, size: float = S.FS_DIM, label_size: float = S.FS_LABEL) -> str:
    W, H = float(n["W"]), float(n["H"])
    sill, head, soffit, depth = float(n["sill"]), float(n["head_r00"]), float(n["soffit"]), float(n["beam_depth"])
    win_off, win_w = float(n["win_off"]), float(n["win_w"])

    def X(m: float) -> float:
        return X0 + m * s

    def Y(m: float) -> float:
        return Y0 - m * s

    parts = [rect(X(0), Y(H), W * s, H * s, fill=WHITE, stroke=INK, stroke_width=fmt(S.SW_OUTLINE))]
    parts.append(rect(X(0), Y(H), W * s, depth * s, fill=f"url(#{hid})", stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    # window (drawn over the beam hatch), then the overlap band
    parts.append(rect(X(win_off), Y(head), win_w * s, (head - sill) * s, fill=WHITE, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    parts.append(rect(X(win_off) + 6, Y(head) + 6, win_w * s - 12, (head - sill) * s - 12, fill="none", stroke=INK, stroke_width=fmt(S.SW_DIM)))
    parts.append(rect(X(win_off), Y(head), win_w * s, (head - soffit) * s, fill=LIME, fill_opacity=".35"))
    parts.append(line(X(win_off), Y(soffit), X(win_off + win_w), Y(soffit), stroke=INK, stroke_width=fmt(S.SW_DIM), stroke_dasharray="4 2"))
    # labels
    bw = 92 if label_size <= 12 else 104
    parts.append(rect(X(W / 2) - bw / 2, Y(soffit + depth / 2) - label_size, bw, label_size + 6, fill=WHITE))
    parts.append(text(X(W / 2), Y(soffit + depth / 2) + 4, f"B-01 · fundo {br(n['soffit'])}", size=label_size, weight=S.FW_LABEL, anchor="middle"))
    parts.append(text(X(win_off + win_w / 2), Y((head + sill) / 2) + 4, "WN-01", size=label_size, weight=S.FW_LABEL, anchor="middle"))
    parts.append(text(X(W / 2), Y(0.28), "W-02", size=label_size, weight=S.FW_LABEL, fill=GREEN, anchor="middle"))
    return "".join(parts)


def p1_desktop(data: dict) -> str:
    src, cons = data["private"], data["private_consumption"]
    n = _p1_numbers(src, cons)
    W_, H_ = 1200, 640
    pid = "recorte-banheiro"
    hid, hid_g = S.hatch_id(f"{pid}-d"), S.hatch_id(f"{pid}-d", GREEN)
    s = 130.0
    body = [S.hatch_defs(f"{pid}-d", (MUTED, GREEN))]
    body.append(text(100, 80, f"Planta baixa · {n['room_id']} · paredes W-01 a W-04 · {n['revision']}", size=S.FS_LABEL, weight=S.FW_LABEL))
    body.append(text(620, 80, "Elevação leste · parede W-02 · estado original R00", size=S.FS_LABEL, weight=S.FW_LABEL))
    PX0, PY0 = 140.0, 400.0
    body.append(_p1_plan(n, PX0, PY0, s, hid, hid_g))
    EX0, EY0 = 700.0, 440.0
    body.append(_p1_elevation(n, EX0, EY0, s, hid))
    L, Wd, t, H = float(n["L"]), float(n["W"]), float(n["t"]), float(n["H"])
    sill, head, soffit = float(n["sill"]), float(n["head_r00"]), float(n["soffit"])
    win_off, win_w = float(n["win_off"]), float(n["win_w"])

    def EX(m: float) -> float:
        return EX0 + m * s

    def EY(m: float) -> float:
        return EY0 - m * s

    rest = Wd - win_off - win_w
    body.append(dim_group(
        dim_v(EY(sill), EY(0), EX(0) - 30, f"peitoril {br(n['sill'])}", x_obj=EX(0)),
        dim_v(EY(head), EY(sill), EX(0) - 30, br(Decimal(str(head)) - n["sill"])),
        dim_v(EY(H), EY(head), EX(0) - 30, br(n["H"] - Decimal(str(head)))),
        dim_v(EY(H), EY(0), EX(0) - 58, f"pé-direito {br(n['H'])}"),
        dim_h(EX(0), EX(win_off), EY0 + 26, br(n["win_off"]), y_obj=EY0, above=False),
        dim_h(EX(win_off), EX(win_off + win_w), EY0 + 26, br(n["win_w"]), above=False),
        dim_h(EX(win_off + win_w), EX(Wd), EY0 + 26, br(Decimal(str(rest))), above=False),
        dim_h(EX(0), EX(Wd), EY0 + 50, f"{br(n['W'])}", above=False),
        level(EX(Wd) + 3, EY(H), br(n["H"]), left=False),
        level(EX(Wd) + 3, EY(soffit), f"{br(n['soffit'])} fundo B-01", left=False),
        level(EX(Wd) + 3, EY(0), "0,00", left=False),
    ))
    body.append(S.scale_bar(PX0, 476, s, 1, "1 m"))
    # callouts
    body.append(leader(PX0 + (L + t) * s + 34, PY0 - (Wd - 0.25) * s, PX0 + (L + t / 2) * s, PY0 - (Wd - 0.25) * s))
    body.append(callout(PX0 + (L + t) * s + 34, PY0 - (Wd - 0.25) * s, 1))
    body.append(leader(EX(Wd) + 62, EY(2.45), EX(win_off + win_w) + 2, EY((head + soffit) / 2)))
    body.append(callout(EX(Wd) + 62, EY(2.45), 2))
    door_cx = PX0 + (float(n["door_off"]) + float(n["door_w"]) / 2) * s
    body.append(leader(door_cx, PY0 - (Wd + t) * s - 30, door_cx, PY0 - (Wd + t / 2) * s))
    body.append(callout(door_cx, PY0 - (Wd + t) * s - 30, 3))
    body.append(callout(612, 552, 4))
    # legend + memory
    body.append(_legend(100, 516, "Chamadas", [
        ("1", f"Parede em foco W-02: {br(n['W'])} × {br(n['H'])} m, com a janela WN-01 e a viga B-01."),
        ("2", f"Interferência WN-01 × B-01: verga {br(n['head_r00'])} m, fundo da viga {br(n['soffit'])} m, sobreposição {br(n['overlap'])} m (R00)."),
        ("3", f"Aberturas descontadas (≥ {br(n['min_opening'])} m²): porta D-01 {br(n['door_area'])} m² e janela WN-01 {br(n['win_area'])} m²."),
        ("4", f"Item da planilha {n['budget_id']}: {n['service'].lower()}, {br(n['net'])} m²."),
    ]))
    a = n["areas"]
    body.append(_legend(630, 516, f"Memória de quantidade {n['quantity_id']} · base {n['basis']}", [
        ("", f"W-01 {br(a['W-01'])} · W-02 {br(a['W-02'])} · W-03 {br(a['W-03'])} · W-04 {br(a['W-04'])} (comprimento × {br(n['H'])}) · soma {br(n['gross'])} m²"),
        ("", f"{br(n['gross'])} − {br(n['door_area'])} (porta D-01) − {br(n['win_area'])} (janela WN-01) = {br(n['net'])} m² → {n['budget_id']}", INK),
        ("", f"Aberturas ≥ {br(n['min_opening'])} m² são descontadas. A elevação mostra o estado R00; em R01 a verga desce a {br(n['head_r01'])} m."),
        ("", f"Folga em R01: {br(n['clearance'])} m até o fundo da viga. Quantidade com base em {n['basis']}."),
    ]))
    title = f"Prancha P1 · Recorte de banheiro {n['room_id']}: planta e elevação leste W-02 · exemplo demonstrativo"
    desc = (
        f"Planta do recorte de {br(n['L'])} por {br(n['W'])} m com paredes W-01 a W-04, porta D-01 na parede norte, janela WN-01 e viga B-01 na parede leste, "
        f"poço hidrossanitário HS-01 a oeste. Elevação leste W-02 de {br(n['W'])} por {br(n['H'])} m: janela do peitoril {br(n['sill'])} m à verga {br(n['head_r00'])} m, "
        f"viga com fundo em {br(n['soffit'])} m, sobreposição de {br(n['overlap'])} m no estado R00. Memória: {br(n['gross'])} menos {br(n['door_area'])} da porta e "
        f"{br(n['win_area'])} da janela igual a {br(n['net'])} m², item {n['budget_id']}. Exemplo demonstrativo."
    )
    return S.sheet(
        plate_id=pid, variant="desktop", width=W_, height=H_, title=title, desc=desc + _provenance("private", "private_consumption"),
        heading="Recorte de banheiro: planta e elevação leste, da parede ao item da planilha",
        source_note=_public_note(n["revision"]),
        body="\n".join(body),
        carimbo=_desktop_carimbo(W_, H_, "P1", pid, n["revision"], "Escala gráfica na folha · cotas em m"),
    )


def p1_mobile(data: dict) -> str:
    src, cons = data["private"], data["private_consumption"]
    n = _p1_numbers(src, cons)
    pid = "recorte-banheiro"
    hid = S.hatch_id(f"{pid}-m")
    s = 88.0
    EX0, EY0 = 92.0, 296.0
    Wd, H = float(n["W"]), float(n["H"])
    sill, head, soffit = float(n["sill"]), float(n["head_r00"]), float(n["soffit"])
    win_off, win_w = float(n["win_off"]), float(n["win_w"])
    fs = MOBILE_MIN_FONT

    def EX(m: float) -> float:
        return EX0 + m * s

    def EY(m: float) -> float:
        return EY0 - m * s

    body = [S.hatch_defs(f"{pid}-m")]
    body.append(_p1_elevation(n, EX0, EY0, s, hid, size=fs, label_size=fs))
    rest = Wd - win_off - win_w
    body.append(dim_group(
        dim_v(EY(sill), EY(0), EX(0) - 24, br(n["sill"]), x_obj=EX(0), size=fs),
        dim_v(EY(head), EY(sill), EX(0) - 24, br(Decimal(str(head)) - n["sill"]), size=fs),
        dim_v(EY(H), EY(head), EX(0) - 24, br(n["H"] - Decimal(str(head))), size=fs),
        dim_h(EX(0), EX(win_off), EY0 + 20, br(n["win_off"]), y_obj=EY0, above=False, size=fs),
        dim_h(EX(win_off), EX(win_off + win_w), EY0 + 20, br(n["win_w"]), above=False, size=fs),
        dim_h(EX(win_off + win_w), EX(Wd), EY0 + 20, br(Decimal(str(rest))), above=False, size=fs),
        level(EX(Wd) + 3, EY(soffit), f"{br(n['soffit'])} B-01", left=False, size=fs),
    ))
    body.append(leader(EX(Wd) + 44, EY(0.7), EX(Wd) + 1, EY(0.7)))
    body.append(callout(EX(Wd) + 44, EY(0.7), 1, size=fs))
    body.append(leader(EX(Wd) + 44, 60, EX(win_off + win_w) + 2, EY((head + soffit) / 2)))
    body.append(callout(EX(Wd) + 44, 60, 2, size=fs))
    body.append(text(20, 348, f"Paredes W-01 a W-04: {br(n['gross'])} m²", size=fs))
    body.append(text(20, 363, f"− {br(n['door_area'])} (porta) − {br(n['win_area'])} (janela)", size=fs))
    body.append(text(20, 378, f"= {br(n['net'])} m² → {n['budget_id']}", size=fs, weight=S.FW_LABEL))
    body.append(text(228, 348, "1 parede em foco", size=fs, fill=MUTED))
    body.append(text(228, 363, "2 interferência", size=fs, fill=MUTED))
    body.append(text(228, 378, f"{br(n['overlap'])} m em R00", size=fs, fill=MUTED))
    title = f"Prancha P1 (móvel) · Elevação leste W-02 do recorte de banheiro · exemplo demonstrativo"
    desc = (
        f"Elevação da parede W-02 de {br(n['W'])} por {br(n['H'])} m. Janela WN-01 do peitoril {br(n['sill'])} m à verga {br(n['head_r00'])} m; "
        f"viga B-01 com fundo em {br(n['soffit'])} m; sobreposição de {br(n['overlap'])} m no estado R00. Memória: {br(n['gross'])} menos {br(n['door_area'])} "
        f"e {br(n['win_area'])} igual a {br(n['net'])} m², item {n['budget_id']}. Exemplo demonstrativo."
    )
    return S.sheet(
        plate_id=pid, variant="mobile", width=MOBILE_W, height=MOBILE_H, title=title, desc=desc + _provenance("private", "private_consumption"),
        heading="Elevação leste W-02 · estado R00", source_note="",
        body="\n".join(body),
        carimbo=_mobile_carimbo("P1-M", n["revision"], pid, ("Escala indicativa", "cotas em m")),
    )


# ---------------------------------------------------------------------------
# P2 · drenagem-perfil
# ---------------------------------------------------------------------------


def _p2_numbers(src: dict, cons: dict) -> dict:
    els = _elements(src)
    t = cons["named_totals"]
    rows = {r["id"]: r for r in cons["quantity_rows"]}
    pv = els["PV-01"]
    assert Decimal(t["mh02_invert_sheet_r00_m"]) - Decimal(t["mh02_invert_drawn_m"]) == Decimal(t["mh02_mismatch_r00_m"])
    return {
        "sta1": Decimal(els["MH-01"]["station_m"]), "sta2": Decimal(els["MH-02"]["station_m"]),
        "inv1": Decimal(t["mh01_invert_m"]), "inv2": Decimal(t["mh02_invert_drawn_m"]),
        "inv2_sheet_r00": Decimal(t["mh02_invert_sheet_r00_m"]), "inv2_sheet_r01": Decimal(t["mh02_invert_sheet_r01_m"]),
        "mismatch": Decimal(t["mh02_mismatch_r00_m"]),
        "slope": Decimal(t["pipe_slope_drawn_m_per_m"]),
        "dn": Decimal(els["DR-01"]["diameter_mm"]),
        "pipe_len": Decimal(t["pipe_length_m"]),
        "subbase": Decimal(pv["layers"]["subbase_m"]), "base": Decimal(pv["layers"]["base_m"]), "wearing": Decimal(pv["layers"]["wearing_m"]),
        "width": Decimal(pv["width_m"]), "length": Decimal(t["pavement_length_m"]), "area": Decimal(t["pavement_area_m2"]),
        "q_sub": Decimal(t["subbase_m3"]), "q_base": Decimal(t["base_m3"]), "q_cap": Decimal(t["wearing_m3"]),
        "q_tub_formula": rows["Q-TUB-01"]["formula"],
        "revision": src["revision"],
    }


def _p2_profile(n: dict, X0: float, sx: float, Ydatum: float, sy: float, datum: Decimal, *, size: float = S.FS_DIM, label_size: float = S.FS_LABEL, mh_top: float) -> tuple[str, dict]:
    sta1, sta2 = float(n["sta1"]), float(n["sta2"])
    inv1, inv2, inv2s = float(n["inv1"]), float(n["inv2"]), float(n["inv2_sheet_r00"])

    def X(sta: float) -> float:
        return X0 + (sta - sta1) * sx

    def Y(elev: float) -> float:
        return Ydatum - (elev - float(datum)) * sy

    parts = []
    # divergence wedge between drawn invert and R00 spreadsheet invert
    parts.append(path(f"M{fmt(X(sta1))} {fmt(Y(inv1))}L{fmt(X(sta2))} {fmt(Y(inv2s))}V{fmt(Y(inv2))}Z", fill=LIME, fill_opacity=".35"))
    # datum line
    parts.append(line(X(sta1) - 20, Ydatum, X(sta2) + 20, Ydatum, stroke=RULE, stroke_width="1"))
    # manholes (symbolic chambers, not dimensioned)
    for sta, inv in ((sta1, inv1), (sta2, inv2)):
        parts.append(rect(X(sta) - 9, mh_top, 18, Y(inv) + 8 - mh_top, fill=WHITE, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    # spreadsheet R00 line, then drawn invert
    parts.append(line(X(sta1), Y(inv1), X(sta2), Y(inv2s), stroke=MUTED, stroke_width=fmt(S.SW_OUTLINE), stroke_dasharray="6 4"))
    parts.append(line(X(sta1), Y(inv1), X(sta2), Y(inv2), stroke=INK, stroke_width=fmt(S.SW_CUT)))
    parts.append(f'<g font-size="{fmt(label_size)}" font-weight="{S.FW_LABEL}">')
    parts.append(text(X(sta1), mh_top - 8, "MH-01", size=label_size, anchor="middle"))
    parts.append(text(X(sta2), mh_top - 8, "MH-02", size=label_size, anchor="middle"))
    parts.append("</g>")
    parts.append(text(X(sta1), Ydatum + size + 6, f"est. {br(n['sta1'])} m", size=size, fill=MUTED, anchor="middle"))
    parts.append(text(X(sta2), Ydatum + size + 6, f"est. {br(n['sta2'])} m", size=size, fill=MUTED, anchor="middle"))
    geo = {"X": X, "Y": Y}
    return "".join(parts), geo


def p2_desktop(data: dict) -> str:
    src, cons = data["infra"], data["infra_consumption"]
    n = _p2_numbers(src, cons)
    W_, H_ = 1200, 600
    pid = "drenagem-perfil"
    hid = S.hatch_id(f"{pid}-d")
    datum = Decimal("12.20")
    sx, sy = 20.0, 300.0
    prof, g = _p2_profile(n, 140, sx, 380, sy, datum, mh_top=150)
    X, Y = g["X"], g["Y"]
    sta1, sta2 = float(n["sta1"]), float(n["sta2"])
    inv1, inv2, inv2s = float(n["inv1"]), float(n["inv2"]), float(n["inv2_sheet_r00"])
    body = [S.hatch_defs(f"{pid}-d")]
    body.append(text(100, 80, "Perfil longitudinal · trecho DR-01 · MH-01 a MH-02 · escala vertical exagerada", size=S.FS_LABEL, weight=S.FW_LABEL))
    body.append(text(760, 80, "Detalhe · camadas da faixa PV-01 · sem escala horizontal", size=S.FS_LABEL, weight=S.FW_LABEL))
    body.append(prof)
    # pipe label along the drawn invert
    ang = math.degrees(math.atan2(Y(inv2) - Y(inv1), X(sta2) - X(sta1)))
    mx, my = (X(sta1) + X(sta2)) / 2, (Y(inv1) + Y(inv2)) / 2
    body.append(text(mx, my + 22, f"DR-01 · DN {br(n['dn'], 0)} · declive geométrico {br(n['slope'], 4)} m/m", size=S.FS_LABEL, weight=S.FW_LABEL, anchor="middle", rotate=ang))
    body.append(text(X(sta2) - 30, Y(inv2s) - 8, f"planilha R00", size=S.FS_DIM, fill=MUTED, anchor="end"))
    body.append(dim_group(
        level(X(sta1) - 11, Y(inv1), f"invert {br(n['inv1'])}", left=True),
        dim_v(Y(inv2s), Y(inv2), X(sta2) + 34, br(n["mismatch"]), x_obj=X(sta2) + 9),
        level(X(sta2) + 56, Y(inv2s), f"{br(n['inv2_sheet_r00'])} · planilha R00", left=False),
        level(X(sta2) + 56, Y(inv2), f"{br(n['inv2'])} · desenho", left=False),
        dim_h(X(sta1), X(sta2), 430, f"{n['q_tub_formula'].replace('.', ',').replace('-', ' − ')} = {br(n['pipe_len'])} m (Q-TUB-01)", y_obj=412, above=False),
    ))
    body.append(leader(150, 292, 180, Y(inv1) + (180 - X(sta1)) / (X(sta2) - X(sta1)) * (Y(inv2) - Y(inv1))))
    body.append(callout(150, 292, 1))
    body.append(leader(470, 236, 500, Y(inv1) + (500 - X(sta1)) / (X(sta2) - X(sta1)) * ((Y(inv2) + Y(inv2s)) / 2 - Y(inv1))))
    body.append(callout(470, 236, 2))
    # section detail
    DX, DW, DY = 810.0, 250.0, 200.0
    ds = 400.0
    cap, base, sub = float(n["wearing"]) * ds, float(n["base"]) * ds, float(n["subbase"]) * ds
    body.append(rect(DX, DY, DW, cap, fill=MUTED))
    body.append(rect(DX, DY + cap, DW, base, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    body.append(rect(DX, DY + cap + base, DW, sub, fill=f"url(#{hid})", stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    body.append(rect(DX, DY, DW, cap + base + sub, fill="none", stroke=INK, stroke_width=fmt(S.SW_CUT)))
    body.append(text(DX + 10, DY + cap + base / 2 + 4, "base", size=S.FS_LABEL, weight=S.FW_LABEL))
    body.append(text(DX + 10, DY + cap + base + sub / 2 + 4, "sub-base", size=S.FS_LABEL, weight=S.FW_LABEL))
    body.append(text(DX + 10, DY - 6, "capa de rolamento", size=S.FS_LABEL, weight=S.FW_LABEL))
    dx = DX + DW + 22
    body.append(dim_group(
        line(dx, DY, dx, DY + cap + base + sub), S.tick(dx, DY), S.tick(dx, DY + cap), S.tick(dx, DY + cap + base), S.tick(dx, DY + cap + base + sub),
        line(DX + DW, DY, dx + 2, DY), line(DX + DW, DY + cap, dx + 2, DY + cap), line(DX + DW, DY + cap + base, dx + 2, DY + cap + base), line(DX + DW, DY + cap + base + sub, dx + 2, DY + cap + base + sub),
        text(dx + 8, DY + cap / 2 + 4, f"capa {br(n['wearing'])}"),
        text(dx + 8, DY + cap + base / 2 + 4, f"base {br(n['base'])}"),
        text(dx + 8, DY + cap + base + sub / 2 + 4, f"sub-base {br(n['subbase'])}"),
    ))
    body.append(leader(DX - 34, DY + cap + base + sub / 2, DX - 1, DY + cap + base + sub / 2))
    body.append(callout(DX - 34, DY + cap + base + sub / 2, 3))
    body.append(_legend(760, 356, "Quantidades das camadas · faixa PV-01", [
        ("", f"Faixa {br(n['length'])} × {br(n['width'])} = {br(n['area'])} m² (comprimento do estaqueamento × largura declarada)"),
        ("", f"Q-SUB-01 {br(n['area'])} × {br(n['subbase'])} = {br(n['q_sub'])} m³ · Q-BASE-01 {br(n['area'])} × {br(n['base'])} = {br(n['q_base'])} m³"),
        ("", f"Q-CAP-01 {br(n['area'])} × {br(n['wearing'])} = {br(n['q_cap'])} m³ · volumes geométricos, não dimensionamento"),
    ]))
    body.append(_legend(100, 478, "Chamadas", [
        ("1", f"Trecho DR-01, DN {br(n['dn'], 0)}: invert de montante {br(n['inv1'])} m em MH-01; declive geométrico, não capacidade hidráulica."),
        ("2", f"Divergência em MH-02 (R00): desenho {br(n['inv2'])} m × planilha {br(n['inv2_sheet_r00'])} m, diferença {br(n['mismatch'])} m; em R01 a planilha passa a {br(n['inv2_sheet_r01'])} m."),
        ("3", f"Seção da faixa: sub-base {br(n['subbase'])}, base {br(n['base'])} e capa {br(n['wearing'])} m, espessuras declaradas."),
    ]))
    title = "Prancha P2 · Perfil de drenagem MH-01 a MH-02 e camadas da faixa PV-01 · exemplo demonstrativo"
    desc = (
        f"Perfil do trecho DR-01 entre os poços MH-01 (estaca {br(n['sta1'])} m, invert {br(n['inv1'])} m) e MH-02 (estaca {br(n['sta2'])} m, invert desenhado {br(n['inv2'])} m), "
        f"comprimento {br(n['pipe_len'])} m. No estado R00 a planilha traz {br(n['inv2_sheet_r00'])} m em MH-02, divergência de {br(n['mismatch'])} m, marcada em faixa. "
        f"Detalhe das camadas da faixa: sub-base {br(n['subbase'])} m, base {br(n['base'])} m, capa {br(n['wearing'])} m. Exemplo demonstrativo."
    )
    return S.sheet(
        plate_id=pid, variant="desktop", width=W_, height=H_, title=title, desc=desc + _provenance("infra", "infra_consumption"),
        heading="Drenagem e pavimento: o desenho e a planilha têm de dizer a mesma cota",
        source_note=_public_note(n["revision"]),
        body="\n".join(body),
        carimbo=_desktop_carimbo(W_, H_, "P2", pid, n["revision"], "Escala vertical exagerada · cotas em m"),
    )


def p2_mobile(data: dict) -> str:
    src, cons = data["infra"], data["infra_consumption"]
    n = _p2_numbers(src, cons)
    pid = "drenagem-perfil"
    fs = MOBILE_MIN_FONT
    datum = Decimal("12.20")
    prof, g = _p2_profile(n, 64, 10.5, 244, 220.0, datum, size=fs, label_size=fs, mh_top=76)
    X, Y = g["X"], g["Y"]
    sta1, sta2 = float(n["sta1"]), float(n["sta2"])
    inv1, inv2, inv2s = float(n["inv1"]), float(n["inv2"]), float(n["inv2_sheet_r00"])
    body = [prof]
    body.append(dim_group(
        level(X(sta1) - 11, Y(inv1), br(n["inv1"]), left=True, size=fs),
        level(X(sta2) + 11, Y(inv2s), br(n["inv2_sheet_r00"]), left=False, size=fs),
        level(X(sta2) + 11, Y(inv2), br(n["inv2"]), left=False, size=fs),
        dim_v(Y(inv2s), Y(inv2), X(sta2) + 54, br(n["mismatch"]), size=fs, left=False),
        dim_h(X(sta1), X(sta2), 284, f"{br(n['pipe_len'])} m (Q-TUB-01)", y_obj=268, above=False, size=fs),
    ))
    body.append(leader(112, 196, 132, Y(inv1) + (132 - X(sta1)) / (X(sta2) - X(sta1)) * (Y(inv2) - Y(inv1))))
    body.append(callout(112, 196, 1, size=fs))
    body.append(leader(200, 118, 232, Y(inv1) + (232 - X(sta1)) / (X(sta2) - X(sta1)) * ((Y(inv2) + Y(inv2s)) / 2 - Y(inv1))))
    body.append(callout(200, 118, 2, size=fs))
    body.append(text(20, 330, f"1 DR-01, DN {br(n['dn'], 0)}, declive {br(n['slope'], 4)} m/m", size=fs))
    body.append(text(20, 346, f"2 MH-02: desenho {br(n['inv2'])} × planilha {br(n['inv2_sheet_r00'])} (R00)", size=fs))
    body.append(text(20, 362, f"Divergência {br(n['mismatch'])} m; R01 corrige a planilha.", size=fs, weight=S.FW_LABEL))
    title = "Prancha P2 (móvel) · Perfil de drenagem MH-01 a MH-02 · exemplo demonstrativo"
    desc = (
        f"Perfil do trecho DR-01 de {br(n['pipe_len'])} m entre MH-01 (invert {br(n['inv1'])} m) e MH-02 (invert desenhado {br(n['inv2'])} m). "
        f"No estado R00 a planilha traz {br(n['inv2_sheet_r00'])} m, divergência de {br(n['mismatch'])} m. Exemplo demonstrativo."
    )
    return S.sheet(
        plate_id=pid, variant="mobile", width=MOBILE_W, height=MOBILE_H, title=title, desc=desc + _provenance("infra", "infra_consumption"),
        heading="Perfil DR-01 · MH-01 a MH-02 · R00", source_note="",
        body="\n".join(body),
        carimbo=_mobile_carimbo("P2-M", n["revision"], pid, ("Escala exagerada", "cotas em m")),
    )


# ---------------------------------------------------------------------------
# P3 · medicao-parede
# ---------------------------------------------------------------------------


def _p3_numbers(src: dict) -> dict:
    series = {s_["id"]: s_ for s_ in src["series"]}
    bands = {b["id"]: b for b in src["bands"]}
    for b in bands.values():
        assert Decimal(series[b["to_id"]]["area_m2"]) - Decimal(series[b["from_id"]]["area_m2"]) == Decimal(b["area_m2"]), b["id"]
    return {"series": src["series"], "bands": src["bands"], "ruler": src["ruler"], "criterion": src["criterion"], "revision": src["revision"]}


def p3_desktop(data: dict) -> str:
    src = data["medicao"]
    n = _p3_numbers(src)
    W_, H_ = 1200, 560
    pid = "medicao-parede"
    hid = S.hatch_id(f"{pid}-d")
    X0, XMAX = 330.0, 1050.0
    vmax = Decimal(n["ruler"]["max_m2"])
    k = (XMAX - X0) / float(vmax)

    def X(v: str | Decimal) -> float:
        return X0 + float(Decimal(v)) * k

    body = [S.hatch_defs(f"{pid}-d")]
    body.append(text(28, 72, "Alvenaria do período · áreas em m² · o ateste permanece com o órgão contratante", size=S.FS_LABEL, weight=S.FW_LABEL))
    ys = {s_["id"]: 110 + i * 70 for i, s_ in enumerate(n["series"])}
    bar_h = 44
    top, bottom = 100, 110 + 2 * 70 + bar_h + 10
    # bands first (behind bars)
    for b in n["bands"]:
        x1, x2 = X(_area(n, b["from_id"])), X(_area(n, b["to_id"]))
        body.append(rect(x1, top, x2 - x1, bottom - top, fill=LIME, fill_opacity=".35"))
    for s_ in n["series"]:
        y = ys[s_["id"]]
        w = X(s_["area_m2"]) - X0
        if s_["id"] == "EXE-01":
            body.append(rect(X0, y, w, bar_h, fill=f"url(#{hid})", stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
        elif s_["id"] == "MED-01":
            body.append(rect(X0, y, w, bar_h, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
        else:
            body.append(rect(X0, y, w, bar_h, fill=GREEN))
        body.append(text(X0 - 20, y + 20, s_["label_pt_br"], size=S.FS_LABEL, weight=S.FW_LABEL, anchor="end"))
        body.append(text(X0 - 20, y + 36, s_["note_pt_br"], fill=MUTED, anchor="end"))
        body.append(text(X(s_["area_m2"]) + 8, y + 27, f"{br(s_['area_m2'], 0)} m²", size=S.FS_LABEL, weight=S.FW_LABEL))
    # boundary rules for the bands
    for v in ("80", "90", "120"):
        body.append(line(X(v), top, X(v), bottom, stroke=MUTED, stroke_width=fmt(S.SW_DIM), stroke_dasharray="4 3"))
    # band dimensions between bars and ruler
    ydim = bottom + 16
    dims = []
    for b in n["bands"]:
        dims.append(dim_h(X(_area(n, b["from_id"])), X(_area(n, b["to_id"])), ydim, f"{br(b['area_m2'], 0)} m²", above=False))
    body.append(dim_group(*dims))
    # ruler = contractual criterion
    yr = ydim + 44
    body.append(line(X0, yr, XMAX, yr, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    for tick_v in n["ruler"]["ticks_m2"]:
        body.append(line(X(tick_v), yr, X(tick_v), yr + 6, stroke=INK, stroke_width=fmt(S.SW_DIM)))
        lab = f"{br(tick_v, 0)} m²" if tick_v == n["ruler"]["max_m2"] else br(tick_v, 0)
        body.append(text(X(tick_v), yr + 20, lab, fill=MUTED, anchor="middle"))
    body.append(text(X0, yr + 40, f"Régua · {n['criterion']['label_pt_br'].lower()}: {n['criterion']['rule_pt_br'].lower()[:-1]}", size=S.FS_LABEL, weight=S.FW_LABEL))
    # callouts
    b1, b2 = n["bands"][0], n["bands"][1]
    c1x = (X(_area(n, b1["from_id"])) + X(_area(n, b1["to_id"]))) / 2
    c2x = (X(_area(n, b2["from_id"])) + X(_area(n, b2["to_id"]))) / 2
    body.append(leader(c1x, 74, c1x, top))
    body.append(callout(c1x, 74, 1))
    body.append(leader(c2x - 40, 74, c2x, top))
    body.append(callout(c2x - 40, 74, 2))
    body.append(leader(X0 - 34, yr, X0 - 2, yr))
    body.append(callout(X0 - 34, yr, 3))
    body.append(_legend(28, yr + 66, "Chamadas", [
        ("1", f"{b1['label_pt_br']}: {br(_area(n, b1['to_id']), 0)} − {br(_area(n, b1['from_id']), 0)} = {br(b1['area_m2'], 0)} m². Não é direito automático: o dossiê registra os dois números e o critério."),
        ("2", f"{b2['label_pt_br']}: {br(_area(n, b2['to_id']), 0)} medidos − {br(_area(n, b2['from_id']), 0)} evidenciados por fotos datadas = {br(b2['area_m2'], 0)} m² sem prova contemporânea."),
        ("3", f"{n['criterion']['label_pt_br']}: {n['criterion']['note_pt_br']}"),
    ]))
    title = f"Prancha P3 · {src['title']} · exemplo demonstrativo"
    s_ = {x["id"]: x for x in n["series"]}
    desc = (
        f"Três barras proporcionais: executado declarado {br(s_['EXE-01']['area_m2'], 0)} m², medido no boletim {br(s_['MED-01']['area_m2'], 0)} m², "
        f"evidenciado por fotos datadas {br(s_['EVI-01']['area_m2'], 0)} m². Régua do critério contratual: área de projeção da parede. "
        f"Faixas anotadas: diferença medido × executado de {br(b1['area_m2'], 0)} m² e lacuna de prova de {br(b2['area_m2'], 0)} m². "
        "Exemplo demonstrativo."
    )
    return S.sheet(
        plate_id=pid, variant="desktop", width=W_, height=H_, title=title, desc=desc + _provenance("medicao"),
        heading=src["title"] + ": executado, medido, evidenciado e o critério contratual",
        source_note=_public_note(n["revision"]),
        body="\n".join(body),
        carimbo=_desktop_carimbo(W_, H_, "P3", pid, n["revision"], "Barras proporcionais à área em m²"),
    )


def _area(n: dict, sid: str) -> str:
    return next(s_["area_m2"] for s_ in n["series"] if s_["id"] == sid)


def p3_mobile(data: dict) -> str:
    src = data["medicao"]
    n = _p3_numbers(src)
    pid = "medicao-parede"
    hid = S.hatch_id(f"{pid}-m")
    fs = MOBILE_MIN_FONT
    X0, XMAX = 40.0, 328.0
    vmax = Decimal(n["ruler"]["max_m2"])
    k = (XMAX - X0) / float(vmax)

    def X(v: str | Decimal) -> float:
        return X0 + float(Decimal(v)) * k

    body = [S.hatch_defs(f"{pid}-m")]
    y_first, pitch, bar_h = 96, 54, 22
    top, bottom = y_first - 18, y_first + 2 * pitch + bar_h
    for b in n["bands"]:
        x1, x2 = X(_area(n, b["from_id"])), X(_area(n, b["to_id"]))
        body.append(rect(x1, top, x2 - x1, bottom - top, fill=LIME, fill_opacity=".35"))
    short = {"EXE-01": "Executado declarado", "MED-01": "Medido no boletim", "EVI-01": "Evidenciado por fotos"}
    for i, s_ in enumerate(n["series"]):
        y = y_first + i * pitch
        w = X(s_["area_m2"]) - X0
        body.append(text(X0, y - 5, f"{short[s_['id']]} · {br(s_['area_m2'], 0)} m²", size=fs, weight=S.FW_LABEL))
        if s_["id"] == "EXE-01":
            body.append(rect(X0, y, w, bar_h, fill=f"url(#{hid})", stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
        elif s_["id"] == "MED-01":
            body.append(rect(X0, y, w, bar_h, fill=SOFT, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
        else:
            body.append(rect(X0, y, w, bar_h, fill=GREEN))
    for v in ("80", "90", "120"):
        body.append(line(X(v), top, X(v), bottom, stroke=MUTED, stroke_width=fmt(S.SW_DIM), stroke_dasharray="4 3"))
    yr = bottom + 22
    body.append(line(X0, yr, XMAX, yr, stroke=INK, stroke_width=fmt(S.SW_OUTLINE)))
    for tick_v in n["ruler"]["ticks_m2"]:
        body.append(line(X(tick_v), yr, X(tick_v), yr + 6, stroke=INK, stroke_width=fmt(S.SW_DIM)))
        if int(tick_v) % 40 == 0:
            body.append(text(X(tick_v), yr + 20, br(tick_v, 0), size=fs, fill=MUTED, anchor="middle"))
    body.append(text(X0, yr + 40, "Régua: critério contratual,", size=fs, weight=S.FW_LABEL))
    body.append(text(X0, yr + 55, "área de projeção da parede", size=fs, weight=S.FW_LABEL))
    b1, b2 = n["bands"][0], n["bands"][1]
    c1x = (X(_area(n, b1["from_id"])) + X(_area(n, b1["to_id"]))) / 2
    c2x = (X(_area(n, b2["from_id"])) + X(_area(n, b2["to_id"]))) / 2
    body.append(leader(c1x, 62, c1x, top))
    body.append(callout(c1x, 62, 1, size=fs))
    body.append(leader(c2x, 62, c2x, top))
    body.append(callout(c2x, 62, 2, size=fs))
    body.append(text(20, 342, f"1 Diferença medido × executado: {br(b1['area_m2'], 0)} m²", size=fs))
    body.append(text(20, 358, f"2 Lacuna de prova: {br(b2['area_m2'], 0)} m²", size=fs))
    body.append(text(20, 374, "Ateste do órgão contratante", size=fs, fill=MUTED))
    s_ = {x["id"]: x for x in n["series"]}
    title = f"Prancha P3 (móvel) · {src['title']} · exemplo demonstrativo"
    desc = (
        f"Barras empilhadas: executado declarado {br(s_['EXE-01']['area_m2'], 0)} m², medido {br(s_['MED-01']['area_m2'], 0)} m², evidenciado por fotos {br(s_['EVI-01']['area_m2'], 0)} m²; "
        f"diferença {br(b1['area_m2'], 0)} m² e lacuna de prova {br(b2['area_m2'], 0)} m². Régua: critério contratual, área de projeção da parede. Exemplo demonstrativo."
    )
    return S.sheet(
        plate_id=pid, variant="mobile", width=MOBILE_W, height=MOBILE_H, title=title, desc=desc + _provenance("medicao"),
        heading=src["title"], source_note="",
        body="\n".join(body),
        carimbo=_mobile_carimbo("P3-M", n["revision"], pid, ("Barras em m²", "proporcionais")),
    )


# ---------------------------------------------------------------------------
# P4 · avaliacao-estrutura
# ---------------------------------------------------------------------------


def p4_desktop(data: dict) -> str:
    src = data["avaliacao"]
    W_, H_ = 1200, 460
    pid = "avaliacao-estrutura"
    steps = src["steps"]
    bw, gap, bh, y0 = 196.0, 32.0, 140.0, 112.0
    x0 = (W_ - (len(steps) * bw + (len(steps) - 1) * gap)) / 2
    body = [text(28, 72, "Cinco etapas encadeadas · cada uma delimita a seguinte · sem valor monetário nesta prancha", size=S.FS_LABEL, weight=S.FW_LABEL)]
    callouts = {c["step_id"]: c for c in src["callouts"]}
    for i, st in enumerate(steps):
        x = x0 + i * (bw + gap)
        focus = st["id"] == src["focus_step_id"]
        body.append(rect(x, y0, bw, bh, fill=WHITE, stroke=GREEN if focus else INK, stroke_width=fmt(S.SW_CUT if focus else S.SW_OUTLINE)))
        body.append(text(x + 14, y0 + 22, st["id"], fill=MUTED))
        body.append(text(x + 14, y0 + 44, st["label_pt_br"], size=S.FS_LABEL, weight=S.FW_LABEL, fill=GREEN if focus else INK))
        for j, ln in enumerate(st["lines_pt_br"]):
            body.append(text(x + 14, y0 + 68 + j * 16, ln))
        if i < len(steps) - 1:
            body.append(S.arrow_h(x + bw + 4, x + bw + gap - 4, y0 + bh / 2))
        if st["id"] in callouts:
            body.append(callout(x + bw - 2, y0 + 2, callouts[st["id"]]["n"]))
    body.append(text(x0, y0 + bh + 36, "Percurso da análise: o objeto define o que se avalia; finalidade e data definem para quê e quando; o método e os dados sustentam a conclusão, que sai com os próprios limites.", fill=MUTED))
    body.append(_legend(x0, y0 + bh + 74, "Chamadas", [(str(c["n"]), c["text_pt_br"]) for c in src["callouts"]]))
    title = f"Prancha P4 · {src['title']} · exemplo demonstrativo"
    desc = (
        "Diagrama de fluxo em cinco etapas: " + " → ".join(st["label_pt_br"] for st in steps) + ". "
        "Método comparativo ou evolutivo, conforme o caso. Sem valor monetário. Parecer preliminar não substitui a avaliação formal. Exemplo demonstrativo."
    )
    return S.sheet(
        plate_id=pid, variant="desktop", width=W_, height=H_, title=title, desc=desc + _provenance("avaliacao"),
        heading=src["title"] + ": do objeto à conclusão delimitada",
        source_note=_public_note(src["revision"]),
        body="\n".join(body),
        carimbo=_desktop_carimbo(W_, H_, "P4", pid, src["revision"], "Sem escala · diagrama de estrutura"),
    )


def p4_mobile(data: dict) -> str:
    src = data["avaliacao"]
    pid = "avaliacao-estrutura"
    fs = MOBILE_MIN_FONT
    steps = src["steps"]
    bx, bw, bh, gap, y0 = 24.0, 276.0, 42.0, 14.0, 52.0
    body = []
    mobile_callouts = [c for c in src["callouts"] if c["step_id"] in src["mobile_callout_step_ids"]]
    callouts = {c["step_id"]: dict(c, n=i) for i, c in enumerate(mobile_callouts, start=1)}
    for i, st in enumerate(steps):
        y = y0 + i * (bh + gap)
        focus = st["id"] == src["focus_step_id"]
        body.append(rect(bx, y, bw, bh, fill=WHITE, stroke=GREEN if focus else INK, stroke_width=fmt(S.SW_CUT if focus else S.SW_OUTLINE)))
        body.append(text(bx + 12, y + 17, f"{st['id']} · {st['label_pt_br']}", size=fs, weight=S.FW_LABEL, fill=GREEN if focus else INK))
        body.append(text(bx + 12, y + 34, st["short_pt_br"], size=fs, fill=MUTED))
        if i < len(steps) - 1:
            body.append(S.arrow_v(y + bh + 2, y + bh + gap - 2, bx + bw / 2))
        if st["id"] in callouts:
            body.append(callout(bx + bw + 14, y + bh / 2, callouts[st["id"]]["n"], size=fs))
    y_leg = y0 + len(steps) * (bh + gap) - gap + 22
    for c in callouts.values():
        body.append(text(20, y_leg, f"{c['n']} {c['mobile_pt_br']}", size=fs, fill=MUTED))
        y_leg += 16
    title = f"Prancha P4 (móvel) · {src['title']} · exemplo demonstrativo"
    desc = (
        "Fluxo de cima para baixo em cinco etapas: " + " → ".join(st["label_pt_br"] for st in steps) + ". "
        "Método comparativo ou evolutivo, conforme o caso. Sem valor monetário. Exemplo demonstrativo."
    )
    return S.sheet(
        plate_id=pid, variant="mobile", width=MOBILE_W, height=MOBILE_H, title=title, desc=desc + _provenance("avaliacao"),
        heading="Estrutura da análise de avaliação", source_note="",
        body="\n".join(body),
        carimbo=_mobile_carimbo("P4-M", src["revision"], pid, ("Sem escala", "diagrama")),
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

RENDERERS = {
    ("recorte-banheiro", "desktop"): p1_desktop,
    ("recorte-banheiro", "mobile"): p1_mobile,
    ("drenagem-perfil", "desktop"): p2_desktop,
    ("drenagem-perfil", "mobile"): p2_mobile,
    ("medicao-parede", "desktop"): p3_desktop,
    ("medicao-parede", "mobile"): p3_mobile,
    ("avaliacao-estrutura", "desktop"): p4_desktop,
    ("avaliacao-estrutura", "mobile"): p4_mobile,
}


def _register_family_modules() -> None:
    """Fold in the plates of each family module (``family_*.py`` next to this
    file). A module declares ``SOURCES`` (key -> JSON path relative to the repo
    root), ``PLATE_SOURCES`` (plate id -> source keys) and ``RENDERERS``
    ((plate id, variant) -> callable(data)). Ids and source keys must not
    collide with the pilot's; the merge is deterministic (sorted by file name)
    so ``--check`` and the manifest stay reproducible."""
    import importlib

    here = Path(__file__).resolve().parent
    for mod_path in sorted(here.glob("family_*.py")):
        mod = importlib.import_module(f"scripts.demonstrative.plates.{mod_path.stem}")
        for key, rel in getattr(mod, "SOURCES", {}).items():
            if key in SOURCES and SOURCES[key] != Path(rel):
                raise SystemExit(f"plate_source_key_collision:{mod_path.stem}:{key}")
            SOURCES[key] = Path(rel)
        for pid, keys in getattr(mod, "PLATE_SOURCES", {}).items():
            if pid in PLATE_SOURCES:
                raise SystemExit(f"plate_id_collision:{mod_path.stem}:{pid}")
            PLATE_SOURCES[pid] = tuple(keys)
        for (pid, variant), fn in getattr(mod, "RENDERERS", {}).items():
            if (pid, variant) in RENDERERS:
                raise SystemExit(f"plate_renderer_collision:{mod_path.stem}:{pid}-{variant}")
            RENDERERS[(pid, variant)] = fn


_register_family_modules()


def render_all(root: Path = ROOT) -> dict[str, str]:
    data = load(root)
    out: dict[str, str] = {}
    for (pid, variant), fn in RENDERERS.items():
        svg = fn(data)
        problems = S.validate(svg)
        if problems:
            raise SystemExit(f"plate_invalid:{pid}-{variant}:{','.join(problems)}")
        out[f"{pid}-{variant}.svg"] = svg
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--check", action="store_true", help="fail if the versioned SVGs differ from a fresh render")
    parser.add_argument("--out", default=str(OUT_DIR_REL), help="output directory relative to the repo root")
    args = parser.parse_args(argv)
    out_dir = ROOT / args.out
    rendered = render_all()
    if args.check:
        drift = []
        for name, svg in rendered.items():
            target = out_dir / name
            if not target.exists() or target.read_text(encoding="utf-8") != svg:
                drift.append(name)
        if drift:
            print("plates_drift: " + ", ".join(drift) + " (run python3 -m scripts.demonstrative.plates.render_plates)")
            return 1
        print(f"plates_ok: {len(rendered)} files match {args.out}")
        return 0
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, svg in rendered.items():
        (out_dir / name).write_text(svg, encoding="utf-8")
        print(f"{args.out}/{name} {len(svg.encode('utf-8'))} B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
