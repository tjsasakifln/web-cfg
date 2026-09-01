from __future__ import annotations

import pytest
import json
from pathlib import Path

from scripts.demand_radar.external_intake import INTAKE_VERSION, normalize_external_draft, verify_approval
from scripts.demand_radar.schema import (
    SnapshotError,
    seal_approval_manifest,
    seal_snapshot,
    sha256_json,
    validate_snapshot,
)


def draft() -> dict:
    payload = {
        "schema_version": INTAKE_VERSION,
        "source": {
            "id": "planner-bra-2026-08-31",
            "kind": "KEYWORD_PLANNER",
            "observed_at": "2026-08-31",
            "geo": "BRA",
            "language": "pt-BR",
            "privacy_class": "INTERNAL_AGGREGATE_NO_PII",
            "provenance": {
                "authority": "Founder-authorized Google Ads Keyword Planner export, sanitized",
                "repository": "tjsasakifln/web-cfg",
                "path": "data/demand_radar/intake-candidates/2026-08-31/planner.draft.json",
                "revision": "de3a66138fb70220efc87c18e2b8189c993ee8bb",
                "content_sha256": "b" * 64,
            },
            "freshness": {"state": "CURRENT", "evaluated_at": "2026-09-01", "expires_at": "2026-10-05"},
            "unknown_semantics": "UNKNOWN is preserved and never interpreted as zero.",
            "limitations": ["Aggregate proxy only; no volume, revenue, WTP, or causal priority."],
        },
        "records": [
            {
                "family_id": "defesa-margem",
                "state": "OBSERVED",
                "breadth": "MEDIUM",
                "competition": "HIGH",
                "bid": {"state": "APPROXIMATE", "currency": "BRL", "band": "MEDIUM"},
            }
        ],
    }
    payload["input_sha256"] = sha256_json(payload)
    return payload


def test_normalizes_a_legitimate_aggregate_draft_to_the_existing_envelope() -> None:
    snapshot = normalize_external_draft(draft(), as_of="2026-09-01")
    assert snapshot["source"]["kind"] == "KEYWORD_PLANNER"
    assert len(snapshot["snapshot_sha256"]) == 64
    assert snapshot["records"][0]["record_provenance"]["source_content_sha256"] == "b" * 64


def test_record_provenance_and_seal_fail_closed() -> None:
    snapshot = normalize_external_draft(draft(), as_of="2026-09-01")
    snapshot["records"][0]["record_provenance"]["source_content_sha256"] = "a" * 64
    with pytest.raises(SnapshotError, match="record_provenance_source_mismatch"):
        validate_snapshot(seal_snapshot(snapshot))


@pytest.mark.parametrize(
    ("mutate", "error"),
    [
        (lambda value: value["source"].update({"observed_at": "2026-09-02"}), "future_observation"),
        (lambda value: value["source"]["freshness"].update({"expires_at": "2026-08-31"}), "expired"),
        (lambda value: value["source"].update({"geo": "USA"}), "market_scope_mismatch"),
        (lambda value: value["source"].update({"kind": "GSC_PAGE_OVERLAY"}), "source_kind_not_permitted"),
        (lambda value: value["records"][0].update({"query": "forbidden"}), "pii_or_raw_identifier_forbidden"),
        (lambda value: value["records"][0].update({"note": "ana@example.test"}), "pii_value_forbidden"),
    ],
)
def test_external_intake_rejects_adversarial_or_invalid_drafts(mutate, error: str) -> None:
    payload = draft()
    mutate(payload)
    payload["input_sha256"] = sha256_json({key: value for key, value in payload.items() if key != "input_sha256"})
    with pytest.raises(SnapshotError, match=error):
        normalize_external_draft(payload, as_of="2026-09-01")


def test_tampered_draft_hash_fails_before_normalization() -> None:
    payload = draft()
    payload["records"][0]["breadth"] = "HIGH"
    with pytest.raises(SnapshotError, match="input_hash_mismatch"):
        normalize_external_draft(payload, as_of="2026-09-01")


def test_unapproved_and_mismatched_approval_fail_closed() -> None:
    snapshot = normalize_external_draft(draft(), as_of="2026-09-01")
    empty = seal_approval_manifest(
        {"schema_version": "confenge-demand-radar-source-approvals/v1", "sources": []}
    )
    with pytest.raises(SnapshotError, match="source_not_approved"):
        verify_approval(snapshot, empty)
    approval = {
        "source_id": snapshot["source"]["id"],
        "kind": snapshot["source"]["kind"],
        "repository": snapshot["source"]["provenance"]["repository"],
        "path": snapshot["source"]["provenance"]["path"],
        "revision": snapshot["source"]["provenance"]["revision"],
        "content_sha256": snapshot["source"]["provenance"]["content_sha256"],
        "snapshot_sha256": "a" * 64,
        "allow_accepted_historical": False,
        "approved_at": "2026-09-01",
        "reason": "test approval",
    }
    with pytest.raises(SnapshotError, match="approval_mismatch"):
        verify_approval(snapshot, seal_approval_manifest({"schema_version": "confenge-demand-radar-source-approvals/v1", "sources": [approval]}))


def test_founder_action_packet_covers_each_missing_external_source() -> None:
    packet_path = Path(__file__).resolve().parents[2] / "data/demand_radar/external-intake/founder-action-required.v1.json"
    packet = json.loads(packet_path.read_text(encoding="utf-8"))
    assert packet["decision_state"] == "FOUNDER_ACTION_REQUIRED"
    assert packet["effect_of_absence"].startswith("UNKNOWN")
    sources = {source["source_kind"]: source for source in packet["sources"]}
    assert set(sources) == {"KEYWORD_PLANNER", "GOOGLE_TRENDS", "SERP_RESEARCH"}
    for source in sources.values():
        for field in ("why_needed", "exact_export", "minimum_columns", "forbidden_fields", "sanitization", "freshness"):
            assert source[field]
