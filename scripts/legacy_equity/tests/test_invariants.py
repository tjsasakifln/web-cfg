"""Invariants of the shipped inventory — every priority URL decided, no home dump."""

from __future__ import annotations

import sys
from pathlib import Path
from datetime import date
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

from legacy_equity.inventory import (  # noqa: E402
    FAIL_CLOSED_ACTIONS,
    FORBIDDEN_GENERIC_TARGETS,
    hold_entries,
    is_generic_or_parent_target,
    load_inventory,
    priority_entries,
    ready_redirects,
    validate_inventory,
)

HOME = "https://confenge.com.br/"


def test_validate_inventory_ok():
    report = validate_inventory()
    assert report["ok"], report["errors"][:20]
    assert report["redirect_count"] == 11
    assert report["hold_count"] == 54
    assert report["retire_count"] == 1190
    assert report["migrate_count"] == 0
    assert report["legal_count"] == 0


def test_every_priority_url_has_a_decision():
    data = load_inventory()
    for entry in priority_entries(data):
        assert entry["action"], entry["legacy_url"]
        assert entry["owner"], entry["legacy_url"]
        assert entry["reason"], entry["legacy_url"]
        assert entry["priority"], entry["legacy_url"]
        assert entry["observation_status"], entry["legacy_url"]


def test_no_redirect_to_home_or_unjustified_parent():
    for entry in ready_redirects():
        target = entry["target"]
        assert target
        assert target.rstrip("/") != HOME.rstrip("/")
        assert target not in FORBIDDEN_GENERIC_TARGETS
        assert "/consultoria-b2g" not in target
        if is_generic_or_parent_target(target):
            assert (entry.get("semantic_equivalence") or "").strip()
            assert (entry.get("unique_utility") or "").strip()
        host = (urlsplit(target).hostname or "").lower()
        assert host == "confenge.com.br"
        assert entry["expected_http"] == 301
        assert entry["no_chain"] is True
        assert entry["no_loop"] is True
        assert entry["http_status"] == 301


def test_hold_is_fail_closed_no_location():
    holds = hold_entries()
    assert holds, "expected at least one HOLD_TARGET_NOT_READY row"
    for entry in holds:
        assert entry["target"] in (None, "")
        assert entry["target_url"] in (None, "")
        assert entry["expected_http"] == 410
        assert entry["status"] == "hold"
        assert entry["skip_reason"]
        assert entry["intended_future_surface"]
        assert date.fromisoformat(entry["review_date"]) >= date(2026, 8, 24)
        assert not str(entry["intended_future_surface"]).startswith("https://")
        assert "301" not in entry["skip_reason"] or "Do not 301" in entry["skip_reason"]


def test_retire_is_410_not_301_home():
    data = load_inventory()
    for entry in data["entries"]:
        if entry["action"] != "RETIRE_410":
            continue
        assert entry["target"] in (None, "")
        assert entry["expected_http"] in (410, 404)
        assert entry["reason"]
        assert entry["target_absence_justification"]


def test_fail_closed_actions_never_emit_location():
    data = load_inventory()
    for entry in data["entries"]:
        if entry["action"] not in FAIL_CLOSED_ACTIONS:
            continue
        assert entry["target"] in (None, "")
        assert entry["expected_http"] in (410, 404)


def test_saas_home_is_retired_not_redirected():
    data = load_inventory()
    home = next(e for e in data["entries"] if e["legacy_url"] == "https://smartlic.tech/")
    assert home["action"] == "RETIRE_410"
    assert home["expected_http"] == 410
    assert home["target"] in (None, "")


def test_high_impression_unready_pncp_is_hold_not_home():
    data = load_inventory()
    row = next(
        e
        for e in data["entries"]
        if e["legacy_url"] == "https://smartlic.tech/blog/como-consultar-contratos-publicos-pncp"
    )
    assert row["action"] == "HOLD_TARGET_NOT_READY"
    assert row["target"] in (None, "")
    assert row["expected_http"] == 410


def test_ti_outside_icp_stays_retired():
    data = load_inventory()
    row = next(
        e
        for e in data["entries"]
        if e["legacy_url"] == "https://smartlic.tech/blog/licitacoes-ti-software-2026"
    )
    assert row["action"] == "RETIRE_410"
    assert row["target"] in (None, "")
