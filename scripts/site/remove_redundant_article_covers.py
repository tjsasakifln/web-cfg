#!/usr/bin/env python3
"""Keep title-card artwork for Open Graph without rendering it inside articles.

The 1200x630 assets under assets/conteudos and assets/clusters repeat the page
title/category/brand as raster text. Public HTML is canonical in this static
site, so this migration edits eligible files deterministically and is
idempotent. The six BOFU pillars frozen by #128/#226 remain out of scope.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXCLUDED_PARTS = {".git", ".worktrees", "_site", "node_modules"}
MIN_EXPECTED_ROUTES = 128
FROZEN_BOFU_PATHS = {
    "aditivos-obras-publicas/index.html",
    "auditoria-orcamento-licitacao/index.html",
    "diagnostico-b2g-360/index.html",
    "diagnostico-pre-licitacao/index.html",
    "medicoes-glosas-obras-publicas/index.html",
    "reequilibrio-obras-publicas/index.html",
}

META_RE = re.compile(r"<meta\b[^>]*>", re.I)
ATTR_RE = re.compile(r"([:\w-]+)\s*=\s*([\"'])(.*?)\2", re.I | re.S)
COVER_RE = re.compile(
    r"<figure\b[^>]*class=[\"'][^\"']*\barticle-cover\b[^\"']*[\"'][^>]*>"
    r"[\s\S]*?</figure>",
    re.I,
)
IMG_RE = re.compile(r"<img\b[^>]*>", re.I)
HERO_RE = re.compile(
    r"(<header\b[^>]*class=[\"'])([^\"']*\bcontent-hero\b[^\"']*)([\"'][^>]*>)",
    re.I,
)
OG_PREFIXES = (
    "https://confenge.com.br/assets/conteudos/",
    "https://confenge.com.br/assets/clusters/",
)


def _attrs(tag: str) -> dict[str, str]:
    return {key.lower(): value for key, _quote, value in ATTR_RE.findall(tag)}


def _og_image(html: str) -> str | None:
    for tag in META_RE.findall(html):
        attrs = _attrs(tag)
        if attrs.get("property", "").lower() == "og:image":
            return attrs.get("content")
    return None


def _candidate_files() -> list[Path]:
    candidates: list[Path] = []
    for path in ROOT.rglob("index.html"):
        if any(part in EXCLUDED_PARTS for part in path.parts):
            continue
        html = path.read_text(encoding="utf-8")
        og_image = _og_image(html)
        if og_image and og_image.startswith(OG_PREFIXES):
            candidates.append(path)
    return sorted(candidates)


def _use_existing_coverless_hero(html: str, path: Path) -> str:
    def add_class(match: re.Match[str]) -> str:
        classes = match.group(2).split()
        if "article-hero" not in classes:
            classes.append("article-hero")
        return f'{match.group(1)}{" ".join(classes)}{match.group(3)}'

    updated, count = HERO_RE.subn(add_class, html, count=1)
    if count != 1:
        raise ValueError(f"{path.relative_to(ROOT)}: expected one content hero")
    return updated


def migrate(path: Path, *, write: bool) -> bool:
    html = path.read_text(encoding="utf-8")
    og_image = _og_image(html)
    assert og_image is not None
    local_og = og_image.removeprefix("https://confenge.com.br")
    covers = COVER_RE.findall(html)
    relative = path.relative_to(ROOT).as_posix()

    if relative in FROZEN_BOFU_PATHS:
        if len(covers) != 1:
            raise ValueError(f"{relative}: frozen BOFU route must preserve its cover")
        image = IMG_RE.search(covers[0])
        attrs = _attrs(image.group(0)) if image else {}
        if attrs.get("src") != local_og:
            raise ValueError(f"{relative}: frozen cover must keep the OG asset")
        if attrs.get("width") != "1200" or attrs.get("height") != "630":
            raise ValueError(f"{relative}: frozen cover must preserve 1200x630 intrinsic size")
        return False

    if not covers:
        updated = html.replace(" content-hero-grid--text", "")
        updated = _use_existing_coverless_hero(updated, path)
        if updated == html:
            return False
        if write:
            path.write_text(updated, encoding="utf-8")
        return True
    if len(covers) != 1:
        raise ValueError(f"{path.relative_to(ROOT)}: expected exactly one article cover")

    image = IMG_RE.search(covers[0])
    if not image:
        raise ValueError(f"{path.relative_to(ROOT)}: article cover has no image")
    inline_src = _attrs(image.group(0)).get("src")
    if inline_src != local_og:
        raise ValueError(
            f"{path.relative_to(ROOT)}: inline {inline_src!r} != OG {local_og!r}; "
            "classify informative media separately"
        )

    updated = COVER_RE.sub("", html, count=1)
    updated = updated.replace(" content-hero-grid--text", "")
    updated = _use_existing_coverless_hero(updated, path)
    if write:
        path.write_text(updated, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="apply the migration")
    args = parser.parse_args()

    candidates = _candidate_files()
    if len(candidates) < MIN_EXPECTED_ROUTES:
        raise SystemExit(
            f"ARTICLE_COVER_MIGRATION_BLOCKED candidates={len(candidates)} "
            f"expected_at_least={MIN_EXPECTED_ROUTES}"
        )
    changed = [path for path in candidates if migrate(path, write=args.write)]
    if changed and not args.write:
        for path in changed[:20]:
            print(f"NEEDS_MIGRATION {path.relative_to(ROOT)}")
        print(f"ARTICLE_COVER_MIGRATION_BLOCKED remaining={len(changed)}")
        return 1

    frozen = sum(
        path.relative_to(ROOT).as_posix() in FROZEN_BOFU_PATHS for path in candidates
    )
    print(
        f"ARTICLE_COVER_MIGRATION_OK routes={len(candidates)} "
        f"eligible={len(candidates) - frozen} frozen={frozen} changed={len(changed)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
