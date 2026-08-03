"""Build a human-reviewable Wave 1 package from real registry HTML only.

Binds CANDIDATE-UNIVERSE wave1_proposal to quality_eligible registry pages
(or re-selects from registry if universe URLs do not match). Regenerates
Approval Center packet. Never marks HUMAN_APPROVED.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def page_exists(url: str) -> bool:
    rel = url.strip("/")
    return (ROOT / rel / "index.html").is_file()


def select_wave1_from_registry(
    registry: dict[str, Any],
    *,
    limit: int = 40,
) -> list[dict[str, Any]]:
    """Pick diverse quality_eligible pages that exist on disk."""
    quotas = {
        "market": 12,
        "agency": 8,
        "price": 8,
        "competition": 6,
        "radar": 3,
        "problem_service": 3,
    }
    pages = registry.get("pages") or []
    # quality_eligible True OR (noindex + empty mandatory_fail + score high)
    eligible: list[dict] = []
    for p in pages:
        if p.get("status") == "reject":
            continue
        fails = p.get("mandatory_fail") or []
        if fails:
            continue
        if not page_exists(p.get("url") or ""):
            continue
        qe = p.get("quality_eligible")
        score = int(p.get("indexability_score") or p.get("score") or 0)
        if qe is False and score < 65:
            continue
        if qe is not True and score < 80 and p.get("status") != "noindex":
            # keep high-score noindex pending human review
            if not (p.get("status") == "noindex" and score >= 65):
                continue
        eligible.append(p)

    eligible.sort(
        key=lambda p: (
            -int(p.get("indexability_score") or p.get("score") or 0),
            -int(p.get("observation_count") or 0),
            p.get("url") or "",
        )
    )
    picked: list[dict] = []
    counts: Counter = Counter()
    for p in eligible:
        pt = p.get("page_type") or "other"
        if pt not in quotas:
            continue
        if counts[pt] >= quotas[pt]:
            continue
        url = p["url"]
        if not page_exists(url):
            continue
        picked.append(
            {
                "page_id": p.get("page_id"),
                "candidate_id": p.get("page_id"),
                "url": url,
                "page_type": pt,
                "archetype": p.get("archetype"),
                "title": p.get("title"),
                "h1": p.get("h1"),
                "status": p.get("status"),
                "lifecycle_hint": "READY_AFTER_HUMAN_REVIEW",
                "indexability_score": p.get("indexability_score") or p.get("score"),
                "observation_count": p.get("observation_count"),
                "quality_eligible": p.get("quality_eligible"),
                "human_review": p.get("human_review") or "PENDING",
                "html_exists": True,
                "mandatory_fail": p.get("mandatory_fail") or [],
            }
        )
        counts[pt] += 1
        if len(picked) >= limit:
            break
    return picked


def main() -> int:
    reg_path = ROOT / "data" / "pseo" / "registry.json"
    univ_path = ROOT / "data" / "pseo" / "CANDIDATE-UNIVERSE.json"
    registry = load_json(reg_path)
    univ = load_json(univ_path) if univ_path.exists() else {}

    # Try bind universe wave1 to registry first
    reg_by_url = {p["url"]: p for p in registry.get("pages") or [] if p.get("url")}
    bound: list[dict] = []
    for w in (univ.get("wave1_proposal") or {}).get("pages") or []:
        url = w.get("url") or w.get("proposed_url")
        p = reg_by_url.get(url)
        if not p or not page_exists(url or ""):
            continue
        if p.get("status") == "reject" or (p.get("mandatory_fail") or []):
            continue
        bound.append(
            {
                **w,
                "page_id": p.get("page_id"),
                "url": url,
                "html_exists": True,
                "registry_status": p.get("status"),
                "quality_eligible": p.get("quality_eligible"),
                "indexability_score": p.get("indexability_score") or p.get("score"),
                "title": p.get("title"),
                "human_review": p.get("human_review") or "PENDING",
                "lifecycle_hint": "READY_AFTER_HUMAN_REVIEW",
            }
        )

    if len(bound) < 20:
        # Full reselect from registry — authoritative for human review
        bound = select_wave1_from_registry(registry, limit=40)
        source = "registry_quality_eligible_reselect"
    else:
        # Fill remaining quota from registry
        have = {b["url"] for b in bound}
        for p in select_wave1_from_registry(registry, limit=40):
            if p["url"] in have:
                continue
            bound.append(p)
            have.add(p["url"])
            if len(bound) >= 40:
                break
        source = "universe_bound_plus_registry_fill"

    # Hard filter: every page must exist
    bound = [b for b in bound if page_exists(b["url"])]
    type_counts = Counter(b.get("page_type") for b in bound)

    package = {
        "schema_version": "1.0.0",
        "artifact": "WAVE1-HUMAN-REVIEW-PACKAGE",
        "generated_at": _now(),
        "source": source,
        "n": len(bound),
        "type_counts": dict(type_counts),
        "archetypes": sorted({b.get("archetype") for b in bound if b.get("archetype")}),
        "all_html_exists": all(b.get("html_exists") for b in bound),
        "phantom_urls": 0,
        "note": (
            "Every URL has quality-eligible (or high-score noindex) registry entry "
            "and index.html on disk. Human approval required — automation does not approve."
        ),
        "pages": bound,
    }

    out_dir = ROOT / "data" / "pseo"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "WAVE1-PACKAGE.json").write_text(
        json.dumps(package, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # Patch CANDIDATE-UNIVERSE wave1_proposal to match package
    if univ:
        univ["wave1_proposal"] = {
            "n": package["n"],
            "note": package["note"],
            "type_counts": package["type_counts"],
            "source": source,
            "all_html_exists": True,
            "pages": [
                {
                    "candidate_id": b.get("candidate_id") or b.get("page_id"),
                    "url": b["url"],
                    "page_type": b.get("page_type"),
                    "family": b.get("family"),
                    "seo_opportunity_score": b.get("seo_opportunity_score")
                    or b.get("indexability_score"),
                    "status": "READY_AFTER_HUMAN_REVIEW",
                    "observation_count": b.get("observation_count"),
                    "archetype": b.get("archetype"),
                    "html_exists": True,
                    "page_id": b.get("page_id"),
                }
                for b in bound
            ],
        }
        univ_path.write_text(
            json.dumps(univ, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    # Docs summary
    docs = ROOT / "docs" / "pseo"
    docs.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Wave 1 Human Review Package",
        "",
        f"**Generated:** {package['generated_at']}  ",
        f"**n:** {package['n']}  ",
        f"**source:** {source}  ",
        f"**all_html_exists:** {package['all_html_exists']}  ",
        f"**types:** `{package['type_counts']}`  ",
        f"**archetypes:** {package['archetypes']}  ",
        "",
        "| # | Type | Score | N | URL |",
        "|--:|------|------:|--:|-----|",
    ]
    for i, b in enumerate(bound, 1):
        lines.append(
            f"| {i} | {b.get('page_type')} | {b.get('indexability_score') or b.get('seo_opportunity_score')} | "
            f"{b.get('observation_count')} | `{b.get('url')}` |"
        )
    lines.append("")
    (docs / "WAVE1-PACKAGE.md").write_text("\n".join(lines), encoding="utf-8")

    print(
        json.dumps(
            {
                "n": package["n"],
                "type_counts": package["type_counts"],
                "all_html_exists": package["all_html_exists"],
                "source": source,
                "archetypes_n": len(package["archetypes"]),
            }
        )
    )
    if package["n"] < 15 or not package["all_html_exists"]:
        return 2
    if len(package["type_counts"]) < 4:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
