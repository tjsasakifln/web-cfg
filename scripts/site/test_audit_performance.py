#!/usr/bin/env python3
"""Boundary regressions for the static performance budget gate."""
from __future__ import annotations

import gzip
import random
from pathlib import Path

from scripts.site.audit_performance import evaluate_performance


ONE_KIB_BUDGET = {
    "css_gzip_kb_max": 1,
    "own_js_gzip_kb_max": 1,
}


def payload_with_gzip_size(target: int) -> bytes:
    """Return deterministic incompressible bytes with the requested gzip size."""
    for raw_size in range(max(1, target - 128), target + 128):
        payload = random.Random(461_000 + raw_size).randbytes(raw_size)
        if len(gzip.compress(payload, compresslevel=9)) == target:
            return payload
    raise AssertionError(f"could not construct gzip payload of {target} bytes")


def write_assets(root: Path, *, css: bytes, js: bytes) -> None:
    (root / "styles.css").write_bytes(css)
    (root / "script.js").write_bytes(js)


def test_one_byte_over_gzip_budget_fails_even_when_report_rounds_down(tmp_path: Path) -> None:
    write_assets(
        tmp_path,
        css=payload_with_gzip_size(1025),
        js=payload_with_gzip_size(1024),
    )

    report = evaluate_performance(tmp_path, budget=ONE_KIB_BUDGET)

    assert report["css_gzip_kb"] == 1.0
    assert report["ok"] is False


def test_raw_budget_rejects_large_assets_even_when_gzip_is_small(tmp_path: Path) -> None:
    write_assets(tmp_path, css=b"a" * 16_384, js=b"b" * 16_384)

    report = evaluate_performance(
        tmp_path,
        budget={
            **ONE_KIB_BUDGET,
            "css_raw_kb_max": 8,
            "own_js_raw_kb_max": 8,
        },
    )

    assert report["css_raw_kb"] == 16.0
    assert report["js_raw_kb"] == 16.0
    assert report["gzip_ok"] is True
    assert report["raw_ok"] is False
    assert report["ok"] is False
