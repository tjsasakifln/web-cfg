"""Build national pSEO candidate inventory from export snapshot + GSC evidence.

Does not invent search volume. demand_evidence is gsc|analytics|unknown.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.evidence_ledger import ledger_from_candidate, validate_ledger  # noqa: E402
from scripts.pseo.lifecycle import derive_lifecycle_from_registry_page  # noqa: E402
from scripts.pseo.page_value_score import score_from_candidate_dict  # noqa: E402
from scripts.pseo.score import build_candidates  # noqa: E402
from scripts.pseo.schema import validate_snapshot  # noqa: E402

CTA_BY_TYPE = {
    "market": ("Solicitar um mapa aplicado à minha empresa", "mapa_mercado"),
    "agency": ("Avaliar estratégia para vender a este órgão", "estrategia_orgao"),
    "competition": ("Analisar posicionamento competitivo", "posicionamento"),
    "radar": ("Analisar edital antes da proposta", "analise_edital"),
    "price": ("Validar orçamento, preço, risco e margem", "validar_preco"),
    "problem_service": ("Solicitar diagnóstico técnico", "diagnostico_tecnico"),
}


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_gsc_queries(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"available": False, "queries": []}
    # Prefer metrics/gsc monthly json
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"available": False, "queries": []}
    return {"available": True, "raw": data}


def build_inventory(
    data_dir: Path,
    *,
    gsc_path: Path | None = None,
    registry_path: Path | None = None,
) -> dict[str, Any]:
    snap = validate_snapshot(data_dir)
    data = snap["data"]
    manifest = snap["manifest"]
    cands = build_candidates(data, manifest)
    gsc = load_gsc_queries(
        gsc_path or (data_dir / "metrics" / "gsc" / "2026-07.json")
    )
    reg_pages: dict[str, dict] = {}
    if registry_path and registry_path.exists():
        reg = json.loads(registry_path.read_text(encoding="utf-8"))
        for p in reg.get("pages") or []:
            if p.get("page_id"):
                reg_pages[p["page_id"]] = p

    items: list[dict[str, Any]] = []
    type_counts: Counter = Counter()
    status_counts: Counter = Counter()
    for c in cands:
        d = c.as_dict()
        d["data_ref"] = c.data_ref
        d["demand_evidence"] = "gsc" if gsc.get("available") else "unknown"
        # Do not invent volume
        d["search_volume_monthly"] = None
        d["demand_note"] = (
            "GSC artifact present but page-level volume not fabricated"
            if gsc.get("available")
            else "No verifiable demand source; demand_evidence=unknown"
        )
        pvs = score_from_candidate_dict(d)
        d["page_value_score"] = pvs["page_value_score"]
        d["page_value_breakdown"] = pvs["breakdown"]
        d["publish_blocked_by_semantic_gates"] = pvs["publish_blocked_by_semantic_gates"]
        ledger = ledger_from_candidate(d)
        d["evidence_ledger"] = ledger
        d["evidence_ledger_validation"] = validate_ledger(ledger)
        prior = reg_pages.get(c.page_id) or {}
        merged = {
            **d,
            "human_review": prior.get("human_review") or d.get("human_review"),
            "indexation_status": prior.get("indexation_status") or prior.get("gsc_verdict"),
            "redirect_to": prior.get("redirect_to"),
            "http_status": prior.get("http_status"),
        }
        d["lifecycle_state"] = derive_lifecycle_from_registry_page(merged)
        d["human_review"] = merged["human_review"]
        # CTA coherence
        if c.page_type in CTA_BY_TYPE and not d.get("cta_label"):
            lab, intent = CTA_BY_TYPE[c.page_type]
            d["cta_label"] = lab
            d["cta_intent"] = intent
        type_counts[c.page_type] += 1
        status_counts[c.status] += 1
        items.append(d)

    # Coverage matrix: segment × UF × type
    matrix: dict[str, Any] = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    for it in items:
        seg = it.get("archetype") or it.get("segment") or "_"
        uf = it.get("region") or "_"
        matrix[str(seg)][str(uf)][str(it.get("page_type"))] += 1

    coverage = {
        "by_segment_uf_type": {
            seg: {uf: dict(types) for uf, types in ufs.items()}
            for seg, ufs in matrix.items()
        },
        "type_counts": dict(type_counts),
        "status_counts": dict(status_counts),
    }

    # Query map entries (no invented volumes)
    query_map_pages = []
    for it in items:
        query_map_pages.append(
            {
                "page_id": it["page_id"],
                "url": it["url"],
                "page_type": it["page_type"],
                "primary_intent": it.get("intent"),
                "primary_query": None, # filled from GSC when available, never invented
                "demand_evidence": it["demand_evidence"],
                "search_volume_monthly": None,
                "page_value_score": it["page_value_score"],
                "lifecycle_state": it["lifecycle_state"],
                "editorial_status": it.get("human_review") or "PENDING",
                "publication_status": it.get("status"),
                "indexation_status": "NOT_ASSUMED",
                "cta_intent": it.get("cta_intent"),
            }
        )

    # Wave 1 proposal: diversity across page_type × segment × UF × intent
    # Target mix (when eligible candidates exist for each type).
    WAVE1_TYPE_QUOTAS = {
        "market": 10,
        "competition": 8,
        "agency": 8,
        "price": 8,
        "radar": 6,
        "problem_service": 5,
    }
    WAVE1_MAX = 50
    eligible = [
        it
        for it in items
        if it.get("quality_eligible")
        and not it.get("mandatory_fail")
        and int(it.get("page_value_score") or 0) >= 65
        and (it.get("status") or "") != "reject"
    ]
    eligible.sort(
        key=lambda x: (-int(x.get("page_value_score") or 0), str(x.get("page_id") or ""))
    )

    def _wave1_entry(it: dict[str, Any], reason: str) -> dict[str, Any]:
        return {
            "page_id": it["page_id"],
            "url": it["url"],
            "page_type": it["page_type"],
            "segment": it.get("archetype") or it.get("segment"),
            "region": it.get("region"),
            "intent": it.get("intent"),
            "page_value_score": it["page_value_score"],
            "lifecycle_state": it["lifecycle_state"],
            "status": it["status"],
            "mandatory_fail": it.get("mandatory_fail"),
            "reason": reason,
        }

    wave1: list[dict[str, Any]] = []
    selected_ids: set[str] = set()
    type_counts: Counter = Counter()
    # Keys: (page_type, segment, region, intent) for fine diversity
    seen_combo: set[tuple[str, str, str, str]] = set()
    seen_type_seg_uf: set[tuple[str, str, str]] = set()

    def _try_add(it: dict[str, Any], reason: str, *, force_type_quota: bool = False) -> bool:
        if len(wave1) >= WAVE1_MAX:
            return False
        pid = str(it.get("page_id") or "")
        if not pid or pid in selected_ids:
            return False
        ptype = str(it.get("page_type") or "")
        seg = str(it.get("archetype") or it.get("segment") or "_")
        uf = str(it.get("region") or "_")
        intent = str(it.get("intent") or "_")
        combo = (ptype, seg, uf, intent)
        tsu = (ptype, seg, uf)
        # Prefer unique type×segment×UF; allow only if quota not filled for type
        if tsu in seen_type_seg_uf and not force_type_quota:
            return False
        if combo in seen_combo:
            return False
        quota = WAVE1_TYPE_QUOTAS.get(ptype)
        if quota is not None and type_counts[ptype] >= quota and not force_type_quota:
            return False
        wave1.append(_wave1_entry(it, reason))
        selected_ids.add(pid)
        type_counts[ptype] += 1
        seen_combo.add(combo)
        seen_type_seg_uf.add(tsu)
        return True

    # Pass 1: fill type quotas round-robin by score within each type
    by_type: dict[str, list] = defaultdict(list)
    for it in eligible:
        by_type[str(it.get("page_type") or "")].append(it)
    # Round-robin across types that have quotas first
    ordered_types = list(WAVE1_TYPE_QUOTAS.keys()) + sorted(
        t for t in by_type if t not in WAVE1_TYPE_QUOTAS
    )
    progressed = True
    while progressed and len(wave1) < WAVE1_MAX:
        progressed = False
        for ptype in ordered_types:
            pool = by_type.get(ptype) or []
            for it in pool:
                if _try_add(it, "diversity_quota_pass"):
                    progressed = True
                    break

    # Pass 2: fill remaining slots with best remaining scores, still avoiding
    # exact type×segment×UF duplicates. Soft cap: no type exceeds 2× its quota
    # (or 12 if unlisted) so competition cannot dominate Wave 1.
    soft_caps = {t: max(q * 2, q + 4) for t, q in WAVE1_TYPE_QUOTAS.items()}
    for it in eligible:
        if len(wave1) >= WAVE1_MAX:
            break
        ptype = str(it.get("page_type") or "")
        cap = soft_caps.get(ptype, 12)
        if type_counts.get(ptype, 0) >= cap:
            continue
        _try_add(it, "diversity_fill_pass", force_type_quota=True)
    wave1_diversity = {
        "type_counts": dict(type_counts),
        "quotas": dict(WAVE1_TYPE_QUOTAS),
        "unique_type_segment_uf": len(seen_type_seg_uf),
        "types_present": sorted(type_counts.keys()),
        "missing_quota_types": sorted(
            t
            for t, q in WAVE1_TYPE_QUOTAS.items()
            if type_counts.get(t, 0) == 0 and (by_type.get(t) or [])
        ),
        "note": (
            "Wave 1 ranks by page_value_score with hard diversity across "
            "page_type × segment × UF × intent; not competition-only."
        ),
    }
    # Reject thin / non-diverse doorway types
    rejected = [
        {
            "page_id": it["page_id"],
            "reason": it.get("mandatory_fail") or it.get("reasons") or ["not_eligible"],
            "status": it["status"],
        }
        for it in items
        if it["status"] == "reject" or it.get("mandatory_fail")
    ]

    return {
        "schema_version": "1.0.0",
        "generated_at": _now(),
        "dataset_hash": manifest.get("dataset_hash"),
        "source_commit_sha": manifest.get("source_commit_sha"),
        "export_version": manifest.get("export_version"),
        "denominators": manifest.get("denominators") or {},
        "n_candidates": len(items),
        "candidates": items,
        "coverage_matrix": coverage,
        "query_map": {
            "version": "national-1",
            "schema_note": "No search volume invented; demand_evidence unknown when unverified",
            "pages": query_map_pages,
        },
        "wave1_proposal": {
            "n": len(wave1),
            "pages": wave1,
            "diversity": wave1_diversity,
            "note": (
                "Proposal only, publish still requires human approval, "
                "similarity, and production gates. Never autopublish. "
                "Diversity quotas across market/competition/agency/price/radar/"
                "problem_service when eligible candidates exist."
            ),
        },
        "rejected_summary": {
            "n": len(rejected),
            "sample": rejected[:100],
        },
        "gsc_available": bool(gsc.get("available")),
        "principles": [
            "No page per contract/supplier/municipality without editorial value",
            "page_value_score does not override semantic gates",
            "demand_evidence unknown when no GSC/analytics proof",
            "Indexation never inferred from sitemap or deploy",
        ],
    }


def render_inventory_md(inv: dict[str, Any]) -> str:
    lines = [
        "# pSEO National Candidate Inventory",
        "",
        f"- generated_at: `{inv['generated_at']}`",
        f"- dataset_hash: `{inv.get('dataset_hash')}`",
        f"- n_candidates: **{inv['n_candidates']}**",
        f"- wave1_proposal: **{inv['wave1_proposal']['n']}**",
        f"- rejected: **{inv['rejected_summary']['n']}**",
        f"- gsc_available: {inv['gsc_available']}",
        "",
        "## Coverage (type counts)",
        "",
    ]
    for k, v in (inv.get("coverage_matrix") or {}).get("type_counts", {}).items():
        lines.append(f"- {k}: {v}")
    lines += ["", "## Wave 1 proposal", ""]
    for p in inv["wave1_proposal"]["pages"][:50]:
        lines.append(
            f"- `{p['page_id']}` score={p['page_value_score']} "
            f"type={p['page_type']} status={p['status']} lifecycle={p['lifecycle_state']}"
        )
    lines += ["", "## Principles", ""]
    for p in inv.get("principles") or []:
        lines.append(f"- {p}")
    lines.append("")
    return "\n".join(lines)


def write_inventory(inv: dict[str, Any], *, data_dir: Path, seo_dir: Path) -> dict[str, str]:
    data_dir.mkdir(parents=True, exist_ok=True)
    seo_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "inventory_json": str(data_dir / "national-candidate-inventory.json"),
        "inventory_md": str(seo_dir / "pseo-national-candidate-inventory.md"),
        "coverage": str(seo_dir / "pseo-coverage-matrix.json"),
        "query_map": str(seo_dir / "pseo-query-map.json"),
    }
    (data_dir / "national-candidate-inventory.json").write_text(
        json.dumps(inv, ensure_ascii=False, indent=2, sort_keys=True, default=str) + "\n",
        encoding="utf-8",
    )
    (seo_dir / "pseo-national-candidate-inventory.md").write_text(
        render_inventory_md(inv), encoding="utf-8"
    )
    (seo_dir / "pseo-coverage-matrix.json").write_text(
        json.dumps(inv["coverage_matrix"], ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    # Merge/preserve national query map (versioned)
    (seo_dir / "pseo-query-map.json").write_text(
        json.dumps(inv["query_map"], ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return paths


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build national pSEO candidate inventory")
    parser.add_argument("--data", type=Path, default=ROOT / "data" / "pseo")
    parser.add_argument("--seo", type=Path, default=ROOT / "seo")
    parser.add_argument("--registry", type=Path, default=ROOT / "data" / "pseo" / "registry.json")
    args = parser.parse_args(argv)
    inv = build_inventory(args.data, registry_path=args.registry)
    paths = write_inventory(inv, data_dir=args.data, seo_dir=args.seo)
    print(json.dumps({"ok": True, "paths": paths, "n": inv["n_candidates"], "wave1": inv["wave1_proposal"]["n"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
