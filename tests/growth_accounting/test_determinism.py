"""Two builds of the same frozen input are byte-identical."""

from __future__ import annotations

from scripts.growth_accounting.report import build_report, render_markdown
from scripts.growth_accounting.serialize import canonical_dumps
from tests.growth_accounting.helpers import exponential_clicks, synthetic_input


def test_double_build_byte_identical_json_and_md():
    payload = synthetic_input(n_cohorts=3, clicks_for=exponential_clicks)
    a = build_report(payload)
    b = build_report(payload)
    assert canonical_dumps(a) == canonical_dumps(b)
    assert render_markdown(a) == render_markdown(b)
    assert a["report_hash"] == b["report_hash"]
    assert a["input_hash"] == b["input_hash"]


def test_report_does_not_embed_wall_clock():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    report = build_report(payload)
    blob = canonical_dumps(report)
    assert "generated_at" not in blob
    assert report["as_of"].startswith("2026-")
