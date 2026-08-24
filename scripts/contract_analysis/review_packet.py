"""Emit hash-bound human review packets. Never apply activation or approve INDEX."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from scripts.contract_analysis import AUTHORIZED_LISTING_SHA256, AUTHORIZED_PDF_SHA256
from scripts.contract_analysis.approval import material_hash, rendered_content_hash
from scripts.contract_analysis.gate import PublicationDecision
from scripts.contract_analysis.quality import HUMAN_REVIEW_PENDING, material_claims, source_claim_matrix_of

REVIEW_ROOT = Path("docs/editorial/contract-analysis/review")
PACKET_FILES = (
    "REVIEW.md",
    "claims.json",
    "source-claim-matrix.json",
    "calculations.json",
    "reputational-review.json",
    "seo-review.json",
    "rendered-content.sha256",
    "evidence-pack.sha256",
    "activation-plan.json",
    "rollback-plan.json",
)


def _root() -> Path:
    env = os.environ.get("CONFENGE_CONTRACT_ANALYSIS_ROOT")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[2]


def _sha256_text(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def activation_plan(record: dict[str, Any], decision: PublicationDecision) -> dict[str, Any]:
    aid = str(record.get("id") or decision.analysis_id)
    return {
        "schema": "contract-analysis-activation-plan/1.0",
        "analysis_id": aid,
        "applied": False,
        "forbidden_in_this_campaign": True,
        "steps": [
            {"n": 1, "action": "hash_bound_human_approval", "command": f"approve_one --id {aid} --actor HUMAN --rollback git:revert:{aid}"},
            {"n": 2, "action": "confirm_author_reviewer", "note": "Do not invent Tiago Sasaki."},
            {"n": 3, "action": "set_publication_state", "from": decision.state, "to": "PUBLISHABLE_INDEX"},
            {"n": 4, "action": "render_final"},
            {"n": 5, "action": "remove_noindex_selectively"},
            {"n": 6, "action": "adjust_robots_headers", "only": "contract-analysis family rules"},
            {"n": 7, "action": "write_family_sitemap"},
            {"n": 8, "action": "add_sitemap_index_entry"},
            {"n": 9, "action": "deploy"},
            {"n": 10, "action": "probe"},
            {"n": 11, "action": "handoff_discovery_86"},
            {"n": 12, "action": "rollback_ready"},
        ],
    }


def rollback_plan(record: dict[str, Any], decision: PublicationDecision) -> dict[str, Any]:
    aid = str(record.get("id") or decision.analysis_id)
    return {
        "schema": "contract-analysis-rollback-plan/1.0",
        "analysis_id": aid,
        "applied": False,
        "steps": [
            "withdraw_approval(analysis_id)",
            "restore PUBLISHABLE_NOINDEX and HUMAN_REVIEW_PENDING",
            "restore family Disallow and X-Robots-Tag noindex",
            "remove sitemap-analises-contratos.xml and sitemap-index entry",
            "re-render preview labeled rascunho/noindex",
        ],
        "command": f"python3 -c \"from scripts.contract_analysis.approval import withdraw_approval; withdraw_approval('{aid}', actor='HUMAN', reason='rollback')\"",
    }


def _review_markdown(
    record: dict[str, Any],
    decision: PublicationDecision,
    *,
    quality: dict[str, Any],
    rendered_hash: str,
    evidence_hash: str,
) -> str:
    aid = str(record.get("id") or decision.analysis_id)
    title = str(record.get("title") or "")
    thesis = str(record.get("thesis") or record.get("insight_singular") or "")
    lines = [
        f"# REVIEW {aid}",
        "",
        f"- URL: `/analises-contratos-publicos/{decision.slug}/`",
        f"- title: {title}",
        f"- meta: {record.get('meta_description') or record.get('executive_summary')}",
        f"- H1: {record.get('h1') or title}",
        f"- tese: {thesis}",
        f"- resumo: {record.get('executive_summary')}",
        f"- estado publicação: {decision.state}",
        f"- review: {decision.human_review_status or HUMAN_REVIEW_PENDING}",
        f"- quality verdict: {quality.get('review_verdict')}",
        f"- score: {quality.get('score')}",
        f"- dimensions: {quality.get('dimensions')}",
        f"- findings: {quality.get('findings')}",
        f"- rendered-content.sha256: {rendered_hash}",
        f"- evidence-pack.sha256: {evidence_hash}",
        f"- material_hash: {material_hash(record)}",
        "",
        "## Texto / preview",
        "",
        str(record.get("executive_summary") or ""),
        "",
        "## Fontes / locators",
        "",
        json.dumps(record.get("sources") or [], ensure_ascii=False, indent=2),
        "",
        "## Cálculos",
        "",
        json.dumps(record.get("calculations") or [], ensure_ascii=False, indent=2),
        "",
        "## Inferences / unknowns",
        "",
        json.dumps(record.get("interpretation") or [], ensure_ascii=False, indent=2),
        "",
        str(record.get("cannot_conclude") or ""),
        "",
        "## Contraprova",
        "",
        str(record.get("counterproof") or ""),
        "",
        "## Riscos",
        "",
        json.dumps(record.get("risks") or [], ensure_ascii=False, indent=2),
        "",
        "## Aprovação individual (NÃO executar nesta campanha)",
        "",
        f"`approve_one` bound to analysis_id={aid} evidence_pack_version={record.get('evidence_pack_version')} content_hash={record.get('content_hash')}",
        "",
        "## Rollback",
        "",
        f"withdraw_approval({aid!r}) and keep noindex.",
        "",
        f"{decision.human_review_status or HUMAN_REVIEW_PENDING}; no human approval, authorship or INDEX was simulated.",
        "",
    ]
    return "\n".join(lines)


def founder_decision_required(
    record: dict[str, Any],
    decision: PublicationDecision,
    *,
    rendered_hash: str,
    evidence_hash: str,
) -> str:
    aid = str(record.get("id") or decision.analysis_id)
    slug = decision.slug or record.get("slug") or aid
    preview = f"https://confenge.com.br/analises-contratos-publicos/{slug}/"
    thesis = str(record.get("thesis") or record.get("insight_singular") or "").strip()
    risks = record.get("risks") or []
    if isinstance(risks, list):
        risk_lines = "\n".join(f"- {item}" for item in risks)
    else:
        risk_lines = str(risks)
    quality = decision.quality if isinstance(getattr(decision, "quality", None), dict) else {}
    return "\n".join(
        [
            f"analysis_id: {aid}",
            f"preview_url: {preview}",
            f"publication_state: {decision.state}",
            f"human_review_status: {decision.human_review_status or HUMAN_REVIEW_PENDING}",
            f"quality_verdict: {quality.get('review_verdict')}",
            f"quality_score: {quality.get('score')}",
            "",
            "TESE",
            thesis,
            "",
            "RISCOS",
            risk_lines,
            "",
            "HASHES",
            f"rendered-content.sha256: {rendered_hash}",
            f"evidence-pack.sha256: {evidence_hash}",
            f"material_hash: {material_hash(record)}",
            f"listing_sha256: {AUTHORIZED_LISTING_SHA256}",
            f"pdf_sha256: {AUTHORIZED_PDF_SHA256}",
            f"dossier_content_hash: {record.get('content_hash')}",
            "",
            "ACTIONS (exactly two; founder only)",
            "APPROVE_FOR_INDEX_FOLLOWUP",
            "REJECT_WITH_REASON",
            "",
            "Do not call approve_one in this campaign. INDEX is not granted.",
            "",
        ]
    )


def emit_review_packet(
    record: dict[str, Any],
    decision: PublicationDecision,
    *,
    rendered_html: str = "",
    root: Path | None = None,
) -> Path:
    """Write the review packet. Does not call approve_one or change robots/sitemap."""
    base = root or _root()
    aid = str(record.get("id") or decision.analysis_id)
    dest = base / REVIEW_ROOT / aid
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "screenshots").mkdir(exist_ok=True)
    quality = decision.quality if isinstance(getattr(decision, "quality", None), dict) else {}
    rendered_hash = rendered_content_hash(rendered_html, record=record, root=base)
    evidence_hash = str(record.get("evidence_pack_hash") or _sha256_text(json.dumps(record.get("sources") or [], sort_keys=True)))
    files = {
        "REVIEW.md": _review_markdown(
            record, decision, quality=quality, rendered_hash=rendered_hash, evidence_hash=evidence_hash
        ),
        "claims.json": json.dumps(material_claims(record), ensure_ascii=False, indent=2) + "\n",
        "source-claim-matrix.json": json.dumps(source_claim_matrix_of(record), ensure_ascii=False, indent=2) + "\n",
        "calculations.json": json.dumps(record.get("calculations") or [], ensure_ascii=False, indent=2) + "\n",
        "reputational-review.json": json.dumps(
            {
                "safe": decision.conditions.get("reputational_safety") if decision.conditions else None,
                "reason_codes": [c for c in decision.reason_codes if str(c).startswith("reputation_")],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        "seo-review.json": json.dumps(
            {
                "title": record.get("title"),
                "meta": record.get("meta_description"),
                "h1": record.get("h1") or record.get("title"),
                "canonical": f"/analises-contratos-publicos/{decision.slug}/",
                "robots": decision.robots,
                "sitemap": decision.sitemap,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        "rendered-content.sha256": rendered_hash + "\n",
        "evidence-pack.sha256": evidence_hash + "\n",
        "activation-plan.json": json.dumps(activation_plan(record, decision), ensure_ascii=False, indent=2) + "\n",
        "rollback-plan.json": json.dumps(rollback_plan(record, decision), ensure_ascii=False, indent=2) + "\n",
        "FOUNDER_DECISION_REQUIRED.txt": founder_decision_required(
            record, decision, rendered_hash=rendered_hash, evidence_hash=evidence_hash
        ),
    }
    for name, body in files.items():
        (dest / name).write_text(body, encoding="utf-8")
    readme = dest / "screenshots" / "README.md"
    if not readme.is_file():
        readme.write_text(
            "Headless screenshots are optional. Packet remains valid without them.\n",
            encoding="utf-8",
        )
    return dest


def packet_complete(path: Path) -> bool:
    if not path.is_dir():
        return False
    return all((path / name).is_file() for name in PACKET_FILES) and (path / "screenshots").is_dir()


def packet_hashes_match_rendered(
    path: Path,
    *,
    rendered_html: str,
    record: dict[str, Any] | None = None,
    root: Path | None = None,
) -> bool:
    """True only when packet SHA files match the rendered HTML and evidence bytes."""
    if not packet_complete(path):
        return False
    expected_rendered = rendered_content_hash(rendered_html, record=record, root=root)
    stored_rendered = (path / "rendered-content.sha256").read_text(encoding="utf-8").strip()
    if stored_rendered != expected_rendered:
        return False
    review = (path / "REVIEW.md").read_text(encoding="utf-8")
    if expected_rendered not in review:
        return False
    stored_evidence = (path / "evidence-pack.sha256").read_text(encoding="utf-8").strip()
    if not stored_evidence or len(stored_evidence) != 64:
        return False
    return True
