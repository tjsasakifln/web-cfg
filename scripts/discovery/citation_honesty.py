"""Observed citations stay UNKNOWN until a live probe (#86)."""

from __future__ import annotations

from typing import Any

from scripts.discovery.report import build_report


def evaluate_citation_honesty(report: dict[str, Any] | None = None) -> dict[str, Any]:
    report = report or build_report()
    fails: list[str] = []
    if report.get("llms_txt_strategy") is True:
        fails.append("llms_txt_strategy")
    if report.get("geo_hacks") is True:
        fails.append("geo_hacks")
    if report.get("fake_citations") is True:
        fails.append("fake_citations")
    if report.get("network_probed") is not True:
        citations = report.get("citations")
        if citations is None:
            citations = report.get("observed_citations")
        if citations in (0, "0"):
            fails.append("absence_counted_as_zero")
        stage = (report.get("stage_separation") or {})
        if stage.get("absence_is_not_zero") is not True:
            fails.append("absence_zero_rule_missing")
    return {
        "schema_version": "discovery-citation-honesty-v1",
        "ok": not fails,
        "fails": fails,
        "network_probed": report.get("network_probed"),
        "llms_txt_strategy": report.get("llms_txt_strategy"),
    }
