#!/usr/bin/env python3
"""Drive the shipped performance auditor on injected sizes and the real tree."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.audit_performance import (  # noqa: E402
    BASELINE_PATH,
    CLS_CAP,
    CSS_GZIP_CAP_KB,
    FONT_FILES_CAP,
    FONT_GZIP_CAP_KB,
    JS_GZIP_CAP_KB,
    asset_class,
    audit_tree,
    build_baseline,
    evaluate_route_budgets,
    evaluate_sizes,
    gzip_len,
    load_budget,
    load_route_cls,
    measure_route,
    measure_routes,
    render_route_table,
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


# ---------------------------------------------------------------------------
# Issue #508 - font, asset and CLS budgets measured per route.
#
# The site ships zero @font-face today, so every negative test below builds the
# cost synthetically and proves the shipped auditor refuses it. A budget that
# has never been shown to fail is not a budget.
# ---------------------------------------------------------------------------


def _route_row(**kwargs):
    row = {
        "route": "/",
        "asset_files": 4,
        "asset_raw_kb": 100.0,
        "asset_gzip_kb": 40.0,
        "by_class": {},
        "font_files": 0,
        "font_gzip_kb": 0.0,
        "font_raw_kb": 0.0,
        "font_face_rules": 0,
        "font_sources": [],
        "cls": 0.0,
    }
    row.update(kwargs)
    return row


def _budgets(**kwargs):
    defaults = dict(
        font_files_budget=0,
        font_total_gzip_budget_kb=0,
        cls_budget=0.05,
    )
    defaults.update(kwargs)
    return defaults


_PLAIN_HTML = (
    '<!doctype html><html><head><link rel="stylesheet" href="/styles.css">'
    "</head><body><p>ok</p></body></html>"
)


def _write_synthetic_route(base, *, font_bytes, css, html=_PLAIN_HTML):
    """A minimal shipped tree: one route, one stylesheet, optionally one font."""
    (base / "assets" / "fonts").mkdir(parents=True, exist_ok=True)
    if font_bytes is not None:
        (base / "assets" / "fonts" / "inter-subset.woff2").write_bytes(font_bytes)
    (base / "styles.css").write_text(css, encoding="utf-8")
    (base / "index.html").write_text(html, encoding="utf-8")


def test_the_three_new_keys_exist_and_are_read_by_the_auditor() -> None:
    budget = load_budget()
    for key in ("font_total_gzip_budget_kb", "font_files_budget", "cls_budget"):
        assert key in budget, key
    raw = json.loads(
        (ROOT / "data" / "site" / "design-system.json").read_text(encoding="utf-8")
    )["performance_budget"]
    assert raw["font_total_gzip_kb_max"] == budget["font_total_gzip_budget_kb"]
    assert raw["font_files_max"] == budget["font_files_budget"]
    assert raw["cls_max"] == budget["cls_budget"]


def test_missing_font_or_cls_key_fails_closed() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        ds = Path(tmp) / "design-system.json"
        ds.write_text(
            json.dumps({"performance_budget": {"css_gzip_kb_max": 80}}),
            encoding="utf-8",
        )
        try:
            load_budget(ds)
        except KeyError as exc:
            assert "cls_max" in str(exc) and "font_files_max" in str(exc), exc
        else:
            raise AssertionError("a performance_budget without the #508 keys must not load")


def test_font_files_over_budget_fails() -> None:
    report = evaluate_route_budgets(
        [_route_row(font_files=1, font_sources=["/assets/fonts/inter-subset.woff2"])],
        **_budgets(),
    )
    assert report["failures"], report
    assert any("font files exceed budget" in item for item in report["failures"]), report


def test_font_gzip_over_budget_fails_even_when_the_file_count_passes() -> None:
    report = evaluate_route_budgets(
        [_route_row(font_files=1, font_gzip_kb=31.5)],
        **_budgets(font_files_budget=2, font_total_gzip_budget_kb=30),
    )
    assert any(
        "font gzip 31.5 KB exceeds budget 30 KB" in item for item in report["failures"]
    ), report


def test_font_face_rule_with_no_resolvable_file_still_fails() -> None:
    """A remote webfont spends the same visitor time as a checked-in WOFF2."""
    report = evaluate_route_budgets(
        [_route_row(font_face_rules=2, font_files=0)],
        **_budgets(),
    )
    assert any("@font-face rules exceed budget" in item for item in report["failures"]), report


def test_cls_over_budget_fails() -> None:
    report = evaluate_route_budgets([_route_row(cls=0.06)], **_budgets())
    assert any("CLS 0.06 exceeds budget 0.05" in item for item in report["failures"]), report
    assert evaluate_route_budgets([_route_row(cls=0.05)], **_budgets())["failures"] == []


def test_declared_font_and_cls_budgets_cannot_be_raised_past_their_caps() -> None:
    over_files = evaluate_route_budgets([], **_budgets(font_files_budget=FONT_FILES_CAP + 1))
    assert any("font_files_max" in item for item in over_files["failures"]), over_files
    over_gzip = evaluate_route_budgets(
        [], **_budgets(font_total_gzip_budget_kb=FONT_GZIP_CAP_KB + 1)
    )
    assert any("font_total_gzip_kb_max" in item for item in over_gzip["failures"]), over_gzip
    over_cls = evaluate_route_budgets([], **_budgets(cls_budget=CLS_CAP + 0.01))
    assert any("cls_max" in item for item in over_cls["failures"]), over_cls
    budget = load_budget()
    assert budget["font_files_budget"] <= FONT_FILES_CAP
    assert budget["font_total_gzip_budget_kb"] <= FONT_GZIP_CAP_KB
    assert budget["cls_budget"] <= CLS_CAP


def test_the_first_webfont_lands_as_a_measured_delta_not_a_silent_pass() -> None:
    """The exact shape #494 can contract: a subsetted WOFF2 behind @font-face.

    Zero fonts pass; adding one font file to the same tree flips the shipped
    auditor to FAIL and names the file. This is the bite the budget exists for.
    """
    plain_css = "body{color:#071a31}"
    font_css = (
        "@font-face{font-family:Inter;font-display:swap;"
        "src:url('/assets/fonts/inter-subset.woff2') format('woff2')}"
        "body{font-family:Inter,serif}"
    )
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        _write_synthetic_route(base, font_bytes=None, css=plain_css)
        before = measure_routes(base, summary_path=base / "absent.json")
        assert len(before) == 1, before
        assert before[0]["font_files"] == 0
        assert before[0]["font_face_rules"] == 0
        assert evaluate_route_budgets(before, **_budgets())["failures"] == []

        _write_synthetic_route(base, font_bytes=os.urandom(24 * 1024), css=font_css)
        after = measure_routes(base, summary_path=base / "absent.json")
        assert after[0]["font_files"] == 1, after
        assert after[0]["font_face_rules"] == 1, after
        assert after[0]["font_gzip_kb"] > 0, after
        assert after[0]["font_sources"] == ["/assets/fonts/inter-subset.woff2"], after
        failures = evaluate_route_budgets(after, **_budgets())["failures"]
        assert failures, "a webfont must not pass the zero baseline silently"
        assert any("inter-subset.woff2" in item for item in failures), failures

        six = evaluate_route_budgets(
            [_route_row(font_files=6, font_gzip_kb=90.0)], **_budgets()
        )
        assert six["failures"], six


def test_a_google_fonts_link_is_measured_even_with_no_file_in_the_repository() -> None:
    html = (
        "<!doctype html><html><head>"
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">'
        "</head><body><p>ok</p></body></html>"
    )
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        (base / "index.html").write_text(html, encoding="utf-8")
        rows = measure_routes(base, summary_path=base / "absent.json")
        assert rows[0]["font_files"] == 1, rows
        assert rows[0]["font_sources"] == ["https://fonts.googleapis.com/css2"], rows
        assert evaluate_route_budgets(rows, **_budgets())["failures"], rows


def test_asset_classification_covers_the_shipped_extensions() -> None:
    assert asset_class("/assets/fonts/x.WOFF2") == "font"
    assert asset_class("/assets/x.svg?v=2") == "image"
    assert asset_class("/styles.css") == "style"
    assert asset_class("/script.js") == "script"
    assert asset_class("/feed.xml") == "other"


def test_per_route_measurement_attributes_stylesheet_assets_to_the_route() -> None:
    css = "body{background:url('/assets/bg.png')}"
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        (base / "assets").mkdir()
        (base / "assets" / "bg.png").write_bytes(b"\x89PNG" + os.urandom(2048))
        (base / "styles.css").write_text(css, encoding="utf-8")
        (base / "index.html").write_text(_PLAIN_HTML, encoding="utf-8")
        row = measure_route(route="/", html_path=base / "index.html", root=base)
        assert row["by_class"]["image"]["files"] == 1, row
        assert row["by_class"]["style"]["files"] == 1, row
        assert row["asset_files"] == 2, row


def test_cls_rows_come_from_committed_chrome_evidence_not_from_this_auditor() -> None:
    observed = load_route_cls()
    assert observed, "docs/lighthouse-runs/summary.json must carry measured CLS"
    committed = json.loads(
        (ROOT / "docs" / "lighthouse-runs" / "summary.json").read_text(encoding="utf-8")
    )
    for row in committed["results"]:
        if row.get("error"):
            continue
        assert observed[row["path"]] >= float(row["cls"])
    source = (ROOT / "scripts" / "site" / "audit_performance.py").read_text(encoding="utf-8")
    assert "docs/lighthouse-runs/summary.json" in source


def test_real_tree_ships_only_the_declared_webfont_and_stays_inside_every_budget() -> None:
    """The tree may only ship the webfont the budget file declares.

    Until 2026-08-30 the tree shipped zero @font-face and this test asserted the
    literal zero. The home canary declares one subsetted family, so the literal
    would now be asserting yesterday's tree instead of today's contract. The
    contract is the declared budget: `report["ok"]` still enforces it per route,
    the module caps still bound what may be declared, and an undeclared second
    font still fails here because the census must not exceed the declaration.
    """
    report = audit_tree()
    assert report["ok"] is True, report["failures"]
    declared_files = report["per_route"]["font_files_budget"]
    declared_gzip = report["per_route"]["font_total_gzip_budget_kb"]
    assert report["per_route"]["font_files_total"] <= declared_files
    assert report["per_route"]["font_gzip_kb_max_route"] <= declared_gzip
    assert len(report["font_routes"]) <= declared_files, report["font_routes"]
    for route in report["font_routes"]:
        assert route["font_files"] <= declared_files, route
        assert all(
            source.startswith("/assets/") for source in route["font_sources"]
        ), f"webfont must be self-hosted: {route}"
    assert report["per_route"]["routes_measured"] >= 200
    assert report["per_route"]["cls_routes_measured"] >= 20
    assert report["per_route"]["cls_observed_max"] <= report["per_route"]["cls_budget"]
    assert report["heaviest_routes"], "per-route asset weight must be reported"
    assert len(report["route_cls"]) == report["per_route"]["cls_routes_measured"]


def test_per_route_table_is_deterministic_and_diffable_across_shas() -> None:
    rows = [
        _route_row(route="/b/", cls=None),
        _route_row(route="/a/", cls=0.0),
    ]
    table = render_route_table(rows)
    lines = table.splitlines()
    assert lines[0].split()[0] == "route"
    assert lines[2].startswith("/a/") and lines[3].startswith("/b/"), table
    assert lines[2].endswith("0.000") and lines[3].endswith("-"), table
    assert render_route_table(rows) == table


def test_committed_baseline_is_the_delta_anchor_and_is_still_true() -> None:
    committed = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    current = build_baseline()
    assert committed["budget"] == current["budget"], (
        "docs/performance/PERFORMANCE-BUDGET-BASELINE.json no longer matches "
        "design-system.json: refresh with npm run audit:performance -- --write-baseline"
    )
    assert committed["fonts"] == current["fonts"], (
        "the font baseline moved: declare the delta and refresh the baseline"
    )
    assert committed["fonts"]["font_files_total"] <= current["budget"]["font_files_max"]
    assert len(committed["fonts"]["routes_with_font_face_rules"]) <= current["budget"][
        "font_files_max"
    ], committed["fonts"]["routes_with_font_face_rules"]
    assert committed["cls"]["observed_max"] <= committed["budget"]["cls_max"]
    assert committed["cls"]["routes_measured"] >= 20


def test_cli_text_format_prints_a_per_route_census() -> None:
    proc = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "site" / "audit_performance.py"),
            "--format",
            "text",
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr
    assert "@font-face" in proc.stdout
    budget = json.loads(
        (ROOT / "data" / "site" / "design-system.json").read_text(encoding="utf-8")
    )["performance_budget"]
    # The census prints measured/declared. Pinning the literal "0/0" pinned the
    # tree of the day the budget was calibrated; pinning the declared number
    # keeps the assertion about the contract, which is what may not drift.
    assert f"/{budget['font_files_max']}" in proc.stdout, proc.stdout
    assert "font_files=" in proc.stdout, proc.stdout
    cls_match = re.search(r"cls_max_observed=([0-9.]+)/([0-9.]+)", proc.stdout)
    assert cls_match, proc.stdout
    observed_cls, declared_cls = map(float, cls_match.groups())
    assert declared_cls == budget["cls_max"]
    assert observed_cls <= declared_cls
    assert proc.stdout.count("\n") > 200, "every shipped route must appear"


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
