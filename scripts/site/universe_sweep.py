"""Full-universe indexation sweep (CONFENGE-PSEO-EDITORIAL-INDEXATION-CUTOVER, P4).

Derives the entire public-route universe from authorities only:
- data/organic/public-family-registry.json (family declarations)
- data/organic/noindex-governance-registry.json (why a family stays noindex)
- docs/seo/INBOUND-GATES-REPORT.json (per-family editorial/instance gate results,
  itself produced by scripts/site/inbound_gates.py from the shipped public HTML)

The build tree (scripts/site._conversion_files) is used only to enumerate actual
routes and detect orphans -- routes with no declared family -- never as the
authority for what SHOULD be indexed. That authority is the registry.

Every route lands in exactly one bucket:
  INDEX_READY        -- indexable now, correctly index,follow
  NOINDEX_JUSTIFIED   -- noindex with a valid governance reason_code
  REJECT_WITHDRAW     -- fails PUBLIC_SAFE/archetype materially (not wired here yet
                         beyond what inbound_gates.py already flags as errors)
  NOT_PUBLIC_SAFE      -- fails naturalness/brand-shell/machine-pattern checks
  INDEX_READY_BUT_NOINDEX -- indexable per its family's editorial+instance gates,
                             but currently noindex with no valid reason (violation)
  NOINDEX_WITHOUT_REASON  -- noindex, no governance record for its family (violation)
  ORPHAN               -- route with no declared family at all (flag, don't classify)

North star is the last two counts at zero -- achieved by correct classification
(add real governance, or actually index), never by loosening a gate.
"""

from __future__ import annotations

import json
from pathlib import Path

from scripts.site.inbound_gates import (
    ROOT,
    _conversion_files,
    _family_routes,
    _bofu_service_routes,
    is_noindex,
    load_family_registry,
)

GOVERNANCE_REL = "data/organic/noindex-governance-registry.json"
GATES_REPORT_REL = "docs/seo/INBOUND-GATES-REPORT.json"
OUT_REL = "docs/seo/UNIVERSE-SWEEP-REPORT.json"


def _route_of(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    return "/" if rel == "index.html" else "/" + rel.removesuffix("index.html")


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def sweep(root: Path | None = None) -> dict:
    base = root or ROOT
    registry = load_family_registry(base)
    families = registry.get("families") or []
    governance = _load_json(base / GOVERNANCE_REL)
    governance_by_family = {
        entry.get("family_id"): entry for entry in (governance.get("families") or []) if entry.get("family_id")
    }
    gates_report = _load_json(base / GATES_REPORT_REL)
    editorial_findings = {
        f["path"] for f in gates_report.get("gates", {}).get("archetype_editorial_ready", {}).get("findings", [])
    }
    naturalness_findings = {
        f["path"] for f in gates_report.get("gates", {}).get("naturalness", {}).get("findings", [])
    }

    service_routes = _bofu_service_routes()
    all_files = _conversion_files(base)
    route_to_family: dict[str, dict] = {}
    for family in families:
        routes, prefix = _family_routes(family, service_routes)
        for p in all_files:
            route = _route_of(p)
            if route in routes or (prefix and route.startswith(prefix)):
                route_to_family.setdefault(route, family)

    buckets = {
        "INDEX_READY": [],
        "NOINDEX_JUSTIFIED": [],
        "NOT_PUBLIC_SAFE": [],
        "INDEX_READY_BUT_NOINDEX": [],
        "NOINDEX_WITHOUT_REASON": [],
        "ORPHAN": [],
    }

    for p in all_files:
        route = _route_of(p)
        rel = str(p.relative_to(base))
        family = route_to_family.get(route)
        html = p.read_text(encoding="utf-8", errors="replace")
        noindex = is_noindex(html)

        if family is None:
            buckets["ORPHAN"].append(route)
            continue

        fid = family["id"]
        not_public_safe = rel in naturalness_findings or (
            family.get("editorial_jargon_strict") and rel in editorial_findings
        )

        if not_public_safe:
            buckets["NOT_PUBLIC_SAFE"].append(route)
            continue

        gov = governance_by_family.get(fid)
        has_valid_reason = bool(gov and gov.get("reason_code"))

        if noindex:
            if has_valid_reason:
                buckets["NOINDEX_JUSTIFIED"].append(route)
            else:
                # Family's own archetype is not opted into the strict editorial gate
                # (i.e. not flagged NOT_PUBLIC_SAFE) but still has no governance record
                # for its noindex state -- this is the literal violation to remediate,
                # either by adding a real reason_code or by actually indexing it.
                buckets["NOINDEX_WITHOUT_REASON"].append(route)
        else:
            buckets["INDEX_READY"].append(route)

    # A route that IS a valid archetype (public safe, family declared) but sits in
    # NOINDEX_WITHOUT_REASON with no legitimate reason and is not fixture/synthetic
    # is a candidate for INDEX_READY_BUT_NOINDEX -- surfaced separately for remediation
    # triage rather than auto-flipped, per the no-forced-index rule.
    for route in list(buckets["NOINDEX_WITHOUT_REASON"]):
        family = route_to_family.get(route)
        if family and family.get("id", "").startswith("live-intelligence"):
            # Live Intelligence is fixture-backed pending the real contract -- its
            # noindex-without-a-governance-record state (if any slips through) is a
            # remediation target for governance, not an index-now candidate, since the
            # archetype itself doesn't yet pass ARCHETYPE_EDITORIAL_READY.
            continue
        buckets["INDEX_READY_BUT_NOINDEX"].append(route)
        buckets["NOINDEX_WITHOUT_REASON"].remove(route)

    total = sum(len(v) for v in buckets.values())
    report = {
        "schema_version": "universe-sweep-v1",
        "total_routes": total,
        "counts": {k: len(v) for k, v in buckets.items()},
        "index_ready_but_noindex": buckets["INDEX_READY_BUT_NOINDEX"],
        "noindex_without_reason": buckets["NOINDEX_WITHOUT_REASON"],
        "orphans": buckets["ORPHAN"],
        "not_public_safe": buckets["NOT_PUBLIC_SAFE"],
        "buckets": buckets,
    }
    return report


def main() -> int:
    report = sweep()
    out_path = ROOT / OUT_REL
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "buckets"}, ensure_ascii=False, indent=2))
    violations = report["counts"]["INDEX_READY_BUT_NOINDEX"] + report["counts"]["NOINDEX_WITHOUT_REASON"]
    return 0 if violations == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
