#!/usr/bin/env python3
"""PERF-185: build versioned brand logos close to their rendered size.

The header logo renders at most 224 CSS px wide and the footer logo at most
236 CSS px, so a 800x208 master is roughly 4x more pixels than any viewport
asks for. This script reads the stable 800x208 masters and writes new,
versioned 500x130 assets. It uses an exact box filter, quantises them to a
palette (logos are flat art) and re-encodes them with the smallest per-row
filter, keeping the 800:208 aspect ratio bit-exact.

Usage:
    python3 scripts/site/optimize_brand_logos.py --report
    python3 scripts/site/optimize_brand_logos.py --write

Dependency-free on purpose: CI has no Pillow/sharp, and the brand assets must
stay reproducible from stdlib alone.
"""

from __future__ import annotations

import argparse
import hashlib
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# 800x208 divided by 1.6 keeps the aspect ratio exact (208 / 1.6 == 130) and
# still covers a 2x device pixel ratio for the widest render (236 CSS px).
TARGET_WIDTH = 500
TARGET_HEIGHT = 130

# Both logos are a single RGB tint with an antialiased alpha mask (243 distinct
# colours, all sharing one RGB), so the palette only has to carry alpha steps.
# 64 steps keep the edges smooth and cut another third of the bytes.
PALETTE_LIMIT = 64

ASSETS = ("assets/logo-confenge.png", "assets/logo-confenge-white.png")

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def read_png(path: Path) -> tuple[int, int, bytearray]:
    """Decode a non-interlaced 8-bit RGBA or palette PNG into a flat RGBA bytearray."""
    data = path.read_bytes()
    if data[:8] != PNG_MAGIC:
        raise ValueError(f"{path}: not a PNG")
    idat = bytearray()
    width = height = 0
    color = 6
    plte = b""
    trns = b""
    offset = 8
    while offset < len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        chunk = data[offset + 8:offset + 8 + length]
        if kind == b"IHDR":
            width, height, depth, color, _comp, _filt, interlace = struct.unpack(
                ">IIBBBBB", chunk
            )
            if depth != 8 or color not in (3, 6) or interlace != 0:
                raise ValueError(f"{path}: expected 8-bit RGBA/palette non-interlaced")
        elif kind == b"PLTE":
            plte = chunk
        elif kind == b"tRNS":
            trns = chunk
        elif kind == b"IDAT":
            idat += chunk
        offset += 12 + length
    raw = zlib.decompress(bytes(idat))
    channels = 1 if color == 3 else 4
    stride = width * channels
    pixels = bytearray(width * height * 4)
    prev = bytearray(stride)
    pos = 0
    for y in range(height):
        ftype = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        if ftype == 1:
            for x in range(channels, stride):
                line[x] = (line[x] + line[x - channels]) & 255
        elif ftype == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif ftype == 3:
            for x in range(stride):
                left = line[x - channels] if x >= channels else 0
                line[x] = (line[x] + ((left + prev[x]) >> 1)) & 255
        elif ftype == 4:
            for x in range(stride):
                left = line[x - channels] if x >= channels else 0
                up = prev[x]
                upleft = prev[x - channels] if x >= channels else 0
                guess = left + up - upleft
                da, db, dc = abs(guess - left), abs(guess - up), abs(guess - upleft)
                if da <= db and da <= dc:
                    pred = left
                elif db <= dc:
                    pred = up
                else:
                    pred = upleft
                line[x] = (line[x] + pred) & 255
        elif ftype != 0:
            raise ValueError(f"{path}: unknown filter {ftype}")
        if color == 3:
            base = y * width * 4
            for x in range(width):
                index = line[x]
                pixels[base + x * 4] = plte[index * 3]
                pixels[base + x * 4 + 1] = plte[index * 3 + 1]
                pixels[base + x * 4 + 2] = plte[index * 3 + 2]
                pixels[base + x * 4 + 3] = trns[index] if index < len(trns) else 255
        else:
            pixels[y * stride:(y + 1) * stride] = line
        prev = line
    return width, height, pixels


def _axis_weights(src: int, dst: int) -> list[list[tuple[int, float]]]:
    """Box-filter coverage of each destination sample over source samples."""
    scale = src / dst
    weights: list[list[tuple[int, float]]] = []
    for index in range(dst):
        start = index * scale
        end = start + scale
        first = int(start)
        last = min(int(end - 1e-9), src - 1)
        row: list[tuple[int, float]] = []
        for pos in range(first, last + 1):
            covered = min(end, pos + 1) - max(start, pos)
            if covered > 0:
                row.append((pos, covered))
        total = sum(w for _, w in row)
        weights.append([(pos, w / total) for pos, w in row])
    return weights


def dominant_tint(pixels: bytearray) -> tuple[int, int, int]:
    """RGB of the most common fully opaque pixel; used to tint transparent pixels."""
    counts: dict[tuple[int, int, int], int] = {}
    for offset in range(0, len(pixels), 4):
        if pixels[offset + 3] != 255:
            continue
        key = (pixels[offset], pixels[offset + 1], pixels[offset + 2])
        counts[key] = counts.get(key, 0) + 1
    if not counts:
        return (0, 0, 0)
    return max(counts.items(), key=lambda item: item[1])[0]


def resize_rgba(
    width: int, height: int, pixels: bytearray, dst_w: int, dst_h: int
) -> bytearray:
    """Area-average resize in premultiplied alpha so edges do not gain halos."""
    tint = dominant_tint(pixels)
    x_weights = _axis_weights(width, dst_w)
    y_weights = _axis_weights(height, dst_h)

    # Horizontal pass into float rows of premultiplied RGBA.
    rows: list[list[float]] = []
    for y in range(height):
        base = y * width * 4
        row = [0.0] * (dst_w * 4)
        for dx, contributions in enumerate(x_weights):
            r = g = b = a = 0.0
            for sx, weight in contributions:
                off = base + sx * 4
                alpha = pixels[off + 3] / 255.0
                r += pixels[off] * alpha * weight
                g += pixels[off + 1] * alpha * weight
                b += pixels[off + 2] * alpha * weight
                a += alpha * weight
            out = dx * 4
            row[out] = r
            row[out + 1] = g
            row[out + 2] = b
            row[out + 3] = a
        rows.append(row)

    result = bytearray(dst_w * dst_h * 4)
    for dy, contributions in enumerate(y_weights):
        acc = [0.0] * (dst_w * 4)
        for sy, weight in contributions:
            row = rows[sy]
            for i in range(dst_w * 4):
                acc[i] += row[i] * weight
        base = dy * dst_w * 4
        for dx in range(dst_w):
            i = dx * 4
            alpha = acc[i + 3]
            out = base + i
            if alpha <= 0:
                # Keep the brand tint under transparent pixels: a black fringe
                # would show up wherever a renderer downsamples unpremultiplied.
                result[out], result[out + 1], result[out + 2] = tint
                continue
            result[out] = min(255, int(acc[i] / alpha + 0.5))
            result[out + 1] = min(255, int(acc[i + 1] / alpha + 0.5))
            result[out + 2] = min(255, int(acc[i + 2] / alpha + 0.5))
            result[out + 3] = min(255, int(alpha * 255 + 0.5))
    return result


def _median_cut(colors: dict[bytes, int], limit: int) -> list[bytes]:
    """Median-cut quantisation over RGBA, weighted by pixel population."""
    buckets = [list(colors.items())]
    while len(buckets) < limit:
        target = -1
        best_range = -1
        best_channel = 0
        for index, bucket in enumerate(buckets):
            if len(bucket) < 2:
                continue
            for channel in range(4):
                lo = min(color[channel] for color, _ in bucket)
                hi = max(color[channel] for color, _ in bucket)
                spread = (hi - lo) * (3 if channel == 3 else 1)
                if spread > best_range:
                    best_range = spread
                    target = index
                    best_channel = channel
        if target < 0 or best_range <= 0:
            break
        bucket = sorted(buckets[target], key=lambda item: item[0][best_channel])
        half = sum(count for _, count in bucket) / 2
        running = 0
        split = 1
        for position, (_, count) in enumerate(bucket):
            running += count
            if running >= half:
                split = max(1, min(position + 1, len(bucket) - 1))
                break
        buckets[target] = bucket[:split]
        buckets.append(bucket[split:])

    palette: list[bytes] = []
    for bucket in buckets:
        total = sum(count for _, count in bucket) or 1
        channels = []
        for channel in range(4):
            channels.append(
                min(
                    255,
                    int(
                        sum(color[channel] * count for color, count in bucket) / total
                        + 0.5
                    ),
                )
            )
        palette.append(bytes(channels))
    return palette


def _chunk(kind: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + kind
        + payload
        + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    )


def _filter_scanlines(raw_rows: list[bytes], bpp: int) -> bytes:
    """Per-row adaptive filtering with the standard minimum-sum-of-absolute heuristic."""
    out = bytearray()
    prev = bytes(len(raw_rows[0])) if raw_rows else b""
    for line in raw_rows:
        candidates = []
        for ftype in range(5):
            buf = bytearray(len(line))
            for x in range(len(line)):
                left = line[x - bpp] if x >= bpp else 0
                up = prev[x]
                upleft = prev[x - bpp] if x >= bpp else 0
                if ftype == 0:
                    value = line[x]
                elif ftype == 1:
                    value = line[x] - left
                elif ftype == 2:
                    value = line[x] - up
                elif ftype == 3:
                    value = line[x] - ((left + up) >> 1)
                else:
                    guess = left + up - upleft
                    da, db, dc = (
                        abs(guess - left),
                        abs(guess - up),
                        abs(guess - upleft),
                    )
                    if da <= db and da <= dc:
                        pred = left
                    elif db <= dc:
                        pred = up
                    else:
                        pred = upleft
                    value = line[x] - pred
                buf[x] = value & 255
            score = sum(b if b < 128 else 256 - b for b in buf)
            candidates.append((score, ftype, buf))
        score, ftype, buf = min(candidates, key=lambda item: (item[0], item[1]))
        out.append(ftype)
        out += buf
        prev = line
    return bytes(out)


def encode_rgba(width: int, height: int, pixels: bytearray) -> bytes:
    rows = [bytes(pixels[y * width * 4:(y + 1) * width * 4]) for y in range(height)]
    body = zlib.compress(_filter_scanlines(rows, 4), 9)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return PNG_MAGIC + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", body) + _chunk(b"IEND", b"")


def encode_indexed(
    width: int, height: int, pixels: bytearray, limit: int = PALETTE_LIMIT
) -> bytes:
    counts: dict[bytes, int] = {}
    for offset in range(0, len(pixels), 4):
        key = bytes(pixels[offset:offset + 4])
        counts[key] = counts.get(key, 0) + 1
    palette = (
        sorted(counts, key=lambda color: -counts[color])
        if len(counts) <= limit
        else _median_cut(counts, limit)
    )
    # Fully transparent pixels collapse to one entry; alpha entries first keeps tRNS short.
    palette = sorted(set(palette), key=lambda color: (color[3], color[0], color[1], color[2]))

    lookup: dict[bytes, int] = {}

    def nearest(color: bytes) -> int:
        hit = lookup.get(color)
        if hit is not None:
            return hit
        best = 0
        best_cost = None
        for index, candidate in enumerate(palette):
            cost = (
                (candidate[0] - color[0]) ** 2
                + (candidate[1] - color[1]) ** 2
                + (candidate[2] - color[2]) ** 2
                + 3 * (candidate[3] - color[3]) ** 2
            )
            if best_cost is None or cost < best_cost:
                best_cost = cost
                best = index
        lookup[color] = best
        return best

    rows = []
    for y in range(height):
        base = y * width * 4
        row = bytearray(width)
        for x in range(width):
            offset = base + x * 4
            row[x] = nearest(bytes(pixels[offset:offset + 4]))
        rows.append(bytes(row))

    body = zlib.compress(_filter_scanlines(rows, 1), 9)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 3, 0, 0, 0)
    plte = b"".join(bytes(color[:3]) for color in palette)
    trns = bytes(color[3] for color in palette)
    while trns and trns[-1] == 255:
        trns = trns[:-1]
    out = PNG_MAGIC + _chunk(b"IHDR", ihdr) + _chunk(b"PLTE", plte)
    if trns:
        out += _chunk(b"tRNS", trns)
    return out + _chunk(b"IDAT", body) + _chunk(b"IEND", b"")


def optimize(path: Path) -> bytes:
    width, height, pixels = read_png(path)
    if (width, height) != (TARGET_WIDTH, TARGET_HEIGHT):
        pixels = resize_rgba(width, height, pixels, TARGET_WIDTH, TARGET_HEIGHT)
    indexed = encode_indexed(TARGET_WIDTH, TARGET_HEIGHT, pixels)
    truecolor = encode_rgba(TARGET_WIDTH, TARGET_HEIGHT, pixels)
    return indexed if len(indexed) <= len(truecolor) else truecolor


def versioned_asset_path(source_relative: str, payload: bytes) -> str:
    """Return a content-addressed path so immutable URLs never change bytes."""
    source = Path(source_relative)
    digest = hashlib.sha256(payload).hexdigest()[:8]
    filename = f"{source.stem}-{TARGET_WIDTH}-{digest}{source.suffix}"
    return (source.parent / filename).as_posix()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write", action="store_true", help="write the versioned optimized assets"
    )
    parser.add_argument("--report", action="store_true", help="print before/after sizes only")
    args = parser.parse_args(argv)

    for source_relative in ASSETS:
        source = ROOT / source_relative
        before = source.stat().st_size
        width, height, _ = read_png(source)
        payload = optimize(source)
        destination_relative = versioned_asset_path(source_relative, payload)
        destination = ROOT / destination_relative
        print(
            f"{source_relative}: {width}x{height} {before}B -> "
            f"{destination_relative}: {TARGET_WIDTH}x{TARGET_HEIGHT} {len(payload)}B "
            f"({100 - round(100 * len(payload) / before)}% smaller)"
        )
        if args.write:
            destination.write_bytes(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
