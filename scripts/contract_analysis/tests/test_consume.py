"""Drive the shipped extra-cli #400 consume path."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis import MAX_CANARY, PUBLIC_READ_SCHEMA, SOURCE_FIXTURE
from scripts.contract_analysis.consume import (
    data_state_of,
    fixture_as_live,
    load_canary,
    load_extra_cli_bundle,
)
from scripts.contract_analysis.gate import evaluate_cohort


EXPORT = ROOT / "scripts/contract_analysis/fixtures/extra-cli-export"
AS_LIVE = ROOT / "scripts/contract_analysis/fixtures/extra-cli-fixture-as-live"
HOLD = ROOT / "scripts/contract_analysis/fixtures/extra-cli-data-hold"
REJECT = ROOT / "scripts/contract_analysis/fixtures/extra-cli-data-reject"


def test_extra_cli_export_is_fixture_and_cannot_index():
    bundle = load_extra_cli_bundle(EXPORT)
    assert bundle["schema"] == PUBLIC_READ_SCHEMA
    assert bundle["catalog_mode"] == "fixture"
    assert bundle["claimed_live"] is False
    assert bundle["source_kind"] == SOURCE_FIXTURE
    assert bundle["test_only"] is True
    assert bundle["evaluated"] <= MAX_CANARY
    assert bundle["evaluated"] >= 1
    assert all(rec["is_fixture"] for rec in bundle["records"])
    assert all(rec.get("catalog_mode") == "fixture" for rec in bundle["records"])
    decisions = evaluate_cohort(bundle["records"])
    assert all(d.state != "PUBLISHABLE_INDEX" for d in decisions)
    assert all("noindex" in d.robots for d in decisions)
    assert all(d.sitemap is False for d in decisions)


def test_default_canary_prefers_extra_cli_export_when_live_absent():
    bundle = load_canary()
    assert bundle["source_kind"] == SOURCE_FIXTURE
    assert bundle["export_kind"] == "extra_cli_public_read"
    assert bundle["live_absent"] is True
    assert bundle["evaluated"] <= MAX_CANARY
    assert any(rec.get("publication_readiness") == "DATA_READY" for rec in bundle["records"])


def test_data_hold_cannot_be_publishable_index():
    bundle = load_extra_cli_bundle(HOLD)
    assert bundle["records"]
    rec = bundle["records"][0]
    rec["approved_for_index"] = True
    rec["source_kind"] = "official_live"
    rec["catalog_mode"] = "official_live"
    rec["is_fixture"] = False
    rec["claimed_live"] = True
    # Even if someone relabels the record, DATA_HOLD stays off INDEX.
    rec["publication_readiness"] = "DATA_HOLD"
    rec["data_state"] = "DATA_HOLD"
    rec["data_incomplete"] = True
    from scripts.contract_analysis.gate import evaluate_publication

    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert decision.state == "HOLD_FOR_DATA" or "data_hold" in decision.reason_codes


def test_data_reject_cannot_be_publishable_index():
    bundle = load_extra_cli_bundle(REJECT)
    rec = bundle["records"][0]
    assert data_state_of(rec) == "DATA_REJECT"
    from scripts.contract_analysis.gate import evaluate_publication

    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert decision.state == "REJECT"


def test_claimed_live_fixture_is_fixture_as_live_and_cannot_index():
    bundle = load_extra_cli_bundle(AS_LIVE)
    assert bundle["catalog_mode"] == "fixture"
    assert bundle["claimed_live"] is True
    assert bundle["source_kind"] == SOURCE_FIXTURE
    rec = bundle["records"][0]
    assert fixture_as_live(
        {"catalog_mode": rec["catalog_mode"], "claimed_live": rec["claimed_live"], "reason_codes": rec["reason_codes"]}
    )
    assert rec["is_fixture"] is True
    from scripts.contract_analysis.gate import evaluate_publication

    rec["approved_for_index"] = True
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert "fixture_as_live" in rec["reason_codes"] or decision.state == "REJECT"


def test_comparisons_or_not_comparable_present_on_export():
    bundle = load_extra_cli_bundle(EXPORT)
    flags = []
    for rec in bundle["records"]:
        comps = rec.get("comparisons") or []
        flags.append(
            any(isinstance(c, dict) and c.get("outcome") == "NOT_COMPARABLE" for c in comps)
            or any(isinstance(c, dict) and c.get("peer_id") for c in comps)
        )
    assert any(flags)
