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
        print("OK css modules concatenated")
        return 0
    if current != assembled:
        STYLES.write_text(assembled, encoding="utf-8")
        print(f"wrote {STYLES.relative_to(ROOT)} ({len(assembled.encode())} bytes)")
    else:
        print(f"unchanged {STYLES.relative_to(ROOT)} ({len(current.encode())} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
