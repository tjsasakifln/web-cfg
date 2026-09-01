"""Fail-closed intake for legitimate, aggregate external-demand evidence.

This module deliberately does not call Google services or parse raw exports.  A
human with authorized access first sanitizes an export into the documented
aggregate draft.  The command validates that draft, seals the normalized Radar
envelope, and can verify its reviewed approval.  Thus an external observation
joins the existing Radar rather than becoming a second backlog or score.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from scripts.demand_radar.schema import (
    UNKNOWN,
    SnapshotError,
    parse_iso_date,
    seal_snapshot,
    seal_external_intake_record,
    sha256_json,
    source_effective_date,
    validate_approval_manifest,
    validate_snapshot,
)

INTAKE_VERSION = "confenge-demand-radar-external-intake/v1"
EXTERNAL_KINDS = frozenset({"KEYWORD_PLANNER", "GOOGLE_TRENDS", "SERP_RESEARCH"})


def _load(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SnapshotError(f"external_intake_read_failed:{path}") from exc
    if not isinstance(value, dict):
        raise SnapshotError("external_intake_payload_invalid")
    return value


def _exact(value: dict[str, Any], fields: set[str]) -> None:
    missing = sorted(fields - set(value))
    unknown = sorted(set(value) - fields)
    if missing:
        raise SnapshotError(f"external_intake_fields_missing:{','.join(missing)}")
    if unknown:
        raise SnapshotError(f"external_intake_fields_unknown:{','.join(unknown)}")


def normalize_external_draft(draft: dict[str, Any], *, as_of: str) -> dict[str, Any]:
    """Validate a sanitized aggregate draft and return a fully sealed snapshot."""
    _exact(draft, {"schema_version", "input_sha256", "source", "records"})
    if draft["schema_version"] != INTAKE_VERSION:
        raise SnapshotError("external_intake_schema_unsupported")
    unsigned = {key: value for key, value in draft.items() if key != "input_sha256"}
    if draft["input_sha256"] != sha256_json(unsigned):
        raise SnapshotError("external_intake_input_hash_mismatch")
    if not isinstance(draft["source"], dict):
        raise SnapshotError("external_intake_source_invalid")
    if not isinstance(draft["records"], list) or not all(
        isinstance(record, dict) for record in draft["records"]
    ):
        raise SnapshotError("external_intake_records_invalid")
    source = draft["source"]
    if source.get("kind") not in EXTERNAL_KINDS:
        raise SnapshotError("external_intake_source_kind_not_permitted")
    if source.get("geo") != "BRA" or source.get("language") != "pt-BR":
        raise SnapshotError("external_intake_market_scope_mismatch")
    if source.get("privacy_class") != (
        "INTERNAL_AGGREGATE_NO_PII" if source["kind"] == "KEYWORD_PLANNER" else "PUBLIC_NON_PERSONAL"
    ):
        raise SnapshotError("external_intake_privacy_class_invalid")
    if not isinstance(source.get("limitations"), list) or not source["limitations"]:
        raise SnapshotError("external_intake_limitations_required")
    if UNKNOWN not in str(source.get("unknown_semantics", "")).upper():
        raise SnapshotError("external_intake_unknown_semantics_required")
    has_observed_at = "observed_at" in source
    has_range = "range" in source
    if has_observed_at == has_range:
        raise SnapshotError("external_intake_requires_exactly_one_observed_at_or_range")
    source["intake_version"] = INTAKE_VERSION
    effective = parse_iso_date(source_effective_date({"source": source}), "external_intake_date_invalid")
    report_as_of = parse_iso_date(as_of, "external_intake_as_of_invalid")
    if effective > report_as_of:
        raise SnapshotError("external_intake_future_observation")
    freshness = source.get("freshness")
    if not isinstance(freshness, dict) or freshness.get("state") != "CURRENT":
        raise SnapshotError("external_intake_freshness_not_current")
    expiry = freshness.get("expires_at")
    if expiry is None:
        raise SnapshotError("external_intake_expiry_required")
    if parse_iso_date(expiry, "external_intake_expiry_invalid") < report_as_of:
        raise SnapshotError("external_intake_expired")
    snapshot = seal_snapshot(
        {
            "schema_version": "confenge-demand-radar-snapshot/v1",
            "source": source,
            "records": [
                seal_external_intake_record(
                    record, content_sha256=source["provenance"]["content_sha256"]
                )
                for record in draft["records"]
            ],
            "records_sha256": "",
            "snapshot_sha256": "",
        }
    )
    return validate_snapshot(snapshot)


def verify_approval(snapshot: dict[str, Any], approvals: dict[str, Any]) -> None:
    approved = validate_approval_manifest(approvals)
    source = snapshot["source"]
    approval = approved.get(source["id"])
    if approval is None:
        raise SnapshotError(f"external_intake_source_not_approved:{source['id']}")
    for key, value in {
        "kind": source["kind"],
        "repository": source["provenance"]["repository"],
        "path": source["provenance"]["path"],
        "revision": source["provenance"]["revision"],
        "content_sha256": source["provenance"]["content_sha256"],
        "snapshot_sha256": snapshot["snapshot_sha256"],
    }.items():
        if approval[key] != value:
            raise SnapshotError(f"external_intake_approval_mismatch:{source['id']}:{key}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("normalize", "verify"))
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--as-of", required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--approvals", type=Path)
    args = parser.parse_args()
    draft = _load(args.input)
    snapshot = normalize_external_draft(draft, as_of=args.as_of)
    if args.command == "verify":
        if args.approvals is None:
            parser.error("--approvals is required for verify")
        verify_approval(snapshot, _load(args.approvals))
        print(f"external_intake_approved:{snapshot['source']['id']}")
        return 0
    if args.output is None:
        parser.error("--output is required for normalize")
    rendered = json.dumps(snapshot, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if args.output.exists() and args.output.read_text(encoding="utf-8") != rendered:
        raise SnapshotError(f"external_intake_replay_conflict:{args.output}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(rendered, encoding="utf-8")
    print(f"external_intake_normalized:{snapshot['snapshot_sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
