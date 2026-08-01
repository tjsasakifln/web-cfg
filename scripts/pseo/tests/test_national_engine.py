"""Tests for national inventory, page_value_score, lifecycle, evidence ledger."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
import sys

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.evidence_ledger import (  # noqa: E402
    ledger_from_market,
    make_entry,
    validate_ledger,
)
from scripts.pseo.lifecycle import (  # noqa: E402
    can_transition,
    derive_lifecycle_from_registry_page,
    retirement_action,
    transition,
)
from scripts.pseo.page_value_score import compute_page_value_score  # noqa: E402


def test_page_value_score_cannot_override_semantic_gates():
    r = compute_page_value_score(
        page_type="market",
        observation_count=100,
        unique_buyers=20,
        unique_suppliers=15,
        temporal_span_days=200,
        demand_evidence="gsc",
        demand_strength=1.0,
        has_executive_numbers=True,
        has_service_cta=True,
        differentiation_signals=5,
        icp_fit=1.0,
        intent_clarity=1.0,
        mandatory_fail=["contracts<15"],  # still blocked
    )
    assert r["page_value_score"] >= 70
    assert r["publish_blocked_by_semantic_gates"] is True
    assert "contracts<15" in r["mandatory_fail"]


def test_page_value_score_unknown_demand_not_invented():
    r = compute_page_value_score(
        page_type="market",
        observation_count=20,
        unique_buyers=5,
        demand_evidence="unknown",
    )
    assert r["demand_evidence"] == "unknown"
    # demand component should be modest when unknown
    assert r["breakdown"]["demand_evidence"] <= 4


def test_lifecycle_transitions_fail_closed():
    assert can_transition("CANDIDATE", "QUALITY_ELIGIBLE")
    assert not can_transition("CANDIDATE", "INDEXED")
    with pytest.raises(ValueError):
        transition("p1", "CANDIDATE", "INDEXED", reason="nope")
    ev = transition("p1", "CANDIDATE", "QUALITY_ELIGIBLE", reason="gates_ok")
    assert ev["to_state"] == "QUALITY_ELIGIBLE"
    assert ev["at"]


def test_derive_lifecycle_from_publish_approved():
    st = derive_lifecycle_from_registry_page(
        {"status": "publish", "human_review": "APPROVED", "quality_eligible": True}
    )
    assert st == "PUBLISHED"


def test_retirement_301_vs_410():
    assert retirement_action(has_semantic_substitute=True)["http_status"] == 301
    assert retirement_action(has_semantic_substitute=False)["http_status"] == 410


def test_evidence_ledger_requires_source_for_factual():
    e = make_entry(claim="n", value=1, source="", sample_size=1)
    assert e.get("ledger_incomplete")
    e2 = make_entry(claim="n", value=1, source="pncp", sample_size=10)
    assert not e2.get("ledger_incomplete")
    v = validate_ledger([e2])
    assert v["ok"] is True


def test_ledger_from_market_has_contract_count():
    m = {
        "contract_count": 20,
        "buyer_count": 8,
        "period_start": "2025-01-01",
        "period_end": "2026-07-01",
        "sources": ["pncp_contracts"],
        "median_value": 100000,
        "sample_metrics": {"primary_contract_count": 20, "unique_buyer_count": 8},
    }
    led = ledger_from_market(m)
    claims = {e["claim"] for e in led}
    assert "primary_contract_count" in claims
    assert "median_contract_value" in claims
    assert all(e.get("source") for e in led)


def test_national_inventory_module_builds_from_real_data():
    """Drive the real inventory builder against committed data/pseo snapshot."""
    from scripts.pseo.national_inventory import build_inventory

    data = ROOT / "data" / "pseo"
    if not (data / "manifest.json").exists():
        pytest.skip("no snapshot")
    inv = build_inventory(data, registry_path=data / "registry.json")
    assert inv["n_candidates"] >= 1
    assert "coverage_matrix" in inv
    assert "query_map" in inv
    # No invented volumes
    for p in inv["query_map"]["pages"]:
        assert p["search_volume_monthly"] is None
        assert p["demand_evidence"] in {"gsc", "analytics", "unknown"}
    # Every candidate has evidence_ledger
    for c in inv["candidates"][:5]:
        assert "evidence_ledger" in c
        assert "page_value_score" in c
        assert "lifecycle_state" in c
    # Wave 1 diversity: not a single page_type monopoly
    w1 = inv.get("wave1_proposal") or {}
    pages = w1.get("pages") or []
    if pages:
        from collections import Counter
        tc = Counter(p.get("page_type") for p in pages)
        assert len(tc) >= 3, f"Wave1 needs multi-type diversity, got {dict(tc)}"
        top = max(tc.values()) if tc else 0
        assert top <= max(20, int(0.5 * len(pages)) + 1), f"one type dominates Wave1: {dict(tc)}"
        div = w1.get("diversity") or {}
        assert "type_counts" in div or len(tc) >= 3


def test_learn_never_autopublishes():
    src = (ROOT / "scripts" / "pseo" / "learn.py").read_text(encoding="utf-8")
    assert "auto_mutate" in src
    assert "Never mutates publish" in src or "auto_publish" in src
    # Ensure no assignment that flips status to publish
    assert "status = \"publish\"" not in src
    assert "['status'] = 'publish'" not in src


def test_lifecycle_and_inventory_files_exist_as_modules():
    assert (ROOT / "scripts" / "pseo" / "lifecycle.py").is_file()
    assert (ROOT / "scripts" / "pseo" / "page_value_score.py").is_file()
    assert (ROOT / "scripts" / "pseo" / "evidence_ledger.py").is_file()
    assert (ROOT / "scripts" / "pseo" / "national_inventory.py").is_file()
