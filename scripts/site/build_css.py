#!/usr/bin/env python3
"""Concatenate css/ modules into styles.css deterministically.

Source of truth for tokens is styles-tokens.css. Page CSS stays in styles.css.
Modules in css/manifest.json are spliced between the CFG10X-12 markers so
fingerprint_css.py still hashes a single /styles.css without a framework.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "css" / "manifest.json"
STYLES = ROOT / "styles.css"
BEGIN = "/* BEGIN css-modules:cfg10x-12 */"
END = "/* END css-modules:cfg10x-12 */"


def load_manifest() -> dict:
    data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    assert data.get("framework") in (None, ""), "heavy CSS framework is forbidden"
    assert data.get("bundle") == "styles.css"
    return data


def module_blob(manifest: dict) -> str:
    parts = [BEGIN]
    for rel in manifest["modules"]:
        path = ROOT / rel
        raw = path.read_text(encoding="utf-8").strip()
        parts.append(f"/* module:{rel} */")
        parts.append(raw)
    parts.append(END)
    return "\n".join(parts) + "\n"


def strip_existing(css: str) -> str:
    start = css.find(BEGIN)
    if start == -1:
        return css.rstrip() + "\n"
    finish = css.find(END, start)
    if finish == -1:
        raise SystemExit("styles.css has a module begin marker without an end marker")
    finish += len(END)
    while finish < len(css) and css[finish] in "\n\r":
        finish += 1
    return css[:start].rstrip() + "\n"


COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)


def strip_comments(css: str) -> str:
    """Drop author comments. Markers are re-inserted by assemble()."""
    def keep(match: re.Match[str]) -> str:
        text = match.group(0)
        if "BEGIN css-modules:cfg10x-12" in text or "END css-modules:cfg10x-12" in text:
            return text
        return ""

    return COMMENT_RE.sub(keep, css)


def assemble(css: str, blob: str) -> str:
    body = strip_comments(strip_existing(css)).strip()
    compact_blob = strip_comments(blob).strip()
    return body + "\n" + compact_blob + "\n"


HOME_EDITORIAL_BLOCKS = (
    "Type roles",
    "Section rhythm",
    "Plate:",
    "Opening (home)",
    "Area index",
    "Deliveries",
    "Responsibility",
    "Public works band",
    "After send",
    "Contact hierarchy",
    "Motion",
)


def home_subset(sheet_text: str) -> str:
    """Only the editorial blocks the home renders (every byte of CSS before the
    first paint costs LCP under slow-start; measured 2026-09-17: the full sheet
    inside home-10x.css added ~80 ms of lab LCP). Blocks are delimited by their
    `/* Title ---` header comments in assets/editorial.css."""
    import re as _re

    parts = _re.split(r"(?m)^(?=/\* )", sheet_text)
    kept = []
    for part in parts:
        if not part.startswith("/* "):
            continue  # file header before the first block
        title = part[3:].split("\n", 1)[0]
        if any(title.startswith(prefix) for prefix in HOME_EDITORIAL_BLOCKS):
            kept.append(part.rstrip("\n"))
    return "\n".join(kept) + "\n"


def sync_home_sheet(root: Path) -> bool:
    """Copy assets/editorial.css into assets/home-10x.css between its markers.

    The home carries the editorial layer inside its own composition sheet so it
    keeps two stylesheets (a third render-blocking request cost ~150 ms of LCP
    in the lab). Returns True when the file changed.
    """
    home = root / "assets" / "home-10x.css"
    sheet = root / "assets" / "editorial.css"
    if not home.is_file() or not sheet.is_file():
        return False
    begin, end = "/* BEGIN editorial-route-sheet */\n", "\n/* END editorial-route-sheet */"
    text = home.read_text(encoding="utf-8")
    if begin not in text or end not in text:
        return False
    head, rest = text.split(begin, 1)
    _old, tail = rest.split(end, 1)
    new = head + begin + home_subset(sheet.read_text(encoding="utf-8")).rstrip("\n") + end + tail
    if new != text:
        home.write_text(new, encoding="utf-8")
        return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail if styles.css is stale")
    args = parser.parse_args()
    manifest = load_manifest()
    blob = module_blob(manifest)
    current = STYLES.read_text(encoding="utf-8")
    assembled = assemble(current, blob)
    if args.check:
        if current != assembled:
            print("FAIL styles.css is stale; run python3 scripts/site/build_css.py")
            return 1
        home = ROOT / "assets" / "home-10x.css"
        snapshot = home.read_text(encoding="utf-8") if home.is_file() else ""
        if sync_home_sheet(ROOT):
            home.write_text(snapshot, encoding="utf-8")
            print("FAIL assets/home-10x.css is stale against assets/editorial.css; run python3 scripts/site/build_css.py")
            return 1
        print("OK css modules concatenated")
        return 0
    if sync_home_sheet(ROOT):
        print("wrote assets/home-10x.css (editorial route sheet synced)")
    if current != assembled:
        STYLES.write_text(assembled, encoding="utf-8")
        print(f"wrote {STYLES.relative_to(ROOT)} ({len(assembled.encode())} bytes)")
    else:
        print(f"unchanged {STYLES.relative_to(ROOT)} ({len(current.encode())} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
