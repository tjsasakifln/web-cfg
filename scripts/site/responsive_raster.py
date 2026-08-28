"""Portrait/avatar <picture> markup and raster dimension readers."""

from __future__ import annotations

from pathlib import Path

AUTHOR_PNG = "/assets/tiago-sasaki-avatar-v11-sem-fundo.png"
PORTRAIT_PNG = "/assets/tiago-sasaki-foto-v11-sem-fundo.png"
PORTRAIT_560_PNG = "/assets/tiago-sasaki-foto-v11-sem-fundo-560.png"

AUTHOR_IMG = (
    f'<img src="{AUTHOR_PNG}" width="512" height="512" '
    'alt="Engº Tiago Sasaki" loading="lazy" decoding="async"/>'
)
AUTHOR_PICTURE = (
    "<picture>"
    f'<source type="image/avif" srcset="{AUTHOR_PNG.replace(".png", ".avif")}"/>'
    f'<source type="image/webp" srcset="{AUTHOR_PNG.replace(".png", ".webp")}"/>'
    f"{AUTHOR_IMG}"
    "</picture>"
)

HOME_IMG = (
    f'<img src="{PORTRAIT_PNG}" width="640" height="800" '
    'alt="Engº Tiago Sasaki, responsável técnico da CONFENGE" loading="lazy" decoding="async"/>'
)
HOME_PICTURE = (
    "<picture>"
    f'<source type="image/avif" srcset="{PORTRAIT_560_PNG.replace(".png", ".avif")}"/>'
    f'<source type="image/webp" srcset="{PORTRAIT_560_PNG.replace(".png", ".webp")}"/>'
    f'<img src="{PORTRAIT_560_PNG}" width="560" height="700" '
    'alt="Engº Tiago Sasaki, responsável técnico da CONFENGE" loading="lazy" decoding="async" fetchpriority="low"/>'
    "</picture>"
)

SPECIALIST_IMG = (
    f'<img src="{PORTRAIT_560_PNG}" srcset="{PORTRAIT_560_PNG} 560w, {PORTRAIT_PNG} 1080w" '
    'sizes="(max-width: 767px) 273px, 309px" width="1080" height="1350" '
    'alt="Engº Tiago Sasaki" fetchpriority="high" decoding="async"/>'
)
SPECIALIST_PICTURE = (
    "<picture>"
    f'<source type="image/avif" srcset="{PORTRAIT_560_PNG.replace(".png", ".avif")} 560w, '
    f'{PORTRAIT_PNG.replace(".png", ".avif")} 1080w" sizes="(max-width: 767px) 273px, 309px"/>'
    f'<source type="image/webp" srcset="{PORTRAIT_560_PNG.replace(".png", ".webp")} 560w, '
    f'{PORTRAIT_PNG.replace(".png", ".webp")} 1080w" sizes="(max-width: 767px) 273px, 309px"/>'
    f"{SPECIALIST_IMG}"
    "</picture>"
)

RASTER_FILES = (
    "assets/tiago-sasaki-foto-v11-sem-fundo-560.png",
    "assets/tiago-sasaki-foto-v11-sem-fundo.png",
    "assets/tiago-sasaki-avatar-v11-sem-fundo.png",
)


def sibling(path: str, suffix: str) -> str:
    if not path.endswith(".png"):
        raise ValueError(path)
    return path[: -len(".png")] + suffix


def webp_dimensions(data: bytes) -> tuple[int, int]:
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("not a WebP file")
    offset = 12
    while offset + 8 <= len(data):
        kind = data[offset : offset + 4]
        size = int.from_bytes(data[offset + 4 : offset + 8], "little")
        payload = data[offset + 8 : offset + 8 + size]
        if kind == b"VP8X" and len(payload) >= 10:
            width = int.from_bytes(payload[4:7], "little") + 1
            height = int.from_bytes(payload[7:10], "little") + 1
            return width, height
        if kind == b"VP8 " and len(payload) >= 10:
            width = int.from_bytes(payload[6:8], "little") & 0x3FFF
            height = int.from_bytes(payload[8:10], "little") & 0x3FFF
            return width, height
        if kind == b"VP8L" and len(payload) >= 5:
            bits = int.from_bytes(payload[1:5], "little")
            width = (bits & 0x3FFF) + 1
            height = ((bits >> 14) & 0x3FFF) + 1
            return width, height
        offset += 8 + size + (size & 1)
    raise ValueError("WebP has no VP8 dimension box")


def avif_dimensions(data: bytes) -> tuple[int, int]:
    marker = b"ispe"
    idx = 0
    while True:
        found = data.find(marker, idx)
        if found < 0:
            raise ValueError("AVIF has no ispe box")
        if found >= 4:
            width = int.from_bytes(data[found + 8 : found + 12], "big")
            height = int.from_bytes(data[found + 12 : found + 16], "big")
            if width > 0 and height > 0 and width < 100_000 and height < 100_000:
                return width, height
        idx = found + 4


def png_dimensions(data: bytes) -> tuple[int, int]:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG file")
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    return width, height


def rewrite_raster_markup(html: str) -> str:
    updated = html
    if AUTHOR_IMG in updated and AUTHOR_PICTURE not in updated:
        updated = updated.replace(AUTHOR_IMG, AUTHOR_PICTURE)
    if SPECIALIST_IMG in updated and SPECIALIST_PICTURE not in updated:
        updated = updated.replace(SPECIALIST_IMG, SPECIALIST_PICTURE)
    if HOME_IMG in updated and HOME_PICTURE not in updated:
        updated = updated.replace(HOME_IMG, HOME_PICTURE)
    return updated


def picture_has_sources(html: str, png_href: str) -> bool:
    avif = sibling(png_href, ".avif")
    webp = sibling(png_href, ".webp")
    return (
        "<picture>" in html
        and f'type="image/avif"' in html
        and f'type="image/webp"' in html
        and avif in html
        and webp in html
        and png_href in html
        and "<img " in html
    )


def expected_converted(root: Path) -> list[Path]:
    files: list[Path] = []
    for png in RASTER_FILES:
        files.append(root / sibling(png, ".avif"))
        files.append(root / sibling(png, ".webp"))
    return files
