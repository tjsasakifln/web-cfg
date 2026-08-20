"""Individual human approval for PUBLISHABLE_INDEX. Never quota-fill."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from scripts.contract_analysis import (
    OWNER_CONDITIONAL_APPROVER,
    OWNER_CONDITIONAL_TOKEN,
    OWNER_DIMENSION_MIN,
    OWNER_PREAPPROVAL_APPROVER,
    OWNER_PREAPPROVAL_TOKEN,
    OWNER_QUALITY_MIN,
)

APPROVALS_REL = Path("data/editorial/contract-analysis/approvals.json")
CONDITIONAL_CHECKLIST = (
    "source_official_live",
    "handoff_ready_verified",
    "material_claims_have_locators",
    "hard_gates_all_true",
    "quality_total_ge_88",
    "no_dimension_below_75",
    "insight_singular",
    "utility_beyond_source",
    "method_limitations_author_reviewer_visible",
    "author_assigned_after_review",
    "reputational_safety",
    "unique_content_anti_doorway",
    "cta_attribution_preserved",
    "canonical_robots_schema_sitemap_coherent",
    "no_implied_commercial_relation",
    "snapshot_hashes_recorded",
    "suite_green",
)
APPROVAL_SCHEMA = "contract-analysis-approvals/1.0"

_MATERIAL_KEYS = (
    "id",
    "slug",
    "title",
    "insight_singular",
    "executive_summary",
    "why_analysis",
    "utility_beyond_source",
    "cannot_conclude",
    "methodology",
    "limitations",
    "as_of",
    "evidence_pack_hash",
    "evidence_pack_version",
    "content_hash",
    "publication_readiness",
    "catalog_mode",
    "facts",
    "calculations",
    "comparisons",
    "interpretation",
)


def _root() -> Path:
    env = os.environ.get("CONFENGE_CONTRACT_ANALYSIS_ROOT")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[2]


def material_payload(record: dict[str, Any]) -> dict[str, Any]:
    return {key: record.get(key) for key in _MATERIAL_KEYS}


def material_hash(record: dict[str, Any]) -> str:
    blob = json.dumps(material_payload(record), ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def approval_triple(record: dict[str, Any]) -> tuple[str, str, str]:
    """INDEX approval is bound to analysis_id + evidence_pack_version + content hash."""
    aid = str(record.get("id") or record.get("analysis_id") or record.get("analysis_candidate_id") or "")
    pack = str(record.get("evidence_pack_version") or "")
    digest = str(record.get("content_hash") or "")
    return aid, pack, digest


def triple_complete(record: dict[str, Any]) -> bool:
    aid, pack, digest = approval_triple(record)
    return bool(aid and pack and digest)


def _is_fixture_record(record: dict[str, Any]) -> bool:
    if record.get("is_fixture") or record.get("test_only"):
        return True
    return record.get("catalog_mode") in {"fixture", "offline_catalog"}


def approvals_path(root: Path | None = None) -> Path:
    return (root or _root()) / APPROVALS_REL


def load_approvals(root: Path | None = None) -> dict[str, Any]:
    path = approvals_path(root)
    if not path.is_file():
        return {"schema": APPROVAL_SCHEMA, "approvals": []}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return {"schema": APPROVAL_SCHEMA, "approvals": []}
    payload.setdefault("approvals", [])
    return payload


def approval_rendered_hash_ok(
    record: dict[str, Any],
    rendered_html: str,
    *,
    root: Path | None = None,
) -> tuple[bool, list[str]]:
    """A stored rendered_content_hash must still match the HTML that would go live."""
    stored = find_approval(record, root=root)
    if stored is None:
        return True, []
    expected = str(stored.get("rendered_content_hash") or "")
    if not expected:
        return True, []
    actual = rendered_content_hash(rendered_html)
    if actual != expected:
        return False, ["approval_rendered_hash_mismatch"]
    return True, []


def find_approval(record: dict[str, Any], *, root: Path | None = None) -> dict[str, Any] | None:
    aid, pack, digest = approval_triple(record)
    if not (aid and pack and digest):
        return None
    expected = material_hash(record)
    for row in load_approvals(root).get("approvals") or []:
        if not isinstance(row, dict):
            continue
        if row.get("withdrawn"):
            continue
        if str(row.get("analysis_id") or "") != aid:
            continue
        if str(row.get("evidence_pack_version") or "") != pack:
            continue
        if str(row.get("content_hash") or "") != digest:
            continue
        if str(row.get("material_hash") or "") != expected:
            continue
        if row.get("state") != "PUBLISHABLE_INDEX":
            continue
        return row
    return None


class ApprovalError(ValueError):
    """Mass or fixture approval is refused."""


def approve_many(*_args: Any, **_kwargs: Any) -> None:
    """There is no bulk INDEX approval path."""
    raise ApprovalError("mass_approval_forbidden")


approve_all = approve_many


def approve_one(
    record: dict[str, Any],
    *,
    actor: str,
    rollback: str,
    root: Path | None = None,
) -> dict[str, Any]:
    """Record a single human INDEX approval. Refuses fixtures and incomplete triples."""
    if _is_fixture_record(record):
        raise ApprovalError("approval_refused_fixture")
    if not triple_complete(record):
        raise ApprovalError("approval_triple_incomplete")
    if not rollback:
        raise ApprovalError("approval_rollback_absent")
    if not str(actor or "").strip():
        raise ApprovalError("approval_actor_absent")
    aid, pack, digest = approval_triple(record)
    row = {
        "analysis_id": aid,
        "evidence_pack_version": pack,
        "content_hash": digest,
        "material_hash": material_hash(record),
        "state": "PUBLISHABLE_INDEX",
        "actor": str(actor).strip(),
        "rollback": rollback,
        "approved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "withdrawn": False,
    }
    payload = load_approvals(root)
    payload["schema"] = APPROVAL_SCHEMA
    payload.setdefault("audit", [])
    payload["audit"].append({"action": "approve_one", **row})
    payload["approvals"] = [
        existing
        for existing in (payload.get("approvals") or [])
        if not (
            isinstance(existing, dict)
            and existing.get("analysis_id") == aid
            and not existing.get("withdrawn")
        )
    ]
    payload["approvals"].append(row)
    path = approvals_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return row


def withdraw_approval(
    analysis_id: str,
    *,
    actor: str,
    reason: str,
    root: Path | None = None,
) -> dict[str, Any]:
    """Audit-trailed rollback: withdraw every active INDEX approval for this id."""
    payload = load_approvals(root)
    payload.setdefault("audit", [])
    withdrawn = 0
    for row in payload.get("approvals") or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("analysis_id") or "") != str(analysis_id):
            continue
        if row.get("withdrawn"):
            continue
        row["withdrawn"] = True
        row["withdrawn_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        row["withdrawn_by"] = str(actor or "").strip()
        row["withdraw_reason"] = str(reason or "fast_withdrawal")
        withdrawn += 1
    event = {
        "action": "withdraw",
        "analysis_id": analysis_id,
        "actor": str(actor or "").strip(),
        "reason": str(reason or "fast_withdrawal"),
        "count": withdrawn,
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    payload["audit"].append(event)
    path = approvals_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return event


def approval_allows_index(record: dict[str, Any], *, root: Path | None = None) -> tuple[bool, list[str]]:
    """INDEX requires a stored approval whose triple and material hash still match."""
    reasons: list[str] = []
    if _is_fixture_record(record):
        return False, ["approval_refused_fixture"]
    if not triple_complete(record):
        return False, ["approval_triple_incomplete"]
    if not record.get("approved_for_index") and not find_approval(record, root=root):
        return False, ["approval_absent"]
    stored = find_approval(record, root=root)
    expected = material_hash(record)
    aid, pack, digest = approval_triple(record)
    if stored is None:
        # Inline approval on the record (tests) still needs the triple + hash + rollback.
        inline_hash = str(record.get("material_hash") or "")
        rollback = record.get("rollback") or (record.get("approval") or {}).get("rollback")
        inline_pack = str(record.get("approved_evidence_pack_version") or pack)
        inline_digest = str(record.get("approved_content_hash") or digest)
        if (
            record.get("approved_for_index")
            and inline_hash == expected
            and rollback
            and inline_pack == pack
            and inline_digest == digest
        ):
            return True, []
        if record.get("approved_for_index") and not inline_hash:
            reasons.append("approval_material_hash_absent")
            return False, reasons
        if record.get("approved_for_index") and inline_hash != expected:
            reasons.append("approval_material_hash_mismatch")
            return False, reasons
        if record.get("approved_for_index") and (inline_pack != pack or inline_digest != digest):
            reasons.append("approval_triple_mismatch")
            return False, reasons
        if not rollback:
            reasons.append("approval_rollback_absent")
        reasons.append("approval_absent")
        return False, reasons
    if str(stored.get("material_hash") or "") != expected:
        return False, ["approval_material_hash_mismatch"]
    if str(stored.get("evidence_pack_version") or "") != pack or str(stored.get("content_hash") or "") != digest:
        return False, ["approval_triple_mismatch"]
    if not stored.get("rollback"):
        return False, ["approval_rollback_absent"]
    return True, []


def active_index_count(*, root: Path | None = None) -> int:
    return sum(
        1
        for row in load_approvals(root).get("approvals") or []
        if isinstance(row, dict) and row.get("state") == "PUBLISHABLE_INDEX" and not row.get("withdrawn")
    )


def rendered_content_hash(html: str) -> str:
    return hashlib.sha256((html or "").encode("utf-8")).hexdigest()


def evaluate_conditional_checklist(
    record: dict[str, Any],
    *,
    quality: dict[str, Any] | None = None,
    handoff: dict[str, Any] | None = None,
    rendered_html: str = "",
    producer_root_hash: str = "",
    source_dossier_hash: str = "",
    suite_green: bool = False,
) -> dict[str, bool]:
    from scripts.contract_analysis.consume import (
        claim_has_locator,
        iter_material_claims,
        official_live_declared,
    )
    from scripts.contract_analysis.handoff import HANDOFF_READY

    quality = quality or {}
    handoff = handoff or {}
    dimensions = quality.get("dimensions") if isinstance(quality.get("dimensions"), dict) else {}
    hard_gates = quality.get("hard_gates") if isinstance(quality.get("hard_gates"), dict) else {}
    score = quality.get("score")
    try:
        score_n = int(score)
    except (TypeError, ValueError):
        score_n = -1
    locators_ok = bool(iter_material_claims(record)) and all(
        claim_has_locator(item) for item in iter_material_claims(record)
    )
    author = record.get("author") if isinstance(record.get("author"), dict) else {"name": record.get("author")}
    reviewer = record.get("reviewer") if isinstance(record.get("reviewer"), dict) else {"name": record.get("reviewer")}
    author_name = str((author or {}).get("name") if isinstance(author, dict) else author or "")
    reviewer_name = str((reviewer or {}).get("name") if isinstance(reviewer, dict) else reviewer or "")
    html = rendered_html or ""
    cta_ok = (
        'data-asset-id="' in html
        and 'data-cta-id="' in html
        and 'data-route-family="' in html
        and "@" not in html.split('id="proximo-passo"')[-1][:800] if 'id="proximo-passo"' in html else True
    )
    schema_ok = "CaseStudy" not in html and "Review" not in html and "Product" not in html
    lowered = html.lower()
    commercial = "nosso cliente" in lowered or "case de cliente" in lowered
    remainder = (
        lowered.replace("não é um caso confenge", " ")
        .replace("nao e um caso confenge", " ")
        .replace("não é caso confenge", " ")
        .replace("nao e caso confenge", " ")
        .replace("não implica relação comercial", " ")
        .replace("nao implica relacao comercial", " ")
    )
    commercial = commercial or "caso confenge" in remainder
    hashes_ok = bool(producer_root_hash and source_dossier_hash and record.get("content_hash"))
    return {
        "source_official_live": official_live_declared(record)
        or (
            record.get("source_kind") == "official_live"
            and record.get("catalog_mode") == "official_live"
            and not record.get("is_fixture")
        ),
        "handoff_ready_verified": handoff.get("status") == HANDOFF_READY and bool(handoff.get("path")),
        "material_claims_have_locators": locators_ok,
        "hard_gates_all_true": bool(hard_gates) and all(bool(value) for value in hard_gates.values()),
        "quality_total_ge_88": score_n >= OWNER_QUALITY_MIN,
        "no_dimension_below_75": bool(dimensions)
        and all(int(value) >= OWNER_DIMENSION_MIN for value in dimensions.values() if value is not None),
        "insight_singular": len(str(record.get("insight_singular") or "")) >= 80,
        "utility_beyond_source": len(str(record.get("utility_beyond_source") or "")) >= 60,
        "method_limitations_author_reviewer_visible": (
            len(str(record.get("methodology") or "")) >= 40
            and len(str(record.get("limitations") or "")) >= 40
            and len(author_name) >= 5
            and (len(reviewer_name) >= 5 or bool(record.get("solo_reviewer_disclosure")))
        ),
        "author_assigned_after_review": bool(record.get("human_authorship_confirmed")) and "rascunho" not in author_name.lower(),
        "reputational_safety": quality.get("reputational_safety", True) is not False
        and "reputation_" not in str(quality.get("findings") or ""),
        "unique_content_anti_doorway": quality.get("unique_content", True) is not False,
        "cta_attribution_preserved": bool(html) and cta_ok,
        "canonical_robots_schema_sitemap_coherent": bool(html) and 'rel="canonical"' in html and schema_ok,
        "no_implied_commercial_relation": not commercial,
        "snapshot_hashes_recorded": hashes_ok,
        "suite_green": bool(suite_green),
    }


def approve_conditional_canary(
    record: dict[str, Any],
    *,
    token: str,
    rollback: str,
    rendered_html: str,
    producer_root_hash: str,
    source_dossier_hash: str,
    quality: dict[str, Any] | None = None,
    handoff: dict[str, Any] | None = None,
    suite_green: bool = False,
    root: Path | None = None,
    actor: str = OWNER_CONDITIONAL_APPROVER,
) -> dict[str, Any]:
    """Hash-bound owner-token approval for at most one INDEX canary."""
    if token != OWNER_CONDITIONAL_TOKEN:
        raise ApprovalError("conditional_token_invalid")
    if actor != OWNER_CONDITIONAL_APPROVER:
        raise ApprovalError("conditional_approver_invalid")
    if _is_fixture_record(record):
        raise ApprovalError("approval_refused_fixture")
    if active_index_count(root=root) >= 1:
        raise ApprovalError("index_cap_exceeded")
    checklist = evaluate_conditional_checklist(
        record,
        quality=quality,
        handoff=handoff,
        rendered_html=rendered_html,
        producer_root_hash=producer_root_hash,
        source_dossier_hash=source_dossier_hash,
        suite_green=suite_green,
    )
    missing = [key for key, value in checklist.items() if not value]
    if missing:
        raise ApprovalError("conditional_gates_incomplete:" + ",".join(missing))
    row = approve_one(record, actor=actor, rollback=rollback, root=root)
    row["token"] = token
    row["approver"] = OWNER_CONDITIONAL_APPROVER
    row["producer_root_hash"] = producer_root_hash
    row["source_dossier_hash"] = source_dossier_hash
    row["rendered_content_hash"] = rendered_content_hash(rendered_html)
    row["checklist"] = checklist
    payload = load_approvals(root)
    updated = []
    for existing in payload.get("approvals") or []:
        if (
            isinstance(existing, dict)
            and existing.get("analysis_id") == row["analysis_id"]
            and not existing.get("withdrawn")
        ):
            updated.append({**existing, **row})
        else:
            updated.append(existing)
    payload["approvals"] = updated
    path = approvals_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return row


def approve_preapproval_canary(
    record: dict[str, Any],
    *,
    token: str,
    rollback: str,
    rendered_html: str,
    producer_root_hash: str,
    source_dossier_hash: str,
    quality: dict[str, Any] | None = None,
    handoff: dict[str, Any] | None = None,
    suite_green: bool = False,
    root: Path | None = None,
    actor: str = OWNER_PREAPPROVAL_APPROVER,
) -> dict[str, Any]:
    """2026-08-19 owner preapproval. Distinct token/approver from the 08-17 path.

    Bound to official payload hash + rendered HTML hash. Any drift invalidates INDEX.
    The 08-17 conditional token cannot satisfy this function.
    """
    if token == OWNER_CONDITIONAL_TOKEN:
        raise ApprovalError("preapproval_token_stale_campaign")
    if token != OWNER_PREAPPROVAL_TOKEN:
        raise ApprovalError("preapproval_token_invalid")
    if actor != OWNER_PREAPPROVAL_APPROVER:
        raise ApprovalError("preapproval_approver_invalid")
    if _is_fixture_record(record):
        raise ApprovalError("approval_refused_fixture")
    if active_index_count(root=root) >= 1:
        raise ApprovalError("index_cap_exceeded")
    if not producer_root_hash or not source_dossier_hash:
        raise ApprovalError("preapproval_payload_hash_absent")
    if not rendered_html:
        raise ApprovalError("preapproval_render_absent")
    checklist = evaluate_conditional_checklist(
        record,
        quality=quality,
        handoff=handoff,
        rendered_html=rendered_html,
        producer_root_hash=producer_root_hash,
        source_dossier_hash=source_dossier_hash,
        suite_green=suite_green,
    )
    missing = [key for key, value in checklist.items() if not value]
    if missing:
        raise ApprovalError("preapproval_gates_incomplete:" + ",".join(missing))
    row = approve_one(record, actor=actor, rollback=rollback, root=root)
    row["token"] = token
    row["approver"] = OWNER_PREAPPROVAL_APPROVER
    row["approved_by"] = OWNER_PREAPPROVAL_APPROVER
    row["producer_root_hash"] = producer_root_hash
    row["source_dossier_hash"] = source_dossier_hash
    row["official_payload_hash"] = source_dossier_hash
    row["rendered_content_hash"] = rendered_content_hash(rendered_html)
    row["checklist"] = checklist
    payload = load_approvals(root)
    updated = []
    for existing in payload.get("approvals") or []:
        if (
            isinstance(existing, dict)
            and existing.get("analysis_id") == row["analysis_id"]
            and not existing.get("withdrawn")
        ):
            updated.append({**existing, **row})
        else:
            updated.append(existing)
    payload["approvals"] = updated
    path = approvals_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return row
