"""Strict contracts for normalized Demand Radar snapshots.

The radar accepts only aggregate, versioned JSON snapshots. It never pulls a
live source, stores query/contact data, or converts missing evidence to zero.
Unknown fields fail closed so a newly introduced producer field cannot bypass
privacy or decision semantics by accident.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from copy import deepcopy
from datetime import date
from typing import Any
from urllib.parse import urlsplit

SCHEMA_VERSION = "confenge-demand-radar-snapshot/v1"
LEDGER_VERSION = "confenge-demand-radar-ledger/v1"
APPROVALS_VERSION = "confenge-demand-radar-source-approvals/v1"
UNKNOWN = "UNKNOWN"

SOURCE_KINDS = frozenset(
    {
        "CANONICAL_BOFU_OWNER_PROJECTION",
        "GSC_PAGE_OVERLAY",
        "GOOGLE_TRENDS",
        "KEYWORD_PLANNER",
        "SERP_RESEARCH",
        "WARMBLY_AGGREGATE_OUTCOMES",
    }
)
REQUIRED_SOURCE_KINDS = frozenset(
    {"CANONICAL_BOFU_OWNER_PROJECTION", "GSC_PAGE_OVERLAY"}
)
OPTIONAL_SOURCE_KINDS = SOURCE_KINDS - REQUIRED_SOURCE_KINDS
PRIVACY_CLASSES = frozenset(
    {
        "PUBLIC_NON_PERSONAL",
        "AGGREGATE_NO_PII",
        "INTERNAL_AGGREGATE_NO_PII",
    }
)
PRIVACY_BY_KIND = {
    "CANONICAL_BOFU_OWNER_PROJECTION": frozenset({"PUBLIC_NON_PERSONAL"}),
    "GSC_PAGE_OVERLAY": frozenset({"AGGREGATE_NO_PII", "INTERNAL_AGGREGATE_NO_PII"}),
    "GOOGLE_TRENDS": frozenset({"PUBLIC_NON_PERSONAL"}),
    "KEYWORD_PLANNER": frozenset({"INTERNAL_AGGREGATE_NO_PII"}),
    "SERP_RESEARCH": frozenset({"PUBLIC_NON_PERSONAL"}),
    "WARMBLY_AGGREGATE_OUTCOMES": frozenset({"INTERNAL_AGGREGATE_NO_PII"}),
}
FRESHNESS_STATES = frozenset({"CURRENT", "ACCEPTED_HISTORICAL", "STALE", UNKNOWN})
ALLOWED_ACTIONS = frozenset(
    {
        "WAIT_MEASUREMENT",
        "IMPROVE_SERP_SNIPPET",
        "IMPROVE_CANONICAL_OWNER",
        "FIX_COMMERCIAL_BRIDGE",
        "BUILD_UTILITY_CANDIDATE",
        "BUILD_ORIGINAL_DATA_ASSET_CANDIDATE",
        "CREATE_CANONICAL_OWNER_CANDIDATE",
        "CONSOLIDATE",
        "DEPRIORITIZE",
        "RESEARCH_REQUIRED",
    }
)
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9._:-]*$")
EMAIL_RE = re.compile(r"(?i)(?<![\w.+-])[\w.+-]+@[\w.-]+\.[a-z]{2,}(?![\w.-])")
CPF_RE = re.compile(r"(?<![A-Za-z0-9])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![A-Za-z0-9])")
CNPJ_RE = re.compile(
    r"(?<![A-Za-z0-9])\d{2}\.?\d{3}\.?\d{3}/?(?:\d{4})-?\d{2}(?![A-Za-z0-9])"
)
PHONE_RE = re.compile(
    r"(?<![A-Za-z0-9])(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?\d{4}[\s.-]*\d{4}(?![A-Za-z0-9])"
)

OWNER_STATE_TRIPLES = frozenset(
    {
        ("MEASUREMENT_WAIT", "PROTECTED_WAIT", "MEASUREMENT_WAIT"),
        ("MEASUREMENT_WAIT", "SUPPORTING_MEASUREMENT_WAIT", "MEASUREMENT_WAIT"),
        ("MEASUREMENT_WAIT", "MEASUREMENT_PENDING", "MEASUREMENT_WAIT"),
        ("OWNED_BUT_WEAK", "WEAK", "VALIDATE"),
        ("COMMERCIAL_BRIDGE_GAP", "BRIDGE_GAP", "VALIDATE"),
        ("SERP_SNIPPET_GAP", "SERP_SNIPPET_GAP", "VALIDATE"),
        ("UTILITY_GAP", "UTILITY_GAP", "VALIDATE"),
        ("ORIGINAL_DATA_GAP", "ORIGINAL_DATA_GAP", "VALIDATE"),
        ("CANONICAL_CONFLICT", "CANONICAL_CONFLICT", "VALIDATE"),
        ("CANONICAL_OWNER_GAP", "GAP", "VALIDATE"),
        ("NO_DEMAND_EVIDENCE", "GAP", "DEFER"),
        ("CONTENT_GAP", "GAP", "DEFER_EXTERNAL"),
    }
)
GAP_COVERAGE_STATES = frozenset(
    {"CANONICAL_OWNER_GAP", "NO_DEMAND_EVIDENCE", "CONTENT_GAP"}
)
GSC_INTERPRETATIONS = frozenset(
    {
        "PAGE_EXPOSURE_ONLY_NOT_CONVERSION_FAILURE",
        "INSUFFICIENT_EVIDENCE_TINY_SAMPLE",
        "PAGE_EXPOSURE_ONLY_PROTECTED_SUPPORT_INCLUDED",
    }
)

FORBIDDEN_KEYS = frozenset(
    {
        "name",
        "full_name",
        "firstname",
        "first_name",
        "lastname",
        "last_name",
        "email",
        "emails",
        "e_mail",
        "phone",
        "phones",
        "telephone",
        "whatsapp",
        "cpf",
        "cnpj",
        "address",
        "contact",
        "contacts",
        "contact_name",
        "lead",
        "lead_id",
        "account",
        "account_id",
        "user_id",
        "session_id",
        "ip",
        "ip_address",
        "query",
        "queries",
        "raw_query",
        "query_text",
    }
)


class SnapshotError(ValueError):
    """A source snapshot failed closed."""


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def snapshot_hash(payload: dict[str, Any]) -> str:
    unsigned = {key: value for key, value in payload.items() if key != "snapshot_sha256"}
    return sha256_json(unsigned)


def seal_snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    sealed = deepcopy(payload)
    sealed["records_sha256"] = sha256_json(sealed.get("records"))
    sealed["snapshot_sha256"] = snapshot_hash(sealed)
    return sealed


def parse_iso_date(value: Any, code: str) -> date:
    try:
        parsed = date.fromisoformat(str(value))
    except (TypeError, ValueError) as exc:
        raise SnapshotError(code) from exc
    if parsed.isoformat() != value:
        raise SnapshotError(code)
    return parsed


def _require_exact_keys(
    value: Any,
    *,
    required: set[str],
    optional: set[str] | None = None,
    code: str,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise SnapshotError(f"{code}_invalid")
    optional = optional or set()
    missing = sorted(required - set(value))
    unknown = sorted(set(value) - required - optional)
    if missing:
        raise SnapshotError(f"{code}_fields_missing:{','.join(missing)}")
    if unknown:
        raise SnapshotError(f"{code}_fields_unknown:{','.join(unknown)}")
    return value


def _require_text(value: Any, code: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SnapshotError(code)
    return value


def _walk_privacy(value: Any, *, path: str = "$") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = re.sub(r"(?<!^)(?=[A-Z])", "_", str(key)).strip().lower()
            if normalized in FORBIDDEN_KEYS:
                raise SnapshotError(f"pii_or_raw_identifier_forbidden:{path}.{key}")
            _walk_privacy(child, path=f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _walk_privacy(child, path=f"{path}[{index}]")
    elif isinstance(value, str) and (
        EMAIL_RE.search(value)
        or CPF_RE.search(value)
        or CNPJ_RE.search(value)
        or PHONE_RE.search(value)
    ):
        raise SnapshotError(f"pii_value_forbidden:{path}")


def _validate_provenance(value: Any) -> dict[str, Any]:
    provenance = _require_exact_keys(
        value,
        required={"authority", "repository", "path", "revision", "content_sha256"},
        code="provenance",
    )
    for key in ("authority", "repository", "path", "revision"):
        _require_text(provenance[key], f"provenance_{key}_invalid")
    if not provenance["repository"].startswith("tjsasakifln/"):
        raise SnapshotError("provenance_repository_invalid")
    if not SHA256_RE.fullmatch(str(provenance["content_sha256"])):
        raise SnapshotError("provenance_sha256_invalid")
    return provenance


def _validate_freshness(value: Any, *, effective_date: date) -> dict[str, Any]:
    freshness = _require_exact_keys(
        value,
        required={"state", "evaluated_at", "expires_at"},
        optional={"note"},
        code="freshness",
    )
    if freshness["state"] not in FRESHNESS_STATES:
        raise SnapshotError("freshness_state_invalid")
    evaluated_at = parse_iso_date(freshness["evaluated_at"], "freshness_evaluated_at_invalid")
    if evaluated_at < effective_date:
        raise SnapshotError("freshness_evaluated_before_observation")
    expires_at = freshness["expires_at"]
    if expires_at is not None:
        expiry = parse_iso_date(expires_at, "freshness_expires_at_invalid")
        if expiry < evaluated_at:
            raise SnapshotError("freshness_expiry_before_evaluation")
    if "note" in freshness:
        _require_text(freshness["note"], "freshness_note_invalid")
    return freshness


def _validate_gsc_sample(value: Any) -> None:
    sample = _require_exact_keys(
        value,
        required={
            "property",
            "clicks",
            "impressions",
            "ctr",
            "visible_query_impressions",
            "query_visibility_state",
        },
        code="gsc_sample",
    )
    _require_text(sample["property"], "gsc_sample_property_invalid")
    for key in ("clicks", "impressions", "visible_query_impressions"):
        if not isinstance(sample[key], int) or isinstance(sample[key], bool) or sample[key] < 0:
            raise SnapshotError(f"gsc_sample_{key}_invalid")
    if sample["clicks"] > sample["impressions"] or sample["visible_query_impressions"] > sample[
        "impressions"
    ]:
        raise SnapshotError("gsc_sample_denominator_invalid")
    if (
        not isinstance(sample["ctr"], (int, float))
        or isinstance(sample["ctr"], bool)
        or not math.isfinite(float(sample["ctr"]))
        or not 0 <= sample["ctr"] <= 1
    ):
        raise SnapshotError("gsc_sample_ctr_invalid")
    if sample["query_visibility_state"] != "HEAVILY_CENSORED_OR_ANONYMIZED":
        raise SnapshotError("gsc_sample_query_visibility_invalid")


def _validate_source(source: Any) -> dict[str, Any]:
    if not isinstance(source, dict):
        raise SnapshotError("source_invalid")
    kind = source.get("kind")
    if kind not in SOURCE_KINDS:
        raise SnapshotError(f"source_kind_invalid:{kind}")
    optional = {"observed_at", "range", "limitations"}
    if kind == "GSC_PAGE_OVERLAY":
        optional.add("sample")
    required = {
        "id",
        "kind",
        "geo",
        "language",
        "privacy_class",
        "provenance",
        "freshness",
        "unknown_semantics",
    }
    _require_exact_keys(source, required=required, optional=optional, code="source")
    if not ID_RE.fullmatch(str(source["id"])):
        raise SnapshotError("source_id_invalid")
    if source["privacy_class"] not in PRIVACY_CLASSES or source["privacy_class"] not in PRIVACY_BY_KIND[
        kind
    ]:
        raise SnapshotError("privacy_class_invalid")
    _require_text(source["geo"], "geo_invalid")
    _require_text(source["language"], "language_invalid")
    if "UNKNOWN" not in _require_text(
        source["unknown_semantics"], "unknown_semantics_invalid"
    ).upper():
        raise SnapshotError("unknown_semantics_must_be_explicit")

    has_observed_at = "observed_at" in source
    has_range = "range" in source
    if has_observed_at == has_range:
        raise SnapshotError("source_requires_exactly_one_observed_at_or_range")
    if has_observed_at:
        effective_date = parse_iso_date(source["observed_at"], "observed_at_invalid")
    else:
        period = _require_exact_keys(
            source["range"], required={"start", "end"}, code="range"
        )
        start = parse_iso_date(period["start"], "range_start_invalid")
        effective_date = parse_iso_date(period["end"], "range_end_invalid")
        if start > effective_date:
            raise SnapshotError("range_inverted")
    _validate_provenance(source["provenance"])
    _validate_freshness(source["freshness"], effective_date=effective_date)
    if "limitations" in source:
        if not isinstance(source["limitations"], list) or not all(
            isinstance(item, str) and item.strip() for item in source["limitations"]
        ):
            raise SnapshotError("limitations_invalid")
    if "sample" in source:
        _validate_gsc_sample(source["sample"])
    return source


def _validate_owner_record(record: dict[str, Any]) -> None:
    _require_exact_keys(
        record,
        required={
            "family_id",
            "buyer_job",
            "canonical_owner",
            "eligibility",
            "coverage_state",
            "content_state",
            "execution_state",
            "commercial_relevance",
            "issue_refs",
            "next_step",
        },
        optional={"gap"},
        code="owner_record",
    )
    family_id = record["family_id"]
    if not ID_RE.fullmatch(str(family_id)):
        raise SnapshotError("family_id_invalid")
    _require_text(record["buyer_job"], f"buyer_job_invalid:{family_id}")
    for key in ("coverage_state", "content_state", "execution_state", "next_step"):
        _require_text(record[key], f"owner_{key}_invalid:{family_id}")

    owner = _require_exact_keys(
        record["canonical_owner"],
        required={"state", "url", "operational_owner"},
        code="canonical_owner",
    )
    if owner["state"] not in {"OWNED", "GAP"}:
        raise SnapshotError(f"canonical_owner_invalid:{family_id}")
    _require_text(owner["operational_owner"], f"operational_owner_invalid:{family_id}")
    if owner["state"] == "OWNED":
        parsed = urlsplit(str(owner["url"] or ""))
        if (
            parsed.scheme != "https"
            or parsed.netloc != "confenge.com.br"
            or not parsed.path.startswith("/")
            or parsed.query
            or parsed.fragment
        ):
            raise SnapshotError(f"canonical_owner_url_invalid:{family_id}")
        if "gap" in record:
            raise SnapshotError(f"owned_record_cannot_have_gap:{family_id}")
    else:
        if owner["url"] is not None:
            raise SnapshotError(f"canonical_owner_gap_url_invalid:{family_id}")
        gap = _require_exact_keys(
            record.get("gap"), required={"state", "reason"}, code="owner_gap"
        )
        _require_text(gap["state"], f"gap_state_invalid:{family_id}")
        _require_text(gap["reason"], f"gap_reason_invalid:{family_id}")
        if gap["state"] != record["coverage_state"]:
            raise SnapshotError(f"gap_coverage_state_mismatch:{family_id}")

    eligibility = _require_exact_keys(
        record["eligibility"],
        required={"buyer_fit", "truth", "freeze", "controllable", "exclusion"},
        code="eligibility",
    )
    expected = {
        "buyer_fit": {"ELIGIBLE", "INELIGIBLE", UNKNOWN},
        "truth": {"PASS", "BLOCKED", UNKNOWN},
        "freeze": {"NONE", "ACTIVE", UNKNOWN},
        "controllable": {True, False},
    }
    for key, allowed in expected.items():
        if eligibility[key] not in allowed:
            raise SnapshotError(f"eligibility_{key}_invalid:{family_id}")
    if eligibility["exclusion"] is not None:
        _require_text(eligibility["exclusion"], f"eligibility_exclusion_invalid:{family_id}")

    state_triple = (
        record["coverage_state"],
        record["content_state"],
        record["execution_state"],
    )
    if state_triple not in OWNER_STATE_TRIPLES:
        raise SnapshotError(f"owner_state_combination_invalid:{family_id}")
    is_measurement_wait = state_triple[0] == "MEASUREMENT_WAIT"
    if is_measurement_wait and eligibility["freeze"] not in {"ACTIVE", UNKNOWN}:
        raise SnapshotError(f"measurement_wait_requires_active_freeze:{family_id}")
    if not is_measurement_wait and eligibility["freeze"] == "ACTIVE":
        raise SnapshotError(f"active_freeze_requires_measurement_wait:{family_id}")
    is_gap_state = state_triple[0] in GAP_COVERAGE_STATES
    if (owner["state"] == "GAP") != is_gap_state:
        raise SnapshotError(f"owner_gap_state_mismatch:{family_id}")
    if state_triple[0] in {"NO_DEMAND_EVIDENCE", "CONTENT_GAP"} and eligibility[
        "controllable"
    ]:
        raise SnapshotError(f"blocked_gap_cannot_be_controllable:{family_id}")
    if state_triple[0] == "CANONICAL_OWNER_GAP" and not eligibility["controllable"]:
        raise SnapshotError(f"candidate_owner_gap_must_be_controllable:{family_id}")

    relevance = _require_exact_keys(
        record["commercial_relevance"],
        required={"level", "economic_consequence"},
        code="commercial_relevance",
    )
    if relevance["level"] not in {"HIGH", "MEDIUM", "LOW", UNKNOWN}:
        raise SnapshotError(f"commercial_relevance_invalid:{family_id}")
    _require_text(
        relevance["economic_consequence"], f"economic_consequence_invalid:{family_id}"
    )
    if not isinstance(record["issue_refs"], list):
        raise SnapshotError(f"issue_refs_invalid:{family_id}")
    for ref in record["issue_refs"]:
        _require_exact_keys(ref, required={"number", "role"}, code="issue_ref")
        if not isinstance(ref["number"], int) or isinstance(ref["number"], bool) or ref[
            "number"
        ] < 1:
            raise SnapshotError(f"issue_ref_number_invalid:{family_id}")
        _require_text(ref["role"], f"issue_ref_role_invalid:{family_id}")


def _validate_observation(
    value: Any, *, family_id: str, require_path: bool
) -> dict[str, Any]:
    required = {"clicks", "impressions", "ctr", "position"}
    if require_path:
        required.add("path")
    observation = _require_exact_keys(value, required=required, code="gsc_observation")
    if require_path:
        path = observation["path"]
        if not isinstance(path, str) or not path.startswith("/") or "?" in path or "#" in path:
            raise SnapshotError(f"gsc_owner_path_invalid:{family_id}")
    for key in ("clicks", "impressions"):
        metric = observation[key]
        if not isinstance(metric, int) or isinstance(metric, bool) or metric < 0:
            raise SnapshotError(f"gsc_{key}_invalid:{family_id}")
    if observation["clicks"] > observation["impressions"]:
        raise SnapshotError(f"gsc_clicks_exceed_impressions:{family_id}")
    for key in ("ctr", "position"):
        metric = observation[key]
        if (
            not isinstance(metric, (int, float))
            or isinstance(metric, bool)
            or not math.isfinite(float(metric))
        ):
            raise SnapshotError(f"gsc_{key}_invalid:{family_id}")
    if not 0 <= observation["ctr"] <= 1 or observation["position"] <= 0:
        raise SnapshotError(f"gsc_metric_range_invalid:{family_id}")
    return observation


def _validate_gsc_record(record: dict[str, Any]) -> None:
    family_id = str(record.get("family_id") or "")
    if not ID_RE.fullmatch(family_id):
        raise SnapshotError("gsc_family_id_invalid")
    state = record.get("state")
    if state == UNKNOWN:
        _require_exact_keys(
            record, required={"family_id", "state", "reason"}, code="gsc_unknown_record"
        )
        _require_text(record["reason"], f"unknown_gsc_reason_required:{family_id}")
        return
    if state != "OBSERVED":
        raise SnapshotError(f"gsc_state_invalid:{family_id}")
    _require_exact_keys(
        record,
        required={"family_id", "state", "owner_observation", "interpretation"},
        optional={"family_aggregate"},
        code="gsc_observed_record",
    )
    owner_observation = _validate_observation(
        record["owner_observation"], family_id=family_id, require_path=True
    )
    if "family_aggregate" in record:
        family_aggregate = _validate_observation(
            record["family_aggregate"], family_id=family_id, require_path=False
        )
        if (
            family_aggregate["impressions"] < owner_observation["impressions"]
            or family_aggregate["clicks"] < owner_observation["clicks"]
        ):
            raise SnapshotError(f"gsc_family_aggregate_smaller_than_owner:{family_id}")
    if record["interpretation"] not in GSC_INTERPRETATIONS:
        raise SnapshotError(f"gsc_interpretation_invalid:{family_id}")


def _validate_optional_record(
    kind: str, record: dict[str, Any], *, source_geo: str
) -> None:
    family_id = str(record.get("family_id") or "")
    if not ID_RE.fullmatch(family_id):
        raise SnapshotError(f"optional_family_id_invalid:{kind}")
    state = record.get("state")
    if state == UNKNOWN:
        _require_exact_keys(
            record,
            required={"family_id", "state", "reason"},
            code="optional_unknown_record",
        )
        _require_text(record["reason"], f"optional_unknown_reason_required:{kind}:{family_id}")
        return
    if state != "OBSERVED":
        raise SnapshotError(f"optional_state_invalid:{kind}:{family_id}")

    if kind == "KEYWORD_PLANNER":
        _require_exact_keys(
            record,
            required={"family_id", "state", "breadth", "competition", "bid"},
            code="planner_record",
        )
        if record["breadth"] not in {"HIGH", "MEDIUM", "LOW", UNKNOWN}:
            raise SnapshotError(f"planner_breadth_invalid:{family_id}")
        if record["competition"] not in {"HIGH", "MEDIUM", "LOW", UNKNOWN}:
            raise SnapshotError(f"planner_competition_invalid:{family_id}")
        bid = _require_exact_keys(
            record["bid"], required={"state", "currency", "band"}, code="planner_bid"
        )
        if bid["state"] not in {"APPROXIMATE", UNKNOWN} or bid["band"] not in {
            "HIGH",
            "MEDIUM",
            "LOW",
            UNKNOWN,
        }:
            raise SnapshotError(f"planner_bid_invalid:{family_id}")
        if bid["currency"] not in {"BRL", UNKNOWN}:
            raise SnapshotError(f"planner_currency_invalid:{family_id}")
    elif kind == "GOOGLE_TRENDS":
        _require_exact_keys(
            record,
            required={"family_id", "state", "momentum", "geography"},
            code="trends_record",
        )
        if record["momentum"] not in {"RISING", "STABLE", "FALLING", UNKNOWN}:
            raise SnapshotError(f"trends_momentum_invalid:{family_id}")
        _require_text(record["geography"], f"trends_geography_invalid:{family_id}")
        if record["geography"] != source_geo:
            raise SnapshotError(f"trends_geography_source_mismatch:{family_id}")
    elif kind == "SERP_RESEARCH":
        _require_exact_keys(
            record,
            required={"family_id", "state", "intent_match", "formats"},
            code="serp_record",
        )
        if record["intent_match"] not in {"HIGH", "MEDIUM", "LOW", UNKNOWN}:
            raise SnapshotError(f"serp_intent_invalid:{family_id}")
        if not isinstance(record["formats"], list) or not all(
            isinstance(item, str) and item.strip() for item in record["formats"]
        ):
            raise SnapshotError(f"serp_formats_invalid:{family_id}")
    elif kind == "WARMBLY_AGGREGATE_OUTCOMES":
        _require_exact_keys(
            record,
            required={"family_id", "state", "outcomes"},
            code="warmbly_record",
        )
        outcomes = _require_exact_keys(
            record["outcomes"],
            required={"qco", "proposal", "contract"},
            code="warmbly_outcomes",
        )
        for key, value in outcomes.items():
            if value != UNKNOWN and (
                not isinstance(value, int) or isinstance(value, bool) or value < 0
            ):
                raise SnapshotError(f"warmbly_outcome_invalid:{family_id}:{key}")
    else:  # pragma: no cover - SOURCE_KINDS and caller make this unreachable.
        raise SnapshotError(f"optional_kind_unhandled:{kind}")


def validate_snapshot(payload: Any) -> dict[str, Any]:
    snapshot = _require_exact_keys(
        payload,
        required={
            "schema_version",
            "source",
            "records",
            "records_sha256",
            "snapshot_sha256",
        },
        code="snapshot",
    )
    if snapshot["schema_version"] != SCHEMA_VERSION:
        raise SnapshotError("snapshot_schema_unsupported")
    source = _validate_source(snapshot["source"])
    records = snapshot["records"]
    if not isinstance(records, list):
        raise SnapshotError("records_invalid")
    try:
        calculated_records_sha = sha256_json(records)
        calculated_snapshot_sha = snapshot_hash(snapshot)
    except ValueError as exc:
        raise SnapshotError(f"non_finite_number_forbidden:{source['id']}") from exc
    if snapshot["records_sha256"] != calculated_records_sha:
        raise SnapshotError(f"records_hash_mismatch:{source['id']}")
    if snapshot["snapshot_sha256"] != calculated_snapshot_sha:
        raise SnapshotError(f"snapshot_hash_mismatch:{source['id']}")
    _walk_privacy(snapshot)
    seen: set[str] = set()
    for record in records:
        if not isinstance(record, dict):
            raise SnapshotError(f"record_invalid:{source['id']}")
        family_id = str(record.get("family_id") or "")
        if family_id in seen:
            raise SnapshotError(f"duplicate_family:{source['id']}:{family_id}")
        seen.add(family_id)
        if source["kind"] == "CANONICAL_BOFU_OWNER_PROJECTION":
            _validate_owner_record(record)
        elif source["kind"] == "GSC_PAGE_OVERLAY":
            _validate_gsc_record(record)
        else:
            _validate_optional_record(source["kind"], record, source_geo=source["geo"])
    return snapshot


def approval_manifest_hash(payload: dict[str, Any]) -> str:
    unsigned = {key: value for key, value in payload.items() if key != "manifest_sha256"}
    return sha256_json(unsigned)


def seal_approval_manifest(payload: dict[str, Any]) -> dict[str, Any]:
    sealed = deepcopy(payload)
    sealed["manifest_sha256"] = approval_manifest_hash(sealed)
    return sealed


def validate_approval_manifest(payload: Any) -> dict[str, dict[str, Any]]:
    manifest = _require_exact_keys(
        payload,
        required={"schema_version", "sources", "manifest_sha256"},
        code="approval_manifest",
    )
    if manifest["schema_version"] != APPROVALS_VERSION:
        raise SnapshotError("approval_manifest_schema_unsupported")
    if not isinstance(manifest["sources"], list):
        raise SnapshotError("approval_manifest_sources_invalid")
    if manifest["manifest_sha256"] != approval_manifest_hash(manifest):
        raise SnapshotError("approval_manifest_hash_mismatch")
    _walk_privacy(manifest)
    approved: dict[str, dict[str, Any]] = {}
    for item in manifest["sources"]:
        approval = _require_exact_keys(
            item,
            required={
                "source_id",
                "kind",
                "repository",
                "path",
                "revision",
                "content_sha256",
                "snapshot_sha256",
                "allow_accepted_historical",
                "approved_at",
                "reason",
            },
            code="source_approval",
        )
        source_id = approval["source_id"]
        if not ID_RE.fullmatch(str(source_id)) or source_id in approved:
            raise SnapshotError(f"source_approval_id_invalid_or_duplicate:{source_id}")
        if approval["kind"] not in SOURCE_KINDS:
            raise SnapshotError(f"source_approval_kind_invalid:{source_id}")
        if not str(approval["repository"]).startswith("tjsasakifln/"):
            raise SnapshotError(f"source_approval_repository_invalid:{source_id}")
        for key in ("repository", "path", "revision", "reason"):
            _require_text(approval[key], f"source_approval_{key}_invalid:{source_id}")
        for key in ("content_sha256", "snapshot_sha256"):
            if not SHA256_RE.fullmatch(str(approval[key])):
                raise SnapshotError(f"source_approval_{key}_invalid:{source_id}")
        if not isinstance(approval["allow_accepted_historical"], bool):
            raise SnapshotError(f"source_approval_historical_invalid:{source_id}")
        parse_iso_date(approval["approved_at"], f"source_approval_date_invalid:{source_id}")
        approved[source_id] = approval
    return approved


def source_effective_date(snapshot: dict[str, Any]) -> str:
    source = snapshot["source"]
    return source.get("observed_at") or source["range"]["end"]


def source_summary(snapshot: dict[str, Any]) -> dict[str, Any]:
    source = snapshot["source"]
    return {
        "id": source["id"],
        "kind": source["kind"],
        "effective_date": source_effective_date(snapshot),
        "geo": source["geo"],
        "language": source["language"],
        "privacy_class": source["privacy_class"],
        "freshness": source["freshness"],
        "provenance": source["provenance"],
        "records": len(snapshot["records"]),
        "records_sha256": snapshot["records_sha256"],
        "snapshot_sha256": snapshot["snapshot_sha256"],
        "unknown_semantics": source["unknown_semantics"],
    }
