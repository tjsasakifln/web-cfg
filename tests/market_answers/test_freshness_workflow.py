"""Dedicated read-only freshness proof for the private market-intelligence consumer."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/market-answer-freshness.yml"
REVOPS = ROOT / ".github/workflows/revops-scheduled.yml"


def test_market_answer_freshness_workflow_probes_the_private_consumer_read_only():
    assert WORKFLOW.is_file()
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "on:" in text
    assert "schedule:" in text
    assert "workflow_dispatch:" in text
    crons = re.findall(r'cron:\s*["\']([^"\']+)["\']', text)
    assert crons, text
    for expr in crons:
        parts = expr.split()
        assert len(parts) == 5, expr
        minute, hour, *_rest = parts
        # Must re-evaluate more often than max_age_hours (48h).
        if hour.startswith("*/"):
            interval_h = int(hour[2:])
            assert 0 < interval_h < 48, expr
        elif hour.isdigit() and minute.startswith("*/"):
            interval_m = int(minute[2:])
            assert 0 < interval_m < 48 * 60, expr
        else:
            raise AssertionError(f"schedule is not more frequent than 48h: {expr}")
    assert "node scripts/revops/verify_gsc_freshness.mjs" in text
    assert "OPS_TOKEN: ${{ secrets.OPS_TOKEN }}" in text
    assert "BASE_URL: https://confenge.com.br" in text
    assert "name: revops-scheduled" not in text
    assert "scheduled_daily.mjs" not in text
    assert "search_demand_observatory.py sync" not in text
    assert "publish_gsc_insights.mjs" not in text
    assert "gsc_insights_ingest" not in text
    assert "method: POST" not in text
    assert "upload-artifact" not in text
    assert "git commit" not in text
    assert "git push" not in text


def test_freshness_workflow_is_not_revops_scheduled():
    assert REVOPS.is_file()
    revops = REVOPS.read_text(encoding="utf-8")
    market = WORKFLOW.read_text(encoding="utf-8")
    assert "name: revops-scheduled" in revops
    assert "name: market-answer-freshness" in market
    assert market != revops
    assert "verify_gsc_freshness.mjs" not in revops
    assert "publish_gsc_insights.mjs" in revops
