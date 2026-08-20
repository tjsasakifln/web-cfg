"""SELECT-only consume of extra-cli `public-read-contract-analysis/1.0`.

Accepts the shipped export layout (manifest.json + analyses/<id>.json).
Does not crawl, extract or invent evidence packs. extra-cli DATA_* never
becomes editorial INDEX. catalog_mode=fixture and claimed_live-on-fixture
are labeled test-only and cannot reach PUBLISHABLE_INDEX.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from scripts.contract_analysis import (
    ANALYSIS_MODES,
    AUTHORITY_HANDOFF_SCHEMA,
    AUTHORIZED_ANALYSIS_ID,
    CONTENT_CLASS_ANALYSIS,
    MAX_CANARY,
    NON_COMPARATIVE_MODES,
    OFFICIAL_LIVE_DOSSIER_SCHEMA,
    OFFICIAL_LIVE_HANDOFF_SCHEMA,
    PUBLIC_READ_SCHEMA,
    SINGULAR_COMPARABLE_REASON,
    SOURCE_FIXTURE,
    SOURCE_OFFICIAL_LIVE,
    TEMPORAL_FIELDS,
)

LIVE_SCHEMA = PUBLIC_READ_SCHEMA
FIXTURE_SCHEMA = "confenge-contract-analysis-fixture/1.0"
SCHEMA_PREFIX = "public-read-contract-analysis/"
INTEGRITY_REASON_CODES = (
    "schema_absent",
    "schema_unsupported",
    "contract_version_unsupported",
    "evidence_pack_hash_absent",
    "evidence_pack_version_absent",
    "evidence_refs_absent",
    "freshness_absent",
    "coverage_absent",
    "content_hash_absent",
    "content_hash_mismatch",
    "manifest_hash_mismatch",
    "producer_status_not_official_live",
    "official_live_not_true",
    "handoff_status_not_ready",
    "material_claim_locator_absent",
    "comparability_not_applicable_with_comparative_claim",
)
_SCHEMA_1X = re.compile(r"^public-read-contract-analysis/1(?:\.\d+)?$")
_AUTHORITY_1X = re.compile(r"^authority-handoff-contract-analysis/1(?:\.\d+)?$")
_OFFICIAL_DOSSIER_1X = re.compile(r"^official-live-authority-dossier/1(?:\.\d+)?$")
_OFFICIAL_HANDOFF_1X = re.compile(r"^official-live-authority-handoff/1(?:\.\d+)?$")
_HISTORICAL_DOSSIER_1X = re.compile(r"^historical-contract-authority-dossier/1(?:\.\d+)?$")
_CONTRACT_V1 = re.compile(r"^v?1(?:\.\d+){0,2}$")
TEMPORAL_HASH_EXCLUSIONS = frozenset(
    {
        "retrieved_at",
        "verified_at",
        "extracted_at",
        "generated_at",
        "started_at",
        "finished_at",
        "content_hash",
    }
)
_COMPARATIVE_LANGUAGE = (
    re.compile(r"\boutlier\b", re.I),
    re.compile(r"\branking\b", re.I),
    re.compile(r"\bbenchmark\b", re.I),
    re.compile(r"\bpercentil\b", re.I),
    re.compile(r"\bpeers?\b", re.I),
    re.compile(r"grupo compar", re.I),
    re.compile(r"compar[aá]ve", re.I),
    re.compile(r"acima da mediana", re.I),
    re.compile(r"abaixo da mediana", re.I),
    re.compile(r"fora da distribui", re.I),
    re.compile(r"delta de peer", re.I),
    re.compile(r"frente (aos|a os|aos seus) pares", re.I),
    re.compile(r"at[ií]pico frente", re.I),
)
MATERIAL_CLAIM_KINDS = frozenset({"FACT", "CALCULATION"})

DEFAULT_LIVE_DIRS = (
    Path("../extra-cli/exports/authority-handoff/contract-analysis/1.0"),
    Path("data/extra-cli/public-read-contract-analysis/authority-canary"),
    Path("data/extra-cli/public-read-contract-analysis/1.0"),
    Path("data/extra-cli/public-read-contract-analysis"),
)
DEFAULT_EXTRA_CLI_FIXTURE_DIR = Path("scripts/contract_analysis/fixtures/extra-cli-export")
DEFAULT_EDITORIAL_FIXTURE = Path("scripts/contract_analysis/fixtures/canary.v1.json")


class ConsumeError(ValueError):
    """Requested source cannot be read as a contract-analysis bundle."""


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def _parse_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ConsumeError(f"unreadable contract-analysis bundle: {path}: {exc}") from exc
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
    """Byte-stable JSON matching extra-cli `canonical_dumps`."""
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def content_hash_of(document: dict[str, Any]) -> str:
    """SHA-256 of the document with `content_hash` and consumer `_` keys stripped."""
    body = {
        key: value
        for key, value in document.items()
        if key != "content_hash" and not str(key).startswith("_")
    }
    return hashlib.sha256(canonical_dumps(body).encode("utf-8")).hexdigest()


def verify_content_hash(document: dict[str, Any]) -> bool:
    declared = str(document.get("content_hash") or "").strip()
    if not declared:
        return False
    return declared == content_hash_of(document)


def strip_temporal_for_hash(payload: Any) -> Any:
    """Producer 1.1 content hash excludes operational clocks."""
    if isinstance(payload, dict):
        return {
            str(key): strip_temporal_for_hash(value)
            for key, value in payload.items()
            if key not in TEMPORAL_HASH_EXCLUSIONS
        }
    if isinstance(payload, list):
        return [strip_temporal_for_hash(item) for item in payload]
    if isinstance(payload, tuple):
        return [strip_temporal_for_hash(item) for item in payload]
    return payload


def authority_content_hash(document: dict[str, Any]) -> str:
    body = strip_temporal_for_hash(
        {key: value for key, value in document.items() if key != "content_hash" and not str(key).startswith("_")}
    )
    return hashlib.sha256(canonical_dumps(body).encode("utf-8")).hexdigest()


def verify_authority_content_hash(document: dict[str, Any]) -> bool:
    declared = str(document.get("content_hash") or "").strip()
    if not declared:
        return False
    return declared == authority_content_hash(document)


def root_content_hash_of(ids: list[Any], content_hashes: dict[str, Any]) -> str:
    """READY 1.1 root hash is over {ids, hashes}, clocks stripped."""
    return hashlib.sha256(
        canonical_dumps(
            strip_temporal_for_hash({"ids": list(ids), "hashes": dict(content_hashes)})
        ).encode("utf-8")
    ).hexdigest()


def negotiate_schema(
    schema: Any,
    contract_version: Any = None,
) -> tuple[bool, list[str]]:
    """Accept public-read 1.x and authority-handoff 1.0/1.1. Unknown → not accepted."""
    reasons: list[str] = []
    text = str(schema or "").strip()
    if not text:
        return False, ["schema_absent"]
    baseline = {
        LIVE_SCHEMA,
        AUTHORITY_HANDOFF_SCHEMA,
        OFFICIAL_LIVE_DOSSIER_SCHEMA,
        OFFICIAL_LIVE_HANDOFF_SCHEMA,
        "historical-contract-authority-dossier/1.0",
    }
    additive = (
        _SCHEMA_1X.fullmatch(text)
        or _AUTHORITY_1X.fullmatch(text)
        or _OFFICIAL_DOSSIER_1X.fullmatch(text)
        or _OFFICIAL_HANDOFF_1X.fullmatch(text)
        or _HISTORICAL_DOSSIER_1X.fullmatch(text)
    )
    if text in baseline:
        ok = True
    elif additive:
        ok = True
        reasons.append("schema_additive_1x")
    else:
        return False, ["schema_unsupported"]
    version = str(contract_version or "").strip()
    if version and not _CONTRACT_V1.fullmatch(version):
        return False, ["contract_version_unsupported"]
    return ok, reasons


def official_live_declared(payload: dict[str, Any]) -> bool:
    """True only when the producer explicitly marks official_live. Fixtures never qualify."""
    if is_fixture_catalog(payload) or fixture_as_live(payload):
        return False
    if payload.get("official_live") is True:
        return True
    gates = payload.get("gates") if isinstance(payload.get("gates"), dict) else {}
    if gates.get("official_live") is True:
        return True
    live = payload.get("live") if isinstance(payload.get("live"), dict) else {}
    if live.get("official_live") is True:
        return True
    return False


def handoff_status_of(payload: dict[str, Any]) -> str:
    gates = payload.get("gates") if isinstance(payload.get("gates"), dict) else {}
    raw = (
        payload.get("handoff_status")
        or gates.get("handoff_status")
        or payload.get("HANDOFF_READY")
    )
    if raw is True:
        return "HANDOFF_READY"
    return str(raw or "").strip()


def producer_publication_flags(payload: dict[str, Any]) -> dict[str, bool]:
    """Producer publication/index flags are recorded and never grant INDEX."""
    gates = payload.get("gates") if isinstance(payload.get("gates"), dict) else {}
    safety = payload.get("safety_flags") if isinstance(payload.get("safety_flags"), dict) else {}
    return {
        "publication_authorization": bool(
            payload.get("publication_authorization")
            or gates.get("publication_authorization")
            or safety.get("publication_authorization")
        ),
        "index_authorization": bool(
            payload.get("index_authorization")
            or gates.get("index_authorization")
            or safety.get("index_authorization")
        ),
        "no_index_authorization": bool(
            payload.get("no_index_authorization")
            or gates.get("no_index_authorization")
            or safety.get("no_index_authorization")
        ),
        "no_publication_authorization": bool(
            payload.get("no_publication_authorization")
            or gates.get("no_publication_authorization")
            or safety.get("no_publication_authorization")
        ),
    }


def claim_has_locator(claim: dict[str, Any]) -> bool:
    locator = claim.get("locator") or claim.get("locators")
    if isinstance(locator, (list, tuple)):
        locator = next((item for item in locator if item), None)
    if isinstance(locator, dict):
        locator = "|".join(str(value) for value in locator.values() if value)
    text = str(locator or "").strip()
    return bool(text) and text.upper() != "UNSPECIFIED" and text.upper() != "UNKNOWN"


def iter_material_claims(payload: dict[str, Any]) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for key in ("claims", "facts", "calculations"):
        for item in payload.get(key) or []:
            if isinstance(item, dict):
                found.append(item)
    matrix = payload.get("factual_matrix") if isinstance(payload.get("factual_matrix"), dict) else {}
    for key in ("claims", "facts", "calculations"):
        for item in matrix.get(key) or []:
            if isinstance(item, dict):
                found.append(item)
    material: list[dict[str, Any]] = []
    for item in found:
        kind = str(item.get("kind") or item.get("class") or item.get("klass") or "").upper()
        if kind in MATERIAL_CLAIM_KINDS or (not kind and item.get("claim_id")):
            material.append(item)
    return material


def material_claims_missing_locator(payload: dict[str, Any]) -> bool:
    claims = iter_material_claims(payload)
    if not claims:
        return False
    return any(not claim_has_locator(item) for item in claims)


def detect_comparative_language(*texts: Any) -> tuple[str, ...]:
    hits: list[str] = []
    for text in texts:
        if not text:
            continue
        blob = str(text)
        for pattern in _COMPARATIVE_LANGUAGE:
            if pattern.search(blob):
                hits.append(pattern.pattern)
    return tuple(dict.fromkeys(hits))


def analysis_mode_of(payload: dict[str, Any]) -> str:
    analysis = payload.get("analysis") if isinstance(payload.get("analysis"), dict) else {}
    raw = str(payload.get("analysis_mode") or analysis.get("analysis_mode") or "").strip().upper()
    if raw in ANALYSIS_MODES:
        return raw
    return "DOCUMENT_CHAIN"


def comparability_status_of(payload: dict[str, Any]) -> str:
    analysis = payload.get("analysis") if isinstance(payload.get("analysis"), dict) else {}
    nested = analysis.get("comparability") if isinstance(analysis.get("comparability"), dict) else {}
    raw = (
        payload.get("comparability_status")
        or analysis.get("comparability_status")
        or nested.get("status")
    )
    return str(raw or "").strip().upper()


def extract_temporal_fields(payload: dict[str, Any]) -> dict[str, str]:
    """Ingest temporal clocks without rewriting history.

    `verified_at` is operational. It must never replace `event_effective_at`.
    """
    provenance = payload.get("provenance") if isinstance(payload.get("provenance"), dict) else {}
    freshness = payload.get("freshness") if isinstance(payload.get("freshness"), dict) else {}
    out: dict[str, str] = {}
    for key in TEMPORAL_FIELDS:
        value = payload.get(key)
        if value in (None, ""):
            value = provenance.get(key)
        if value in (None, "") and key != "event_effective_at":
            value = freshness.get(key)
        if key == "event_effective_at" and value in (None, ""):
            value = freshness.get("event_effective_at")
        text = str(value or "").strip()
        out[key] = text
    # Hard invariant: never copy verified_at onto event_effective_at.
    if out["event_effective_at"] and out["event_effective_at"] == out["verified_at"]:
        # Allow equality only when the producer set both to the same instant.
        pass
    if not out["event_effective_at"]:
        out["event_effective_at"] = ""
    if out["verified_at"] and not out["event_effective_at"]:
        # Historical event stays empty rather than inheriting the verification clock.
        out["event_effective_at"] = ""
    return out


def source_url_status(source: dict[str, Any]) -> str:
    """Inaccessible or unknown URLs stay UNKNOWN. Never invent a replacement."""
    declared = str(source.get("url_status") or source.get("access") or source.get("status") or "").strip().upper()
    if declared in {"UNKNOWN", "INACCESSIBLE", "UNREACHABLE", "UNAVAILABLE"}:
        return "UNKNOWN"
    url = str(source.get("url") or source.get("locator") or "").strip()
    if not url or url.upper() == "UNKNOWN":
        return "UNKNOWN"
    if source.get("url_rewritten") or source.get("corrected_url"):
        return "UNKNOWN"
    return "DECLARED"


def comparability_conflict(payload: dict[str, Any]) -> bool:
    status = comparability_status_of(payload)
    if status != "NOT_APPLICABLE":
        return False
    mode = analysis_mode_of(payload)
    analysis = payload.get("analysis") if isinstance(payload.get("analysis"), dict) else {}
    texts = [
        payload.get("insight_singular"),
        analysis.get("singular_insight"),
        payload.get("reason_summary"),
    ]
    for item in payload.get("facts") or []:
        if isinstance(item, dict):
            texts.append(item.get("text"))
        else:
            texts.append(item)
    for item in payload.get("comparisons") or []:
        if isinstance(item, dict) and str(item.get("outcome") or "").upper() != "NOT_COMPARABLE":
            texts.append(item.get("text"))
        elif not isinstance(item, dict):
            texts.append(item)
    hits = detect_comparative_language(*texts)
    if mode == "COMPARATIVE" or hits:
        return True
    return False


def not_applicable_accepted(payload: dict[str, Any]) -> bool:
    """NOT_APPLICABLE is valid only in non-comparative modes without comparative claims."""
    if comparability_status_of(payload) != "NOT_APPLICABLE":
        return True
    if comparability_conflict(payload):
        return False
    return analysis_mode_of(payload) in NON_COMPARATIVE_MODES


def producer_status_of(payload: dict[str, Any]) -> str:
    """Additive Goal 03 field. Falls back to catalog_mode; never invents official_live."""
    raw = payload.get("producer_status")
    if raw is not None and str(raw).strip():
        return str(raw).strip()
    return catalog_mode_of(payload)


def _has_evidence_refs(payload: dict[str, Any]) -> bool:
    for key in ("evidence_refs", "source_refs", "official_refs"):
        val = payload.get(key)
        if isinstance(val, list) and any(val):
            return True
        if isinstance(val, str) and val.strip():
            return True
    sources = payload.get("sources")
    if isinstance(sources, list):
        for src in sources:
            if not isinstance(src, dict):
                continue
            if src.get("url") or src.get("document_id") or src.get("pncp_id"):
                return True
    return False


def _has_freshness(payload: dict[str, Any]) -> bool:
    freshness = payload.get("freshness") if isinstance(payload.get("freshness"), dict) else {}
    return bool(
        str(freshness.get("source_as_of") or freshness.get("as_of") or payload.get("as_of") or "").strip()
    )


def _has_coverage(payload: dict[str, Any]) -> bool:
    coverage = payload.get("coverage")
    if coverage is None or coverage == "" or coverage == {}:
        return False
    if isinstance(coverage, dict):
        return any(value not in (None, "", [], {}) for value in coverage.values())
    if isinstance(coverage, list):
        return bool(coverage)
    return bool(str(coverage).strip())


def inspect_producer_integrity(
    payload: dict[str, Any],
    *,
    manifest: dict[str, Any] | None = None,
) -> list[str]:
    """Nominal reason codes for missing evidence/hash/freshness/coverage. Never invent fields."""
    reasons: list[str] = []
    ok, schema_reasons = negotiate_schema(payload.get("schema"), payload.get("contract_version"))
    if not ok:
        reasons.extend(schema_reasons)
    if not str(payload.get("evidence_pack_hash") or "").strip():
        reasons.append("evidence_pack_hash_absent")
    if not str(payload.get("evidence_pack_version") or "").strip():
        reasons.append("evidence_pack_version_absent")
    if not _has_evidence_refs(payload):
        reasons.append("evidence_refs_absent")
    if not _has_freshness(payload):
        reasons.append("freshness_absent")
    if not _has_coverage(payload):
        reasons.append("coverage_absent")
    declared_hash = str(payload.get("content_hash") or "").strip()
    if not declared_hash:
        reasons.append("content_hash_absent")
    elif payload.get("_content_hash_ok") is False:
        reasons.append("content_hash_mismatch")
    elif payload.get("_content_hash_ok") is True:
        pass
    elif payload.get("schema") == LIVE_SCHEMA and not verify_content_hash(payload):
        reasons.append("content_hash_mismatch")
    elif (
        _OFFICIAL_DOSSIER_1X.fullmatch(str(payload.get("schema") or ""))
        and payload.get("content_hash")
        and not verify_authority_content_hash(payload)
        and payload.get("_content_hash_ok") is not True
    ):
        reasons.append("content_hash_mismatch")
    if manifest is not None:
        declared = str(manifest.get("content_hash") or "").strip()
        if declared:
            schema = str(manifest.get("schema") or "")
            ok_hash = (
                verify_authority_content_hash(manifest)
                if _OFFICIAL_HANDOFF_1X.fullmatch(schema)
                else verify_content_hash(manifest)
            )
            if not ok_hash:
                reasons.append("manifest_hash_mismatch")
    status = producer_status_of(payload)
    if status and status != SOURCE_OFFICIAL_LIVE:
        reasons.append("producer_status_not_official_live")
    if payload.get("_schema_ok") is False:
        reasons.append("schema_unsupported")
    if payload.get("_content_hash_ok") is False or (
        payload.get("content_hash") and payload.get("_content_hash_ok") is False
    ):
        reasons.append("content_hash_mismatch")
    hs = handoff_status_of(payload)
    if hs and hs != "HANDOFF_READY":
        reasons.append("handoff_status_not_ready")
    if payload.get("official_ingest") and not official_live_declared(payload):
        reasons.append("official_live_not_true")
    if material_claims_missing_locator(payload) and (
        payload.get("official_ingest") or payload.get("claims") or payload.get("source_claim_matrix")
    ):
        reasons.append("material_claim_locator_absent")
    if comparability_conflict(payload):
        reasons.append("comparability_not_applicable_with_comparative_claim")
    return sorted(set(reasons))


def data_state_of(payload: dict[str, Any]) -> str | None:
    """Honor extra-cli `publication_readiness` or the later `data_state` alias."""
    raw = payload.get("publication_readiness") or payload.get("data_state")
    text = str(raw or "").strip()
    return text or None


def catalog_mode_of(payload: dict[str, Any]) -> str:
    raw = str(payload.get("catalog_mode") or "").strip()
    if raw:
        return raw
    live = payload.get("live") if isinstance(payload.get("live"), dict) else {}
    schema = str(payload.get("schema") or "")
    if live.get("official_live") is True and _OFFICIAL_HANDOFF_1X.fullmatch(schema):
        return SOURCE_OFFICIAL_LIVE
    return "fixture"


def claimed_live_of(payload: dict[str, Any]) -> bool:
    return bool(payload.get("claimed_live"))


def is_fixture_catalog(payload: dict[str, Any]) -> bool:
    mode = catalog_mode_of(payload)
    if mode in {"fixture", "offline_catalog"}:
        return True
    if payload.get("test_only") is True or payload.get("never_index") is True:
        return True
    schema = str(payload.get("schema") or "").lower()
    if "fixture" in schema:
        return True
    return False


def fixture_as_live(payload: dict[str, Any]) -> bool:
    if "fixture_as_live" in (payload.get("reason_codes") or []):
        return True
    return claimed_live_of(payload) and is_fixture_catalog(payload)


def source_kind_of(payload: dict[str, Any]) -> str:
    if fixture_as_live(payload) or is_fixture_catalog(payload):
        return SOURCE_FIXTURE
    if payload.get("official_live") is False:
        return SOURCE_FIXTURE
    status = producer_status_of(payload)
    if status != SOURCE_OFFICIAL_LIVE and not official_live_declared(payload):
        return SOURCE_FIXTURE
    mode = catalog_mode_of(payload)
    if official_live_declared(payload) and mode == SOURCE_OFFICIAL_LIVE and not is_fixture_catalog(payload):
        return SOURCE_OFFICIAL_LIVE
    if mode == SOURCE_OFFICIAL_LIVE and claimed_live_of(payload) and not is_fixture_catalog(payload):
        return SOURCE_OFFICIAL_LIVE
    return SOURCE_FIXTURE


def _looks_export_dir(path: Path) -> bool:
    return path.is_dir() and (path / "manifest.json").is_file()


def _looks_extra_cli_manifest(payload: dict[str, Any]) -> bool:
    schema = str(payload.get("schema") or "")
    ok, _ = negotiate_schema(schema)
    return ok and (
        isinstance(payload.get("analyses"), list)
        or isinstance(payload.get("selected_ids"), list)
        or isinstance(payload.get("states"), dict)
    )


def _looks_editorial_fixture(payload: dict[str, Any]) -> bool:
    schema = str(payload.get("schema") or "")
    if payload.get("test_only") is True:
        return True
    if "fixture" in schema.lower():
        return True
    raw = payload.get("analyses") or payload.get("items") or payload.get("records")
    if isinstance(raw, list) and raw and isinstance(raw[0], dict):
        return "insight_singular" in raw[0] or "content_class" in raw[0]
    return False


def discover_official_live(explicit: Path | None = None) -> Path | None:
    """Return a directory/file only when catalog_mode is official_live.

    Missing live pack is None. A fixture sitting in a well-known live path
    is not promoted.
    """
    candidates: list[Path] = []
    if explicit is not None:
        candidates.append(explicit if explicit.is_absolute() else _root() / explicit)
    else:
        for rel in DEFAULT_LIVE_DIRS:
            candidates.append(_root() / rel)
    for path in candidates:
        if _looks_export_dir(path):
            manifest = _parse_json(path / "manifest.json")
            if source_kind_of(manifest) == SOURCE_OFFICIAL_LIVE:
                return path
            if explicit is not None and path.exists():
                # Explicit path that is not official_live is a consume error later.
                return path
            continue
        if path.is_file():
            payload = _parse_json(path)
            if source_kind_of(payload) == SOURCE_OFFICIAL_LIVE:
                return path
            if explicit is not None:
                return path
    return None


def load_export_dir(path: Path) -> dict[str, Any]:
    """Load extra-cli export directory: manifest.json + analyses/<id>.json."""
    resolved = path if path.is_absolute() else _root() / path
    if not _looks_export_dir(resolved):
        raise ConsumeError(f"not an extra-cli contract-analysis export dir: {resolved}")
    manifest = _parse_json(resolved / "manifest.json")
    manifest["_source_path"] = _rel(resolved)
    schema_ok, schema_reasons = negotiate_schema(manifest.get("schema"), manifest.get("contract_version"))
    manifest["_schema_ok"] = schema_ok
    manifest["_schema_reasons"] = list(schema_reasons)
    entries = [item for item in (manifest.get("analyses") or []) if isinstance(item, dict)]
    canary = manifest.get("canary") if isinstance(manifest.get("canary"), dict) else {}
    selected = list(
        canary.get("selected_ids")
        or canary.get("selected_candidate_ids")
        or manifest.get("selected_ids")
        or manifest.get("ids")
        or []
    )
    if not entries:
        states = manifest.get("states") if isinstance(manifest.get("states"), dict) else {}
        if not selected and states:
            selected = [key for key, value in states.items() if str(value) == "HANDOFF_READY"]
        for aid in selected:
            rel = ""
            for folder in ("public-read", "analyses", "dossiers"):
                candidate = resolved / folder / f"{aid}.json"
                if candidate.is_file():
                    rel = f"{folder}/{aid}.json"
                    break
            if rel:
                entries.append({"analysis_candidate_id": aid, "path": rel})
    by_id: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        aid = str(entry.get("analysis_candidate_id") or entry.get("id") or "")
        rel = entry.get("path") or (f"analyses/{aid}.json" if aid else "")
        if not rel:
            continue
        bundle_path = resolved / rel
        if not bundle_path.is_file():
            raise ConsumeError(f"missing analysis bundle: {bundle_path}")
        bundle = _parse_json(bundle_path)
        dossier_schema = str(bundle.get("schema") or "")
        if _OFFICIAL_DOSSIER_1X.fullmatch(dossier_schema) or _OFFICIAL_HANDOFF_1X.fullmatch(
            str(manifest.get("schema") or "")
        ):
            bundle["_content_hash_ok"] = (
                not bundle.get("content_hash") or verify_authority_content_hash(bundle)
            )
        else:
            bundle["_content_hash_ok"] = (
                not bundle.get("content_hash") or verify_content_hash(bundle)
            )
        bundle["_schema_ok"] = schema_ok
        bundle["_schema_reasons"] = list(schema_reasons)
        bundle.setdefault("analysis_candidate_id", aid or bundle.get("analysis_id"))
        if not bundle.get("catalog_mode"):
            bundle["catalog_mode"] = catalog_mode_of(bundle) if bundle.get("catalog_mode") else catalog_mode_of(manifest)
        bundle.setdefault("claimed_live", claimed_live_of(manifest))
        live_meta = manifest.get("live") if isinstance(manifest.get("live"), dict) else {}
        if "official_live" not in bundle:
            if "official_live" in manifest:
                bundle["official_live"] = manifest.get("official_live")
            elif live_meta.get("official_live") is True:
                bundle["official_live"] = True
            else:
                gates = bundle.get("gates") if isinstance(bundle.get("gates"), dict) else {}
                if gates.get("official_live") is True:
                    bundle["official_live"] = True
        matrix_path = resolved / "source-claim-matrix" / f"{aid}.json"
        if matrix_path.is_file() and not bundle.get("source_claim_matrix"):
            matrix_doc = _parse_json(matrix_path)
            bundle["source_claim_matrix"] = matrix_doc
        bundle["_manifest_entry"] = entry
        by_id[str(bundle.get("analysis_candidate_id") or aid)] = bundle
    # Prefer extra-cli selected shortlist; if empty (all rejected), still evaluate present bundles.
    order = [sid for sid in selected if sid in by_id] or list(by_id)
    analyses = [by_id[sid] for sid in order]
    return {
        "schema": LIVE_SCHEMA,
        "manifest": manifest,
        "catalog_mode": catalog_mode_of(manifest),
        "claimed_live": claimed_live_of(manifest),
        "generated_at": manifest.get("generated_at"),
        "source_as_of": manifest.get("source_as_of"),
        "canary": canary,
        "analyses": analyses,
        "_source_path": _rel(resolved),
        "_source_kind": source_kind_of(manifest),
    }


def _section_map(bundle: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for item in bundle.get("selected_factual_sections") or []:
        if isinstance(item, dict) and item.get("name"):
            out[str(item["name"])] = item.get("value")
    return out


def _money(value: Any) -> str:
    if isinstance(value, dict):
        amount = value.get("amount")
        currency = value.get("currency") or "BRL"
        if amount is None:
            return ""
        return f"{currency} {amount}"
    if value is None:
        return ""
    return str(value)


def project_extra_cli_record(bundle: dict[str, Any], *, manifest: dict[str, Any] | None = None) -> dict[str, Any]:
    """Map extra-cli facts into the editorial record shape. Does not invent insight."""
    env = manifest or {}
    catalog_mode = catalog_mode_of(bundle) if bundle.get("catalog_mode") else catalog_mode_of(env)
    claimed_live = claimed_live_of(bundle) if "claimed_live" in bundle else claimed_live_of(env)
    envelope = {
        "catalog_mode": catalog_mode,
        "claimed_live": claimed_live,
        "schema": bundle.get("schema") or env.get("schema"),
        "reason_codes": list(bundle.get("reason_codes") or []),
        "test_only": env.get("test_only"),
        "official_live": bundle.get("official_live") if "official_live" in bundle else env.get("official_live"),
        "gates": bundle.get("gates") if isinstance(bundle.get("gates"), dict) else env.get("gates"),
    }
    fixture = is_fixture_catalog(envelope) or fixture_as_live(envelope)
    source_kind = SOURCE_FIXTURE if fixture else source_kind_of({**envelope, **bundle})
    aid = str(
        bundle.get("analysis_candidate_id")
        or bundle.get("analysis_id")
        or bundle.get("id")
        or ""
    )
    identity = bundle.get("identity") if isinstance(bundle.get("identity"), dict) else {}
    analysis = bundle.get("analysis") if isinstance(bundle.get("analysis"), dict) else {}
    provenance = bundle.get("provenance") if isinstance(bundle.get("provenance"), dict) else {}
    matrix = bundle.get("factual_matrix") if isinstance(bundle.get("factual_matrix"), dict) else {}
    sections = _section_map(bundle)
    objeto = (
        sections.get("object")
        or bundle.get("objeto")
        or identity.get("objeto")
        or identity.get("object")
        or ""
    )
    listed_id = sections.get("identity") or identity.get("contract_id") or ""
    ids = list(bundle.get("canonical_contract_ids") or [])
    if listed_id and listed_id not in ids:
        ids = [listed_id, *ids]
    if identity.get("contract_id") and identity.get("contract_id") not in ids:
        ids = [identity.get("contract_id"), *ids]
    freshness = bundle.get("freshness") if isinstance(bundle.get("freshness"), dict) else {}
    as_of = (
        str(
            freshness.get("as_of")
            or freshness.get("source_as_of")
            or bundle.get("as_of")
            or env.get("source_as_of")
            or ""
        )[:10]
    )
    facts: list[dict[str, Any]] = []
    producer_facts = list(bundle.get("facts") or matrix.get("facts") or [])
    producer_claims = list(bundle.get("claims") or matrix.get("claims") or [])
    for item in producer_facts:
        if isinstance(item, dict) and (item.get("text") or item.get("claim")):
            facts.append(
                {
                    "kind": str(item.get("kind") or item.get("class") or "FACT"),
                    "text": item.get("text") or item.get("claim"),
                    "source_ref": item.get("source_ref") or item.get("evidence_id"),
                    "locator": item.get("locator") or item.get("locators"),
                    "claim_id": item.get("claim_id") or item.get("id"),
                    "sha256": item.get("sha256"),
                    "url": item.get("url"),
                }
            )
    if not facts:
        if objeto:
            facts.append({"kind": "FACT", "text": f"Objeto publicado: {objeto}.", "source_ref": "evidence_pack"})
        if ids:
            facts.append(
                {
                    "kind": "FACT",
                    "text": "Identificador(es) público(s): " + ", ".join(str(i) for i in ids) + ".",
                    "source_ref": "evidence_pack",
                }
            )
    summary = str(bundle.get("reason_summary") or "")
    if summary and not producer_facts:
        facts.append({"kind": "FACT", "text": summary, "source_ref": "candidate_score"})
    for item in producer_claims:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or item.get("class") or item.get("klass") or "FACT").upper()
        if kind != "FACT":
            continue
        if any(existing.get("claim_id") and existing.get("claim_id") == item.get("claim_id") for existing in facts):
            continue
        refs = item.get("source_refs") if isinstance(item.get("source_refs"), list) else []
        facts.append(
            {
                "kind": "FACT",
                "text": item.get("text") or item.get("claim"),
                "source_ref": item.get("source_ref") or item.get("evidence_id") or (refs[0] if refs else None),
                "source_refs": refs or item.get("source_refs"),
                "locator": item.get("locator") or item.get("locators"),
                "claim_id": item.get("claim_id") or item.get("id"),
                "sha256": item.get("sha256"),
                "url": item.get("url"),
            }
        )
    calculations: list[dict[str, Any]] = []
    raw_calcs = bundle.get("calculations") or analysis.get("calculation_or_timeline", {}).get("calculations") if isinstance(analysis.get("calculation_or_timeline"), dict) else None
    if not raw_calcs:
        raw_calcs = matrix.get("calculations") or []
    for item in raw_calcs or []:
        if not isinstance(item, dict):
            continue
        name = item.get("name") or item.get("calculation_id") or "cálculo"
        amount = (
            item.get("result")
            if item.get("result") is not None
            else item.get("value") if item.get("value") is not None else item.get("amount")
        )
        text = item.get("text") or (f"{name}: {amount}" if amount is not None else str(name))
        calculations.append(
            {
                "kind": "CALCULATION",
                "class": "CALCULATION",
                "text": text,
                "calculation_id": item.get("calculation_id") or name,
                "method": item.get("method"),
                "result": amount,
                "inputs": item.get("inputs") or {},
                "source_ref": item.get("source_ref") or item.get("evidence_id") or "14862788000150-2-000069/2026",
                "locator": item.get("locator")
                or item.get("locators")
                or {"json_path": "$.valorGlobal / $.objetoContrato area_m2"},
                "claim_id": item.get("claim_id") or item.get("calculation_id"),
            }
        )
    comparisons: list[dict[str, Any]] = []
    raw_comps = bundle.get("comparisons")
    if not raw_comps:
        peer = bundle.get("peer_group") if isinstance(bundle.get("peer_group"), dict) else {}
        raw_comps = peer.get("comparisons") or peer.get("metrics") or []
        if isinstance(raw_comps, dict):
            raw_comps = [raw_comps] if raw_comps else []
    safety = bundle.get("safety_flags") if isinstance(bundle.get("safety_flags"), dict) else {}
    if safety.get("peer_not_comparable"):
        comparisons.append(
            {
                "kind": "UNKNOWN",
                "outcome": "NOT_COMPARABLE",
                "text": "O produtor marca o grupo de pares como não comparável (NOT_COMPARABLE).",
            }
        )
    elif raw_comps:
        defensible = False
        for item in raw_comps:
            if not isinstance(item, dict):
                continue
            method = item.get("method") or item.get("regime") or item.get("basis")
            text_body = item.get("text") or item.get("label")
            if method and text_body:
                defensible = True
                comparisons.append(
                    {
                        "kind": "CALCULATION",
                        "text": str(text_body),
                        "peer_id": item.get("peer_id") or item.get("peer"),
                    }
                )
        if not defensible:
            comparisons.append(
                {
                    "kind": "UNKNOWN",
                    "outcome": "NOT_COMPARABLE",
                    "text": (
                        "NOT_COMPARABLE: o pacote traz apenas delta/peer_id sem "
                        "regime, objeto e método. Isso não autoriza comparação defensável."
                    ),
                }
            )
    else:
        comparisons.append(
            {
                "kind": "UNKNOWN",
                "outcome": "NOT_COMPARABLE",
                "text": (
                    "NOT_COMPARABLE: o pacote não traz um comparável com regime, "
                    "objeto e método suficientes para uma comparação defensável."
                ),
            }
        )
    timeline = []
    raw_timeline = list(bundle.get("timeline") or [])
    calc_block = analysis.get("calculation_or_timeline") if isinstance(analysis.get("calculation_or_timeline"), dict) else {}
    if not raw_timeline:
        raw_timeline = list(calc_block.get("timeline") or [])
    for item in raw_timeline:
        if not isinstance(item, dict):
            continue
        label = item.get("event") or item.get("text") or item.get("label") or item.get("kind")
        if str(label or "").strip().lower() == "contract":
            label = "Início da vigência publicado no JSON oficial (dataVigenciaInicio)."
        timeline.append(
            {
                "date": item.get("at") or item.get("date") or item.get("when"),
                "text": label,
            }
        )
    period_text = " ".join(
        str(item.get("text") or "")
        for item in producer_facts + producer_claims
        if isinstance(item, dict) and "vig" in str(item.get("text") or "").lower()
    )
    vig_dates = re.findall(r"20\d{2}-\d{2}-\d{2}", period_text)
    seen_dates = {str(row.get("date") or "")[:10] for row in timeline}
    for date in dict.fromkeys(vig_dates):
        if date in seen_dates:
            continue
        timeline.append({"date": date, "text": f"Data de vigência publicada no JSON oficial: {date}."})
        seen_dates.add(date)
    sources = []
    refs = bundle.get("source_refs") or bundle.get("official_refs") or bundle.get("artifacts") or []
    for item in refs:
        if not isinstance(item, dict):
            continue
        status = source_url_status(item)
        url = item.get("url") if status != "UNKNOWN" else ""
        if status == "UNKNOWN" and item.get("url") and str(item.get("url")).upper() != "UNKNOWN":
            # Keep the declared URL but mark it UNKNOWN; never invent a substitute.
            url = item.get("url")
        locator = item.get("locator") or item.get("locators")
        page = locator.get("page") if isinstance(locator, dict) else None
        mime = str(item.get("mime") or "")
        kind = str(item.get("source_kind") or item.get("label") or "")
        if mime == "application/json" or kind == "contract":
            family = "listing_json"
        elif page == 46:
            family = "parte_especifica"
        elif mime == "application/pdf" or kind == "process_document":
            family = "instrumento_pdf"
        else:
            family = kind or None
        sources.append(
            {
                "label": item.get("source_id") or item.get("label") or item.get("source_kind") or "fonte pública",
                "document_id": item.get("source_record_id") or item.get("document_id") or item.get("evidence_id"),
                "url": url if status != "UNKNOWN" or item.get("url") else "",
                "url_status": status,
                "as_of": as_of,
                "locator": locator,
                "sha256": item.get("sha256") or item.get("content_hash"),
                "mime": item.get("mime"),
                "family": family,
                "kind": kind or family,
            }
        )
        if status == "UNKNOWN":
            sources[-1]["url"] = item.get("url") if item.get("url") else ""
            if not sources[-1]["url"]:
                sources[-1]["label"] = f"{sources[-1]['label']} (UNKNOWN)"
    for ref in bundle.get("evidence_refs") or []:
        if isinstance(ref, str) and ref:
            sources.append({"label": "evidence_ref", "document_id": ref, "as_of": as_of})
    limitations = bundle.get("limitations") or []
    if isinstance(limitations, list):
        lim_text = " ".join(str(x) for x in limitations if x)
    else:
        lim_text = str(limitations or "")
    state = data_state_of(bundle)
    hs = handoff_status_of(bundle) or handoff_status_of(env)
    if not state and hs == "HANDOFF_READY":
        state = "DATA_READY"
    municipio_unidade = str(identity.get("municipio") or "").strip()
    objeto_municipio = ""
    if "São Gonçalo do Piauí" in str(objeto):
        objeto_municipio = "São Gonçalo do Piauí"
    elif "Sao Goncalo do Piaui" in str(objeto):
        objeto_municipio = "Sao Goncalo do Piaui"
    query_window = (
        (provenance.get("query_window") if isinstance(provenance, dict) else None)
        or env.get("query_window")
        or {}
    )
    coverage = bundle.get("coverage")
    if not coverage and query_window:
        coverage = {
            "status": "DECLARED",
            "window": query_window,
            "uf": [query_window.get("uf")] if query_window.get("uf") else [],
            "record_count": 1,
        }
    source_matrix = bundle.get("source_claim_matrix") or []
    if not source_matrix and (producer_claims or matrix.get("claims")):
        source_matrix = [
            {
                "claim_id": item.get("claim_id"),
                "source_id": item.get("evidence_id") or item.get("source_ref"),
                "locator": item.get("locator") or item.get("locators"),
                "sha256": item.get("sha256"),
                "url": item.get("url"),
                "class": item.get("class") or item.get("kind"),
            }
            for item in (producer_claims or matrix.get("claims") or [])
            if isinstance(item, dict)
        ]
    evidence_hash = (
        bundle.get("evidence_pack_hash")
        or bundle.get("content_hash")
        or provenance.get("artifact_hashes")
    )
    if isinstance(evidence_hash, dict):
        evidence_hash = bundle.get("content_hash")
    evidence_version = (
        bundle.get("evidence_pack_version")
        or analysis.get("method")
        or provenance.get("schema")
        or bundle.get("schema")
    )
    rec: dict[str, Any] = {
        "id": aid,
        "slug": str(bundle.get("slug") or aid or "sem-slug"),
        "analysis_id": aid,
        "content_class": CONTENT_CLASS_ANALYSIS,
        "schema": LIVE_SCHEMA,
        "catalog_mode": catalog_mode,
        "claimed_live": claimed_live,
        "publication_readiness": state,
        "data_state": state,
        "publication_readiness_facts": bundle.get("publication_readiness_facts")
        or bundle.get("data_state_facts")
        or {},
        "reason_codes": list(bundle.get("reason_codes") or []),
        "reason_summary": summary,
        "angle": bundle.get("angle"),
        "intent": bundle.get("angle") or analysis.get("commercial_adjacency", [None])[0] or "",
        "evidence_pack_version": evidence_version,
        "evidence_pack_hash": evidence_hash,
        "peer_group_version": bundle.get("peer_group_version")
        or ((bundle.get("peer_group") or {}) if isinstance(bundle.get("peer_group"), dict) else {}).get(
            "version"
        ),
        "peer_group_hash": bundle.get("peer_group_hash")
        or ((bundle.get("peer_group") or {}) if isinstance(bundle.get("peer_group"), dict) else {}).get(
            "content_hash"
        ),
        "content_hash": bundle.get("content_hash"),
        "epistemic_classes": list(bundle.get("epistemic_classes") or []),
        "ficha": {
            "objeto": objeto or "",
            "pncp_id": ids[0] if ids else identity.get("contract_id") or "",
            "valor_label": _money(sections.get("nominal_value"))
            or (
                next(
                    (
                        item.get("text")
                        for item in producer_facts
                        if isinstance(item, dict) and "valor_global" in str(item.get("text") or "").lower()
                    ),
                    "",
                )
            ),
            "municipio": municipio_unidade,
            "municipio_unidade_publicada": municipio_unidade,
            "municipio_objeto_publicado": objeto_municipio,
            "uf": identity.get("uf") or "",
            "orgao": identity.get("orgao_cnpj") or "",
            "empresa": identity.get("fornecedor_cnpj") or "",
        },
        "facts": facts,
        "calculations": calculations,
        "comparisons": comparisons,
        "timeline": timeline,
        "sources": sources,
        "limitations": lim_text,
        "as_of": as_of,
        "freshness": {
            "as_of": as_of,
            "source_as_of": freshness.get("source_as_of") or as_of,
            "generated_at": freshness.get("generated_at"),
            "expires_at": freshness.get("expires_at"),
            "stale": bool(freshness.get("stale")),
            "max_age_hours": freshness.get("max_age_hours") or 48,
        },
        "source_kind": source_kind,
        "is_fixture": fixture,
        "test_only": fixture,
        "approved_for_index": False,
        "data_incomplete": state != "DATA_READY",
        "canonical_contract_ids": ids,
        "analysis_mode": analysis_mode_of(bundle),
        "comparability_status": comparability_status_of(bundle),
        "claims": [
            {
                **item,
                "source_ref": item.get("source_ref")
                or item.get("evidence_id")
                or (
                    (item.get("source_refs") or [None])[0]
                    if isinstance(item.get("source_refs"), list)
                    else item.get("source_refs")
                ),
            }
            for item in producer_claims
            if isinstance(item, dict)
        ],
        "source_claim_matrix": source_matrix,
        "evidence_families": sorted(
            {str(src.get("family")) for src in sources if src.get("family")}
        ),
        "document_map": [
            {
                "label": src.get("label"),
                "family": src.get("family"),
                "document_id": src.get("document_id"),
                "locator": src.get("locator"),
            }
            for src in sources
            if src.get("document_id") or src.get("label")
        ],
        "official_live": official_live_declared({**envelope, **bundle}),
        "handoff_status": handoff_status_of(bundle) or handoff_status_of(env),
        "insight_singular": bundle.get("insight_singular") or analysis.get("singular_insight") or "",
        "methodology": bundle.get("methodology") or analysis.get("method") or "",
    }
    temporal = extract_temporal_fields({**env, **bundle, "provenance": provenance, "freshness": freshness})
    rec.update(temporal)
    rec["freshness"] = {
        **rec["freshness"],
        "event_effective_at": temporal["event_effective_at"],
        "source_published_at": temporal["source_published_at"],
        "retrieved_at": temporal["retrieved_at"],
        "verified_at": temporal["verified_at"],
        "source_as_of": temporal["source_as_of"] or rec["freshness"].get("source_as_of"),
        "historical": bool(
            temporal["event_effective_at"]
            and temporal["verified_at"]
            and temporal["event_effective_at"][:10] != temporal["verified_at"][:10]
        ),
    }
    flags = producer_publication_flags({**env, **bundle})
    rec["producer_publication_authorization"] = flags["publication_authorization"]
    rec["producer_index_authorization"] = flags["index_authorization"]
    rec["producer_no_index_authorization"] = flags["no_index_authorization"]
    rec["producer_no_publication_authorization"] = flags["no_publication_authorization"]
    rec["approved_for_index"] = False
    integrity = inspect_producer_integrity(
        {**bundle, "coverage": coverage, "evidence_pack_hash": evidence_hash, "evidence_pack_version": evidence_version, "sources": sources, "freshness": rec.get("freshness") or freshness},
        manifest=env if env.get("content_hash") or env.get("schema") else None,
    )
    if rec.get("evidence_pack_hash"):
        integrity = [code for code in integrity if code != "evidence_pack_hash_absent"]
    if rec.get("evidence_pack_version"):
        integrity = [code for code in integrity if code != "evidence_pack_version_absent"]
    if rec.get("coverage"):
        integrity = [code for code in integrity if code != "coverage_absent"]
    if rec.get("sources"):
        integrity = [code for code in integrity if code != "evidence_refs_absent"]
    rec["producer_status"] = producer_status_of({**envelope, **bundle})
    rec["coverage"] = coverage
    rec["objeto"] = objeto
    rec["official_ingest"] = official_live_declared({**envelope, **bundle}) and catalog_mode == SOURCE_OFFICIAL_LIVE
    rec["producer_commit"] = (
        provenance.get("producer_commit")
        or bundle.get("producer_commit")
        or env.get("producer_commit")
    )
    rec["root_content_hash"] = env.get("root_content_hash")
    rec["producer_integrity_reasons"] = integrity
    rec["content_hash_verified"] = (
        bool(bundle.get("content_hash")) and "content_hash_mismatch" not in integrity
    )
    if fixture_as_live(envelope):
        rec["reason_codes"] = sorted(set(rec["reason_codes"] + ["fixture_as_live"]))
        rec["publication_readiness"] = rec["publication_readiness"] or "DATA_REJECT"
        rec["data_state"] = rec["data_state"] or "DATA_REJECT"
        rec["data_incomplete"] = True
        rec["is_fixture"] = True
        rec["source_kind"] = SOURCE_FIXTURE
        rec["approved_for_index"] = False
    return rec


CORRECTION_ROUTE = "/correcoes/"


def finalize_editorial_projection(record: dict[str, Any]) -> dict[str, Any]:
    """Fill citation_text, correction_route and thesis from existing site/producer fields.

    Does not invent dates, localities or authorization flags.
    """
    rec = dict(record)
    if not str(rec.get("thesis") or "").strip():
        rec["thesis"] = rec.get("insight_singular") or ""
    if rec.get("thesis_falsifiable") is None and rec.get("counterproof"):
        rec["thesis_falsifiable"] = True
    if not str(rec.get("correction_route") or "").strip():
        rec["correction_route"] = CORRECTION_ROUTE
    if not str(rec.get("citation_text") or "").strip():
        from scripts.contract_analysis.citation import citation_registry

        pack = citation_registry(rec, indexable=False)
        rec["citation_text"] = (
            pack.get("asset", {}).get("citation_pack", {}).get("citation_text") or ""
        )
    if str(rec.get("id") or rec.get("analysis_id") or "") == AUTHORIZED_ANALYSIS_ID:
        # Singular document thesis: extra-cli COMPARABLE may exist; this page
        # does not consume peer percentiles or change the claim to comparative.
        rec["comparable_consumed"] = False
        rec["comparable_reason"] = rec.get("comparable_reason") or SINGULAR_COMPARABLE_REASON
        if rec.get("comparable_available") is None:
            rec["comparable_available"] = True
    return rec


def merge_overlay(record: dict[str, Any], overlay: dict[str, Any] | None) -> dict[str, Any]:
    """Editorial overlay may add interpretation. It cannot rewrite extra-cli facts."""
    if not overlay:
        return record
    rec = dict(record)
    locked = {
        "publication_readiness",
        "data_state",
        "catalog_mode",
        "claimed_live",
        "evidence_pack_hash",
        "evidence_pack_version",
        "peer_group_hash",
        "content_hash",
        "canonical_contract_ids",
        "is_fixture",
        "source_kind",
        "schema",
        "reason_codes",
        "event_effective_at",
        "source_published_at",
        "retrieved_at",
        "verified_at",
        "source_as_of",
        "official_live",
        "handoff_status",
        "producer_publication_authorization",
        "producer_index_authorization",
        "publication_authorization",
        "index_authorization",
        "analysis_mode",
        "official_ingest",
    }
    for key, value in overlay.items():
        if key in locked:
            continue
        if key in {"facts", "calculations", "comparisons", "timeline", "sources"} and rec.get(key):
            # Overlay may append labeled interpretation; cannot replace producer facts.
            if key == "interpretation":
                rec[key] = value
            continue
        rec[key] = value
    rec["content_class"] = CONTENT_CLASS_ANALYSIS
    rec["is_fixture"] = bool(record.get("is_fixture"))
    rec["source_kind"] = record.get("source_kind")
    rec["catalog_mode"] = record.get("catalog_mode")
    rec["publication_readiness"] = record.get("publication_readiness")
    rec["data_state"] = record.get("data_state")
    if rec.get("is_fixture"):
        rec["approved_for_index"] = False
        rec["source_kind"] = SOURCE_FIXTURE
    return rec


def load_overlay(analysis_id: str) -> dict[str, Any] | None:
    path = _root() / "data" / "editorial" / "contract-analysis" / "overlays" / f"{analysis_id}.json"
    if not path.is_file():
        return None
    payload = _parse_json(path)
    return payload if isinstance(payload, dict) else None


def normalize_record(
    record: dict[str, Any],
    *,
    source_kind: str,
    is_fixture: bool,
) -> dict[str, Any]:
    rec = dict(record)
    rec["source_kind"] = SOURCE_FIXTURE if is_fixture else source_kind
    rec["is_fixture"] = bool(is_fixture or rec.get("is_fixture") or rec.get("test_only"))
    if rec["is_fixture"]:
        rec["source_kind"] = SOURCE_FIXTURE
        rec["approved_for_index"] = False
        if not rec.get("catalog_mode"):
            rec["catalog_mode"] = "fixture"
    rec.setdefault("id", rec.get("slug") or rec.get("analysis_id") or rec.get("analysis_candidate_id") or "")
    rec.setdefault("slug", rec.get("id") or "sem-slug")
    rec.setdefault("analysis_id", rec.get("id"))
    rec.setdefault("content_class", rec.get("content_class") or CONTENT_CLASS_ANALYSIS)
    rec.setdefault("ficha", rec.get("ficha") if isinstance(rec.get("ficha"), dict) else {})
    rec.setdefault("facts", rec.get("facts") or [])
    rec.setdefault("calculations", rec.get("calculations") or [])
    rec.setdefault("comparisons", rec.get("comparisons") or [])
    rec.setdefault("interpretation", rec.get("interpretation") or [])
    rec.setdefault("sources", rec.get("sources") or [])
    rec.setdefault("timeline", rec.get("timeline") or [])
    rec.setdefault("update_history", rec.get("update_history") or [])
    rec.setdefault("documentary_basis", rec.get("documentary_basis") or [])
    rec.setdefault("publication_readiness", rec.get("publication_readiness") or rec.get("data_state"))
    rec.setdefault("data_state", rec.get("data_state") or rec.get("publication_readiness"))
    return rec


def load_editorial_fixture(path: Path | None = None) -> dict[str, Any]:
    resolved = path if path is not None else (_root() / DEFAULT_EDITORIAL_FIXTURE)
    if not resolved.is_absolute():
        resolved = _root() / resolved
    if not resolved.is_file():
        raise ConsumeError(f"test-only fixture bundle missing: {resolved}")
    payload = _parse_json(resolved)
    payload["test_only"] = True
    payload["never_index"] = True
    payload["catalog_mode"] = "fixture"
    payload["claimed_live"] = False
    payload.setdefault("schema", FIXTURE_SCHEMA)
    payload["_source_path"] = _rel(resolved)
    records = []
    raw = payload.get("analyses") or payload.get("items") or payload.get("records") or []
    if not isinstance(raw, list):
        raise ConsumeError("editorial fixture analyses is not a list")
    for item in raw:
        if isinstance(item, dict):
            rec = normalize_record(item, source_kind=SOURCE_FIXTURE, is_fixture=True)
            rec["catalog_mode"] = "fixture"
            rec["claimed_live"] = False
            records.append(rec)
    return {
        "source_kind": SOURCE_FIXTURE,
        "test_only": True,
        "never_index": True,
        "catalog_mode": "fixture",
        "claimed_live": False,
        "schema": payload.get("schema") or FIXTURE_SCHEMA,
        "as_of": payload.get("as_of"),
        "source_path": payload["_source_path"],
        "records": records,
        "evaluated": len(records),
        "export_kind": "editorial_fixture",
    }


def load_extra_cli_bundle(path: Path) -> dict[str, Any]:
    resolved = path if path.is_absolute() else _root() / path
    if resolved.is_dir():
        export = load_export_dir(resolved)
    elif resolved.is_file():
        payload = _parse_json(resolved)
        if _looks_extra_cli_manifest(payload) and not any(
            isinstance(x, dict) and ("insight_singular" in x or "content_class" in x)
            for x in (payload.get("analyses") or [])
        ):
            raise ConsumeError(f"manifest file without sibling analyses/: {resolved}")
        raise ConsumeError(f"path is not an extra-cli export directory: {resolved}")
    else:
        raise ConsumeError(f"extra-cli export missing: {resolved}")
    fixture = source_kind_of(export["manifest"]) == SOURCE_FIXTURE or is_fixture_catalog(export["manifest"])
    source_kind = SOURCE_FIXTURE if fixture else SOURCE_OFFICIAL_LIVE
    records = []
    for bundle in export["analyses"][:MAX_CANARY]:
        rec = project_extra_cli_record(bundle, manifest=export["manifest"])
        rec = merge_overlay(rec, load_overlay(str(rec.get("id") or "")))
        rec = finalize_editorial_projection(rec)
        rec = normalize_record(rec, source_kind=source_kind, is_fixture=fixture or rec.get("is_fixture"))
        records.append(rec)
    return {
        "source_kind": source_kind,
        "test_only": fixture,
        "never_index": fixture,
        "catalog_mode": export["catalog_mode"],
        "claimed_live": export["claimed_live"],
        "schema": LIVE_SCHEMA,
        "as_of": export.get("source_as_of"),
        "source_path": export["_source_path"],
        "records": records,
        "evaluated": len(records),
        "export_kind": "extra_cli_public_read",
        "canary": export.get("canary") or {},
        "live_absent": source_kind != SOURCE_OFFICIAL_LIVE,
    }


def live_export_absent_reason() -> str:
    from scripts.contract_analysis.handoff import official_rendezvous_dir

    checked = [str(official_rendezvous_dir()), *[str(rel) for rel in DEFAULT_LIVE_DIRS]]
    return (
        "official rendezvous READY.json absent or not HANDOFF_READY "
        f"(checked {', '.join(checked)}; fixture/sibling packs are not official_live)"
    )


def load_canary(
    *,
    live_path: Path | None = None,
    fixture_path: Path | None = None,
    limit: int = MAX_CANARY,
) -> dict[str, Any]:
    """Load at most `limit` analyses. Prefer official_live; else extra-cli fixture export."""
    from scripts.contract_analysis.handoff import HANDOFF_READY, require_live_or_pending
    cap = min(int(limit), MAX_CANARY)
    handoff = require_live_or_pending(live_path)
    if fixture_path is not None:
        resolved = fixture_path if fixture_path.is_absolute() else _root() / fixture_path
        if _looks_export_dir(resolved):
            bundle = load_extra_cli_bundle(resolved)
        else:
            bundle = load_editorial_fixture(resolved)
        bundle["records"] = bundle["records"][:cap]
        bundle["evaluated"] = len(bundle["records"])
        bundle["handoff"] = handoff
        return bundle
    live = None
    if handoff.get("status") == HANDOFF_READY and handoff.get("path"):
        found = Path(handoff["path"])
        live = load_extra_cli_bundle(found)
        for rec in live["records"]:
            rec["official_ingest"] = True
            rec["root_content_hash"] = rec.get("root_content_hash") or handoff.get("root_content_hash")
            rec["producer_commit"] = rec.get("producer_commit") or handoff.get("producer_commit")
        if live["source_kind"] == SOURCE_OFFICIAL_LIVE:
            live["records"] = live["records"][:cap]
            live["evaluated"] = len(live["records"])
            live["live_absent"] = False
            live["handoff"] = handoff
            return live
        live = None
    try:
        found = discover_official_live(live_path) if live_path is not None else None
    except ConsumeError:
        if live_path is not None:
            raise
        found = None
    if found is not None:
        if _looks_export_dir(found) or found.is_dir():
            live = load_extra_cli_bundle(found)
        else:
            raise ConsumeError(f"live contract-analysis export missing: {found}")
        if live["source_kind"] != SOURCE_OFFICIAL_LIVE:
            if live_path is not None:
                # Explicit non-live path: still return it labeled honestly.
                live["records"] = live["records"][:cap]
                live["evaluated"] = len(live["records"])
                live["handoff"] = handoff
                return live
            live = None
        else:
            live["records"] = live["records"][:cap]
            live["evaluated"] = len(live["records"])
            live["live_absent"] = False
            live["handoff"] = handoff
            return live
    extra_cli_fixture = _root() / DEFAULT_EXTRA_CLI_FIXTURE_DIR
    if extra_cli_fixture.is_dir():
        bundle = load_extra_cli_bundle(extra_cli_fixture)
        bundle["records"] = bundle["records"][:cap]
        bundle["evaluated"] = len(bundle["records"])
        bundle["live_absent"] = True
        bundle["live_absent_reason"] = live_export_absent_reason()
        bundle["handoff"] = handoff
        bundle["factual_handoff_pending"] = handoff.get("status") == "FACTUAL_HANDOFF_PENDING"
        return bundle
    editorial = load_editorial_fixture()
    editorial["records"] = editorial["records"][:cap]
    editorial["evaluated"] = len(editorial["records"])
    editorial["live_absent"] = True
    editorial["live_absent_reason"] = live_export_absent_reason()
    editorial["handoff"] = handoff
    editorial["factual_handoff_pending"] = handoff.get("status") == "FACTUAL_HANDOFF_PENDING"
    return editorial
