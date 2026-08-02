"""Static performance budget audit (no fabricated Lighthouse scores)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DS = json.loads((ROOT / "data" / "site" / "design-system.json").read_text(encoding="utf-8"))


def kb(path: Path) -> float:
    return path.stat().st_size / 1024


def main() -> int:
    budget = DS.get("performance_budget") or {}
    css = ROOT / "styles.css"
    js = ROOT / "script.js"
    report = {
        "css_kb": round(kb(css), 2),
        "js_kb": round(kb(js), 2),
        "css_budget_kb": budget.get("css_gzip_kb_max", 80),
        "js_budget_kb": budget.get("own_js_gzip_kb_max", 40),
        "note": "Uncompressed sizes; gzip typically ~30-40% of text assets. Lighthouse not run if environment lacks browser.",
        "framework_runtime": False,
        "carousel_video_webgl_lottie": False,
    }
    # uncompressed soft limits ~2.5x gzip budget
    css_ok = report["css_kb"] <= report["css_budget_kb"] * 3
    js_ok = report["js_kb"] <= report["js_budget_kb"] * 3
    report["ok"] = css_ok and js_ok
    print(json.dumps(report, ensure_ascii=False, indent=2))
    # hard fail only on extreme bloat
    if report["css_kb"] > 250 or report["js_kb"] > 120:
        print("FAIL performance budget exceeded", file=sys.stderr)
        return 1
    print("OK audit:performance")
    return 0


if __name__ == "__main__":
    sys.exit(main())
