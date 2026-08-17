"""SELECT-only adapter for extra-cli Goal 03 `public-read-market-answer/1.0`.

Never rewrites producer facts. Never invents custo/km. A labeled fixture
(`official_live=false`, `producer_status=CONTRACT_FIXTURE`) cannot be
promoted to live. claimed_live on a fixture is rejected.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.market_answers import (
    CLAIM_FIXTURE,
    DEFAULT_FIXTURE,
    DEFAULT_LIVE,
    FORBIDDEN_GRAINS,
    GRAIN,
    PRODUCER_STATUS_FIXTURE,
    SCHEMA_ID,
    SOURCE_FIXTURE,
    SOURCE_OFFICIAL_LIVE,
)
from scripts.market_answers.hashing import content_hash, folded_content_hash, schema_hash


class ConsumeError(ValueError):
    """Payload cannot be consumed as the Goal 03 market-answer contract."""


EXTRA_CLI_CONSUMER_SCHEMA = "public-read-market-answer-pavimentacao/1.0"
EXTRA_CLI_CONSUMER_ID = "web-cfg/market-answer/valor-tipico-contratos-pavimentacao"
# Folded hash of the official SC export (timestamps dropped). Not a fixture.
EXPECTED_SC_FOLDED_HASH = "9b69e30cb9e696a6c268526b3646f2d1588519849c5024aa46e6ba89ec06c0b6"
DEFAULT_EXTRA_CLI_CONSUMER = (
    "data/extra-cli/public-read-market-answer-pavimentacao/1.0/export.json"
)

REQUIRED_TOP_LEVEL = (
    "schema",
    "question_id",
    "typology_id",
    "method_id",
    "grain",
    "statistics",
    "period",
    "geography",
    "distribution",
    "as_of",
    "coverage",
    "freshness",
    "limitations",
    "claim",
    "official_live",
    "producer_status",
)


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def _parse(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ConsumeError(f"unreadable market-answer payload: {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ConsumeError(f"market-answer payload is not an object: {path}")
    return payload


def _text(value: Any) -> str:
    return str(value or "").strip()


def _items(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def is_fixture_payload(payload: dict[str, Any]) -> bool:
    if payload.get("official_live") is True:
        return False
    status = _text(payload.get("producer_status"))
    mode = _text(payload.get("catalog_mode"))
    if status == PRODUCER_STATUS_FIXTURE:
        return True
    if mode in {"fixture", "offline_catalog"}:
        return True
    if payload.get("test_only") is True or payload.get("never_index") is True:
        return True
    if "fixture" in _text(payload.get("schema")).lower():
        return True
    return payload.get("official_live") is False


def claimed_live_on_fixture(payload: dict[str, Any]) -> bool:
    if payload.get("claimed_live") and is_fixture_payload(payload):
        return True
    if payload.get("official_live") is True and (
        _text(payload.get("producer_status")) == PRODUCER_STATUS_FIXTURE
        or _text(payload.get("catalog_mode")) in {"fixture", "offline_catalog"}
    ):
        return True
    return "fixture_as_live" in _items(payload.get("reason_codes"))


def grain_is_ticket(payload: dict[str, Any]) -> bool:
    grain = _text(payload.get("grain")).lower()
    if grain in FORBIDDEN_GRAINS:
        return False
    return grain == GRAIN or grain in {
        "integral_nominal_instrument",
        "valor integral nominal",
        "ticket_contratual_integral",
    }


def invents_cost_per_km(payload: dict[str, Any]) -> bool:
    stats = payload.get("statistics") if isinstance(payload.get("statistics"), dict) else {}
    unit = _text(stats.get("unit") or payload.get("unit")).lower()
    if "km" in unit or "custo/km" in unit or "por km" in unit:
        return True
    derived = payload.get("derived") if isinstance(payload.get("derived"), dict) else {}
    if derived.get("custo_por_km") not in (None, "", False):
        return True
    if payload.get("custo_por_km") not in (None, "", False):
        return True
    return False


def is_extra_cli_consumer_payload(payload: dict[str, Any]) -> bool:
    schema = _text(payload.get("schema"))
    consumer = _text(payload.get("consumer_id"))
    return schema == EXTRA_CLI_CONSUMER_SCHEMA or consumer == EXTRA_CLI_CONSUMER_ID


def project_extra_cli_consumer(payload: dict[str, Any]) -> dict[str, Any]:
    """Map extra-cli named-consumer facts onto Goal 03 without rewriting quartiles.

    Does not authorize INDEX. Does not invent custo/km. Does not relabel
    national_claim_allowed. Folded hash must match the official SC export.
    """
    if not is_extra_cli_consumer_payload(payload):
        raise ConsumeError("not an extra-cli named-consumer market-answer payload")
    digest = folded_content_hash(payload)
    if digest != EXPECTED_SC_FOLDED_HASH:
        raise ConsumeError(
            f"folded_hash_mismatch got {digest} expected {EXPECTED_SC_FOLDED_HASH}"
        )
    stats_in = payload.get("stats") if isinstance(payload.get("stats"), dict) else {}
    if not stats_in and isinstance(payload.get("statistics"), dict):
        stats_in = payload["statistics"]
    claim_in = payload.get("claim_authorization") if isinstance(payload.get("claim_authorization"), dict) else {}
    if not claim_in and isinstance(payload.get("claim"), dict):
        claim_in = payload["claim"]
    geography = payload.get("geography") if isinstance(payload.get("geography"), dict) else {}
    national_allowed = bool(claim_in.get("national_claim_allowed"))
    geo_code = geography.get("code")
    geo_kind = geography.get("kind") or "uf"
    projected = {
        "schema": SCHEMA_ID,
        "contract_version": _text(payload.get("schema_version")) or "v1.0.0",
        "question_id": payload.get("question_id"),
        "typology_id": payload.get("typology_id"),
        "method_id": payload.get("method_id"),
        "grain": payload.get("grain"),
        "grain_label": "valor integral nominal do instrumento",
        "not_grain": list(payload.get("grain_not") or ["custo_por_km", "preco_unitario"]),
        "statistics": {
            "median": stats_in.get("median"),
            "p25": stats_in.get("p25"),
            "p75": stats_in.get("p75"),
            "n": stats_in.get("n"),
            "currency": payload.get("currency") or "BRL",
            "unit": stats_in.get("unit") or "integral_nominal_instrument",
        },
        "period": payload.get("period") or {},
        "geography": {
            "kind": geo_kind,
            "scope": geo_kind,
            "code": geo_code,
            "label": geography.get("label"),
            "ufs": [geo_code] if geo_code else [],
            "national_claim_allowed": national_allowed,
        },
        "distribution": payload.get("distribution") or {},
        "contract_refs": list(payload.get("contract_refs") or []),
        "evidence_refs": list(payload.get("evidence_refs") or []),
        "peer_group": payload.get("peer_group") if isinstance(payload.get("peer_group"), dict) else {},
        "method_refs": [
            {
                "id": payload.get("method_id"),
                "note": "Shipped extra-cli integral-nominal nearest-rank on official pncp_supplier_contracts.",
            }
        ],
        "method_short": (
            "Mediana e quartis do valor integral nominal do instrumento, "
            "tipologia keyword de pavimentação, recorte Santa Catarina. Não é custo por km."
        ),
        "as_of": payload.get("as_of"),
        "coverage": payload.get("coverage") if isinstance(payload.get("coverage"), dict) else {},
        "freshness": payload.get("freshness") if isinstance(payload.get("freshness"), dict) else {},
        "missingness": payload.get("missingness") if isinstance(payload.get("missingness"), dict) else {},
        "limitations": list(payload.get("limitations") or []),
        "unknown_fields": list(payload.get("unknown_fields") or []),
        "reason_codes": list(payload.get("reason_codes") or []),
        "claim": {
            "authorization_state": "UNAUTHORIZED" if not national_allowed else "AUTHORIZED",
            "national_claim_allowed": national_allowed,
            "current_publication_allowed": bool(claim_in.get("current_publication_allowed")),
            "claim_scope": "uf" if geo_kind == "uf" else "national",
            "issue": claim_in.get("issue"),
            "reason_codes": list(claim_in.get("reason_codes") or []),
        },
        "official_live": bool(payload.get("official_live")),
        "producer_status": payload.get("producer_status"),
        "catalog_mode": payload.get("catalog_mode"),
        "claimed_live": bool(payload.get("claimed_live")),
        "source_schema": EXTRA_CLI_CONSUMER_SCHEMA,
        "source_folded_hash": digest,
        "source_content_hash": payload.get("content_hash"),
        "never_index": False,
    }
    return projected


def validate_schema(payload: dict[str, Any]) -> None:
    schema = _text(payload.get("schema"))
    if schema != SCHEMA_ID:
        raise ConsumeError(
            f"incompatible schema {schema!r}; expected {SCHEMA_ID}"
        )
    missing = [key for key in REQUIRED_TOP_LEVEL if key not in payload]
    if missing:
        raise ConsumeError(f"payload missing required fields: {', '.join(missing)}")
    if claimed_live_on_fixture(payload):
        raise ConsumeError("claimed_live on CONTRACT_FIXTURE is rejected")
    if not grain_is_ticket(payload):
        raise ConsumeError(
            f"grain {payload.get('grain')!r} is not valor integral nominal"
        )
    if invents_cost_per_km(payload):
        raise ConsumeError("payload invents or presents custo/km; refuse")
    stats = payload.get("statistics")
    if not isinstance(stats, dict):
        raise ConsumeError("statistics must be an object")
    for key in ("median", "p25", "p75", "n"):
        if key not in stats:
            raise ConsumeError(f"statistics missing {key}")
    claim = payload.get("claim")
    if not isinstance(claim, dict):
        raise ConsumeError("claim must be an object")
    if "authorization_state" not in claim:
        raise ConsumeError("claim.authorization_state required")


def attach_hashes(payload: dict[str, Any]) -> dict[str, Any]:
    adapted = dict(payload)
    adapted["content_hash"] = content_hash(payload)
    adapted["schema_hash"] = schema_hash(
        _text(payload.get("schema")) or SCHEMA_ID,
        _text(payload.get("contract_version")) or "v1.0.0",
    )
    return adapted


def adapt_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Project the producer payload into the consumer view. Facts are copied."""
    if is_extra_cli_consumer_payload(payload):
        payload = project_extra_cli_consumer(payload)
    validate_schema(payload)
    stats = payload["statistics"]
    coverage = payload.get("coverage") if isinstance(payload.get("coverage"), dict) else {}
    freshness = payload.get("freshness") if isinstance(payload.get("freshness"), dict) else {}
    geography = payload.get("geography") if isinstance(payload.get("geography"), dict) else {}
    period = payload.get("period") if isinstance(payload.get("period"), dict) else {}
    claim = payload.get("claim") if isinstance(payload.get("claim"), dict) else {}
    fixture = is_fixture_payload(payload)
    hashed = attach_hashes(payload)
    unknown = list(payload.get("unknown_fields") or payload.get("unknown") or [])
    if "demand" not in {str(item).lower() for item in unknown}:
        # Demand is a web-cfg decision; producer may omit it. Keep UNKNOWN.
        pass
    return {
        "schema": SCHEMA_ID,
        "contract_version": hashed.get("contract_version") or "v1.0.0",
        "question_id": payload["question_id"],
        "typology_id": payload["typology_id"],
        "method_id": payload["method_id"],
        "grain": GRAIN,
        "grain_label": _text(payload.get("grain_label"))
        or "valor integral nominal do instrumento",
        "not_grain": list(payload.get("not_grain") or ["custo_por_km", "preco_unitario"]),
        "statistics": {
            "median": stats.get("median"),
            "p25": stats.get("p25"),
            "p75": stats.get("p75"),
            "n": stats.get("n"),
            "currency": stats.get("currency") or "BRL",
            "unit": stats.get("unit") or "ticket_contratual_integral",
        },
        "period": period,
        "geography": geography,
        "distribution": payload.get("distribution") or {},
        "contract_refs": list(payload.get("contract_refs") or []),
        "evidence_refs": list(payload.get("evidence_refs") or []),
        "peer_group": payload.get("peer_group") if isinstance(payload.get("peer_group"), dict) else {},
        "method_refs": list(payload.get("method_refs") or []),
        "as_of": payload.get("as_of"),
        "coverage": coverage,
        "freshness": freshness,
        "missingness": payload.get("missingness") if isinstance(payload.get("missingness"), dict) else {},
        "limitations": list(payload.get("limitations") or []),
        "unknown_fields": unknown,
        "reason_codes": list(payload.get("reason_codes") or []),
        "claim": claim,
        "content_hash": hashed["content_hash"],
        "schema_hash": hashed["schema_hash"],
        "producer_sha": payload.get("producer_sha") or payload.get("producer_commit_sha"),
        "official_live": bool(payload.get("official_live")) and not fixture,
        "producer_status": payload.get("producer_status"),
        "catalog_mode": payload.get("catalog_mode") or ("fixture" if fixture else SOURCE_OFFICIAL_LIVE),
        "source_kind": SOURCE_FIXTURE if fixture else SOURCE_OFFICIAL_LIVE,
        "is_fixture": fixture,
        "test_only": fixture,
        "never_index": fixture or bool(payload.get("never_index")),
        "source_folded_hash": payload.get("source_folded_hash"),
        "source_schema": payload.get("source_schema"),
        "source_content_hash": payload.get("source_content_hash"),
        "method_short": _text(payload.get("method_short") or payload.get("method")),
        "method": payload.get("method") if isinstance(payload.get("method"), dict) else {
            "id": payload.get("method_id"),
            "short": _text(payload.get("method_short") or payload.get("method")),
        },
        "_source_path": payload.get("_source_path"),
    }


def load_payload(path: Path | None = None, *, default_fixture: bool = True) -> dict[str, Any]:
    """Load official_live when present and valid; otherwise the labeled fixture."""
    root = _root()
    if path is not None:
        resolved = path if path.is_absolute() else root / path
        payload = _parse(resolved)
        payload["_source_path"] = str(resolved)
        return adapt_payload(payload)
    extra = root / DEFAULT_EXTRA_CLI_CONSUMER
    if extra.is_file():
        payload = _parse(extra)
        payload["_source_path"] = str(extra)
        if is_extra_cli_consumer_payload(payload) and payload.get("official_live") is True:
            return adapt_payload(payload)
    live = root / DEFAULT_LIVE
    if live.is_file():
        payload = _parse(live)
        payload["_source_path"] = str(live)
        if not is_fixture_payload(payload) and payload.get("official_live") is True:
            return adapt_payload(payload)
        # A fixture sitting in the live path is not promoted.
    if not default_fixture:
        raise ConsumeError("no official_live market-answer payload")
    fixture = root / DEFAULT_FIXTURE
    payload = _parse(fixture)
    payload["_source_path"] = str(fixture)
    return adapt_payload(payload)


def load_candidate(path: Path | None = None) -> dict[str, Any]:
    from scripts.market_answers import DEFAULT_CANDIDATE

    resolved = path if path is not None else _root() / DEFAULT_CANDIDATE
    if not resolved.is_absolute():
        resolved = _root() / resolved
    record = _parse(resolved)
    if not isinstance(record, dict):
        raise ConsumeError(f"candidate record is not an object: {resolved}")
    required = (
        "question",
        "user_job",
        "intent",
        "demand",
        "dataset",
        "grain",
        "geography",
        "period",
        "coverage_required",
        "freshness_required",
        "answerability",
        "data_quality",
        "singularity",
        "citation_potential",
        "utility",
        "commercial_fit",
        "maintenance_cost",
        "cta",
        "owner",
        "refresh",
        "kill_gate",
    )
    missing = [key for key in required if key not in record]
    if missing:
        raise ConsumeError(f"candidate record missing: {', '.join(missing)}")
    record["_source_path"] = str(resolved)
    return record


def load_approvals(path: Path | None = None) -> dict[str, Any]:
    from scripts.market_answers import DEFAULT_APPROVALS

    resolved = path if path is not None else _root() / DEFAULT_APPROVALS
    if not resolved.is_absolute():
        resolved = _root() / resolved
    if not resolved.is_file():
        return {"approvals": []}
    return _parse(resolved)


def approval_for(question_id: str, approvals: dict[str, Any]) -> dict[str, Any] | None:
    for item in approvals.get("approvals") or []:
        if isinstance(item, dict) and _text(item.get("question_id")) == question_id:
            return item
    return None
