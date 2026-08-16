"""Drive the shipped extra-cli #400 consume path."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis import MAX_CANARY, PUBLIC_READ_SCHEMA, SOURCE_FIXTURE
from scripts.contract_analysis.consume import (
    ConsumeError,
    canonical_dumps,
    content_hash_of,
    data_state_of,
    fixture_as_live,
    inspect_producer_integrity,
    load_canary,
    load_export_dir,
    load_extra_cli_bundle,
    negotiate_schema,
    project_extra_cli_record,
    verify_content_hash,
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


def test_schema_negotiation_accepts_1_0_and_rejects_v2():
    ok, reasons = negotiate_schema("public-read-contract-analysis/1.0", "v1.0.0")
    assert ok is True
    assert "schema_unsupported" not in reasons
    ok_add, add_reasons = negotiate_schema("public-read-contract-analysis/1.1", "v1.1.0")
    assert ok_add is True
    assert "schema_additive_1x" in add_reasons
    bad, bad_reasons = negotiate_schema("public-read-contract-analysis/2.0", "v2.0.0")
    assert bad is False
    assert "schema_unsupported" in bad_reasons or "contract_version_unsupported" in bad_reasons
    missing, missing_reasons = negotiate_schema("", None)
    assert missing is False
    assert "schema_absent" in missing_reasons


def test_extra_cli_fixture_hashes_are_deterministic():
    raw = json.loads((EXPORT / "analyses" / "cand-preco-01.json").read_text(encoding="utf-8"))
    assert verify_content_hash(raw) is True
    manifest = json.loads((EXPORT / "manifest.json").read_text(encoding="utf-8"))
    assert verify_content_hash(manifest) is True
    mutated = dict(raw)
    mutated["reason_summary"] = "tampered"
    assert content_hash_of(mutated) != raw["content_hash"]


def test_missing_evidence_hash_freshness_coverage_emit_nominal_codes():
    raw = json.loads((EXPORT / "analyses" / "cand-preco-01.json").read_text(encoding="utf-8"))
    stripped = dict(raw)
    stripped.pop("evidence_pack_hash", None)
    stripped.pop("evidence_refs", None)
    stripped.pop("source_refs", None)
    stripped.pop("official_refs", None)
    stripped.pop("freshness", None)
    stripped.pop("as_of", None)
    stripped.pop("coverage", None)
    stripped.pop("content_hash", None)
    codes = inspect_producer_integrity(stripped)
    for needed in (
        "evidence_pack_hash_absent",
        "evidence_refs_absent",
        "freshness_absent",
        "coverage_absent",
        "content_hash_absent",
    ):
        assert needed in codes, codes


def test_extra_cli_export_reports_coverage_absent_and_cannot_index():
    bundle = load_extra_cli_bundle(EXPORT)
    assert bundle["records"]
    rec = bundle["records"][0]
    assert "coverage_absent" in rec["producer_integrity_reasons"]
    from scripts.contract_analysis.gate import evaluate_publication

    rec["approved_for_index"] = True
    rec["source_kind"] = "official_live"
    rec["catalog_mode"] = "official_live"
    rec["claimed_live"] = True
    rec["is_fixture"] = False
    rec["producer_status"] = "official_live"
    rec["editorial_status"] = "approved"
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert "coverage_absent" in decision.reason_codes


def test_unknown_schema_export_is_consume_error(tmp_path):
    dest = tmp_path / "bad-export"
    dest.mkdir()
    (dest / "manifest.json").write_text(
        json.dumps(
            {
                "schema": "public-read-contract-analysis/2.0",
                "contract_version": "v2.0.0",
                "catalog_mode": "official_live",
                "claimed_live": True,
                "analyses": [],
            }
        ),
        encoding="utf-8",
    )
    try:
        load_export_dir(dest)
        raise AssertionError("expected ConsumeError")
    except ConsumeError as exc:
        assert "unsupported export schema" in str(exc)


def test_goal03_additive_official_live_does_not_invent_or_index(tmp_path):
    """Additive official_live extra fields are consumed; INDEX is not promoted."""
    raw = json.loads((EXPORT / "analyses" / "cand-preco-01.json").read_text(encoding="utf-8"))
    raw["catalog_mode"] = "official_live"
    raw["claimed_live"] = True
    raw["producer_status"] = "official_live"
    raw["coverage"] = {"status": "DECLARED", "record_count": 1, "uf": ["SC"]}
    raw["goal03_bonus_metric"] = {"n": 12, "label": "additive-only"}
    raw.pop("content_hash", None)
    raw["content_hash"] = content_hash_of(raw)
    dest = tmp_path / "goal03"
    analyses = dest / "analyses"
    analyses.mkdir(parents=True)
    (analyses / "cand-preco-01.json").write_text(
        json.dumps(raw, ensure_ascii=False, sort_keys=True), encoding="utf-8"
    )
    manifest = {
        "schema": "public-read-contract-analysis/1.0",
        "contract_version": "v1.0.0",
        "catalog_mode": "official_live",
        "claimed_live": True,
        "producer_status": "official_live",
        "analyses": [
            {
                "analysis_candidate_id": "cand-preco-01",
                "path": "analyses/cand-preco-01.json",
                "publication_readiness": "DATA_READY",
                "content_hash": raw["content_hash"],
            }
        ],
        "canary": {"selected_ids": ["cand-preco-01"]},
        "source_as_of": "2026-08-15T00:00:00+00:00",
        "generated_at": "2026-08-16T00:00:00+00:00",
    }
    manifest["content_hash"] = content_hash_of(manifest)
    (dest / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    bundle = load_extra_cli_bundle(dest)
    assert bundle["source_kind"] == "official_live"
    rec = bundle["records"][0]
    assert rec.get("coverage")
    assert "goal03_bonus_metric" not in rec
    assert rec.get("insight_singular") in (None, "")
    from scripts.contract_analysis.gate import evaluate_publication

    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert canonical_dumps({"a": 1, "b": 2}) == '{"a":1,"b":2}'
