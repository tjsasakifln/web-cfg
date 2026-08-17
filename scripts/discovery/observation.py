"""Versioned discovery observation records. Pure functions; no I/O."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from scripts.discovery.schema import SchemaError, UNKNOWN

OBSERVATION_SCHEMA_VERSION = 1
INGESTION_VERSION = "discovery-live-ops/1.0"
OBSERVATION_TYPES = frozenset(
    {
        "technical_probe",
        "gsc",
        "referral",
        "cta",
        "lead",
        "commercial_outcome",
    }
)
CONFIDENCE_STATUSES = frozenset(
    {
        "observed",
        "UNKNOWN",
        "UNAVAILABLE",
        "NOT_PROVIDED",
        "NO_ROWS",
        "PROVEN_ZERO",
        "AMBIGUOUS",
        "INCOMPATIBLE",
    }
)

# Reason codes used by probe, importers and report. Absence is never zero.
REASON_GSC_NOT_PROVIDED = "GSC_DATA_NOT_PROVIDED"
REASON_OUTCOME_NOT_PROVIDED = "OUTCOME_DATA_NOT_PROVIDED"
REASON_PERIOD_FILTER_ABSENT = "PERIOD_FILTER_ABSENT"
REASON_ZERO_ROWS = "ZERO_ROWS_IN_EXPORT"
REASON_PROVEN_ZERO = "ZERO_IMPRESSIONS_PROVEN"
REASON_INCOMPATIBLE_WINDOWS = "INCOMPATIBLE_WINDOWS_NOT_SUMMED"
REASON_LEAD_UNATTRIBUTED = "LEAD_UNATTRIBUTED_NO_CORRELATION"
REASON_PII_REFUSED = "PII_REFUSED"
REASON_AMBIGUOUS_FILE = "AMBIGUOUS_EXPORT_REFUSED"
REASON_UNEXPECTED_EXTERNAL_REDIRECT = "UNEXPECTED_EXTERNAL_REDIRECT"
REASON_ROBOTS_BLOCKING = "ROBOTS_BLOCKING"
REASON_CANONICAL_DIVERGENT = "CANONICAL_DIVERGENT"
REASON_SITEMAP_ABSENT = "SITEMAP_ABSENT"
REASON_HTTP_UNAVAILABLE = "HTTP_UNAVAILABLE"
REASON_HTTP_TIMEOUT = "HTTP_TIMEOUT"
REASON_HTTP_429 = "HTTP_429"
REASON_HTTP_5XX = "HTTP_5XX"
REASON_TECHNICAL_LIVE = "TECHNICAL_LIVE"
REASON_DISCOVERY_UNKNOWN = "DISCOVERY_UNKNOWN"
REASON_DISCOVERY_OBSERVED = "DISCOVERY_OBSERVED"
REASON_POSITION_SMALL_N = "POSITION_STATISTICAL_WARNING"
REASON_NO_CAUSALITY = "NO_CAUSALITY_FROM_CORRELATION"
REASON_NO_REVENUE_ESTIMATE = "NO_REVENUE_ESTIMATE"
REASON_NO_SEO_SCORE = "NO_SEO_SCORE"

RECORD_HASH_EXCLUDED = frozenset({"record_hash"})


class ObservationError(SchemaError):
    """Observation record failed the live-operations contract."""


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_text(text: str | bytes) -> str:
    if isinstance(text, str):
        payload = text.encode("utf-8")
    else:
        payload = text
    return hashlib.sha256(payload).hexdigest()


def compute_record_hash(record: dict[str, Any]) -> str:
    body = {key: value for key, value in record.items() if key not in RECORD_HASH_EXCLUDED}
    return sha256_text(canonical_json(body))


def validate_observation(record: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise ObservationError("observation_must_be_object")
    if record.get("schema_version") != OBSERVATION_SCHEMA_VERSION:
        raise ObservationError(f"unexpected_observation_schema:{record.get('schema_version')}")
    if record.get("observation_type") not in OBSERVATION_TYPES:
        raise ObservationError(f"invalid_observation_type:{record.get('observation_type')}")
    asset_id = record.get("asset_id")
    if not isinstance(asset_id, str) or not asset_id.strip():
        raise ObservationError("asset_id_required")
    if not record.get("observed_at"):
        raise ObservationError("observed_at_required")
    status = record.get("status") or record.get("confidence")
    if status not in CONFIDENCE_STATUSES:
        raise ObservationError(f"invalid_observation_status:{status}")
    if not isinstance(record.get("reason_codes"), list):
        raise ObservationError("reason_codes_required")
    if record.get("ingestion_version") != INGESTION_VERSION:
        raise ObservationError(f"unexpected_ingestion_version:{record.get('ingestion_version')}")
    expected = compute_record_hash(record)
    if record.get("record_hash") != expected:
        raise ObservationError("record_hash_mismatch")
    return record


def build_observation(
    *,
    asset_id: str,
    observation_type: str,
    observed_at: str,
    source: str,
    status: str,
    reason_codes: list[str],
    period_start: str | None = None,
    period_end: str | None = None,
    source_file_hash: str | None = None,
    dimensions: dict[str, Any] | None = None,
    metrics: dict[str, Any] | None = None,
    confidence: str | None = None,
    extras: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if observation_type not in OBSERVATION_TYPES:
        raise ObservationError(f"invalid_observation_type:{observation_type}")
    if status not in CONFIDENCE_STATUSES:
        raise ObservationError(f"invalid_observation_status:{status}")
    record: dict[str, Any] = {
        "schema_version": OBSERVATION_SCHEMA_VERSION,
        "asset_id": asset_id,
        "observation_type": observation_type,
        "observed_at": observed_at,
        "period_start": period_start,
        "period_end": period_end,
        "source": source,
        "source_file_hash": source_file_hash,
        "dimensions": dimensions or {},
        "metrics": metrics or {},
        "confidence": confidence or status,
        "status": status,
        "reason_codes": list(reason_codes),
        "ingestion_version": INGESTION_VERSION,
    }
    if extras:
        for key, value in extras.items():
            if key in record or key == "record_hash":
                continue
            record[key] = value
    record["record_hash"] = compute_record_hash(record)
    return validate_observation(record)


def unknown_metric() -> dict[str, Any]:
    return {"status": UNKNOWN, "value": None}


def not_provided_metric() -> dict[str, Any]:
    return {"status": "NOT_PROVIDED", "value": None}
