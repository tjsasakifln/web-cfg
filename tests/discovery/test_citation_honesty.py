"""Drive shipped discovery citation honesty (#86)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.discovery.citation_honesty import evaluate_citation_honesty
from scripts.discovery.report import build_report


def test_prepare_only_report_does_not_treat_absence_as_zero():
    report = build_report(root=ROOT, generated_at="2026-08-19T00:00:00Z")
    honesty = evaluate_citation_honesty(report)
    assert honesty["ok"], honesty["fails"]
    assert report["llms_txt_strategy"] is False
    assert report["network_probed"] is False
    assert (report.get("stage_separation") or {}).get("absence_is_not_zero") is True


def test_counting_zero_citations_without_probe_fails_closed():
    report = build_report(root=ROOT, generated_at="2026-08-19T00:00:00Z")
    report["citations"] = 0
    honesty = evaluate_citation_honesty(report)
    assert honesty["ok"] is False
    assert "absence_counted_as_zero" in honesty["fails"]
