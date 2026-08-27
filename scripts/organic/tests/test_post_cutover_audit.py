"""Specific SEO/GSC regression coverage for the post-cutover campaign."""

from __future__ import annotations

import json
from pathlib import Path

from scripts.organic.post_cutover_audit import (
    html_signals,
    internal_link_census,
    is_sensitive_gsc_value,
    opportunity_score,
    sensitive_gsc_value_paths,
    validate_campaign_report,
)

ROOT = Path(__file__).resolve().parents[3]
REPORT = ROOT / "data" / "organic" / "post-cutover-market-capture-2026-08-27.json"


def _page(root: Path, path: str, body: str) -> None:
    target = root / path.strip("/") / "index.html" if path != "/" else root / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body, encoding="utf-8")


def test_html_signals_are_attribute_order_independent():
    html = """
    <html><head><title>Useful title</title>
    <link href="https://confenge.com.br/x/" rel="canonical">
    <meta content="index,follow" name="robots">
    <script type="application/ld+json">{}</script></head>
    <body><h1>Useful answer</h1><a href="/y/">Y</a></body></html>
    """
    signals = html_signals(html)
    assert signals["canonical"] == "https://confenge.com.br/x/"
    assert signals["noindex"] is False
    assert signals["title_present"] is True
    assert signals["h1_present"] is True
    assert signals["json_ld_blocks"] == 1


def test_internal_link_census_detects_orphan_and_crawl_depth(tmp_path: Path):
    _page(tmp_path, "/", '<a href="/a/">a</a>')
    _page(tmp_path, "/a/", '<a href="/b/">b</a>')
    _page(tmp_path, "/b/", '<a href="/c/">c</a>')
    _page(tmp_path, "/c/", '<a href="/d/">d</a>')
    _page(tmp_path, "/d/", "done")
    _page(tmp_path, "/orphan/", "orphan")
    report = internal_link_census(
        tmp_path,
        ["/", "/a/", "/b/", "/c/", "/d/", "/orphan/"],
    )
    assert report["orphans"] == ["/orphan"]
    assert report["max_depth"] == 4
    assert report["depth_gt_3"] == [{"path": "/d", "depth": 4}]
    assert report["ok"] is False


def test_numeric_github_run_id_reproduces_sensitive_value_false_positive():
    assert is_sensitive_gsc_value("run-3") is False
    assert is_sensitive_gsc_value("33087674413:1") is True
    history = {
        "observations": [{"run_id": "33087674413:1"}],
        "state_sha256": "a" * 64,
    }
    assert sensitive_gsc_value_paths(history) == ["$.observations[0].run_id"]


def test_priority_formula_is_exact_and_fail_closed():
    inputs = {
        "demand_observed": 22,
        "commercial_intent": 4,
        "ranking_proximity": 1,
        "conversion_capacity": 4,
        "effort": 2,
    }
    assert opportunity_score(inputs) == 176.0


def test_committed_campaign_report_is_complete_and_honest():
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    assert validate_campaign_report(report, root=ROOT) == []
    assert report["terminal_state"].startswith("DEGRADED:")
    assert report["gsc_durable_state"]["durable_readback"] is False
    assert report["mutations"]["new_public_pages"] == 0
    assert report["mutations"]["html_edits"] == 0
