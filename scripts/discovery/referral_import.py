"""Analytics/referral/outcome importer. No tracking install. Fail-closed on PII."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Any

from scripts.discovery.observation import (
    REASON_AMBIGUOUS_FILE,
    REASON_LEAD_UNATTRIBUTED,
    REASON_PII_REFUSED,
    ObservationError,
    build_observation,
    sha256_text,
)

PII_FIELD_NAMES = frozenset(
    {
        "name",
        "nome",
        "full_name",
        "nome_completo",
        "email",
        "e-mail",
        "e_mail",
        "phone",
        "telefone",
        "celular",
        "whatsapp",
        "cnpj",
        "cpf",
        "documento",
        "form_content",
        "formulario",
        "message",
        "mensagem",
        "comentario",
        "comment",
    }
)
OPAQUE_ID_FIELDS = frozenset(
    {
        "correlation_id",
        "lead_id",
        "session_id",
        "visitor_id",
        "client_id",
        "anonymous_id",
        "offer_id",
    }
)
CANONICAL_COMMERCIAL_EVENTS = frozenset(
    {
        "payment_confirmed",
        "invoice_paid",
        "asaas_payment_confirmed",
        "commercial_outcome",
    }
)
SEARCH_EVIDENCE_FIELDS = frozenset(
    {
        "gclid",
        "gsc_query",
        "search_query",
        "query",
    }
)
SEARCH_EQUIVALENT_FIELDS = frozenset({"correlation_id"})
EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)
CNPJ_RE = re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?0001-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b")
PHONE_RE = re.compile(r"(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)9?\d{4}[\s-]?\d{4}")
LANDING_ALIASES = ("landing_page", "landing", "page", "página", "pagina", "url", "path")
REFERRER_ALIASES = ("referrer", "referer", "ref")
SOURCE_ALIASES = ("source", "utm_source")
MEDIUM_ALIASES = ("medium", "utm_medium")
TIMESTAMP_ALIASES = ("timestamp", "time", "datetime", "event_time", "occurred_at", "date")
EVENT_ALIASES = ("event", "event_name", "name", "tipo", "type")
CTA_ALIASES = ("cta", "cta_event", "cta_id")
LEAD_ALIASES = ("lead", "lead_event", "is_lead")
CORR_ALIASES = ("correlation_id",)
LEAD_ID_ALIASES = ("lead_id",)
GCLID_ALIASES = ("gclid",)
SEARCH_QUERY_ALIASES = ("gsc_query", "search_query", "query")
OFFER_ALIASES = ("offer_id", "offer")
REVENUE_ALIASES = ("revenue", "amount", "value", "payment")


class ReferralImportError(ObservationError):
    """Referral/outcome export failed the privacy or schema contract."""


def _norm_key(key: str | None) -> str:
    return re.sub(r"\s+", " ", (key or "").strip().lower())


def _lookup(row: dict[str, Any], aliases: tuple[str, ...]) -> Any:
    mapped = {_norm_key(k): v for k, v in row.items()}
    for alias in aliases:
        if alias in mapped:
            return mapped[alias]
    return None


def detect_pii(row: dict[str, Any]) -> list[str]:
    hits: list[str] = []
    for key, value in row.items():
        norm = _norm_key(str(key))
        if norm in PII_FIELD_NAMES and value not in (None, ""):
            hits.append(f"field:{norm}")
            continue
        if norm in OPAQUE_ID_FIELDS:
            text = str(value or "")
            if EMAIL_RE.search(text) or CNPJ_RE.search(text):
                hits.append(f"opaque_id_looks_like_pii:{norm}")
            continue
        text = str(value or "")
        if not text:
            continue
        if EMAIL_RE.search(text):
            hits.append("value:email")
        if CNPJ_RE.search(text):
            hits.append("value:cnpj")
        if PHONE_RE.search(text) and norm not in {"landing_page", "page", "url", "path", "referrer", "referer"}:
            hits.append("value:phone")
    # stable unique
    seen: set[str] = set()
    ordered: list[str] = []
    for item in hits:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered


def _decode(path: Path) -> tuple[str, bytes]:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return raw.decode(enc), raw
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace"), raw


def _as_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        if isinstance(payload.get("rows"), list):
            rows = payload["rows"]
        elif isinstance(payload.get("events"), list):
            rows = payload["events"]
        else:
            rows = [payload]
    else:
        raise ReferralImportError(REASON_AMBIGUOUS_FILE)
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            raise ReferralImportError(REASON_AMBIGUOUS_FILE)
        out.append(row)
    return out


def classify_event(row: dict[str, Any]) -> str:
    event = str(_lookup(row, EVENT_ALIASES) or "").strip().lower()
    if event in CANONICAL_COMMERCIAL_EVENTS:
        return "commercial_outcome"
    if event in {"lead", "qualified_lead", "handoff"} or _truthy(_lookup(row, LEAD_ALIASES)):
        return "lead"
    if event in {"cta", "cta_click", "cta_submit"} or _lookup(row, CTA_ALIASES) not in (None, "", False):
        return "cta"
    return "referral"


def _truthy(value: Any) -> bool:
    if value is True:
        return True
    if isinstance(value, str) and value.strip().lower() in {"1", "true", "yes", "sim"}:
        return True
    return False


def has_search_correlation(row: dict[str, Any]) -> bool:
    """Search attribution requires a search fact, not an opaque identity."""
    lead_id = _lookup(row, LEAD_ID_ALIASES)
    for key, value in row.items():
        norm = _norm_key(str(key))
        if value in (None, ""):
            continue
        if norm == "lead_id":
            continue
        if norm in SEARCH_EVIDENCE_FIELDS:
            return True
        if norm in SEARCH_EQUIVALENT_FIELDS and str(value) != str(lead_id or ""):
            return True
    return False


def normalize_row(row: dict[str, Any], *, source_file_hash: str, source_name: str) -> dict[str, Any]:
    pii = detect_pii(row)
    if pii:
        raise ReferralImportError(f"{REASON_PII_REFUSED}:{','.join(pii)}")
    event_type = classify_event(row)
    landing = _lookup(row, LANDING_ALIASES)
    referrer = _lookup(row, REFERRER_ALIASES)
    source = _lookup(row, SOURCE_ALIASES)
    medium = _lookup(row, MEDIUM_ALIASES)
    timestamp = _lookup(row, TIMESTAMP_ALIASES)
    cta = _lookup(row, CTA_ALIASES)
    correlation = _lookup(row, CORR_ALIASES)
    lead_id = _lookup(row, LEAD_ID_ALIASES)
    gclid = _lookup(row, GCLID_ALIASES)
    search_query = _lookup(row, SEARCH_QUERY_ALIASES)
    offer_id = _lookup(row, OFFER_ALIASES)
    revenue = None
    if event_type == "commercial_outcome":
        raw_rev = _lookup(row, REVENUE_ALIASES)
        if raw_rev not in (None, ""):
            try:
                revenue = float(str(raw_rev).replace(",", "."))
            except ValueError as exc:
                raise ReferralImportError(f"unparseable_revenue:{raw_rev}") from exc
    attributed = has_search_correlation(row)
    return {
        "event_type": event_type,
        "landing_page": None if landing in (None, "") else str(landing),
        "referrer": None if referrer in (None, "") else str(referrer),
        "source": None if source in (None, "") else str(source),
        "medium": None if medium in (None, "") else str(medium),
        "timestamp": None if timestamp in (None, "") else str(timestamp),
        "cta": None if cta in (None, "", False) else str(cta),
        "correlation_id": None if correlation in (None, "") else str(correlation),
        "lead_id": None if lead_id in (None, "") else str(lead_id),
        "gclid": None if gclid in (None, "") else str(gclid),
        "gsc_query": None if search_query in (None, "") else str(search_query),
        "offer_id": None if offer_id in (None, "") else str(offer_id),
        "revenue": revenue,
        "attributed_to_search": attributed,
        "source_file_hash": source_file_hash,
        "export_source": source_name,
        "row_hash": sha256_text(json.dumps(row, ensure_ascii=False, sort_keys=True, default=str)),
    }


def row_to_observation(
    row: dict[str, Any],
    *,
    asset_id: str,
    observed_at: str,
) -> dict[str, Any]:
    reasons: list[str] = []
    if row["event_type"] == "lead" and not row["attributed_to_search"]:
        reasons.append(REASON_LEAD_UNATTRIBUTED)
    metrics: dict[str, Any] = {
        "count": 1,
        "attributed_to_search": row["attributed_to_search"],
    }
    if row["event_type"] == "commercial_outcome":
        metrics["revenue"] = row["revenue"]
        if row["revenue"] is None:
            reasons.append("COMMERCIAL_EVENT_WITHOUT_AMOUNT")
    return build_observation(
        asset_id=asset_id,
        observation_type=row["event_type"],
        observed_at=row.get("timestamp") or observed_at,
        source="referral_export",
        status="observed",
        reason_codes=reasons,
        source_file_hash=row.get("source_file_hash"),
        dimensions={
            "landing_page": row.get("landing_page"),
            "referrer": row.get("referrer"),
            "source": row.get("source"),
            "medium": row.get("medium"),
            "cta": row.get("cta"),
            "correlation_id": row.get("correlation_id"),
            "lead_id": row.get("lead_id"),
            "gclid": row.get("gclid"),
            "gsc_query": row.get("gsc_query"),
            "offer_id": row.get("offer_id"),
            "export_source": row.get("export_source"),
            "row_hash": row.get("row_hash"),
            "fact_key": row.get("row_hash"),
        },
        metrics=metrics,
    )


def import_referral_file(
    path: Path,
    *,
    asset_id: str,
    observed_at: str,
) -> list[dict[str, Any]]:
    text, raw = _decode(path)
    digest = sha256_text(raw)
    suffix = path.suffix.lower()
    if suffix == ".json":
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ReferralImportError(REASON_AMBIGUOUS_FILE) from exc
        rows = _as_rows(payload)
    elif suffix in {".csv", ".tsv"}:
        reader = csv.DictReader(text.splitlines())
        if not reader.fieldnames:
            raise ReferralImportError(REASON_AMBIGUOUS_FILE)
        rows = [dict(row) for row in reader]
        if not any(_lookup(row, LANDING_ALIASES + EVENT_ALIASES) for row in rows):
            raise ReferralImportError(REASON_AMBIGUOUS_FILE)
    else:
        raise ReferralImportError(REASON_AMBIGUOUS_FILE)
    observations: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw_row in rows:
        normalized = normalize_row(raw_row, source_file_hash=digest, source_name=path.name)
        if normalized["row_hash"] in seen:
            continue
        seen.add(normalized["row_hash"])
        observations.append(
            row_to_observation(normalized, asset_id=asset_id, observed_at=observed_at)
        )
    return observations
