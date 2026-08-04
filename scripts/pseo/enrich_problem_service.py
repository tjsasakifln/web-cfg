#!/usr/bin/env python3
"""Editorial enrichment for problem_service after real extra-cli export.

The durable exporter ships structural bridges (refs, guides, patterns, counts).
Wave 0 editorial classification (evidence_kind, claim_evidence package, language
compatible with evidence_kind) is applied here so pages remain gate-eligible
without inventing quantitative incidence claims.

Does NOT change export provenance / dataset_hash recomputation is left to caller
if body keys that participate in dataset_hash change, prefer calling before
checksum finalization or re-hash after.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]

# Comparative / causal phrasing banned on normative_editorial pages
FORBIDDEN_NORMATIVE_COMPARATIVE = [
    re.compile(r"\bconcentram\b", re.I),
    re.compile(r"\bocorre com maior frequ[eê]ncia\b", re.I),
    re.compile(r"\bos dados mostram\b", re.I),
    re.compile(r"\bo recorte comprova\b", re.I),
    re.compile(r"\bmaior exposi[cç][aã]o\b", re.I),
    re.compile(r"\bcomprovam que\b", re.I),
    re.compile(r"\bmais frequentes?\b", re.I),
]

# Defensible rewrites (exact prior → safer technical formulation)
PATTERN_REWRITES: dict[str, str] = {
    "Obras de edificações e saneamento concentram alterações de projeto e quantitativo. Sem registro contemporâneo, o aditivo vira custo absorvido.": (
        "Obras de edificações e saneamento estão particularmente sujeitas a alterações "
        "de projeto e quantitativos durante a execução. Sem registro contemporâneo, o "
        "aditivo vira custo absorvido."
    ),
    "Arquétipos de manutenção predial e edificações com múltiplas medições concentram disputas de critério, diário de obra e parcela incontroversa.": (
        "Arquétipos de manutenção predial e edificações com múltiplas medições estão "
        "sujeitos a disputas de critério, diário de obra e parcela incontroversa."
    ),
}

# Wave 0 seed editorial decisions (do not invent new publishable pages)
SEED_EDITORIAL: dict[str, str] = {
    "prob-aditivos-margem": "PUBLISH_EDITORIAL_VALUE",
    "prob-orcamento-edital": "PUBLISH_EDITORIAL_VALUE",
    "prob-sinapi-sicro": "PUBLISH_EDITORIAL_VALUE",
    "prob-medicao-glosa": "NOINDEX_EVIDENCE_INSUFFICIENT",
    "prob-reequilibrio": "NOINDEX_EVIDENCE_INSUFFICIENT",
}


def _rewrite_pattern(text: str) -> str:
    if text in PATTERN_REWRITES:
        return PATTERN_REWRITES[text]
    # Generic soft rewrite for residual "concentram"
    return re.sub(
        r"\bconcentram\b",
        "estão particularmente sujeitas a",
        text or "",
        flags=re.I,
    )


def build_claim_evidence(p: dict[str, Any]) -> list[dict[str, Any]]:
    """Structured package: regulatory + guides + pattern + market density + limitations."""
    claims: list[dict[str, Any]] = []
    refs = p.get("official_references") or []
    if refs:
        claims.append(
            {
                "kind": "regulatory_reference",
                "summary": "Referências oficiais (lei/portal) amparam o enquadramento do problema.",
                "n": len(refs),
            }
        )
    guides = p.get("technical_guide_paths") or []
    if guides:
        claims.append(
            {
                "kind": "technical_guide",
                "summary": "Guias técnicos CONFENGE relacionados ao problema (biblioteca do site).",
                "paths": list(guides),
            }
        )
    pattern = p.get("observed_pattern") or ""
    if pattern:
        claims.append({"kind": "observed_pattern", "summary": pattern})
    n = int(p.get("evidence_count") or 0)
    if n:
        claims.append(
            {
                "kind": "market_density",
                "summary": (
                    "Contratos de engenharia no recorte público associados aos segmentos "
                    "do tema (dimensão de mercado; não mede frequência do problema)."
                ),
                "n": n,
                "role": "contextual_only",
            }
        )
    lims = p.get("limitations") or []
    if lims:
        claims.append(
            {
                "kind": "explicit_limitations",
                "summary": "Limitações editoriais publicadas na página.",
                "n": len(lims),
            }
        )
    return claims


def enrich_problem_service(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for p in rows:
        row = dict(p)
        # Editorial language
        if row.get("observed_pattern"):
            row["observed_pattern"] = _rewrite_pattern(str(row["observed_pattern"]))
        # Always normative_editorial for Wave 0 problem bridges (no direct incidence n)
        row["evidence_kind"] = "normative_editorial"
        row["claim_evidence"] = build_claim_evidence(row)
        row["evidence_signals"] = [c.get("kind") for c in row["claim_evidence"] if c.get("kind")]
        row["editorial_decision"] = SEED_EDITORIAL.get(
            str(row.get("id")), "NOINDEX_EVIDENCE_INSUFFICIENT"
        )
        out.append(row)
    return out


def find_forbidden_language(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    hits: list[dict[str, str]] = []
    for p in rows:
        kind = (p.get("evidence_kind") or "").strip()
        if kind != "normative_editorial":
            continue
        for field in ("observed_pattern", "problem_label"):
            text = str(p.get(field) or "")
            for rx in FORBIDDEN_NORMATIVE_COMPARATIVE:
                if rx.search(text):
                    hits.append(
                        {
                            "id": str(p.get("id")),
                            "field": field,
                            "pattern": rx.pattern,
                            "excerpt": text[:160],
                        }
                    )
        for ce in p.get("claim_evidence") or []:
            text = str(ce.get("summary") or "")
            for rx in FORBIDDEN_NORMATIVE_COMPARATIVE:
                if rx.search(text):
                    hits.append(
                        {
                            "id": str(p.get("id")),
                            "field": f"claim_evidence.{ce.get('kind')}",
                            "pattern": rx.pattern,
                            "excerpt": text[:160],
                        }
                    )
    return hits


def rehash_manifest(data_dir: Path) -> dict[str, Any]:
    """Recompute checksums + dataset_hash after editorial body edits."""
    sys.path.insert(0, str(ROOT))
    from scripts.pseo.schema import (  # local import
        DATASET_BODY_KEYS,
        _canonical_json,
        _sha256_text,
        load_json,
        recompute_dataset_hash,
    )

    man_path = data_dir / "manifest.json"
    man = load_json(man_path)
    checksums: dict[str, str] = {}
    for name in list((man.get("checksums") or {}).keys()) + [
        f"{k}.json" for k in DATASET_BODY_KEYS
    ]:
        p = data_dir / name
        if p.exists() and p.suffix == ".json" and p.name != "manifest.json":
            checksums[p.name] = _sha256_text(p.read_text(encoding="utf-8"))
    # stable order
    man["checksums"] = {k: checksums[k] for k in sorted(checksums)}
    man["dataset_hash"] = recompute_dataset_hash(data_dir)
    # note editorial layer without lying about export provenance
    notes = list(man.get("methodology_notes") or [])
    flag = "editorial_enrichment:evidence_kind+claim_evidence+language (web-cfg Wave0)"
    if flag not in notes:
        notes.append(flag)
    man["methodology_notes"] = notes
    man_path.write_text(
        json.dumps(man, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return {
        "dataset_hash": man["dataset_hash"],
        "checksum_count": len(man["checksums"]),
        "source_commit_sha": man.get("source_commit_sha"),
        "source_branch": man.get("source_branch"),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data-dir", type=Path, default=ROOT / "data" / "pseo")
    ap.add_argument("--check-only", action="store_true")
    ap.add_argument("--rehash", action="store_true", help="Recompute dataset_hash/checksums")
    args = ap.parse_args(argv)
    path = args.data_dir / "problem_service.json"
    rows = json.loads(path.read_text(encoding="utf-8"))
    if args.check_only:
        hits = find_forbidden_language(rows)
        print(json.dumps({"ok": not hits, "hits": hits}, indent=2, ensure_ascii=False))
        return 0 if not hits else 1
    enriched = enrich_problem_service(rows)
    hits = find_forbidden_language(enriched)
    path.write_text(
        json.dumps(enriched, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    rehash_info = rehash_manifest(args.data_dir) if args.rehash else None
    print(
        json.dumps(
            {
                "ok": not hits,
                "enriched": len(enriched),
                "path": str(path),
                "hits": hits,
                "rehash": rehash_info,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0 if not hits else 1


if __name__ == "__main__":
    raise SystemExit(main())
