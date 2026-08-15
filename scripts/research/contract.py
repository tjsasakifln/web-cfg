"""extra-cli #402 consumer contract and national claim gate.

Live producer contract: `public-read-research-flagship/1.0` (`v1.1.0`),
shipped by extra-cli #402. Pure functions. I/O lives in read_model.py.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from typing import Any

SCHEMA_ID = "public-read-research-flagship/1.0"
SCHEMA_VERSION = "v1.1.0"
CONSUMER_ID = "web-cfg/flagship-research"
PRODUCER_ISSUE = "tjsasakifln/extra-cli#402"
DEFAULT_MAX_AGE_HOURS = 48
DEFAULT_MAX_AGE_DAYS = 2
NATIONAL_UF_MIN = 27

# IBGE UF set the national gate expects (26 states + DF).
NATIONAL_UFS = (
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO",
)

REASON_RESEARCH_READ_MODEL_ABSENT = "RESEARCH_READ_MODEL_ABSENT"
REASON_SCHEMA_MISMATCH = "SCHEMA_MISMATCH"
REASON_CONSUMER_MISMATCH = "CONSUMER_MISMATCH"
REASON_COVERAGE_INSUFFICIENT = "COVERAGE_INSUFFICIENT"
REASON_COVERAGE_TEMPORAL_INSUFFICIENT = "COVERAGE_TEMPORAL_INSUFFICIENT"
REASON_NATIONAL_DENOMINATOR_MISSING = "NATIONAL_DENOMINATOR_MISSING"
REASON_FRESHNESS_STALE = "FRESHNESS_STALE"
REASON_AS_OF_MISSING = "AS_OF_MISSING"
REASON_PROVENANCE_INCOMPLETE = "PROVENANCE_INCOMPLETE"
REASON_VALUE_SEMANTICS_MISSING = "VALUE_SEMANTICS_MISSING"
REASON_UNKNOWN_VALUE_ON_DENOMINATOR = "UNKNOWN_VALUE_ON_DENOMINATOR"
REASON_EXPORT_UNREADABLE = "EXPORT_UNREADABLE"

BLOCKING_REASON_CODES = frozenset(
    {
        REASON_RESEARCH_READ_MODEL_ABSENT,
        REASON_SCHEMA_MISMATCH,
        REASON_CONSUMER_MISMATCH,
        REASON_COVERAGE_INSUFFICIENT,
        REASON_COVERAGE_TEMPORAL_INSUFFICIENT,
        REASON_NATIONAL_DENOMINATOR_MISSING,
        REASON_FRESHNESS_STALE,
        REASON_AS_OF_MISSING,
        REASON_PROVENANCE_INCOMPLETE,
        REASON_VALUE_SEMANTICS_MISSING,
        REASON_UNKNOWN_VALUE_ON_DENOMINATOR,
        REASON_EXPORT_UNREADABLE,
    }
)

REQUIRED_EXPORT_FIELDS = (
    "schema",
    "contract_version",
    "consumer",
    "grain",
    "keys",
    "value_semantics",
    "as_of",
    "freshness",
    "claim",
    "series",
    "provenance",
)

REQUIRED_PROVENANCE_FIELDS = (
    "method",
)


@dataclass(frozen=True)
class NationalClaimGate:
    passed: bool
    present: bool
    consumed: bool
    reason_codes: tuple[str, ...]
    schema: str | None
    consumer: str | None
    as_of: str | None
    freshness_age_days: int | None
    freshness_age_hours: float | None
    max_age_days: int
    max_age_hours: int
    uf_count: int
    ufs: tuple[str, ...]
    national_universe_complete: bool
    national_denominator: str | None
    note: str

    def as_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["reason_codes"] = list(self.reason_codes)
        payload["ufs"] = list(self.ufs)
        return payload


def _as_date(value: Any) -> date | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _today(now: date | datetime | None) -> date:
    if now is None:
        return datetime.now(timezone.utc).date()
    if isinstance(now, datetime):
        if now.tzinfo is None:
            return now.date()
        return now.astimezone(timezone.utc).date()
    return now


def _denominator_label(coverage: dict[str, Any]) -> str | None:
    raw = coverage.get("national_denominator")
    if raw is None:
        return None
    if isinstance(raw, dict):
        if raw.get("unknown") is True:
            return None
        label = raw.get("id") or raw.get("label") or raw.get("source")
        return str(label) if label else None
    text = str(raw).strip()
    return text or None


def _denominator_is_unknown(coverage: dict[str, Any]) -> bool:
    raw = coverage.get("national_denominator")
    if raw is None:
        return False
    if isinstance(raw, dict):
        if raw.get("unknown") is True:
            return True
        codes = raw.get("reason_codes") or []
        return any(str(code).upper() == "UNKNOWN" for code in codes)
    return str(raw).strip().upper() == "UNKNOWN"


def _consumer_id(export: dict[str, Any]) -> str | None:
    raw = export.get("consumer")
    if isinstance(raw, dict):
        value = raw.get("id")
        return str(value) if value else None
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def structural_errors(export: dict[str, Any] | None) -> list[str]:
    """Required-shape errors for extra-cli #402 export. Empty = parseable."""
    if not isinstance(export, dict):
        return ["export is not an object"]
    errors = [
        f"missing field {field}"
        for field in REQUIRED_EXPORT_FIELDS
        if field not in export
    ]
    grain = export.get("grain")
    if not (isinstance(grain, str) and grain.strip()) and not (
        isinstance(grain, dict) and grain.get("keys")
    ):
        errors.append("grain missing")
    keys = export.get("keys")
    if not isinstance(keys, list) or not keys:
        errors.append("keys missing")
    claim = export.get("claim")
    if not isinstance(claim, dict) or "national_claim_allowed" not in claim:
        errors.append("claim.national_claim_allowed missing")
    freshness = export.get("freshness")
    if not isinstance(freshness, dict):
        errors.append("freshness missing")
    provenance = export.get("provenance")
    if not isinstance(provenance, dict):
        errors.append("provenance missing")
    if not isinstance(export.get("series"), list):
        errors.append("series missing")
    return errors


def evaluate_national_claim_gate(
    export: dict[str, Any] | None,
    *,
    now: date | datetime | None = None,
) -> NationalClaimGate:
    """Fail-closed national/PUBLISH/index gate for the extra-cli #402 export.

    `passed` is true only when the producer field `claim.national_claim_allowed`
    is true AND this consumer independently confirms schema, consumer id,
    no Extra-1093 denominator, freshness within 48h, and completeness.
    UNKNOWN stays UNKNOWN.
    """
    if export is None:
        return NationalClaimGate(
            passed=False,
            present=False,
            consumed=False,
            reason_codes=(REASON_RESEARCH_READ_MODEL_ABSENT,),
            schema=None,
            consumer=None,
            as_of=None,
            freshness_age_days=None,
            freshness_age_hours=None,
            max_age_days=DEFAULT_MAX_AGE_DAYS,
            max_age_hours=DEFAULT_MAX_AGE_HOURS,
            uf_count=0,
            ufs=(),
            national_universe_complete=False,
            national_denominator=None,
            note=(
                "No versioned public-read-research-flagship/1.0 export. "
                "Fall back to the 4-UF data/pseo snapshot as preview only."
            ),
        )

    codes: list[str] = []
    shape = structural_errors(export)
    if shape:
        codes.append(REASON_EXPORT_UNREADABLE)

    schema = export.get("schema") if isinstance(export, dict) else None
    consumer = _consumer_id(export) if isinstance(export, dict) else None
    if schema != SCHEMA_ID:
        codes.append(REASON_SCHEMA_MISMATCH)
    if consumer != CONSUMER_ID:
        codes.append(REASON_CONSUMER_MISMATCH)

    claim = export.get("claim") if isinstance(export.get("claim"), dict) else {}
    producer_allowed = claim.get("national_claim_allowed") is True
    complete = claim.get("nacional_completo") is True
    extra_1093 = claim.get("extra_1093_used_as_denominator") is True
    if extra_1093:
        codes.append(REASON_UNKNOWN_VALUE_ON_DENOMINATOR)
        codes.append("inconsistent_denominator_extra_1093")

    series = export.get("series") if isinstance(export.get("series"), list) else []
    ufs = tuple(
        sorted(
            {
                str(row.get("geography_code") or row.get("uf") or "").strip().upper()
                for row in series
                if isinstance(row, dict)
                and str(row.get("geography_kind") or "UF").upper() == "UF"
                and str(row.get("geography_code") or row.get("uf") or "").strip()
            }
        )
    )
    coverage = export.get("coverage") if isinstance(export.get("coverage"), dict) else {}
    if coverage.get("ufs"):
        ufs = tuple(
            str(item).strip().upper()
            for item in coverage.get("ufs") or []
            if str(item).strip()
        )
    uf_count = int(coverage.get("uf_count") or len(ufs) or 0)
    if coverage.get("national_universe_complete") is True:
        complete = True
    denom = _denominator_label(coverage)
    denom_block = export.get("denominator") if isinstance(export.get("denominator"), dict) else {}
    if denom_block.get("extra_1093_used_as_denominator") is True:
        extra_1093 = True
        codes.append(REASON_UNKNOWN_VALUE_ON_DENOMINATOR)
    # A bare authority string is not a closed national denominator.
    if not denom and complete and denom_block.get("authority") and denom_block.get("closed_partitions"):
        if int(denom_block.get("closed_partitions") or 0) >= NATIONAL_UF_MIN:
            denom = str(denom_block.get("authority"))
    if _denominator_is_unknown(coverage):
        codes.append(REASON_UNKNOWN_VALUE_ON_DENOMINATOR)
        denom = None
    if not complete or uf_count < NATIONAL_UF_MIN:
        codes.append(REASON_COVERAGE_INSUFFICIENT)
    if complete and uf_count >= NATIONAL_UF_MIN and ufs:
        missing_ufs = [uf for uf in NATIONAL_UFS if uf not in ufs]
        if missing_ufs:
            codes.append(REASON_COVERAGE_INSUFFICIENT)
    if not denom:
        codes.append(REASON_NATIONAL_DENOMINATOR_MISSING)
    if not producer_allowed:
        for code in claim.get("reason_codes") or []:
            text = str(code)
            if text and text not in codes:
                codes.append(text)
        if REASON_COVERAGE_INSUFFICIENT not in codes and not complete:
            codes.append(REASON_COVERAGE_INSUFFICIENT)

    freshness = (
        export.get("freshness") if isinstance(export.get("freshness"), dict) else {}
    )
    as_of = _as_date(
        freshness.get("as_of") or export.get("as_of") or export.get("data_as_of")
    )
    try:
        max_age_hours = int(freshness.get("max_age_hours") or DEFAULT_MAX_AGE_HOURS)
    except (TypeError, ValueError):
        max_age_hours = DEFAULT_MAX_AGE_HOURS
    try:
        max_age_days = int(freshness.get("max_age_days") or max(1, max_age_hours // 24))
    except (TypeError, ValueError):
        max_age_days = DEFAULT_MAX_AGE_DAYS
    age_days: int | None = None
    age_hours: float | None = None
    if as_of is None:
        codes.append(REASON_AS_OF_MISSING)
    else:
        today = _today(now)
        age_days = (today - as_of).days
        age_hours = age_days * 24.0
        if age_hours > max_age_hours or age_days > max_age_days:
            codes.append(REASON_FRESHNESS_STALE)

    provenance = (
        export.get("provenance") if isinstance(export.get("provenance"), dict) else {}
    )
    if any(not provenance.get(field) for field in REQUIRED_PROVENANCE_FIELDS):
        codes.append(REASON_PROVENANCE_INCOMPLETE)

    semantics = export.get("value_semantics")
    if not semantics:
        codes.append(REASON_VALUE_SEMANTICS_MISSING)

    unique_codes = tuple(dict.fromkeys(codes))
    passed = not unique_codes and producer_allowed
    as_of_text = as_of.isoformat() if as_of else None
    note = (
        "National claim gate passed. Export may be used as the edition source."
        if passed
        else "National claim gate failed. Keep 4-UF snapshot as preview; "
        "do not index, do not treat four UFs as Brazil. Reasons: "
        + ", ".join(unique_codes)
    )
    return NationalClaimGate(
        passed=passed,
        present=True,
        consumed=passed,
        reason_codes=unique_codes,
        schema=str(schema) if schema else None,
        consumer=str(consumer) if consumer else None,
        as_of=as_of_text,
        freshness_age_days=age_days,
        freshness_age_hours=age_hours,
        max_age_days=max_age_days,
        max_age_hours=max_age_hours,
        uf_count=uf_count,
        ufs=ufs,
        national_universe_complete=complete if passed else False,
        national_denominator=denom if passed else denom,
        note=note,
    )


def next_action_for_gate(gate: NationalClaimGate) -> str:
    if gate.passed:
        return (
            "Quality gate humano: revisar metodologia, citation e download "
            "antes de indexar. Não disparar imprensa automaticamente."
        )
    codes = ", ".join(gate.reason_codes) or REASON_RESEARCH_READ_MODEL_ABSENT
    return (
        f"Bloqueio {codes}. Obter o export versionado `{SCHEMA_ID}` com "
        "national_claim_allowed, denominador nacional fechado e freshness "
        f"dentro do SLA ({gate.max_age_hours}h). Regenerar o pack e só então "
        "reavaliar PUBLISH. Não indexar, não promover sitemap, não disparar "
        "imprensa."
    )
