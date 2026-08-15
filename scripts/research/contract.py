"""extra-cli #400 consumer contract and national claim gate.

Pure functions. I/O lives in read_model.py. Tests drive these functions
from fixtures; they do not reimplement the gate.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from typing import Any

SCHEMA_ID = "extra-cli.public_read.research_aggregate.v1"
SCHEMA_VERSION = "1.0.0"
CONSUMER_ID = "web-cfg/flagship-research"
PRODUCER_ISSUE = "tjsasakifln/extra-cli#400"
DEFAULT_MAX_AGE_DAYS = 30
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
    "schema_version",
    "consumer",
    "dataset_hash",
    "data_as_of",
    "grain",
    "value_semantics",
    "coverage",
    "freshness",
    "provenance",
    "unknowns",
)

REQUIRED_PROVENANCE_FIELDS = (
    "tables",
    "method",
    "source_commit_sha",
    "source_run_id",
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
    max_age_days: int
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


def structural_errors(export: dict[str, Any] | None) -> list[str]:
    """Required-shape errors. Empty list means the document is parseable."""
    if not isinstance(export, dict):
        return ["export is not an object"]
    errors = [
        f"missing field {field}"
        for field in REQUIRED_EXPORT_FIELDS
        if field not in export
    ]
    grain = export.get("grain")
    if not isinstance(grain, dict) or not grain.get("keys"):
        errors.append("grain.keys missing")
    coverage = export.get("coverage")
    if not isinstance(coverage, dict):
        errors.append("coverage missing")
    freshness = export.get("freshness")
    if not isinstance(freshness, dict):
        errors.append("freshness missing")
    provenance = export.get("provenance")
    if not isinstance(provenance, dict):
        errors.append("provenance missing")
    unknowns = export.get("unknowns")
    if not isinstance(unknowns, dict) or "reason_codes" not in unknowns:
        errors.append("unknowns.reason_codes missing")
    return errors


def evaluate_national_claim_gate(
    export: dict[str, Any] | None,
    *,
    now: date | datetime | None = None,
) -> NationalClaimGate:
    """Fail-closed national/PUBLISH/index gate for a #400 read model.

    `passed` is true only when coverage, denominator, freshness and
    provenance all sustain a national claim. UNKNOWN stays UNKNOWN.
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
            max_age_days=DEFAULT_MAX_AGE_DAYS,
            uf_count=0,
            ufs=(),
            national_universe_complete=False,
            national_denominator=None,
            note=(
                "No versioned extra-cli #400 research_aggregate_v1 export. "
                "Fall back to the 4-UF data/pseo snapshot as preview only."
            ),
        )

    codes: list[str] = []
    shape = structural_errors(export)
    if shape:
        codes.append(REASON_EXPORT_UNREADABLE)

    schema = export.get("schema") if isinstance(export, dict) else None
    consumer = export.get("consumer") if isinstance(export, dict) else None
    if schema != SCHEMA_ID:
        codes.append(REASON_SCHEMA_MISMATCH)
    if consumer != CONSUMER_ID:
        codes.append(REASON_CONSUMER_MISMATCH)

    coverage = export.get("coverage") if isinstance(export.get("coverage"), dict) else {}
    ufs_raw = coverage.get("ufs") or []
    ufs = tuple(
        str(item).strip().upper()
        for item in ufs_raw
        if str(item).strip()
    )
    uf_count = int(coverage.get("uf_count") or len(ufs) or 0)
    complete = coverage.get("national_universe_complete") is True
    denom = _denominator_label(coverage)
    if _denominator_is_unknown(coverage):
        codes.append(REASON_UNKNOWN_VALUE_ON_DENOMINATOR)
        denom = None
    if not complete or uf_count < NATIONAL_UF_MIN or len(ufs) < NATIONAL_UF_MIN:
        codes.append(REASON_COVERAGE_INSUFFICIENT)
    if complete and uf_count >= NATIONAL_UF_MIN:
        missing_ufs = [uf for uf in NATIONAL_UFS if uf not in ufs]
        if missing_ufs:
            codes.append(REASON_COVERAGE_INSUFFICIENT)
    if not denom:
        codes.append(REASON_NATIONAL_DENOMINATOR_MISSING)
    if not coverage.get("period_start") or not coverage.get("period_end"):
        if complete:
            codes.append(REASON_COVERAGE_TEMPORAL_INSUFFICIENT)

    freshness = (
        export.get("freshness") if isinstance(export.get("freshness"), dict) else {}
    )
    as_of = _as_date(freshness.get("as_of") or export.get("data_as_of"))
    try:
        max_age = int(freshness.get("max_age_days") or DEFAULT_MAX_AGE_DAYS)
    except (TypeError, ValueError):
        max_age = DEFAULT_MAX_AGE_DAYS
    age_days: int | None = None
    if as_of is None:
        codes.append(REASON_AS_OF_MISSING)
    else:
        age_days = (_today(now) - as_of).days
        if age_days > max_age:
            codes.append(REASON_FRESHNESS_STALE)

    provenance = (
        export.get("provenance") if isinstance(export.get("provenance"), dict) else {}
    )
    if any(not provenance.get(field) for field in REQUIRED_PROVENANCE_FIELDS):
        codes.append(REASON_PROVENANCE_INCOMPLETE)
    if not export.get("dataset_hash"):
        codes.append(REASON_PROVENANCE_INCOMPLETE)

    semantics = export.get("value_semantics")
    if not semantics:
        codes.append(REASON_VALUE_SEMANTICS_MISSING)

    unique_codes = tuple(dict.fromkeys(codes))
    passed = not unique_codes
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
        max_age_days=max_age,
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
        f"Bloqueio extra-cli #400 ({codes}). Obter o export versionado "
        f"`{SCHEMA_ID}` com cobertura nacional ({NATIONAL_UF_MIN} UFs), "
        "denominator explícito e freshness dentro do SLA "
        f"({gate.max_age_days} dias). Regenerar o pack e só então reavaliar "
        "PUBLISH. Não indexar, não promover sitemap, não disparar imprensa."
    )
