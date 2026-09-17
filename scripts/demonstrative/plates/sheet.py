"""Shared drawing vocabulary for the demonstrative plates (pranchas).

Every plate is a technical sheet: white page, rule-coloured frame, a title,
the drawing, numbered callouts and a three-cell title block (carimbo). All
colours, weights and sizes live here so the four plates read as one family.
Nothing here knows about a specific plate; the plate modules only compose.
"""

from __future__ import annotations

import math
import re
from decimal import Decimal

# Palette (styles-tokens.css). No other colour may appear in a plate.
INK = "#071a31"        # --ink: main line work, labels
MUTED = "#5d6a7a"      # --muted: dimension and leader lines, secondary text
RULE = "#dfe4e6"       # --rule: frame, title block, ruler
WHITE = "#ffffff"      # sheet
SOFT = "#f3f4f5"       # --soft: soft surface
GREEN = "#2d6f2d"      # --green-700: element in focus
LIME = "#ced62a"       # --lime: interference / overlap band (fill-opacity .35)
GREEN_100 = "#edf5ec"  # --green-100: highlighted table row only

PALETTE = frozenset({INK, MUTED, RULE, WHITE, SOFT, GREEN, LIME, GREEN_100})

FONT = "Archivo Var, Arial, Helvetica, sans-serif"

# Stroke widths (viewBox units; 1 unit ~ 1 px on desktop).
SW_CUT = 2.0      # cut wall
SW_OUTLINE = 1.2  # contour
SW_DIM = 0.6      # dimension and leader lines
SW_HATCH = 0.5    # hatch lines, 45 degrees, 6 units apart
HATCH_STEP = 6

# Type sizes.
FS_DIM = 11
FS_LABEL = 12
FS_TITLE = 16
FW_LABEL = 650
FW_CALLOUT = 700
CALLOUT_R = 11

TITLE_BLOCK_H = 28
FRAME_PAD = 8
DEMO_LABEL = "Exemplo demonstrativo · sem obra de cliente"

_COLOR_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(")
_PAINT_RE = re.compile(r"\b(?:fill|stroke|stop-color|color)=\"([^\"]+)\"")
_NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")


def fmt(value: float) -> str:
    """Coordinate formatter: one decimal, no trailing .0, no negative zero."""
    text = f"{value:.1f}"
    if text.endswith(".0"):
        text = text[:-2]
    return "0" if text == "-0" else text


def br(value: str | float | Decimal, places: int = 2) -> str:
    """Brazilian number: comma decimal, dot thousands. Always `places` decimals."""
    number = Decimal(str(value)).quantize(Decimal(1).scaleb(-places))
    sign = "-" if number < 0 else ""
    whole, _, frac = f"{abs(number):f}".partition(".")
    groups = []
    while whole:
        groups.append(whole[-3:])
        whole = whole[:-3]
    whole_fmt = ".".join(reversed(groups))
    return f"{sign}{whole_fmt},{frac}" if places else f"{sign}{whole_fmt}"


def esc(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def text(
    x: float,
    y: float,
    content: str,
    *,
    size: float = FS_DIM,
    fill: str = INK,
    weight: int | None = None,
    anchor: str | None = None,
    rotate: float | None = None,
) -> str:
    attrs = [f'x="{fmt(x)}"', f'y="{fmt(y)}"', f'font-size="{fmt(size)}"']
    if fill != INK:
        attrs.append(f'fill="{fill}"')
    if weight:
        attrs.append(f'font-weight="{weight}"')
    if anchor:
        attrs.append(f'text-anchor="{anchor}"')
    if rotate is not None:
        attrs.append(f'transform="rotate({fmt(rotate)} {fmt(x)} {fmt(y)})"')
    return f"<text {' '.join(attrs)}>{esc(content)}</text>"


def line(x1: float, y1: float, x2: float, y2: float, **attrs: str) -> str:
    extra = "".join(f' {k.replace("_", "-")}="{v}"' for k, v in attrs.items())
    return f'<line x1="{fmt(x1)}" y1="{fmt(y1)}" x2="{fmt(x2)}" y2="{fmt(y2)}"{extra}/>'


def rect(x: float, y: float, w: float, h: float, **attrs: str) -> str:
    extra = "".join(f' {k.replace("_", "-")}="{v}"' for k, v in attrs.items())
    return f'<rect x="{fmt(x)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}"{extra}/>'


def path(d: str, **attrs: str) -> str:
    extra = "".join(f' {k.replace("_", "-")}="{v}"' for k, v in attrs.items())
    return f'<path d="{d}"{extra}/>'


def hatch_defs(prefix: str, colours: tuple[str, ...] = (MUTED,)) -> str:
    """45-degree hatch patterns, spacing 6, stroke 0.5. One per colour."""
    parts = []
    for colour in colours:
        pid = hatch_id(prefix, colour)
        parts.append(
            f'<pattern id="{pid}" width="{HATCH_STEP}" height="{HATCH_STEP}" '
            f'patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
            f'<path d="M0 0V{HATCH_STEP}" stroke="{colour}" stroke-width="{SW_HATCH}"/></pattern>'
        )
    return "<defs>" + "".join(parts) + "</defs>"


def hatch_id(prefix: str, colour: str = MUTED) -> str:
    return f"{prefix}-h{colour[1:5]}"


def tick(x: float, y: float) -> str:
    """ABNT-style 45-degree dimension tick, 6 units long, centred on the point."""
    return f'<path d="M{fmt(x - 3)} {fmt(y + 3)}L{fmt(x + 3)} {fmt(y - 3)}"/>'


def dim_h(
    x1: float,
    x2: float,
    y: float,
    label: str,
    *,
    y_obj: float | None = None,
    above: bool = True,
    size: float = FS_DIM,
) -> str:
    """Horizontal dimension: extension lines from the object, ticks, centred text."""
    parts = [line(x1, y, x2, y), tick(x1, y), tick(x2, y)]
    if y_obj is not None:
        over = -2 if y < y_obj else 2
        parts.append(line(x1, y_obj, x1, y + over))
        parts.append(line(x2, y_obj, x2, y + over))
    ty = y - 4 if above else y + size + 2
    parts.append(text((x1 + x2) / 2, ty, label, size=size, anchor="middle"))
    return "".join(parts)


def dim_v(
    y1: float,
    y2: float,
    x: float,
    label: str,
    *,
    x_obj: float | None = None,
    left: bool = True,
    size: float = FS_DIM,
) -> str:
    """Vertical dimension with rotated text reading from the right (ABNT)."""
    parts = [line(x, y1, x, y2), tick(x, y1), tick(x, y2)]
    if x_obj is not None:
        over = -2 if x < x_obj else 2
        parts.append(line(x_obj, y1, x + over, y1))
        parts.append(line(x_obj, y2, x + over, y2))
    tx = x - 4 if left else x + size + 2
    parts.append(text(tx, (y1 + y2) / 2, label, size=size, anchor="middle", rotate=-90))
    return "".join(parts)


def dim_group(*inner: str) -> str:
    """Wrap dimension primitives in the muted 0.6 stroke."""
    return f'<g stroke="{MUTED}" stroke-width="{SW_DIM}" fill="{MUTED}">{"".join(inner)}</g>'


def level(x: float, y: float, label: str, *, left: bool = True, size: float = FS_DIM) -> str:
    """Level mark (small open triangle on the line) with a text label."""
    d = 5
    tri = f'<path d="M{fmt(x)} {fmt(y)}L{fmt(x - d)} {fmt(y - d)}H{fmt(x + d)}Z" fill="none"/>'
    tx = x - d - 4 if left else x + d + 4
    return tri + text(tx, y + 4, label, size=size, anchor="end" if left else "start")


def callout(x: float, y: float, n: int, *, r: float = CALLOUT_R, size: float = FS_DIM) -> str:
    return (
        f'<g transform="translate({fmt(x)} {fmt(y)})"><circle r="{fmt(r)}" fill="{INK}"/>'
        f'<text y="{fmt(size * 0.36)}" text-anchor="middle" font-size="{fmt(size)}" '
        f'font-weight="{FW_CALLOUT}" fill="{WHITE}">{n}</text></g>'
    )


def leader(x1: float, y1: float, x2: float, y2: float) -> str:
    """Leader from a callout edge towards the element, muted 0.6, small dot at the target."""
    dx, dy = x2 - x1, y2 - y1
    dist = math.hypot(dx, dy) or 1.0
    sx, sy = x1 + dx / dist * CALLOUT_R, y1 + dy / dist * CALLOUT_R
    return (
        f'<g stroke="{MUTED}" stroke-width="{SW_DIM}">{line(sx, sy, x2, y2)}'
        f'<circle cx="{fmt(x2)}" cy="{fmt(y2)}" r="1.6" fill="{MUTED}"/></g>'
    )


def arrow_h(x1: float, x2: float, y: float) -> str:
    """Flow arrow (open head), muted 0.6."""
    s = 1 if x2 >= x1 else -1
    return (
        f'<g stroke="{MUTED}" stroke-width="{SW_DIM}" fill="none">{line(x1, y, x2, y)}'
        f'<path d="M{fmt(x2 - 6 * s)} {fmt(y - 4)}L{fmt(x2)} {fmt(y)}L{fmt(x2 - 6 * s)} {fmt(y + 4)}"/></g>'
    )


def arrow_v(y1: float, y2: float, x: float) -> str:
    s = 1 if y2 >= y1 else -1
    return (
        f'<g stroke="{MUTED}" stroke-width="{SW_DIM}" fill="none">{line(x, y1, x, y2)}'
        f'<path d="M{fmt(x - 4)} {fmt(y2 - 6 * s)}L{fmt(x)} {fmt(y2)}L{fmt(x + 4)} {fmt(y2 - 6 * s)}"/></g>'
    )


def scale_bar(x: float, y: float, px_per_m: float, metres: float, label: str, *, size: float = FS_DIM) -> str:
    """Graphic scale: alternating bar in ink/white, from 0 to `metres`."""
    n = int(round(metres * 2))
    seg = px_per_m / 2
    parts = [rect(x, y, px_per_m * metres, 4, fill="none", stroke=INK, stroke_width="0.6")]
    for i in range(n):
        if i % 2 == 0:
            parts.append(rect(x + i * seg, y, seg, 4, fill=INK))
    parts.append(text(x, y + size + 5, "0", size=size, anchor="middle"))
    parts.append(text(x + px_per_m * metres, y + size + 5, label, size=size, anchor="middle"))
    return f'<g class="escala-grafica">{"".join(parts)}</g>'


def title_block(
    width: float,
    height: float,
    cells: tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...]],
    *,
    widths: tuple[float, float] | None = None,
    size: float = FS_DIM,
    id: str = "carimbo",
) -> str:
    """Three-cell carimbo, 28 high, on the bottom edge of the frame.

    Each cell holds one or two text lines (two lines for the narrow mobile sheet).
    """
    x0 = FRAME_PAD
    x1 = width - FRAME_PAD
    y0 = height - FRAME_PAD - TITLE_BLOCK_H
    inner = x1 - x0
    if widths is None:
        widths = (inner / 3, inner / 3)
    xs = [x0, x0 + widths[0], x0 + widths[0] + widths[1], x1]
    parts = [
        rect(x0, y0, inner, TITLE_BLOCK_H, fill=WHITE, stroke=RULE),
        line(xs[1], y0, xs[1], y0 + TITLE_BLOCK_H, stroke=RULE),
        line(xs[2], y0, xs[2], y0 + TITLE_BLOCK_H, stroke=RULE),
    ]
    for i, lines in enumerate(cells):
        cx = xs[i] + 8
        if len(lines) == 1:
            parts.append(text(cx, y0 + TITLE_BLOCK_H / 2 + size * 0.36, lines[0], size=size, fill=MUTED))
        else:
            parts.append(text(cx, y0 + 11, lines[0], size=size, fill=MUTED))
            parts.append(text(cx, y0 + 24, lines[1], size=size, fill=MUTED))
    return f'<g id="{id}">{"".join(parts)}</g>'


def sheet(
    *,
    plate_id: str,
    variant: str,
    width: float,
    height: float,
    title: str,
    desc: str,
    heading: str,
    source_note: str,
    body: str,
    carimbo: str,
    heading_size: float = FS_TITLE,
) -> str:
    """Assemble the sheet. `body` is already-rendered inner markup."""
    tid = f"{plate_id}-{variant}-title"
    did = f"{plate_id}-{variant}-desc"
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(width)} {fmt(height)}" '
        f'role="img" aria-labelledby="{tid} {did}" font-family="{FONT}" fill="{INK}">',
        f'<title id="{tid}">{esc(title)}</title>',
        f'<desc id="{did}">{esc(desc)}</desc>',
        rect(0, 0, width, height, fill=WHITE),
        rect(FRAME_PAD, FRAME_PAD, width - 2 * FRAME_PAD, height - 2 * FRAME_PAD, fill=WHITE, stroke=RULE),
        text(28, 40, heading, size=heading_size, weight=FW_LABEL),
    ]
    if source_note:
        parts.append(text(width - 28, 40, source_note, size=FS_DIM, fill=MUTED, anchor="end"))
    parts.append(body)
    parts.append(carimbo)
    parts.append("</svg>\n")
    return "\n".join(parts)


def validate(svg: str, *, max_bytes: int = 12 * 1024) -> list[str]:
    """Fail-closed checks shared by generator and tests. Returns problems."""
    problems: list[str] = []
    for match in _COLOR_RE.finditer(svg):
        token = match.group(0).lower()
        if token.startswith(("rgb", "hsl")):
            problems.append(f"colour_function:{token}")
        elif token not in PALETTE:
            problems.append(f"colour_outside_palette:{token}")
    for paint in _PAINT_RE.findall(svg):
        p = paint.strip().lower()
        if p in ("none", "currentcolor") or p.startswith("url(#"):
            continue
        if p not in PALETTE:
            problems.append(f"paint_outside_palette:{paint}")
    if 'role="img"' not in svg:
        problems.append("missing_role_img")
    if "<title " not in svg or "<desc " not in svg:
        problems.append("missing_title_or_desc")
    if not re.search(r'id="[a-z0-9-]+-carimbo"', svg):
        problems.append("missing_carimbo")
    ids = re.findall(r'\bid="([^"]+)"', svg)
    if len(ids) != len(set(ids)):
        problems.append("duplicate_id")
    if "Exemplo demonstrativo" not in svg:
        problems.append("missing_demo_label")
    size = len(svg.encode("utf-8"))
    if size > max_bytes:
        problems.append(f"too_large:{size}>{max_bytes}")
    return problems
