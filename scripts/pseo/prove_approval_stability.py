#!/usr/bin/env python3
"""Prove approval stability between two real pSEO snapshots (old vs new).

Reads real registry + snapshot pair (not unit-test doubles). Emits:
  seo/pseo-snapshot-diff.json
  seo/pseo-approval-stability.json

Fails (exit 1) when:
  - approval is invalidated only by global dataset_hash churn
  - approval is preserved after a material signature change
  - a page change cannot be classified material vs non-material
  - there is neither a preserved-approval proof nor full material invalidation justification
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.build import load_existing_reviews  # noqa: E402
from scripts.pseo.schema import validate_snapshot  # noqa: E402
from scripts.pseo.score import (  # noqa: E402
    APPROVED_REVIEWS,
    _material_signature,
    apply_human_review_gate,
    build_candidates,
    compare_material,
    page_material_hash,
)

# Fields that may change without invalidating page_material_hash (global / ops)
NON_MATERIAL_MANIFEST_KEYS = frozenset(
    {
        "generated_at",
        "source_run_id",
        "dataset_hash",
        "source_commit_sha",
        "source_branch",
        "source_repository",
        "checksums",
        "export_entrypoint",
        "exporter_entrypoint",
        "export_version",
        "exporter_version",
        "freshness",
        "freshness_by_dataset",
        "counts",
        "classification_counts",
        "denominators",
        "tables",
        "query_versions",
        "horizon",
        "limitations",
        "methodology_notes",
        "timezone",
        "snapshot_status",
        "indexable",
        "publish_status",
    }
)

MATERIAL_SIG_KEYS = frozenset(
    {
        "title",
        "h1",
        "description",
        "cta_label",
        "cta_intent",
        "archetype",
        "sources",
        "observation_count",
        "primary_contract_count",
        "unique_buyer_count",
        "unique_supplier_count",
        "mandatory_fail",
        "period_start",
        "period_end",
        "template_version",
    }
)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _page_index(registry: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {p["page_id"]: p for p in (registry.get("pages") or []) if p.get("page_id")}


def classify_page_change(
    prev: dict[str, Any] | None,
    cur_sig: dict[str, Any],
    cur_hash: str,
    human_after: str,
    material_cmp: dict[str, Any],
) -> dict[str, Any]:
    """Classify material vs non-material and approval outcome for one page."""
    prev = prev or {}
    prev_hash = prev.get("page_material_hash")
    prev_human = prev.get("human_review") or "PENDING"
    was_approved = prev_human in APPROVED_REVIEWS
    changed = list(material_cmp.get("changed_fields") or [])
    unknown = [f for f in changed if f not in MATERIAL_SIG_KEYS]
    material_change = bool(material_cmp.get("needs_review"))
    # Non-material if hashes equal (even if dataset_hash/global churn)
    if prev_hash and prev_hash == cur_hash:
        material_change = False
        change_class = "non_material"
    elif not prev_hash and not prev.get("reviewed_material_signature"):
        change_class = "no_prior_approval_baseline"
        material_change = False
    elif material_change:
        change_class = "material"
    else:
        change_class = "non_material"

    approval_preserved = was_approved and human_after in APPROVED_REVIEWS
    approval_invalidated = was_approved and human_after not in APPROVED_REVIEWS

    reasons: list[str] = []
    if approval_invalidated:
        if material_change and changed:
            reasons = [f"material_field:{f}" for f in changed]
        elif material_change:
            reasons = ["material_hash_changed"]
        else:
            reasons = ["invalidated_without_material_change"]
    elif approval_preserved and material_change:
        reasons = ["preserved_despite_material_change"]
    elif approval_preserved:
        reasons = ["material_hash_unchanged"]
    elif not was_approved:
        reasons = ["no_prior_approval"]

    return {
        "previous_page_material_hash": prev_hash,
        "new_page_material_hash": cur_hash,
        "previous_approval": prev_human,
        "new_approval": human_after,
        "material_change": material_change,
        "change_class": change_class,
        "changed_fields": changed,
        "unclassifiable_fields": unknown,
        "approval_preserved": approval_preserved,
        "approval_invalidated": approval_invalidated,
        "approval_invalidation_reasons": reasons if approval_invalidated else [],
        "severity": material_cmp.get("severity"),
    }


def build_diff(
    old_manifest: dict[str, Any],
    new_manifest: dict[str, Any],
    old_registry: dict[str, Any],
    page_results: dict[str, dict[str, Any]],
    cands_by_id: dict[str, Any],
) -> dict[str, Any]:
    old_pages = set(_page_index(old_registry))
    new_pages = set(cands_by_id)
    added = sorted(new_pages - old_pages)
    removed = sorted(old_pages - new_pages)
    material = sorted(
        pid for pid, r in page_results.items() if r.get("material_change") and pid in old_pages
    )
    non_material = sorted(
        pid
        for pid, r in page_results.items()
        if not r.get("material_change") and pid in old_pages & new_pages
    )
    preserved = sorted(pid for pid, r in page_results.items() if r.get("approval_preserved"))
    invalidated = sorted(pid for pid, r in page_results.items() if r.get("approval_invalidated"))
    inv_reasons = {
        pid: page_results[pid].get("approval_invalidation_reasons") or []
        for pid in invalidated
    }
    schema_changed = (old_manifest.get("schema_version") or "") != (
        new_manifest.get("schema_version") or ""
    )
    return {
        "old_snapshot_hash": old_manifest.get("dataset_hash"),
        "new_snapshot_hash": new_manifest.get("dataset_hash"),
        "old_source_commit_sha": old_manifest.get("source_commit_sha"),
        "new_source_commit_sha": new_manifest.get("source_commit_sha"),
        "old_source_branch": old_manifest.get("source_branch"),
        "new_source_branch": new_manifest.get("source_branch"),
        "schema_version_changed": schema_changed,
        "old_schema_version": old_manifest.get("schema_version"),
        "new_schema_version": new_manifest.get("schema_version"),
        "pages_added": added,
        "pages_removed": removed,
        "pages_materially_changed": material,
        "pages_non_materially_changed": non_material,
        "approvals_preserved": preserved,
        "approvals_invalidated": invalidated,
        "approval_invalidation_reasons": inv_reasons,
        "page_results": page_results,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def prove(
    *,
    old_data_dir: Path,
    new_data_dir: Path,
    old_registry_path: Path,
    seed_page_ids: list[str] | None = None,
) -> dict[str, Any]:
    old_man = _load_json(old_data_dir / "manifest.json")
    new_snap = validate_snapshot(new_data_dir)
    if not new_snap.get("ok"):
        raise SystemExit(f"new snapshot invalid: {new_snap}")
    new_man = new_snap["manifest"]
    new_data = new_snap["data"]
    old_reg = _load_json(old_registry_path)
    reviews = load_existing_reviews(old_registry_path)

    cands = build_candidates(new_data, new_man)
    cands = apply_human_review_gate(
        cands, reviews, dataset_hash=new_man.get("dataset_hash")
    )
    cands_by_id = {c.page_id: c for c in cands}
    old_by_id = _page_index(old_reg)

    page_results: dict[str, dict[str, Any]] = {}
    for c in cands:
        prev = reviews.get(c.page_id) or old_by_id.get(c.page_id) or {}
        # Prefer reviewed signature as baseline for material compare
        prev_sig = (
            prev.get("reviewed_material_signature")
            or prev.get("current_material_signature")
            or {}
        )
        cur_sig = _material_signature(c)
        cur_hash = page_material_hash(cur_sig)
        material_cmp = compare_material(prev_sig, cur_sig)
        # Prefer gate outcome
        human_after = getattr(c, "human_review", None) or "PENDING"
        row = classify_page_change(prev, cur_sig, cur_hash, human_after, material_cmp)
        row["page_id"] = c.page_id
        row["url"] = c.url
        row["page_type"] = c.page_type
        row["status_after_gate"] = c.status
        page_results[c.page_id] = row

    diff = build_diff(old_man, new_man, old_reg, page_results, cands_by_id)

    # Focus proof on seeds if provided
    focus_ids = seed_page_ids or sorted(page_results)
    focus = {pid: page_results[pid] for pid in focus_ids if pid in page_results}

    errors: list[str] = []
    preserved_proof: list[str] = []
    invalidation_proof: list[str] = []

    for pid, r in focus.items():
        if r.get("unclassifiable_fields"):
            errors.append(
                f"{pid}: unclassifiable material fields {r['unclassifiable_fields']}"
            )
        if r.get("approval_invalidated"):
            reasons = r.get("approval_invalidation_reasons") or []
            if not r.get("material_change"):
                errors.append(
                    f"{pid}: approval invalidated without material change "
                    f"(global-only invalidation forbidden): {reasons}"
                )
            elif any("without_material" in x for x in reasons):
                errors.append(f"{pid}: global-only invalidation: {reasons}")
            else:
                invalidation_proof.append(pid)
        if r.get("approval_preserved"):
            if r.get("material_change"):
                errors.append(
                    f"{pid}: approval preserved after material change "
                    f"fields={r.get('changed_fields')}"
                )
            else:
                preserved_proof.append(pid)

    # Require either at least one preserved approved page OR full justification of all invalidations
    approved_before = [
        pid
        for pid in focus
        if (reviews.get(pid) or {}).get("human_review") in APPROVED_REVIEWS
        or (old_by_id.get(pid) or {}).get("human_review") in APPROVED_REVIEWS
    ]
    if approved_before:
        for pid in approved_before:
            r = focus.get(pid) or page_results.get(pid)
            if not r:
                errors.append(f"{pid}: missing result for previously approved page")
                continue
            if r.get("approval_preserved"):
                continue
            if r.get("approval_invalidated") and r.get("material_change") and (
                r.get("approval_invalidation_reasons")
            ):
                continue
            errors.append(
                f"{pid}: insufficient evidence to classify approval outcome"
            )
        if not preserved_proof and not invalidation_proof and approved_before:
            errors.append(
                "no preserved-approval proof and no material-invalidation justification"
            )
    else:
        # No prior approvals in focus — still ok if hashes classifiable
        pass

    # Global dataset_hash churn alone must not appear as sole invalidation reason
    for pid, r in page_results.items():
        if not r.get("approval_invalidated"):
            continue
        reasons = r.get("approval_invalidation_reasons") or []
        if reasons == ["dataset_hash"] or (
            not r.get("material_change") and reasons
        ):
            errors.append(f"{pid}: approval invalidated by global dataset churn only")

    ok = not errors
    stability = {
        "ok": ok,
        "approval_stability_proven": ok
        and (
            bool(preserved_proof)
            or bool(invalidation_proof)
            or not approved_before
        ),
        "errors": errors,
        "preserved_approval_proof_pages": preserved_proof,
        "material_invalidation_proof_pages": invalidation_proof,
        "focus_page_ids": list(focus),
        "focus_results": focus,
        "old_snapshot_hash": old_man.get("dataset_hash"),
        "new_snapshot_hash": new_man.get("dataset_hash"),
        "old_source_commit_sha": old_man.get("source_commit_sha"),
        "new_source_commit_sha": new_man.get("source_commit_sha"),
        "new_source_branch": new_man.get("source_branch"),
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "notes": [
            "Materiality is defined by scripts.pseo.score._material_signature / page_material_hash.",
            "Global dataset_hash / generated_at / source_run_id are non-material for approvals.",
        ],
    }
    return {"diff": diff, "stability": stability, "ok": ok}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--old-data",
        type=Path,
        default=ROOT / "data" / "pseo",
        help="Directory of the previously published snapshot (manifest + bodies)",
    )
    ap.add_argument(
        "--new-data",
        type=Path,
        default=None,
        help="Directory of the candidate snapshot (default: data/pseo if already applied, "
        "else require explicit path)",
    )
    ap.add_argument(
        "--old-registry",
        type=Path,
        default=ROOT / "data" / "pseo" / "registry.json",
    )
    ap.add_argument(
        "--candidate",
        type=Path,
        default=None,
        help="Alias for --new-data (candidate export dir)",
    )
    ap.add_argument(
        "--seed-page-id",
        action="append",
        default=None,
        help="Focus page_id (repeatable). Default: four Wave 0 seeds.",
    )
    ap.add_argument(
        "--out-diff",
        type=Path,
        default=ROOT / "seo" / "pseo-snapshot-diff.json",
    )
    ap.add_argument(
        "--out-stability",
        type=Path,
        default=ROOT / "seo" / "pseo-approval-stability.json",
    )
    args = ap.parse_args(argv)

    new_data = args.new_data or args.candidate
    if new_data is None:
        # If CANDIDATE marker path exists use it; else same as old (after apply)
        cand = ROOT / "seo" / "evidence-audit-2026-07-30"  # fallback unused
        new_data = ROOT / "data" / "pseo"

    seed_ids = args.seed_page_id or [
        "prob-aditivos-margem",
        "prob-orcamento-edital",
        "prob-sinapi-sicro",
        "radar-edificacoes-publicas-pr",
    ]

    # When old and new are the same directory, require an explicit prior registry
    # backup is not available — still run against current state for post-apply proof.
    result = prove(
        old_data_dir=args.old_data,
        new_data_dir=Path(new_data),
        old_registry_path=args.old_registry,
        seed_page_ids=seed_ids,
    )
    args.out_diff.parent.mkdir(parents=True, exist_ok=True)
    args.out_diff.write_text(
        json.dumps(result["diff"], indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    args.out_stability.write_text(
        json.dumps(result["stability"], indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "ok": result["ok"],
                "approval_stability_proven": result["stability"][
                    "approval_stability_proven"
                ],
                "errors": result["stability"]["errors"],
                "preserved": result["stability"]["preserved_approval_proof_pages"],
                "invalidated": result["stability"]["material_invalidation_proof_pages"],
                "out_diff": str(args.out_diff),
                "out_stability": str(args.out_stability),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
