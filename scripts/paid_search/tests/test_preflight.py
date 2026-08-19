"""Preflight fail-closes on forbidden shapes. Drives shipped preflight()."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.paid_search.family import select_family
from scripts.paid_search.package import build_package
from scripts.paid_search.preflight import preflight


def _base() -> dict:
    return build_package(select_family(ROOT))


def test_representative_preflight_blocks_on_human_required_only():
    result = preflight(_base())
    assert result["ok"] is False
    assert result["go_live"] is False
    assert result["campaign_created"] is False
    assert result["ads_mutate"] is False
    assert result["decision"] == "READY_BEHIND_HUMAN_GATE"
    assert result["human_required_blocking"]
    assert all(r.startswith("HUMAN_REQUIRED_") for r in result["reasons"])


def test_preflight_rejects_broad_match():
    package = _base()
    package["terms"]["exact"].append({"text": "obra pública", "match_type": "BROAD"})
    result = preflight(package)
    assert result["ok"] is False
    assert "BROAD_MATCH" in result["reasons"]
    assert result["decision"] == "BLOCKED"


def test_preflight_rejects_pmax():
    package = _base()
    package["channel"] = "PERFORMANCE_MAX"
    result = preflight(package)
    assert "PMAX_OR_FORBIDDEN_CHANNEL" in result["reasons"]
    assert result["decision"] == "BLOCKED"


def test_preflight_rejects_retargeting():
    package = _base()
    package["audiences"] = ["RETARGETING"]
    result = preflight(package)
    assert "RETARGETING" in result["reasons"]


def test_preflight_rejects_pii_in_params():
    package = _base()
    final = package["attribution"]["final_url"]
    final["params"]["email"] = "a@b.com"
    final["url"] = final["base"] + "?email=a@b.com"
    result = preflight(package)
    assert "PII_IN_PARAMS" in result["reasons"]


def test_preflight_rejects_incomplete_tracking():
    package = _base()
    package["events"] = ["page_view"]
    package["conversion_hierarchy"] = ["lead"]
    result = preflight(package)
    assert "TRACKING_INCOMPLETE" in result["reasons"]
    assert "CONVERSION_HIERARCHY_INCOMPLETE" in result["reasons"]


def test_approving_human_fields_still_does_not_mutate(monkeypatch):
    package = _base()
    for field, slot in package["human_required"].items():
        slot["approved"] = True
        slot["value"] = 1 if "brl" in field else "human-owner"
        slot["status"] = "APPROVED"
    result = preflight(package)
    assert result["campaign_created"] is False
    assert result["ads_mutate"] is False
    assert result["go_live"] is False
    # Even if human gates pass, this CLI has no go-live verb.
    assert copy.deepcopy(result)["spend_authorized"] is False
