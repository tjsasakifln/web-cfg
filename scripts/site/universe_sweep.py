"""Full-universe indexation sweep (CONFENGE-PSEO-EDITORIAL-INDEXATION-CUTOVER, P4).

Derives the entire public-route universe from authorities only:
- data/organic/public-family-registry.json (family declarations)
- data/organic/noindex-governance-registry.json (why a family stays noindex)
- the per-route and per-family readiness verdicts in scripts/site/inbound_gates.py
  (``instance_index_ready_for_route`` / ``archetype_editorial_ready_for_family``),
  which are computed from the shipped public HTML plus the editorial authorities
  that already exist in this repository

The build tree (scripts/site._conversion_files) is used only to enumerate actual
routes and detect orphans -- routes with no declared family -- never as the
authority for what SHOULD be indexed.

Every route lands in exactly one bucket, in this order:

  REJECT_WITHDRAW  -- a named editorial authority REJECTED this route, or its
                      archetype is a doorway (sibling pages are one template
                      with different nouns). The remedy is WITHDRAWAL: the route
                      leaves the public tree. Distinct from NOT_PUBLIC_SAFE,
                      whose remedy is a copy fix on a route that stays, and from
                      NOINDEX_JUSTIFIED, whose remedy is a dated review of a
                      route that stays served and out of the index.
  NOT_PUBLIC_SAFE  -- the rendered page carries machine/doorway residue, an
                      abandoned-entity leak, or (for a family opted into
                      editorial_jargon_strict) raw internal jargon in visible
                      copy. Fix the copy; the route stays.
  ORPHAN           -- route with no declared family at all (flag, don't classify)
  INDEX_READY      -- independently earned INSTANCE_INDEX_READY and is indexable
  INDEX_READY_BUT_NOINDEX
                   -- independently earned INSTANCE_INDEX_READY and is STILL
                      noindex. Not "noindex with no recorded excuse": the
                      evidence says index, the public state says otherwise.
  INDEXABLE_WITHOUT_EVIDENCE
                   -- currently indexable but did NOT earn it. The remedy is
                      evidence (a date, a source, a distinct grain), not a
                      robots flip, so this gate reports it and takes no action.
  NOINDEX_JUSTIFIED -- did not earn an index slot and a governance reason_code
                       records why it is out
  NOINDEX_WITHOUT_REASON -- did not earn an index slot and nobody recorded why

REJECT_WITHDRAW is deliberately evaluated before ORPHAN: an explicit REJECTED
verdict is stronger evidence than the absence of a family declaration, and
hiding a rejected page inside ORPHAN would be exactly the conflation this
campaign exists to remove.

North star is INDEX_READY_BUT_NOINDEX and NOINDEX_WITHOUT_REASON at zero --
achieved by correct classification (add real governance, or actually index),
never by loosening a gate.
"""

from __future__ import annotations

import json
from pathlib import Path

from scripts.site.inbound_gates import (
    ROOT,
    archetype_editorial_ready_for_family,
    build_indexation_context,
    instance_index_ready_for_route,
    is_noindex,
)

GOVERNANCE_REL = "data/organic/noindex-governance-registry.json"
GATES_REPORT_REL = "docs/seo/INBOUND-GATES-REPORT.json"
OUT_REL = "docs/seo/UNIVERSE-SWEEP-REPORT.json"

BUCKET_ORDER = (
    "REJECT_WITHDRAW",
    "NOT_PUBLIC_SAFE",
    "ORPHAN",
    "INDEX_READY",
    "INDEX_READY_BUT_NOINDEX",
    "INDEXABLE_WITHOUT_EVIDENCE",
    "NOINDEX_JUSTIFIED",
    "NOINDEX_WITHOUT_REASON",
)

# Instance subgates whose failure means the rendered page is not safe to show a
# visitor as it stands. The route stays; the copy has to change.
NOT_PUBLIC_SAFE_SUBGATES = ("public_safe",)

# Archetype material verdicts that a route inherits. A named editorial REJECT is
# already a per-instance verdict, so it is deliberately absent: one rejected
# sibling must not withdraw the family around it.
ARCHETYPE_LEVEL_MATERIAL = frozenset({"not_doorway"})


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return loaded if isinstance(loaded, dict) else {}


def sweep(root: Path | None = None) -> dict:
    base = root or ROOT
    ctx = build_indexation_context(base)

    governance = _load_json(base / GOVERNANCE_REL)
    governance_by_family = {
        str(entry.get("family_id")): entry
        for entry in (governance.get("families") or [])
        if entry.get("family_id")
    }

    # One archetype verdict per family, reused by every route it owns.
    archetype: dict[str, dict] = {}
    for family in ctx.families:
        fid = str(family.get("id") or "")
        if not fid:
            continue
        ok, detail = archetype_editorial_ready_for_family(family, context=ctx)
        archetype[fid] = {"ready": ok, "material": detail.get("material") or []}

    buckets: dict[str, list[str]] = {name: [] for name in BUCKET_ORDER}
    reasons: dict[str, dict] = {}

    for route in sorted(ctx.html_by_route):
        html = ctx.html_by_route[route]
        family = ctx.route_family.get(route)
        fid = str((family or {}).get("id") or "")
        noindex = is_noindex(html)
        ready, detail = instance_index_ready_for_route(route, html, family, ctx)
        blocking = detail["blocking"]
        material = list(detail["material"])
        # Only `not_doorway` is genuinely a property of the archetype rather
        # than of one page: a template that produces near-identical siblings
        # withdraws all of them. Everything else material -- notably a named
        # editorial REJECT -- is already evaluated per instance, so propagating
        # it would let one rejected sibling withdraw its whole family.
        #
        # A family's hub lists the archetype, it is not generated by it, so it
        # does not inherit even that.
        prefix = str(((family or {}).get("match") or {}).get("prefix") or "")
        if not (prefix and route == prefix):
            material += [
                f"archetype:{name}"
                for name in archetype.get(fid, {}).get("material") or []
                if name in ARCHETYPE_LEVEL_MATERIAL
            ]

        if material:
            bucket = "REJECT_WITHDRAW"
        elif any(name in blocking for name in NOT_PUBLIC_SAFE_SUBGATES):
            bucket = "NOT_PUBLIC_SAFE"
        elif family is None:
            bucket = "ORPHAN"
        elif ready:
            bucket = "INDEX_READY_BUT_NOINDEX" if noindex else "INDEX_READY"
        elif not noindex:
            bucket = "INDEXABLE_WITHOUT_EVIDENCE"
        else:
            entry = governance_by_family.get(fid)
            bucket = (
                "NOINDEX_JUSTIFIED"
                if entry and entry.get("reason_code")
                else "NOINDEX_WITHOUT_REASON"
            )

        buckets[bucket].append(route)
        reasons[route] = {
            "bucket": bucket,
            "family": fid or None,
            "noindex": noindex,
            "instance_index_ready": ready,
            "blocking": blocking,
            "material": material,
            "governance_reason_code": (governance_by_family.get(fid) or {}).get(
                "reason_code"
            ),
        }

    total = sum(len(v) for v in buckets.values())
    return {
        "schema_version": "universe-sweep-v2",
        "total_routes": total,
        "counts": {name: len(buckets[name]) for name in BUCKET_ORDER},
        "archetype_verdicts": archetype,
        "reject_withdraw": buckets["REJECT_WITHDRAW"],
        "index_ready_but_noindex": buckets["INDEX_READY_BUT_NOINDEX"],
        "noindex_without_reason": buckets["NOINDEX_WITHOUT_REASON"],
        "indexable_without_evidence": buckets["INDEXABLE_WITHOUT_EVIDENCE"],
        "orphans": buckets["ORPHAN"],
        "not_public_safe": buckets["NOT_PUBLIC_SAFE"],
        "buckets": buckets,
        "routes": reasons,
    }


def main() -> int:
    report = sweep()
    out_path = ROOT / OUT_REL
    out_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                k: v
                for k, v in report.items()
                if k not in {"buckets", "routes", "archetype_verdicts"}
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    violations = (
        report["counts"]["INDEX_READY_BUT_NOINDEX"]
        + report["counts"]["NOINDEX_WITHOUT_REASON"]
    )
    return 0 if violations == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
