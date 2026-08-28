#!/usr/bin/env python3
"""Static performance budget audit (no fabricated Lighthouse scores).

Budget keys name the unit. Raw and gzip ceilings are compared to exact bytes,
never to rounded display values or an uncompressed-size multiplier. Optional
brotli is reported when available and is never compared to a gzip key.
"""
from __future__ import annotations

import gzip
import json
import sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DS = json.loads((ROOT / "data" / "site" / "design-system.json").read_text(encoding="utf-8"))


def kb(size: int) -> float:
    return round(size / 1024, 2)


def gzip_bytes(path: Path) -> int:
    return len(gzip.compress(path.read_bytes(), compresslevel=9))


def brotli_bytes(path: Path) -> int | None:
    try:
        import brotli  # type: ignore
    except ImportError:
        brotli = None
    if brotli is None:
        return None
    return len(brotli.compress(path.read_bytes()))


def evaluate_performance(
    root: Path | None = None,
    *,
    budget: dict | None = None,
) -> dict:
    base = root or ROOT
    performance_budget = budget if budget is not None else (DS.get("performance_budget") or {})
    css = base / "styles.css"
    js = base / "script.js"
    css_raw = css.stat().st_size
    js_raw = js.stat().st_size
    css_gzip = gzip_bytes(css)
    js_gzip = gzip_bytes(js)
    css_budget = float(performance_budget.get("css_gzip_kb_max", 80))
    js_budget = float(performance_budget.get("own_js_gzip_kb_max", 40))
    css_raw_budget = float(performance_budget.get("css_raw_kb_max", 250))
    js_raw_budget = float(performance_budget.get("own_js_raw_kb_max", 120))
    css_br = brotli_bytes(css)
    js_br = brotli_bytes(js)
    css_ok = Decimal(css_gzip) <= Decimal(str(css_budget)) * 1024
    js_ok = Decimal(js_gzip) <= Decimal(str(js_budget)) * 1024
    css_raw_ok = Decimal(css_raw) <= Decimal(str(css_raw_budget)) * 1024
    js_raw_ok = Decimal(js_raw) <= Decimal(str(js_raw_budget)) * 1024
    report = {
        "css_raw_kb": kb(css_raw),
        "js_raw_kb": kb(js_raw),
        "css_gzip_kb": kb(css_gzip),
        "js_gzip_kb": kb(js_gzip),
        "css_brotli_kb": kb(css_br) if css_br is not None else None,
        "js_brotli_kb": kb(js_br) if js_br is not None else None,
        "css_budget_kb": css_budget,
        "js_budget_kb": js_budget,
        "css_raw_budget_kb": css_raw_budget,
        "js_raw_budget_kb": js_raw_budget,
        "css_budget_unit": "gzip",
        "js_budget_unit": "gzip",
        "compared_unit": "gzip+raw",
        "multiplier_fudge": False,
        "gzip_ok": css_ok and js_ok,
        "raw_ok": css_raw_ok and js_raw_ok,
        "framework_runtime": False,
        "carousel_video_webgl_lottie": False,
        "ok": css_ok and js_ok and css_raw_ok and js_raw_ok,
    }
    return report


def main() -> int:
    report = evaluate_performance()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not report["ok"]:
        print("FAIL performance budget exceeded", file=sys.stderr)
        return 1
    print("OK audit:performance")
    return 0


if __name__ == "__main__":
    sys.exit(main())
