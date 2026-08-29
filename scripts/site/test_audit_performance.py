#!/usr/bin/env python3
"""Drive the shipped performance auditor on injected sizes and the real tree."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.audit_performance import (  # noqa: E402
    CSS_GZIP_CAP_KB,
    JS_GZIP_CAP_KB,
    audit_tree,
    evaluate_sizes,
    gzip_len,
    load_budget,
)


def _eval(**kwargs):
    defaults = dict(
        css_raw=1000,
        css_gzip=500,
        css_brotli=400,
        js_raw=800,
        js_gzip=300,
        js_brotli=250,
        css_gzip_budget_kb=80,
        js_gzip_budget_kb=40,
    )
    defaults.update(kwargs)
    return evaluate_sizes(**defaults)


def test_report_names_raw_compressed_and_hard_budget_separately() -> None:
    report = _eval()
    for key in (
        "css_raw_kb",
        "css_gzip_kb",
        "css_brotli_kb",
        "css_gzip_budget_kb",
        "js_raw_kb",
        "js_gzip_kb",
        "js_brotli_kb",
        "js_gzip_budget_kb",
    ):
        assert key in report, key
    assert report["css_raw_kb"] != report["css_gzip_kb"]
    assert report["css_gzip_kb"] != report["css_gzip_budget_kb"]
    assert report["ok"] is True
    assert report["failures"] == []


def test_under_budget_gzip_exits_ok() -> None:
    css = b"body{color:#071a31}" * 50
    js = b"void 0;" * 50
    report = evaluate_sizes(
        css_raw=len(css),
        css_gzip=gzip_len(css),
        css_brotli=None,
        js_raw=len(js),
        js_gzip=gzip_len(js),
        js_brotli=None,
        css_gzip_budget_kb=80,
        js_gzip_budget_kb=40,
    )
    assert report["ok"] is True, report
    assert report["css_gzip_kb"] <= 80
    assert report["js_gzip_kb"] <= 40


def test_over_budget_gzip_fails_even_when_raw_would_pass_the_old_fudge() -> None:
    """~90 KB of incompressible CSS is under 80×3 raw, over 80 gzip — must fail."""
    css = os.urandom(90 * 1024)
    compressed = gzip_len(css)
    assert compressed / 1024 > 80, compressed
    assert len(css) / 1024 <= 80 * 3, len(css)
    report = evaluate_sizes(
        css_raw=len(css),
        css_gzip=compressed,
        css_brotli=None,
        js_raw=100,
        js_gzip=50,
        js_brotli=None,
        css_gzip_budget_kb=80,
        js_gzip_budget_kb=40,
    )
    assert report["ok"] is False, report
    assert any("css gzip" in item for item in report["failures"]), report["failures"]


def test_over_budget_js_gzip_fails() -> None:
    js = os.urandom(50 * 1024)
    compressed = gzip_len(js)
    assert compressed / 1024 > 40, compressed
    report = evaluate_sizes(
        css_raw=100,
        css_gzip=50,
        css_brotli=None,
        js_raw=len(js),
        js_gzip=compressed,
        js_brotli=None,
        css_gzip_budget_kb=80,
        js_gzip_budget_kb=40,
    )
    assert report["ok"] is False, report
    assert any("own js gzip" in item for item in report["failures"]), report["failures"]


def test_declared_maxima_cannot_be_raised_past_80_40() -> None:
    budget = load_budget()
    assert budget["css_gzip_budget_kb"] <= CSS_GZIP_CAP_KB
    assert budget["js_gzip_budget_kb"] <= JS_GZIP_CAP_KB
    raised = _eval(css_gzip_budget_kb=81, js_gzip_budget_kb=40)
    assert raised["ok"] is False
    raised_js = _eval(css_gzip_budget_kb=80, js_gzip_budget_kb=41)
    assert raised_js["ok"] is False


def test_real_tree_is_under_the_gzip_contract() -> None:
    report = audit_tree()
    assert report["ok"] is True, report
    assert report["css_gzip_kb"] <= report["css_gzip_budget_kb"] <= CSS_GZIP_CAP_KB
    assert report["js_gzip_kb"] <= report["js_gzip_budget_kb"] <= JS_GZIP_CAP_KB
    assert report["css_raw_kb"] > report["css_gzip_kb"]
    assert report["js_raw_kb"] > report["js_gzip_kb"]


def test_cli_matches_the_shipped_function() -> None:
    proc = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "site" / "audit_performance.py")],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout.split("OK audit:performance")[0])
    assert payload["ok"] is True
    assert "css_raw_kb" in payload and "css_gzip_kb" in payload
    assert "css_gzip_budget_kb" in payload


def run_all() -> int:
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print("OK", test.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", test.__name__, exc)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run_all())
