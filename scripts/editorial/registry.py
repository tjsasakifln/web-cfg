"""Editorial registry, canonical material identity and approval state machine.

The approval identity is deliberately content-led.  A repository SHA is useful
traceability, but never grants approval.  Every public field is hashed by
default; only a small, explicit set of operational fields is excluded.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from scripts.pseo.reproducible import build_timestamp
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = ROOT / "data" / "editorial" / "EDITORIAL-REGISTRY.json"

STATES = (
    "DRAFT",
    "LEGAL_SOURCE_VALIDATED",
    "TECHNICAL_REVIEWED",
    "EDITORIAL_REVIEWED",
    "HUMAN_APPROVED",
    "INDEXABLE",
    "PUBLISHED",
    "REVIEW_REQUIRED",
    "REJECTED",
)
INDEXABLE_STATES = frozenset({"INDEXABLE", "PUBLISHED"})
APPROVAL_SCHEMA_VERSION = "3.0.0"

# This preview is the only review target for PR #54.  Production URLs are not
# accepted while the PR is unmerged.
REVIEW_PREVIEW_BASE_URL = "https://deploy-preview-54--confenge.netlify.app"

PROGRESSION = [
    "DRAFT",
    "LEGAL_SOURCE_VALIDATED",
    "TECHNICAL_REVIEWED",
    "EDITORIAL_REVIEWED",
    "HUMAN_APPROVED",
    "INDEXABLE",
    "PUBLISHED",
]

# The hash is fail-closed: new page keys are material unless they are listed
# here with a concrete operational reason.  These values never render public
# HTML and do not change a reader's review target.
NON_MATERIAL_PAGE_FIELDS = frozenset(
    {
        "status",
        "history",
        "approval",
        "material_hash",
        "_source_file",
        "generated_at",
        "derived_at",
        "commit_sha",
        "commit_sha_role",
        "report",
        "report_path",
        "report_document",
        "report_docs",
        "evidence",
        "evidence_path",
        "build_path",
        "artifact_path",
        "ci",
        "ci_data",
        "ci_result",
        "execution",
        "execution_data",
        "execution_report",
        "ops_notes",
        "operational_notes",
        "preview_evidence",
    }
)

# Source records are public evidence.  There is no source-field allowlist:
# exclude only bookkeeping that cannot affect the source identity reviewed by
# a human.  A new source field therefore invalidates the dependent page.
NON_MATERIAL_SOURCE_FIELDS = frozenset(
    {
        "generated_at",
        "derived_at",
        "commit_sha",
        "commit_sha_role",
        "history",
        "approval",
        "ci",
        "ci_data",
        "execution",
        "report_path",
        "evidence_path",
    }
)

BLOCKED_REVIEWER_PATTERNS = (
    r"^editorial-wave1-operator$",
    r"^ci[-_]",
    r"^bot[-_]",
    r"^auto[-_]",
    r"operator$",
    r"^test-",
    r"^tester$",
    r"^system$",
    r"^pipeline$",
    r"^github-actions$",
    r"^dependabot$",
    r"^grok$",
    r"^agent$",
    r"^llm$",
    r"^automation$",
)


def _now() -> str:
    return build_timestamp()


def _normalise(value: Any) -> Any:
    """Return a deterministic JSON-safe representation.

    NFC and line-ending normalization prevent cosmetic encoding differences
    from producing unrelated identities.  List order is deliberately kept:
    FAQ, related links and checklist order alter the public experience.  Sets
    have no public order and are sorted before serialisation.
    """
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value.replace("\r\n", "\n").replace("\r", "\n"))
    if isinstance(value, dict):
        return {
            str(k): _normalise(v)
            for k, v in sorted(value.items(), key=lambda item: str(item[0]))
        }
    if isinstance(value, (set, frozenset)):
        items = [_normalise(v) for v in value]
        return sorted(
            items,
            key=lambda item: json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
        )
    if isinstance(value, tuple):
        return [_normalise(v) for v in value]
    if isinstance(value, list):
        return [_normalise(v) for v in value]
    return value


def canonical_json(value: Any) -> str:
    """Canonical JSON used for all editorial material identities."""
    return json.dumps(
        _normalise(value), ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )


def _load_manifest(source_manifest: dict[str, Any] | None = None) -> dict[str, Any]:
    if source_manifest is not None:
        return source_manifest
    # Local import prevents registry <-> source validation import coupling.
    from scripts.editorial.sources import load_manifest

    return load_manifest()


def _source_map(source_manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(src.get("source_id")): src
        for src in source_manifest.get("sources") or []
        if isinstance(src, dict) and src.get("source_id")
    }


def resolve_page_sources(
    page: dict[str, Any], source_manifest: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """Resolve precisely the source identities used by a page.

    Unused manifest entries are intentionally absent.  An unknown declared
    source is represented in the hash so it cannot be silently ignored.
    """
    manifest = _load_manifest(source_manifest)
    by_id = _source_map(manifest)
    raw_ids = page.get("sources") or []
    if not isinstance(raw_ids, list):
        raw_ids = [raw_ids]
    resolved: list[dict[str, Any]] = []
    for raw_id in raw_ids:
        source_id = str(raw_id)
        source = by_id.get(source_id)
        if source is None:
            resolved.append({"source_id": source_id, "unresolved": True})
            continue
        identity = {
            key: value
            for key, value in source.items()
            if key not in NON_MATERIAL_SOURCE_FIELDS
        }
        identity["source_id"] = source_id
        resolved.append(_normalise(identity))
    return resolved


def canonical_material_payload(
    page: dict[str, Any], source_manifest: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Canonical public-review payload for one editorial page.

    Page fields are included by default instead of maintained in a fragile
    renderer-specific allowlist.  The resolved source identities are attached
    independently so a used source title, official URL, version or digest
    changes approval, while an unused manifest change does not.
    """
    public_page = {
        key: value
        for key, value in page.items()
        if key not in NON_MATERIAL_PAGE_FIELDS
    }
    return _normalise(
        {
            "schema_version": "editorial-material-v3",
            "page": public_page,
            "resolved_sources": resolve_page_sources(page, source_manifest),
        }
    )


def material_hash(
    payload: dict[str, Any], source_manifest: dict[str, Any] | None = None
) -> str:
    """SHA-256 of every public page field and its resolved used sources."""
    raw = canonical_json(canonical_material_payload(payload, source_manifest))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def is_blocked_reviewer(reviewer: str) -> bool:
    try:
        from scripts.editorial.governance import is_blocked_reviewer as _governance_check

        return _governance_check(reviewer)
    except Exception:  # noqa: BLE001
        clean = (reviewer or "").strip().lower()
        if not clean or len(clean) < 3:
            return True
        return any(re.search(p, clean, re.I) for p in BLOCKED_REVIEWER_PATTERNS)


def _valid_timestamp(value: Any) -> bool:
    text = str(value or "").strip()
    if not text:
        return False
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed.tzinfo is not None


def canonical_source_ids(page: dict[str, Any]) -> list[str]:
    raw = page.get("sources") or []
    if not isinstance(raw, list):
        raw = [raw]
    return sorted(str(source_id).strip() for source_id in raw if str(source_id).strip())


def source_verification_errors(
    page: dict[str, Any],
    sources_verified: list[str] | tuple[str, ...] | None,
    source_manifest: dict[str, Any] | None = None,
) -> list[str]:
    """Validate the exact, duplicate-free source set reviewed by a human."""
    manifest = _load_manifest(source_manifest)
    known = set(_source_map(manifest))
    expected_raw = page.get("sources") or []
    if not isinstance(expected_raw, list):
        expected_raw = [expected_raw]
    expected_clean = [str(s).strip() for s in expected_raw if str(s).strip()]
    supplied = [str(s).strip() for s in (sources_verified or []) if str(s).strip()]
    errors: list[str] = []
    if not supplied:
        errors.append("sources_verified_required")
    if len(expected_clean) != len(set(expected_clean)):
        errors.append("page_sources_duplicate")
    if len(supplied) != len(set(supplied)):
        errors.append("sources_verified_duplicate")
    unknown_page = sorted(set(expected_clean) - known)
    unknown_supplied = sorted(set(supplied) - known)
    errors.extend(f"page_source_unknown:{source_id}" for source_id in unknown_page)
    errors.extend(f"source_verified_unknown:{source_id}" for source_id in unknown_supplied)
    missing = sorted(set(expected_clean) - set(supplied))
    extra = sorted(set(supplied) - set(expected_clean))
    errors.extend(f"source_verified_missing:{source_id}" for source_id in missing)
    errors.extend(f"source_verified_not_on_page:{source_id}" for source_id in extra)
    return errors


def _checklist_is_complete(checklist: Any) -> bool:
    from scripts.editorial.governance import EDITORIAL_CHECKLIST_KEYS

    return isinstance(checklist, dict) and all(checklist.get(key) is True for key in EDITORIAL_CHECKLIST_KEYS)


def _preview_is_current(page: dict[str, Any], preview: Any, canonical_hash: str) -> bool:
    """Validate recorded preview identity without treating commit SHA as approval."""
    if not isinstance(preview, dict):
        return False
    base = str(preview.get("preview_base_url") or "").rstrip("/")
    page_url = str(page.get("url") or "")
    expected_url = f"{REVIEW_PREVIEW_BASE_URL}{page_url}"
    target_sha = str(preview.get("review_target_sha") or "")
    build_sha = str(preview.get("preview_build_sha") or "")
    reviewed_url = str(preview.get("reviewed_url") or preview.get("preview_url") or "")
    return bool(
        base == REVIEW_PREVIEW_BASE_URL
        and re.fullmatch(r"[0-9a-fA-F]{40}", target_sha)
        and build_sha == target_sha
        and reviewed_url == expected_url
        and preview.get("page_id") == page.get("page_id")
        and preview.get("material_hash") == canonical_hash
        and preview.get("page_http_status") == 200
        and _valid_timestamp(preview.get("preview_generated_at"))
    )


def load_registry(path: Path | None = None) -> dict[str, Any]:
    chosen = path or REGISTRY_PATH
    if not chosen.exists():
        return {"schema_version": "1.0.0", "generated_at": _now(), "pages": [], "counts": {}}
    return json.loads(chosen.read_text(encoding="utf-8"))


def save_registry(
    data: dict[str, Any], path: Path | None = None, *, source_manifest: dict[str, Any] | None = None
) -> None:
    chosen = path or REGISTRY_PATH
    chosen.parent.mkdir(parents=True, exist_ok=True)
    pages = data.get("pages") or []
    counts: dict[str, int] = {}
    for page in pages:
        state = page.get("status") or "DRAFT"
        counts[state] = counts.get(state, 0) + 1
    data["counts"] = counts
    data["generated_at"] = _now()
    # This is intentionally global registry state, not the release cohort.
    data["indexable_urls_scope"] = "global_valid_human_approvals_not_release_cohort"
    data["indexable_urls"] = [
        page["url"]
        for page in indexable_pages(data, source_manifest=source_manifest)
        if page.get("url")
    ]
    chosen.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def get_page(reg: dict[str, Any], page_id: str) -> dict[str, Any] | None:
    for page in reg.get("pages") or []:
        if page.get("page_id") == page_id:
            return page
    return None


def upsert_page(
    reg: dict[str, Any], page: dict[str, Any], *, source_manifest: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Upsert a page and revoke approval only when public material changed."""
    pages = reg.setdefault("pages", [])
    page_id = page["page_id"]
    for index, existing in enumerate(pages):
        if existing.get("page_id") != page_id:
            continue
        # The stored value is the material that was actually approved.  It
        # must not be recomputed against a newly changed source manifest,
        # otherwise a changed used-source URL could be compared to itself.
        old_hash = str(existing.get("material_hash") or material_hash(existing, source_manifest))
        new_hash = material_hash(page, source_manifest)
        page["material_hash"] = new_hash
        was_approved = existing.get("status") in INDEXABLE_STATES | {"HUMAN_APPROVED"}
        invalidated = old_hash != new_hash and was_approved
        # Page definition files are content inputs.  They must never be able
        # to downgrade an approval merely by carrying stale operational state
        # such as EDITORIAL_REVIEWED, history or a copied approval object.
        incoming_material = {
            key: value
            for key, value in page.items()
            if key not in {"status", "approval", "history", "material_hash"}
        }
        merged = {**existing, **incoming_material, "material_hash": new_hash}
        if existing.get("history"):
            merged["history"] = list(existing["history"])
        if invalidated:
            merged["status"] = "REVIEW_REQUIRED"
            merged.pop("approval", None)
            merged.setdefault("history", []).append(
                {
                    "at": _now(),
                    "event": "material_hash_invalidated_approval",
                    "from": existing.get("status"),
                    "to": "REVIEW_REQUIRED",
                    "previous_material_hash": old_hash,
                    "material_hash": new_hash,
                }
            )
        pages[index] = merged
        return merged
    page.setdefault("status", "DRAFT")
    page.setdefault("history", [])
    page["material_hash"] = material_hash(page, source_manifest)
    pages.append(page)
    return page


def approval_is_current(
    page: dict[str, Any], source_manifest: dict[str, Any] | None = None
) -> bool:
    """Return true only for a complete human decision on current public material."""
    approval = page.get("approval") or {}
    if not isinstance(approval, dict):
        return False
    reviewer = str(approval.get("reviewer") or "")
    canonical_hash = material_hash(page, source_manifest)
    return bool(
        approval.get("schema_version") == APPROVAL_SCHEMA_VERSION
        and approval.get("page_id") == page.get("page_id")
        and approval.get("state") == "HUMAN_APPROVED"
        and page.get("material_hash") == canonical_hash
        and approval.get("material_hash") == canonical_hash
        and reviewer
        and not is_blocked_reviewer(reviewer)
        and _valid_timestamp(approval.get("at"))
        and len(str(approval.get("notes") or "").strip()) >= 20
        and _checklist_is_complete(approval.get("checklist"))
        and not source_verification_errors(page, approval.get("sources_verified"), source_manifest)
        and list(approval.get("sources_verified") or []) == canonical_source_ids(page)
        and _preview_is_current(page, approval.get("preview"), canonical_hash)
    )


def can_advance(current: str, target: str) -> bool:
    if target in {"REJECTED", "REVIEW_REQUIRED"}:
        return True
    if current == "REJECTED":
        return False
    if current == "REVIEW_REQUIRED":
        return target in {"DRAFT", "LEGAL_SOURCE_VALIDATED", "REJECTED"}
    try:
        return current == target if current not in PROGRESSION or target not in PROGRESSION else PROGRESSION.index(target) == PROGRESSION.index(current) + 1
    except ValueError:
        return False


def advance(reg: dict[str, Any], page_id: str, target: str, *, actor: str, notes: str = "") -> dict[str, Any]:
    page = get_page(reg, page_id)
    if not page:
        raise KeyError(page_id)
    current = page.get("status") or "DRAFT"
    if not can_advance(current, target):
        raise ValueError(f"cannot_advance:{current}->{target}")
    if target == "HUMAN_APPROVED":
        raise ValueError("use_approve_human_for_HUMAN_APPROVED")
    if target == "INDEXABLE":
        raise ValueError("use_mark_indexable_for_INDEXABLE")
    page["status"] = target
    page.setdefault("history", []).append(
        {"at": _now(), "event": target, "actor": actor, "notes": notes, "from": current}
    )
    return page


def approve_human(
    reg: dict[str, Any],
    page_id: str,
    *,
    reviewer: str,
    notes: str,
    sources_verified: list[str],
    checklist: dict[str, bool] | None = None,
    preview_evidence: dict[str, Any] | None = None,
    caveats: str = "",
    source_manifest: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Atomically record a named human review of exact sources and preview."""
    page = get_page(reg, page_id)
    if not page:
        raise KeyError(page_id)
    if page.get("status") == "REJECTED":
        raise ValueError("cannot_approve_rejected")
    if page.get("status") != "EDITORIAL_REVIEWED":
        raise ValueError(f"requires_EDITORIAL_REVIEWED_got_{page.get('status')}")
    if is_blocked_reviewer(reviewer):
        raise ValueError(f"reviewer_not_human:{reviewer}")
    if not notes or len(notes.strip()) < 20:
        raise ValueError("approval_notes_too_short")
    if not _checklist_is_complete(checklist):
        raise ValueError("checklist_incomplete")
    source_errors = source_verification_errors(page, sources_verified, source_manifest)
    if source_errors:
        raise ValueError(source_errors[0])
    canonical_hash = material_hash(page, source_manifest)
    if not _preview_is_current(page, preview_evidence, canonical_hash):
        raise ValueError("preview_identity_invalid")
    page["material_hash"] = canonical_hash
    page["status"] = "HUMAN_APPROVED"
    page["approval"] = {
        "schema_version": APPROVAL_SCHEMA_VERSION,
        "page_id": page_id,
        "state": "HUMAN_APPROVED",
        "reviewer": reviewer.strip(),
        "at": _now(),
        "notes": notes.strip(),
        "sources_verified": canonical_source_ids(page),
        "checklist": {key: True for key in checklist or {}},
        "caveats": caveats,
        "material_hash": canonical_hash,
        "preview": _normalise(preview_evidence),
    }
    page.setdefault("history", []).append(
        {"at": _now(), "event": "HUMAN_APPROVED", "reviewer": reviewer.strip()}
    )
    return page


def mark_indexable(
    reg: dict[str, Any], page_id: str, *, source_manifest: dict[str, Any] | None = None
) -> dict[str, Any]:
    page = get_page(reg, page_id)
    if not page:
        raise KeyError(page_id)
    if page.get("status") not in {"HUMAN_APPROVED", "INDEXABLE"}:
        raise ValueError("requires_HUMAN_APPROVED")
    if not approval_is_current(page, source_manifest):
        page["status"] = "REVIEW_REQUIRED"
        page.pop("approval", None)
        raise ValueError("approval_hash_or_identity_mismatch")
    page["status"] = "INDEXABLE"
    page.setdefault("history", []).append({"at": _now(), "event": "INDEXABLE"})
    return page


def revoke_auto_approvals(
    reg: dict[str, Any], *, source_manifest: dict[str, Any] | None = None
) -> int:
    """Fail closed on stale material, tampering or incomplete human evidence."""
    revoked = 0
    for page in reg.get("pages") or []:
        status = page.get("status")
        if status not in INDEXABLE_STATES | {"HUMAN_APPROVED"}:
            continue
        approval = page.get("approval") or {}
        if approval_is_current(page, source_manifest):
            continue
        canonical_hash = material_hash(page, source_manifest)
        material_changed = (
            page.get("material_hash") != canonical_hash
            or approval.get("material_hash") != canonical_hash
        )
        page["status"] = "REVIEW_REQUIRED" if material_changed else "EDITORIAL_REVIEWED"
        page.pop("approval", None)
        page.setdefault("history", []).append(
            {
                "at": _now(),
                "event": "revoked_invalid_approval",
                "from": status,
                "to": page["status"],
                "reviewer_was": approval.get("reviewer"),
            }
        )
        revoked += 1
    return revoked


def indexable_pages(
    reg: dict[str, Any],
    *,
    allowed_page_ids: set[str] | frozenset[str] | None = None,
    source_manifest: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Return only currently approved pages, optionally scoped to a release cohort."""
    pages: list[dict[str, Any]] = []
    for page in reg.get("pages") or []:
        if page.get("status") not in INDEXABLE_STATES:
            continue
        if allowed_page_ids is not None and page.get("page_id") not in allowed_page_ids:
            continue
        if approval_is_current(page, source_manifest):
            pages.append(page)
    return pages
