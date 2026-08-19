"""Dry-run is not executable and creates no campaign. Drives shipped dry_run()."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.paid_search.dry_run import dry_run
from scripts.paid_search.family import select_family
from scripts.paid_search.package import build_package


def test_dry_run_unapproved_is_not_executable():
    package = build_package(select_family(ROOT))
    result = dry_run(package)
    assert result["ok"] is True
    assert result["executable"] is False
    assert result["go_live"] is False
    assert result["campaign_created"] is False
    assert result["spend_authorized"] is False
    assert result["ads_mutate"] is False
    assert result["google_ads_api_called"] is False
    assert result["budget_committed_brl"] == 0
    assert result["decision"] == "READY_BEHIND_HUMAN_GATE"
    assert "No Google Ads campaign" in result["note"]
    assert any(r.startswith("HUMAN_REQUIRED_") for r in result["reasons"])


def test_dry_run_forbidden_variant_is_blocked():
    package = build_package(select_family(ROOT))
    package["channel"] = "PERFORMANCE_MAX"
    result = dry_run(package)
    assert result["ok"] is False
    assert result["executable"] is False
    assert result["campaign_created"] is False
    assert result["ads_mutate"] is False
    assert result["decision"] == "BLOCKED"
    assert "PMAX_OR_FORBIDDEN_CHANNEL" in result["reasons"]
