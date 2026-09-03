"""SELECT-only consume of extra-cli `CONFENGE_LIVE_INTELLIGENCE/1.0`.

Accepts the shipped export layout (manifest.json + opportunities/<id>.json +
companies/<digest>.json, plus the sibling `<out_dir>.private/identity_projection.json`).
Does not crawl, extract or invent facts. extra-cli DATA_* never becomes editorial
INDEX. `catalog_mode=fixture` and fixture-claimed-live payloads are labeled
test-only and cannot reach `PUBLISHABLE_INDEX`.

The production entry point reads one official producer bundle. Missing, invalid
or stale official input FAIL CLOSED: no fixture fallback, no parallel schema, no
per-URL hand edit. The labeled fixture catalog under
`data/live_intelligence/fixtures/` remains an explicit `--source` for tests/dev;
its schema (`confenge-live-intelligence-fixture/1.0`) is structurally rejected
by schema negotiation — a fixture cannot be projected as live even by mistake.

`negotiate_schema` is the single schema authority. `inspect_producer_integrity`,
`index_bars` and `load_export_dir` all read their schema verdict from it, and
`decide` is built from those three, so there is exactly one enforcement path and
no second classifier that could drift from it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, NamedTuple

from scripts.live_intelligence import (
    COMPANIES_OUT,
    COMPANY_FAMILY,
    CONTRACT_VERSION,
    DEFAULT_LIVE_DIR,
    DEFAULT_OFFICIAL_DIR,
    FIXTURE_SCHEMA,
    IDENTITY_PROJECTION_FILE,
    IDENTITY_PROJECTION_SCHEMA,
    LIVE_SCHEMA,
    MAX_AGE_HOURS,
    OPPORTUNITIES_OUT,
    OPPORTUNITY_FAMILY,
    PRAZO_STATUS,
    SOURCE_FIXTURE,
    SOURCE_OFFICIAL_LIVE,
)

INTEGRITY_REASON_CODES = (
    "schema_absent",
    "schema_unsupported",
    "contract_version_unsupported",
    "content_hash_absent",
    "content_hash_mismatch",
    "manifest_hash_mismatch",
    "freshness_absent",
    "freshness_stale",
    "as_of_absent",
    "as_of_unparseable",
    "coverage_absent",
    "source_absent",
    "fixture_as_live",
)

# Reason codes that only hold a payload back until the producer refreshes it.
HOLD_REASON_CODES = frozenset({"freshness_stale"})

# Reasons a payload may render at NOINDEX but can never be promoted to INDEX.
# These are provenance ceilings, not integrity failures.
INDEX_BAR_REASON_CODES = (
    "producer_status_not_official_live",
    "catalog_mode_fixture",
    "fixture_schema",
)

_SCHEMA_1X = re.compile(r"^CONFENGE_LIVE_INTELLIGENCE/1(?:\.\d+)?$")
_CONTRACT_V1 = re.compile(r"^v?1(?:\.\d+){0,2}$")
_DIGEST_RE = re.compile(r"^[0-9a-f]{16}$")
# Producer PNCP opportunity_id values contain `/` (e.g. `<cnpj>-<seq>/<ano>`)
# and are written as nested files. Fixture ids stay hyphenated slugs. `..` and
# leading slashes are refused separately so a nested id cannot traverse.
_OPPORTUNITY_ID_RE = re.compile(
    r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}(?:/[a-zA-Z0-9][a-zA-Z0-9._-]{0,20}){0,3}$"
)
# A company profile is keyed by a consumer-side digest. A raw CNPJ — bare or
# masked — must never survive into the projection, the route or analytics.
_CNPJ_SHAPED = re.compile(r"(?<!\d)\d{14}(?!\d)|\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}")
_CNPJ_KEY = re.compile(r'"[^"]*cnpj[^"]*"\s*:', re.I)


class ConsumeError(ValueError):
    """Malformed or unreadable producer export."""


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def _parse_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ConsumeError(f"unreadable live-intelligence bundle: {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ConsumeError(f"bundle is not an object: {path}")
    return payload


def _rel(path: Path) -> str:
    root = _root()
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def canonical_dumps(payload: Any) -> str:
    """Byte-stable JSON matching extra-cli `canonical_json` / `live_hash`."""
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def envelope_hash(document: dict[str, Any], *, drop: str) -> str:
    """SHA-256 of the document with `drop` and consumer `_` keys stripped."""
    body = {
        key: value
        for key, value in document.items()
        if key != drop and not str(key).startswith("_")
    }
    return hashlib.sha256(canonical_dumps(body).encode("utf-8")).hexdigest()


def content_hash_of(document: dict[str, Any]) -> str:
    """SHA-256 of the document with `content_hash` and consumer `_` keys stripped."""
    return envelope_hash(document, drop="content_hash")


def manifest_hash_of(document: dict[str, Any]) -> str:
    """SHA-256 of the envelope with `manifest_hash` and consumer `_` keys stripped."""
    return envelope_hash(document, drop="manifest_hash")


def sealed_hash_of(document: dict[str, Any]) -> str:
    """SHA-256 of an identity projection with `sealed_hash` stripped."""
    return envelope_hash(document, drop="sealed_hash")


def verify_content_hash(document: dict[str, Any]) -> bool:
    declared = str(document.get("content_hash") or "").strip()
    if not declared:
        return False
    return declared == content_hash_of(document)


def verify_manifest_hash(document: dict[str, Any]) -> bool:
    declared = str(document.get("manifest_hash") or "").strip()
    if not declared:
        return False
    return declared == manifest_hash_of(document)


def verify_sealed_hash(document: dict[str, Any]) -> bool:
    declared = str(document.get("sealed_hash") or "").strip()
    if not declared:
        return False
    return declared == sealed_hash_of(document)


class SchemaNegotiation(NamedTuple):
    """The single answer schema negotiation gives about one declared schema.

    `accepted` is the live-producer verdict: True only for the live family.
    `kind` is the classification (`live`, `fixture`, or None when unusable) and
    is what lets a *labeled* fixture still render at NOINDEX instead of being
    mistaken for a broken payload.
    `reasons` are nominal integrity codes, empty when the schema is usable.
    """

    accepted: bool
    kind: str | None
    reasons: list[str]


def _classify_schema(schema: Any, contract_version: Any) -> tuple[str | None, list[str]]:
    """Internal classifier. Never called directly outside `negotiate_schema`.

    The fixture schema is a *different* schema, not a variant of the live one.
    Keeping the two names disjoint is what makes the fixture bar structural: no
    additive-1.x rule can ever widen into it.
    """
    reasons: list[str] = []
    text = str(schema or "").strip()
    if not text:
        return None, ["schema_absent"]
    if text == FIXTURE_SCHEMA:
        kind = "fixture"
    elif text == LIVE_SCHEMA:
        kind = "live"
    elif text in (OPPORTUNITY_FAMILY, COMPANY_FAMILY):
        kind = "live"
    elif _SCHEMA_1X.fullmatch(text):
        kind = "live"
        reasons.append("schema_additive_1x")
    else:
        return None, ["schema_unsupported"]
    version = str(contract_version or "").strip()
    if version and not _CONTRACT_V1.fullmatch(version):
        return None, ["contract_version_unsupported"]
    return kind, reasons


def negotiate_schema(schema: Any, contract_version: Any = None) -> SchemaNegotiation:
    """The one schema gate. Accepts CONFENGE_LIVE_INTELLIGENCE 1.x as live only.

    Every consumer decision that depends on a declared schema —
    `inspect_producer_integrity`, `index_bars`, `load_export_dir` and therefore
    `decide` — reads its answer from here and nowhere else. There is deliberately
    no second classifier to drift from it.

    The fixture schema is outside the live family, so a fixture catalog can never
    be negotiated as a live producer export (`accepted is False`), while still
    being classified (`kind == "fixture"`) so it can render at NOINDEX behind the
    `fixture_schema` index bar.
    """
    kind, reasons = _classify_schema(schema, contract_version)
    return SchemaNegotiation(accepted=kind == "live", kind=kind, reasons=reasons)


def catalog_mode_of(payload: dict[str, Any]) -> str:
    raw = str(payload.get("catalog_mode") or "").strip()
    return raw or "fixture"


def claimed_live_of(payload: dict[str, Any]) -> bool:
    return bool(payload.get("claimed_live"))


def is_fixture_catalog(payload: dict[str, Any]) -> bool:
    mode = catalog_mode_of(payload)
    if mode in {"fixture", "offline_catalog"}:
        return True
    if payload.get("test_only") is True or payload.get("never_index") is True:
        return True
    return "fixture" in str(payload.get("schema") or "").lower()


def fixture_as_live(payload: dict[str, Any]) -> bool:
    if "fixture_as_live" in (payload.get("reason_codes") or []):
        return True
    return claimed_live_of(payload) and is_fixture_catalog(payload)


def producer_status_of(payload: dict[str, Any]) -> str:
    raw = payload.get("producer_status")
    if raw is not None and str(raw).strip():
        return str(raw).strip()
    return catalog_mode_of(payload)


def official_live_declared(payload: dict[str, Any]) -> bool:
    """True only when the producer explicitly marks official_live. Fixtures never qualify."""
    if is_fixture_catalog(payload) or fixture_as_live(payload):
        return False
    return payload.get("official_live") is True


def source_kind_of(payload: dict[str, Any]) -> str:
    if fixture_as_live(payload) or is_fixture_catalog(payload):
        return SOURCE_FIXTURE
    if payload.get("official_live") is False:
        return SOURCE_FIXTURE
    if producer_status_of(payload) != SOURCE_OFFICIAL_LIVE:
        return SOURCE_FIXTURE
    if not official_live_declared(payload):
        return SOURCE_FIXTURE
    return SOURCE_OFFICIAL_LIVE


def data_state_of(payload: dict[str, Any]) -> str | None:
    raw = payload.get("data_state") or payload.get("publication_readiness")
    text = str(raw or "").strip()
    return text or None


def _parse_instant(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def freshness_of(payload: dict[str, Any]) -> dict[str, Any]:
    raw = payload.get("freshness") if isinstance(payload.get("freshness"), dict) else {}
    return {
        "source_as_of": str(raw.get("source_as_of") or payload.get("as_of") or "").strip(),
        "generated_at": str(raw.get("generated_at") or payload.get("generated_at") or "").strip(),
        "max_age_hours": raw.get("max_age_hours") or MAX_AGE_HOURS,
    }


def _has_coverage(payload: dict[str, Any]) -> bool:
    coverage = payload.get("coverage")
    if coverage in (None, "", {}, []):
        return False
    if isinstance(coverage, dict):
        return any(value not in (None, "", [], {}) for value in coverage.values())
    if isinstance(coverage, list):
        return bool(coverage)
    return bool(str(coverage).strip())


def _source_item_citable(item: dict[str, Any]) -> bool:
    return bool(
        item.get("url")
        or item.get("document_id")
        or item.get("link_edital")
        or item.get("source_id")
        or item.get("nome")
        or item.get("name")
        or item.get("sistema")
    )


def _has_source(payload: dict[str, Any]) -> bool:
    """A public fact without a citable source is not publishable."""
    if payload.get("link_edital") or payload.get("source_id"):
        return True
    sources = payload.get("fonte") or payload.get("sources") or payload.get("official_refs")
    if isinstance(sources, list):
        for item in sources:
            if isinstance(item, dict) and _source_item_citable(item):
                return True
            if isinstance(item, str) and item.strip():
                return True
    if isinstance(sources, dict):
        return _source_item_citable(sources)
    return False


def _requires_citable_source(payload: dict[str, Any]) -> bool:
    """Company-fit records cite provenance at the envelope, not per file.

    extra-cli #539 company payloads have no `fonte`; requiring one would reject
    every real company file. Opportunity records and the envelope still must
    name a citable source.
    """
    schema = str(payload.get("schema") or "").strip()
    if schema == COMPANY_FAMILY:
        return False
    return True


def freshness_reasons(payload: dict[str, Any]) -> list[str]:
    """Freshness is a declared producer clock, never wall-clock."""
    reasons: list[str] = []
    fresh = freshness_of(payload)
    source_as_of = fresh["source_as_of"]
    if not source_as_of:
        return ["freshness_absent", "as_of_absent"]
    parsed_as_of = _parse_instant(source_as_of)
    if parsed_as_of is None:
        return ["as_of_unparseable"]
    generated_at = _parse_instant(fresh["generated_at"])
    if generated_at is None:
        reasons.append("freshness_absent")
        return reasons
    try:
        max_age = float(fresh["max_age_hours"])
    except (TypeError, ValueError):
        max_age = float(MAX_AGE_HOURS)
    age_hours = (generated_at - parsed_as_of).total_seconds() / 3600.0
    if age_hours > max_age or age_hours < 0:
        reasons.append("freshness_stale")
    return reasons


def _payload_hash_reasons(payload: dict[str, Any]) -> list[str]:
    """Record files carry `content_hash`; the envelope carries `manifest_hash`.

    extra-cli #539 never puts `content_hash` on the manifest. Requiring it would
    reject every real bundle. A payload with neither hash is still absent.
    """
    if str(payload.get("content_hash") or "").strip():
        if payload.get("_content_hash_ok") is False:
            return ["content_hash_mismatch"]
        if payload.get("_content_hash_ok") is not True and not verify_content_hash(payload):
            return ["content_hash_mismatch"]
        return []
    if str(payload.get("manifest_hash") or "").strip():
        if not verify_manifest_hash(payload):
            return ["manifest_hash_mismatch"]
        return []
    return ["content_hash_absent"]


def _envelope_hash_reasons(manifest: dict[str, Any]) -> list[str]:
    if str(manifest.get("manifest_hash") or "").strip():
        if not verify_manifest_hash(manifest):
            return ["manifest_hash_mismatch"]
        return []
    declared = str(manifest.get("content_hash") or "").strip()
    if declared and not verify_content_hash(manifest):
        return ["manifest_hash_mismatch"]
    return []


def inspect_producer_integrity(
    payload: dict[str, Any],
    *,
    manifest: dict[str, Any] | None = None,
) -> list[str]:
    """Nominal reason codes for missing schema/hash/freshness/coverage/source.

    Never invents a field and never repairs one. A payload that cannot prove its
    own integrity stays out of the projection.
    """
    reasons: list[str] = []
    negotiated = negotiate_schema(payload.get("schema"), payload.get("contract_version"))
    if negotiated.kind is None:
        reasons.extend(negotiated.reasons)
    reasons.extend(_payload_hash_reasons(payload))
    if manifest is not None and manifest is not payload:
        reasons.extend(_envelope_hash_reasons(manifest))
    reasons.extend(freshness_reasons(payload))
    if not _has_coverage(payload):
        reasons.append("coverage_absent")
    if _requires_citable_source(payload) and not _has_source(payload):
        reasons.append("source_absent")
    if fixture_as_live(payload):
        # A fixture that claims to be live is not a labeling slip; it is a lie
        # about provenance, so it is rejected outright rather than downgraded.
        reasons.append("fixture_as_live")
    if payload.get("_schema_ok") is False:
        reasons.append("schema_unsupported")
    return sorted({code for code in reasons if code in INTEGRITY_REASON_CODES})


def index_bars(payload: dict[str, Any]) -> list[str]:
    """Reasons this payload may be projected but never promoted to INDEX.

    Separate from integrity: a labeled fixture is *honest* data with a known
    provenance ceiling. It renders in dev and in tests at NOINDEX and stops
    there.
    """
    bars: list[str] = []
    status = producer_status_of(payload)
    if status and status != SOURCE_OFFICIAL_LIVE:
        bars.append("producer_status_not_official_live")
    if is_fixture_catalog(payload):
        bars.append("catalog_mode_fixture")
    if negotiate_schema(payload.get("schema"), payload.get("contract_version")).kind == "fixture":
        bars.append("fixture_schema")
    return sorted(set(bars))


def decide(payload: dict[str, Any], *, manifest: dict[str, Any] | None = None) -> dict[str, Any]:
    """Fail-closed editorial decision for one payload.

    READY means the payload may be projected. It is never permission to index:
    W1 renders every live-intelligence surface noindex.
    """
    reasons = inspect_producer_integrity(payload, manifest=manifest)
    bars = index_bars(payload)
    state = data_state_of(payload)
    source_kind = source_kind_of(payload)
    base = {
        "reason_codes": reasons,
        "index_bars": bars,
        "data_state": state,
        "source_kind": source_kind,
        # W1 ships every live-intelligence surface noindex. Nothing in this
        # module may return True: INDEX needs a declared public family plus the
        # full editorial gate, and W1 declares none.
        "index_eligible": False,
    }
    if state and state != "DATA_READY":
        return {
            **base,
            "state": "HOLD_FOR_DATA" if state == "DATA_HOLD" else "REJECT",
            "ready": False,
        }
    if reasons:
        hold_only = set(reasons) <= HOLD_REASON_CODES
        return {
            **base,
            "state": "HOLD_FOR_DATA" if hold_only else "REJECT",
            "ready": False,
        }
    # DATA_READY is not INDEX. READY here only means "may be projected".
    return {**base, "state": "PUBLISHABLE_NOINDEX", "ready": True}


def _looks_export_dir(path: Path) -> bool:
    return path.is_dir() and (path / "manifest.json").is_file()


def identity_projection_path_for(export_dir: Path) -> Path:
    """Producer writes identity as a SIBLING `<name>.private/`, never a child."""
    return export_dir.parent / f"{export_dir.name}.private" / IDENTITY_PROJECTION_FILE


def _contained_file(root: Path, rel: str) -> Path:
    """Resolve `rel` under `root`. Refuse path traversal."""
    candidate = (root / rel).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as exc:
        raise ConsumeError(f"record path escapes export dir: {rel}") from exc
    return candidate


def load_identity_projection(export_dir: Path, *, manifest_hash: str = "") -> dict[str, Any] | None:
    """Load the sibling identity projection. Absent is None; invalid is fail-closed."""
    path = identity_projection_path_for(export_dir)
    if not path.is_file():
        return None
    payload = _parse_json(path)
    if str(payload.get("schema") or "") != IDENTITY_PROJECTION_SCHEMA:
        raise ConsumeError(f"identity projection schema unsupported: {path}")
    if not verify_sealed_hash(payload):
        raise ConsumeError(f"identity projection sealed_hash mismatch: {path}")
    if manifest_hash and str(payload.get("sealed_to_manifest_hash") or "") != manifest_hash:
        raise ConsumeError(f"identity projection is not sealed to this manifest: {path}")
    entries = payload.get("entries")
    if not isinstance(entries, list):
        raise ConsumeError(f"identity projection entries missing: {path}")
    return payload


def load_export_dir(path: Path) -> dict[str, Any]:
    """Load a producer export directory: manifest.json + records under their family dirs."""
    resolved = path if path.is_absolute() else _root() / path
    if not _looks_export_dir(resolved):
        raise ConsumeError(f"not a live-intelligence export dir: {resolved}")
    manifest = _parse_json(resolved / "manifest.json")
    manifest["_source_path"] = _rel(resolved)
    negotiated = negotiate_schema(manifest.get("schema"), manifest.get("contract_version"))
    schema_ok = negotiated.kind is not None
    manifest["_schema_ok"] = schema_ok
    manifest["_schema_kind"] = negotiated.kind
    manifest["_schema_negotiated_live"] = negotiated.accepted
    manifest["_schema_reasons"] = list(negotiated.reasons)
    schema_reasons = negotiated.reasons
    envelope_hash_ok = (
        verify_manifest_hash(manifest)
        if str(manifest.get("manifest_hash") or "").strip()
        else (not str(manifest.get("content_hash") or "").strip() or verify_content_hash(manifest))
    )
    manifest["_manifest_hash_ok"] = envelope_hash_ok

    def _load(entries: Any, default_dir: str, key: str) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for entry in entries or []:
            if not isinstance(entry, dict):
                continue
            record_id = str(entry.get(key) or entry.get("id") or "")
            rel = entry.get("file") or entry.get("path") or (f"{default_dir}/{record_id}.json" if record_id else "")
            if not rel:
                continue
            record_path = _contained_file(resolved, str(rel))
            if not record_path.is_file():
                raise ConsumeError(f"missing live-intelligence record: {record_path}")
            record = _parse_json(record_path)
            record["_content_hash_ok"] = (
                not record.get("content_hash") or verify_content_hash(record)
            )
            record["_schema_ok"] = schema_ok
            record["_schema_reasons"] = list(schema_reasons)
            record.setdefault(key, record_id)
            record.setdefault("catalog_mode", catalog_mode_of(manifest))
            record.setdefault("producer_status", producer_status_of(manifest))
            if "official_live" not in record and "official_live" in manifest:
                record["official_live"] = manifest.get("official_live")
            # Producer #539 does not emit claimed_live. Do not invent True.
            if "claimed_live" in manifest:
                record.setdefault("claimed_live", claimed_live_of(manifest))
            record["_manifest_entry"] = entry
            out.append(record)
        return out

    identity = load_identity_projection(
        resolved,
        manifest_hash=str(manifest.get("manifest_hash") or ""),
    )

    return {
        "schema": str(manifest.get("schema") or ""),
        "manifest": manifest,
        "catalog_mode": catalog_mode_of(manifest),
        "claimed_live": claimed_live_of(manifest),
        "generated_at": manifest.get("generated_at"),
        "source_as_of": manifest.get("source_as_of"),
        "opportunities": _load(
            manifest.get("opportunities") or (manifest.get("index") or {}).get("opportunities"),
            "opportunities",
            "opportunity_id",
        ),
        "companies": _load(
            manifest.get("companies") or (manifest.get("index") or {}).get("companies"),
            "companies",
            "company_digest",
        ),
        "_source_path": _rel(resolved),
        "_source_kind": source_kind_of(manifest),
        "_identity_projection": identity,
        "_identity_projection_path": (
            _rel(identity_projection_path_for(resolved)) if identity is not None else None
        ),
    }


def _text(value: Any) -> str:
    return str(value or "").strip()


def _unknown(value: Any) -> str:
    """Absence of evidence stays UNKNOWN. It is never rendered as zero or blank."""
    text = _text(value)
    return text or "UNKNOWN"


def assert_safe_opportunity_id(opportunity_id: str) -> str:
    """Accept producer PNCP ids (including `/`) and refuse path traversal."""
    text = _text(opportunity_id)
    if not text or ".." in text or text.startswith("/") or "\\" in text:
        raise ConsumeError(f"unsafe opportunity_id: {opportunity_id!r}")
    if not _OPPORTUNITY_ID_RE.fullmatch(text):
        raise ConsumeError(f"unsafe opportunity_id: {opportunity_id!r}")
    return text


def _fonte_items(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalize producer object-shaped `fonte` and fixture list-shaped `fonte`."""
    raw = record.get("fonte")
    items: list[dict[str, Any]]
    if isinstance(raw, dict):
        items = [raw]
    elif isinstance(raw, list):
        items = [item for item in raw if isinstance(item, dict)]
    else:
        items = []
    out: list[dict[str, Any]] = []
    for item in items:
        url = _text(item.get("url") or item.get("link_edital"))
        nome = _text(item.get("nome") or item.get("name") or item.get("sistema"))
        source_id = _text(item.get("source_id"))
        if not (url or nome or source_id):
            continue
        row = {
            "nome": nome,
            "url": url,
            "url_status": _unknown(item.get("url_status")),
            "retrieved_at": _unknown(item.get("retrieved_at")),
        }
        if source_id:
            row["source_id"] = source_id
        out.append(row)
    return out


def _valor_amount(valor: dict[str, Any]) -> Any:
    if valor.get("estimado_brl") not in (None, ""):
        return valor.get("estimado_brl")
    return valor.get("amount_brl")


def project_opportunity(record: dict[str, Any]) -> dict[str, Any]:
    """Consumer-bound projection of one `live-opportunity/1.0` record."""
    opportunity_id = assert_safe_opportunity_id(_text(record.get("opportunity_id")))
    valor = record.get("valor") if isinstance(record.get("valor"), dict) else {}
    orgao = record.get("orgao") if isinstance(record.get("orgao"), dict) else {}
    local = record.get("local") if isinstance(record.get("local"), dict) else {}
    prazo = record.get("prazo") if isinstance(record.get("prazo"), dict) else {}
    status = _text(prazo.get("status")).upper()
    fresh = freshness_of(record)
    amount = _valor_amount(valor)
    epistemic = valor.get("epistemic_class") or (record.get("epistemic_classes") or {}).get(
        "valor.estimado_brl"
    )
    valor_out: dict[str, Any] = {
        # Declared public estimate carried by the source document. Not a
        # CONFENGE price: the renderer never puts a commitment word near it.
        "amount_brl": amount,
        "basis": _unknown(valor.get("basis")),
        "epistemic_class": _unknown(epistemic),
    }
    if "estimado_brl" in valor or "faixa" in valor:
        valor_out["estimado_brl"] = amount
        valor_out["faixa"] = valor.get("faixa")
        if "estado" in valor:
            valor_out["estado"] = valor.get("estado")
    orgao_out: dict[str, Any] = {
        "nome": _unknown(orgao.get("nome")),
        "esfera": _unknown(orgao.get("esfera")),
        "uf": _unknown(orgao.get("uf")),
    }
    if "cnpj" in orgao:
        # Contracting-body CNPJ is public source data on the opportunity, not
        # a company identity key. Never copied onto a company projection.
        orgao_out["cnpj"] = orgao.get("cnpj")
        orgao_out["estado"] = _unknown(orgao.get("estado"))
    prazo_out: dict[str, Any] = {
        "status": status if status in PRAZO_STATUS else "UNKNOWN",
        "data_sessao": _unknown(prazo.get("data_sessao") or prazo.get("data_encerramento")),
    }
    if "data_encerramento" in prazo:
        prazo_out["data_encerramento"] = _unknown(prazo.get("data_encerramento"))
    if "data_publicacao" in prazo:
        prazo_out["data_publicacao"] = _unknown(prazo.get("data_publicacao"))
    return {
        "family": OPPORTUNITY_FAMILY,
        "opportunity_id": opportunity_id,
        "route": f"/oportunidades/{opportunity_id}/",
        "objeto": _text(record.get("objeto")),
        "valor": valor_out,
        "orgao": orgao_out,
        "local": {
            "municipio": _unknown(local.get("municipio")),
            "uf": _unknown(local.get("uf")),
        },
        "prazo": prazo_out,
        "fonte": _fonte_items(record),
        "as_of": fresh["source_as_of"],
        "freshness": fresh,
        "coverage": record.get("coverage"),
        "limitations": [_text(item) for item in record.get("limitations") or [] if _text(item)],
        "epistemic_classes": record.get("epistemic_classes") or {},
        "data_state": data_state_of(record),
        "content_hash": _text(record.get("content_hash")),
    }


def _assert_company_record_has_no_cnpj(record: dict[str, Any], digest: str) -> None:
    """A company profile must never carry a raw CNPJ or a `cnpj` key.

    PNCP `opportunity_id` values embed a 14-digit source id (`<cnpj>-<seq>/<ano>`).
    Those are opportunity keys, not company identity, and are skipped.
    """

    def walk(obj: Any) -> None:
        if isinstance(obj, dict):
            for key, value in obj.items():
                if re.search(r"cnpj", str(key), re.I):
                    raise ConsumeError(f"company record carries a raw CNPJ or a cnpj key: {digest}")
                if key == "opportunity_id":
                    continue
                walk(value)
            return
        if isinstance(obj, list):
            for item in obj:
                walk(item)
            return
        if isinstance(obj, str) and (_CNPJ_SHAPED.search(obj) or _CNPJ_KEY.search(obj)):
            raise ConsumeError(f"company record carries a raw CNPJ or a cnpj key: {digest}")

    public = {key: value for key, value in record.items() if not str(key).startswith("_")}
    walk(public)


def project_company(record: dict[str, Any]) -> dict[str, Any]:
    """Consumer-bound projection of one `company-fit-profile/1.0` record.

    The key is the consumer-side CNPJ digest. A raw CNPJ never enters the
    projection, the route or an analytics payload.
    """
    digest = _text(record.get("company_digest")).lower()
    if not _DIGEST_RE.fullmatch(digest):
        raise ConsumeError(f"company_digest is not a 16-hex digest: {digest!r}")
    _assert_company_record_has_no_cnpj(record, digest)
    perfil = record.get("perfil") if isinstance(record.get("perfil"), dict) else {}
    fresh = freshness_of(record)
    # Only keys the producer actually declared. Filling fixture fields such as
    # natureza on a #539 company invents UNKNOWN and that token then leaks into
    # visible CNPJ copy.
    perfil_out: dict[str, Any] = {}
    for key in ("natureza", "porte_declarado", "primeiro_contrato_publico", "razao_social", "contratacao_mais_recente"):
        if key in perfil:
            perfil_out[key] = _unknown(perfil.get(key))
    for key in ("contratos_publicos_declarados", "contratos_observados"):
        if key in perfil:
            perfil_out[key] = perfil.get(key)
    compradores: list[str] = []
    for item in record.get("compradores") or []:
        if isinstance(item, dict):
            buyer = _text(item.get("buyer_digest")).lower()
            if not buyer:
                continue
            if not _DIGEST_RE.fullmatch(buyer):
                raise ConsumeError(f"buyer_digest is not a 16-hex digest: {buyer!r}")
            compradores.append(buyer)
        else:
            text = _text(item)
            if text:
                compradores.append(text)
    gaps: list[str] = []
    for item in record.get("gaps") or []:
        if isinstance(item, dict):
            oid = _text(item.get("opportunity_id"))
            dims = [
                _text(dim)
                for dim in item.get("dimensoes_sem_correspondencia") or []
                if _text(dim)
            ]
            if oid and dims:
                gaps.append(f"{oid}: {', '.join(dims)}")
            elif oid:
                gaps.append(oid)
            elif dims:
                gaps.append(", ".join(dims))
        else:
            text = _text(item)
            if text:
                gaps.append(text)
    return {
        "family": COMPANY_FAMILY,
        "company_digest": digest,
        "perfil": perfil_out,
        "categorias": [_text(item) for item in record.get("categorias") or [] if _text(item)],
        "faixas": [_text(item) for item in record.get("faixas") or [] if _text(item)],
        "geografias": [_text(item) for item in record.get("geografias") or [] if _text(item)],
        "compradores": compradores,
        "oportunidades_aderentes": [
            {
                "opportunity_id": _text(item.get("opportunity_id")),
                "dimensoes": [
                    _text(dim)
                    for dim in (item.get("dimensoes") or item.get("matched_dimensions") or [])
                    if _text(dim)
                ],
            }
            for item in record.get("oportunidades_aderentes") or []
            if isinstance(item, dict) and _text(item.get("opportunity_id"))
        ],
        "gaps": gaps,
        "unknowns": [_text(item) for item in record.get("unknowns") or [] if _text(item)],
        "as_of": fresh["source_as_of"],
        "freshness": fresh,
        "coverage": record.get("coverage"),
        "limitations": [_text(item) for item in record.get("limitations") or [] if _text(item)],
        "data_state": data_state_of(record),
        "content_hash": _text(record.get("content_hash")),
    }


def build_projection(bundle: dict[str, Any]) -> dict[str, Any]:
    """Split a loaded export into READY projections and rejected records."""
    manifest = bundle.get("manifest") or {}
    source_kind = source_kind_of(manifest)
    opportunities: list[dict[str, Any]] = []
    companies: dict[str, dict[str, Any]] = {}
    rejected: list[dict[str, Any]] = []

    for record in bundle.get("opportunities") or []:
        decision = decide(record, manifest=manifest)
        if not decision["ready"]:
            rejected.append(
                {
                    "family": OPPORTUNITY_FAMILY,
                    "id": _text(record.get("opportunity_id")),
                    "state": decision["state"],
                    "reason_codes": decision["reason_codes"],
                }
            )
            continue
        projected = project_opportunity(record)
        projected["publication_state"] = decision["state"]
        projected["source_kind"] = decision["source_kind"]
        projected["index_bars"] = decision["index_bars"]
        projected["index_eligible"] = False
        opportunities.append(projected)

    for record in bundle.get("companies") or []:
        decision = decide(record, manifest=manifest)
        if not decision["ready"]:
            rejected.append(
                {
                    "family": COMPANY_FAMILY,
                    "id": _text(record.get("company_digest")),
                    "state": decision["state"],
                    "reason_codes": decision["reason_codes"],
                }
            )
            continue
        projected = project_company(record)
        projected["publication_state"] = decision["state"]
        projected["source_kind"] = decision["source_kind"]
        projected["index_bars"] = decision["index_bars"]
        projected["index_eligible"] = False
        companies[projected["company_digest"]] = projected

    ready_ids = {item["opportunity_id"] for item in opportunities}
    for profile in companies.values():
        # An adherence row pointing at a non-READY opportunity is dropped rather
        # than rendered: the consumer never shows a fact it cannot cite.
        profile["oportunidades_aderentes"] = [
            row for row in profile["oportunidades_aderentes"]
            if row["opportunity_id"] in ready_ids
        ]

    projection = {
        "schema": LIVE_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "source_kind": source_kind,
        "source_path": bundle.get("_source_path"),
        "catalog_mode": bundle.get("catalog_mode"),
        "generated_at": bundle.get("generated_at"),
        "source_as_of": bundle.get("source_as_of"),
        # A fixture-sourced projection can never be promoted to INDEX. The flag
        # is written into the artifact so a downstream renderer cannot lose it.
        "index_eligible": False,
        "opportunities": sorted(opportunities, key=lambda item: item["opportunity_id"]),
        "companies": companies,
        "rejected": sorted(rejected, key=lambda item: (item["family"], item["id"])),
    }
    _assert_no_company_ref(projection)
    return projection


def _assert_no_company_ref(payload: Any) -> None:
    """company_ref is private identity. It never enters a public projection."""
    blob = json.dumps(payload, ensure_ascii=False)
    if "company_ref" in blob:
        raise ConsumeError("company_ref leaked into public projection")


def write_projection(projection: dict[str, Any], out_dir: Path | None = None) -> list[Path]:
    """Write the validated projection the runtime function and renderer read."""
    target = out_dir or (_root() / DEFAULT_LIVE_DIR)
    target.mkdir(parents=True, exist_ok=True)
    common = {
        "schema": projection["schema"],
        "contract_version": projection["contract_version"],
        "source_kind": projection["source_kind"],
        "source_path": projection["source_path"],
        "catalog_mode": projection["catalog_mode"],
        "generated_at": projection["generated_at"],
        "source_as_of": projection["source_as_of"],
        "index_eligible": False,
    }
    opportunities_path = target / OPPORTUNITIES_OUT
    companies_path = target / COMPANIES_OUT
    opportunities_path.write_text(
        json.dumps(
            {**common, "opportunities": projection["opportunities"], "rejected": projection["rejected"]},
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    companies_path.write_text(
        json.dumps(
            {**common, "companies": projection["companies"]},
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    return [opportunities_path, companies_path]


def assert_official_bundle(bundle: dict[str, Any]) -> None:
    """Production consume: fixture is not a silent fallback."""
    manifest = bundle.get("manifest") or {}
    if is_fixture_catalog(manifest) or source_kind_of(manifest) != SOURCE_OFFICIAL_LIVE:
        raise ConsumeError(
            "official live bundle required; refusing fixture fallback"
        )
    reasons = inspect_producer_integrity(manifest, manifest=manifest)
    if reasons:
        raise ConsumeError(f"official bundle rejected: {','.join(reasons)}")


def consume(
    source: Path | None = None,
    out_dir: Path | None = None,
    *,
    require_official: bool | None = None,
) -> dict[str, Any]:
    """Load one producer export and project it.

    With no `source`, the official input dir is required and FAIL CLOSED when
    absent, invalid or stale. The fixture catalog is consumed only when the
    caller passes it explicitly.
    """
    del out_dir  # write path is owned by write_projection / main --write
    if source is None:
        source = Path(DEFAULT_OFFICIAL_DIR)
        if require_official is None:
            require_official = True
    bundle = load_export_dir(source)
    if require_official:
        assert_official_bundle(bundle)
    return build_projection(bundle)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Consume CONFENGE_LIVE_INTELLIGENCE/1.0 (SELECT-only).")
    parser.add_argument(
        "--source",
        default=None,
        help="producer export directory (default: official; fixture must be passed explicitly)",
    )
    parser.add_argument("--out", default=DEFAULT_LIVE_DIR, help="validated projection directory")
    parser.add_argument("--write", action="store_true", help="write the projection to --out")
    args = parser.parse_args(argv)
    explicit_source = Path(args.source) if args.source else None
    try:
        projection = consume(explicit_source, require_official=explicit_source is None)
    except ConsumeError as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                    "source_kind": None,
                    "index_eligible": False,
                    "official_live": False,
                },
                ensure_ascii=False,
            )
        )
        return 1
    if args.write:
        if projection["source_kind"] == SOURCE_OFFICIAL_LIVE and projection["index_eligible"] is not False:
            print(json.dumps({"ok": False, "error": "refusing to write an index-eligible projection"}))
            return 1
        written = write_projection(projection, _root() / args.out)
        for path in written:
            print(f"wrote {_rel(path)}")
    print(
        json.dumps(
            {
                "source_kind": projection["source_kind"],
                "index_eligible": projection["index_eligible"],
                "opportunities_ready": len(projection["opportunities"]),
                "companies_ready": len(projection["companies"]),
                "rejected": projection["rejected"],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
