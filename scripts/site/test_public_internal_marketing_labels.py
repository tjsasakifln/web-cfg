#!/usr/bin/env python3
"""Fail closed if public HTML ships internal Job/ICP/Trigger chrome.

Scans visitor-facing HTML (not docs/, node_modules/, .worktrees/).
Prints the exact offending path. No allowlist for commercial pages.

Expected success output:
  PUBLIC_INTERNAL_MARKETING_LABELS=0
  DL_HERO_PROOF=0
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

SKIP_PARTS = {
    "docs",
    "scripts",
    "tests",
    "data",
    "seo",
    "netlify",
    "node_modules",
    "_site",
    ".git",
    ".worktrees",
    ".pytest_cache",
    "supabase",
    "ops",
}

LABEL_PATTERNS = (
    re.compile(r"<dt>\s*Job\s*</dt>", re.I),
    re.compile(r"<dt>\s*ICP\s*</dt>", re.I),
    re.compile(r"<dt>\s*Trigger\s*</dt>", re.I),
    re.compile(r"""aria-label=["']Job,\s*ICP e trigger["']""", re.I),
)

DL_HERO_PROOF = re.compile(r"<dl\b[^>]*\bclass=['\"][^'\"]*\bhero-proof\b", re.I)


def public_html_files(root: Path = ROOT) -> list[Path]:
    out: list[Path] = []
    for path in root.rglob("*.html"):
        rel_parts = path.relative_to(root).parts
        if any(part in SKIP_PARTS for part in rel_parts):
            continue
        out.append(path)
    return sorted(out)


def scan(root: Path = ROOT) -> tuple[list[str], list[str]]:
    labels: list[str] = []
    dl_hero: list[str] = []
    for path in public_html_files(root):
        text = path.read_text(encoding="utf-8")
        vis = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.I)
        vis = re.sub(r"<style[\s\S]*?</style>", " ", vis, flags=re.I)
        rel = str(path.relative_to(root))
        for cre in LABEL_PATTERNS:
            if cre.search(vis):
                labels.append(rel)
                print(f"PUBLIC_INTERNAL_MARKETING_LABELS {rel}: {cre.pattern}", file=sys.stderr)
                break
        if DL_HERO_PROOF.search(vis):
            dl_hero.append(rel)
            print(f"DL_HERO_PROOF {rel}", file=sys.stderr)
    return labels, dl_hero


def main() -> int:
    labels, dl_hero = scan()
    print(f"PUBLIC_INTERNAL_MARKETING_LABELS={len(labels)}")
    print(f"DL_HERO_PROOF={len(dl_hero)}")
    if labels or dl_hero:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
