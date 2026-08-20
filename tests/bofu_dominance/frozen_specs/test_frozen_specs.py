"""Drive shipped frozen-spec functions against the real six pillar HTML files."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.bofu_dominance.frozen_specs.constants import (
    EARLIEST_SAFE_ACTION_AT,
    FORBIDDEN_RELATIVE_PATHS,
    PILLAR_SLUGS,
    REQUIRED_SPEC_FIELDS,
    html_path,
    patch_path,
)
from scripts.bofu_dominance.frozen_specs.entry import run_entry
from scripts.bofu_dominance.frozen_specs.gate import evaluate_gate, load_issue_state
from scripts.bofu_dominance.frozen_specs.hashing import content_sha256, forbidden_path_hashes
from scripts.bofu_dominance.frozen_specs.patch import apply_frozen_patch, parse_patch
from scripts.bofu_dominance.frozen_specs.snapshot import snapshot_pillar, snapshot_six
from scripts.bofu_dominance.frozen_specs.spec import load_spec, load_specs, validate_spec

FROZEN_NOW = date(2026, 8, 19)


def test_six_specs_present_with_required_fields():
    specs = load_specs()
    assert [s["slug"] for s in specs] == list(PILLAR_SLUGS)
    for spec in specs:
        fails = validate_spec(spec)
        assert fails == [], (spec["slug"], fails)
        for field in REQUIRED_SPEC_FIELDS:
            assert field in spec
        snap = spec["snapshot"]
        assert snap["title"]
        assert "meta_description" in snap
        assert snap["h1"]
        assert isinstance(snap["schema_types"], list) and snap["schema_types"]
        assert "canonical" in snap
        assert snap["cta"]
        assert spec["earliest_safe_action_at"] >= "2026-09-16"
        gsc = spec["gsc_precondition"]
        assert gsc["source_kind"] == "LIVE_JOB_OK"
        assert gsc["ready_for_product_decisions"] is False
        assert gsc["authorizes_html_edit"] is False
        assert gsc["other_evidence_decision"]["decision"]
        assert spec["serp_census"]["family"]
        assert spec["serp_census"]["competitors"]
        assert spec["serp_census"]["intent_gaps"]
        assert spec["query_ownership"]
        assert spec["negative_queries"]
        assert "cannibalization" in spec
        assert spec["before_after_blocks"]
        assert spec["evidence_proof_needed"]
        assert spec["success_metrics"]
        assert spec["kill_metrics"]
        assert spec["revert_metrics"]


def test_spec_snapshot_matches_live_html():
    for slug in PILLAR_SLUGS:
        live = snapshot_pillar(slug, ROOT)
        spec = load_spec(slug)
        assert spec["snapshot"]["content_sha256"] == live["content_sha256"]
        assert spec["snapshot"]["title"] == live["title"]
        assert spec["snapshot"]["h1"] == live["h1"]
        assert spec["snapshot"]["canonical"] == live["canonical"]
        assert spec["snapshot"]["meta_description"] == live["meta_description"]
        assert live["content_sha256"] == content_sha256(html_path(slug, ROOT))


def test_patch_txt_hash_equals_live_file_hash():
    for slug in PILLAR_SLUGS:
        parsed = parse_patch(patch_path(slug).read_text(encoding="utf-8"))
        live = content_sha256(html_path(slug, ROOT))
        assert parsed["content_sha256"] == live
        assert parsed["earliest_safe_action_at"] == EARLIEST_SAFE_ACTION_AT.isoformat()
        assert parsed["html_mutation_authorized"] is False
        assert parsed["replacements"]
        result = apply_frozen_patch(
            slug, root=ROOT, mutate=False, now=FROZEN_NOW, evidential_close=False
        )
        pending = any(item["before"] != item["after"] for item in parsed["replacements"])
        if pending:
            assert result["would_mutate"] is True
        assert result["html_mutation"] is False


def test_apply_refused_before_gate_and_html_mutation_false():
    issue = load_issue_state()
    assert issue["evidential_close"] is False
    assert issue["state"] == "LANDED_AWAITING_LIVE_EVIDENCE"
    gate = evaluate_gate(now=FROZEN_NOW, evidential_close=False)
    assert gate["refused"] is True
    assert gate["apply_refused_before_gate"] is True
    assert gate["html_mutation"] is False
    assert gate["authorizes_html_edit"] is False
    before = forbidden_path_hashes(ROOT)
    for slug in PILLAR_SLUGS:
        result = apply_frozen_patch(
            slug, root=ROOT, mutate=False, now=FROZEN_NOW, evidential_close=False
        )
        assert result["refused"] is True
        assert result["html_mutation"] is False
        assert result["apply_refused_before_gate"] is True
        assert result["hash_match"] is True
    after = forbidden_path_hashes(ROOT)
    assert after == before


def test_gate_opens_on_date_or_evidential_close_but_prepare_only_still_refuses_write():
    by_date = evaluate_gate(now=date(2026, 9, 16), evidential_close=False)
    assert by_date["gate_open"] is True
    assert by_date["apply_refused_before_gate"] is False
    by_issue = evaluate_gate(now=FROZEN_NOW, evidential_close=True)
    assert by_issue["gate_open"] is True
    result = apply_frozen_patch(
        PILLAR_SLUGS[0],
        root=ROOT,
        mutate=False,
        now=date(2026, 9, 16),
        evidential_close=False,
    )
    assert result["gate_open"] is True
    assert result["refused"] is True
    assert result["reason"] == "mutate_false_prepare_only"
    assert result["html_mutation"] is False


def test_entry_twice_html_mutation_false():
    first = run_entry(root=ROOT, mutate=False, now=FROZEN_NOW, evidential_close=False)
    second = run_entry(root=ROOT, mutate=False, now=FROZEN_NOW, evidential_close=False)
    assert first["html_mutation"] is False
    assert second["html_mutation"] is False
    assert first["apply_refused_before_gate"] is True
    assert second["apply_refused_before_gate"] is True
    assert first["forbidden_unchanged"] is True
    assert first["pillar_count"] == 6
    assert all(item["ok"] for item in first["specs"])
    snaps = snapshot_six(ROOT)
    assert len(snaps) == 6


def test_forbidden_paths_unchanged_list():
    hashes = forbidden_path_hashes(ROOT)
    for rel in FORBIDDEN_RELATIVE_PATHS:
        path = ROOT / rel
        assert path.is_file(), rel
        assert hashes[rel] == content_sha256(path)


def test_citations_in_specs():
    for spec in load_specs():
        dc = spec["demand_control_citation"]
        assert dc["authorizes_html_edit"] is False
        assert dc["source_kind"] == "LIVE_JOB_OK"
        assert dc["ready_for_product_decisions"] is False
        assert dc["bofu_observe_only"] is True
        assert dc["earliest_safe_action_at"] >= "2026-09-16"
        assert spec["issue_128_baseline"]["commercial_click_share"] == 0.0
        assert spec["issue_128_baseline"]["state"] == "LANDED_AWAITING_LIVE_EVIDENCE"
        extra = spec["extra_cli_inputs"]
        assert extra["publication_authorization"] is False
        assert extra["national_claim_authorized"] is False
        assert extra["pr_435"]["state"] == "COMPARABLE"
        assert extra["pr_437"]["verdict"] == "PARTIAL"
