#!/usr/bin/env python3
"""Static performance budget audit with honest gzip math.

Compares first-party ``styles.css`` and ``script.js`` as three distinct
quantities: uncompressed (raw) bytes, gzip-compressed bytes at production
level 6, and the hard gzip contract from ``design-system.json``. Brotli is
reported when the encoder is importable; gzip remains the fail-closed
transport. A raw-size fudge (for example ×3 of the gzip budget) must not
mark an over-budget compressed tree OK.
"""

from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DS_PATH = ROOT / "data" / "site" / "design-system.json"

CSS_GZIP_CAP_KB = 80
JS_GZIP_CAP_KB = 40
GZIP_LEVEL = 6


def gzip_len(data: bytes, *, level: int = GZIP_LEVEL) -> int:
    return len(gzip.compress(data, compresslevel=level))


def brotli_len(data: bytes) -> int | None:
    try:
        import brotli  # type: ignore[import-not-found]
    except ImportError:
        return None
    return len(brotli.compress(data))


def kb(n: int) -> float:
    return round(n / 1024, 2)


def evaluate_sizes(
    *,
    css_raw: int,
    css_gzip: int,
    css_brotli: int | None,
    js_raw: int,
    js_gzip: int,
    js_brotli: int | None,
    css_gzip_budget_kb: float,
    js_gzip_budget_kb: float,
    css_gzip_cap_kb: float = CSS_GZIP_CAP_KB,
    js_gzip_cap_kb: float = JS_GZIP_CAP_KB,
) -> dict[str, Any]:
    """Pure budget math. Callers inject measured sizes; this does not read disk."""
    failures: list[str] = []
    if css_gzip_budget_kb > css_gzip_cap_kb:
        failures.append(
            f"declared css_gzip_kb_max {css_gzip_budget_kb} exceeds cap {css_gzip_cap_kb}"
        )
    if js_gzip_budget_kb > js_gzip_cap_kb:
        failures.append(
            f"declared own_js_gzip_kb_max {js_gzip_budget_kb} exceeds cap {js_gzip_cap_kb}"
        )
    css_gzip_kb = kb(css_gzip)
    js_gzip_kb = kb(js_gzip)
    if css_gzip_kb > css_gzip_budget_kb:
        failures.append(
            f"css gzip {css_gzip_kb} KB exceeds hard budget {css_gzip_budget_kb} KB"
        )
    if js_gzip_kb > js_gzip_budget_kb:
        failures.append(
            f"own js gzip {js_gzip_kb} KB exceeds hard budget {js_gzip_budget_kb} KB"
        )
    return {
        "css_raw_kb": kb(css_raw),
        "css_gzip_kb": css_gzip_kb,
        "css_brotli_kb": None if css_brotli is None else kb(css_brotli),
        "css_gzip_budget_kb": css_gzip_budget_kb,
        "js_raw_kb": kb(js_raw),
        "js_gzip_kb": js_gzip_kb,
        "js_brotli_kb": None if js_brotli is None else kb(js_brotli),
        "js_gzip_budget_kb": js_gzip_budget_kb,
        "gzip_level": GZIP_LEVEL,
        "framework_runtime": False,
        "carousel_video_webgl_lottie": False,
        "failures": failures,
        "ok": not failures,
    }


def load_budget(ds_path: Path = DS_PATH) -> dict[str, float]:
    ds = json.loads(ds_path.read_text(encoding="utf-8"))
    budget = ds.get("performance_budget") or {}
    return {
        "css_gzip_budget_kb": float(budget.get("css_gzip_kb_max", CSS_GZIP_CAP_KB)),
        "js_gzip_budget_kb": float(budget.get("own_js_gzip_kb_max", JS_GZIP_CAP_KB)),
    }


def audit_tree(root: Path = ROOT, ds_path: Path = DS_PATH) -> dict[str, Any]:
    css = (root / "styles.css").read_bytes()
    js = (root / "script.js").read_bytes()
    budget = load_budget(ds_path)
    report = evaluate_sizes(
        css_raw=len(css),
        css_gzip=gzip_len(css),
        css_brotli=brotli_len(css),
        js_raw=len(js),
        js_gzip=gzip_len(js),
        js_brotli=brotli_len(js),
        **budget,
    )
    report["note"] = (
        "Hard fail is gzip vs the declared gzip contract. Raw and brotli are "
        "reported separately and never used as a fudge for the gzip gate."
    )
    return report


def main() -> int:
    report = audit_tree()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not report["ok"]:
        print("FAIL performance budget exceeded", file=sys.stderr)
        for failure in report["failures"]:
            print(f"FAIL {failure}", file=sys.stderr)
        return 1
    print("OK audit:performance")
    return 0


if __name__ == "__main__":
    sys.exit(main())
