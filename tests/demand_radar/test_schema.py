from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from scripts.demand_radar.schema import (
    SnapshotError,
    seal_snapshot,
    validate_approval_manifest,
    validate_snapshot,
)

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT_ROOT = ROOT / "data" / "demand_radar" / "snapshots" / "2026-08-31"
APPROVALS_PATH = ROOT / "data" / "demand_radar" / "approved-sources.v1.json"


def load(name: str) -> dict:
    return json.loads((SNAPSHOT_ROOT / name).read_text(encoding="utf-8"))


def reseal(payload: dict) -> dict:
    sealed = seal_snapshot(payload)
    payload.clear()
    payload.update(sealed)
    return payload


def test_committed_snapshots_are_strict_and_sealed() -> None:
    for path in sorted(SNAPSHOT_ROOT.glob("*.json")):
        assert validate_snapshot(json.loads(path.read_text(encoding="utf-8")))


def test_committed_source_approvals_are_sealed_and_exact() -> None:
    approved = validate_approval_manifest(json.loads(APPROVALS_PATH.read_text(encoding="utf-8")))
    assert set(approved) == {
        "bofu-owner-projection-2026-08-31-pr545",
        "gsc-page-overlay-2026-08-02-2026-08-29",
        "serp-research-bra-2026-09-01",
    }


def test_snapshot_hash_mismatch_fails_closed() -> None:
    snapshot = load("gsc-page-overlay.json")
    snapshot["records"][0]["owner_observation"]["impressions"] += 1
    with pytest.raises(SnapshotError, match="records_hash_mismatch"):
        validate_snapshot(snapshot)


def test_unknown_gsc_cannot_hide_a_numeric_zero() -> None:
    snapshot = load("gsc-page-overlay.json")
    unknown = next(item for item in snapshot["records"] if item["state"] == "UNKNOWN")
    unknown["owner_observation"] = {
        "clicks": 0,
        "impressions": 0,
        "ctr": 0,
        "position": 0,
    }
    reseal(snapshot)
    with pytest.raises(SnapshotError, match="gsc_unknown_record_fields_unknown"):
        validate_snapshot(snapshot)


def test_pii_or_raw_identifiers_are_rejected() -> None:
    snapshot = load("gsc-page-overlay.json")
    snapshot["records"][0]["interpretation"] = "contact not-allowed@example.test"
    reseal(snapshot)
    with pytest.raises(SnapshotError, match="pii_value_forbidden"):
        validate_snapshot(snapshot)


@pytest.mark.parametrize("field", ["fullName", "queries", "contacts"])
def test_unknown_or_privacy_bypass_fields_fail_closed(field: str) -> None:
    snapshot = load("gsc-page-overlay.json")
    snapshot["records"][0][field] = "not permitted"
    reseal(snapshot)
    with pytest.raises(
        SnapshotError,
        match="pii_or_raw_identifier_forbidden|gsc_observed_record_fields_unknown",
    ):
        validate_snapshot(snapshot)


def test_owner_must_remain_on_the_confenge_canonical_surface() -> None:
    snapshot = load("bofu-owner-projection.json")
    snapshot["records"][0]["canonical_owner"]["url"] = "https://smartlic.example/"
    reseal(snapshot)
    with pytest.raises(SnapshotError, match="canonical_owner_url_invalid"):
        validate_snapshot(snapshot)


def test_unknown_semantics_are_mandatory() -> None:
    snapshot = load("bofu-owner-projection.json")
    snapshot["source"]["unknown_semantics"] = "Missing fields use a default."
    with pytest.raises(SnapshotError, match="unknown_semantics_must_be_explicit"):
        validate_snapshot(snapshot)


def test_full_envelope_seal_covers_provenance_and_freshness() -> None:
    snapshot = load("bofu-owner-projection.json")
    snapshot["source"]["provenance"]["path"] = "data/not-the-authority.json"
    with pytest.raises(SnapshotError, match="snapshot_hash_mismatch"):
        validate_snapshot(snapshot)


def test_every_report_consumed_owner_field_is_required() -> None:
    snapshot = load("bofu-owner-projection.json")
    del snapshot["records"][0]["commercial_relevance"]["economic_consequence"]
    reseal(snapshot)
    with pytest.raises(SnapshotError, match="commercial_relevance_fields_missing"):
        validate_snapshot(snapshot)


def test_observed_gsc_requires_a_normalized_owner_path() -> None:
    snapshot = load("gsc-page-overlay.json")
    del snapshot["records"][0]["owner_observation"]["path"]
    reseal(snapshot)
    with pytest.raises(SnapshotError, match="gsc_observation_fields_missing:path"):
        validate_snapshot(snapshot)


def test_non_finite_metrics_fail_closed_before_json_output() -> None:
    snapshot = load("gsc-page-overlay.json")
    snapshot["records"][0]["owner_observation"]["position"] = float("nan")
    with pytest.raises(SnapshotError, match="non_finite_number_forbidden"):
        validate_snapshot(snapshot)


def test_phone_value_cannot_hide_in_an_allowed_text_field() -> None:
    snapshot = load("gsc-page-overlay.json")
    snapshot["records"][0]["interpretation"] = "+55 11 98765-4321"
    reseal(snapshot)
    with pytest.raises(SnapshotError, match="pii_value_forbidden"):
        validate_snapshot(snapshot)


def test_gsc_interpretation_is_a_finite_enum_not_free_text() -> None:
    snapshot = load("gsc-page-overlay.json")
    snapshot["records"][0]["interpretation"] = "Looks promising"
    reseal(snapshot)
    with pytest.raises(SnapshotError, match="gsc_interpretation_invalid"):
        validate_snapshot(snapshot)


def test_mutated_copy_can_be_resealed_for_new_normalized_observation() -> None:
    snapshot = copy.deepcopy(load("gsc-page-overlay.json"))
    snapshot["source"]["id"] = "gsc-page-overlay-test-copy"
    snapshot["records"][0]["owner_observation"]["impressions"] += 1
    assert validate_snapshot(reseal(snapshot))["source"]["id"] == "gsc-page-overlay-test-copy"
