#!/usr/bin/env python3
"""Audit /piloto/* pages — classify promote|revise|consolidate|reject.

Never promotes /piloto/* URLs to final indexable paths automatically.
Max 5 promote candidates; finals would live under stable URLs (e.g. /inteligencia/)
only after valid human approval.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def classify(html: str, rel: str) -> dict:
    score = 0
    reasons = []
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    words = len(text.split())

    if words >= 600:
        score += 2
        reasons.append("adequate_length")
    elif words >= 300:
        score += 1
        reasons.append("medium_length")
    else:
        reasons.append("thin")

    if re.search(r"metodolog|fonte|limita[cç][aã]o|per[ií]odo", html, re.I):
        score += 2
        reasons.append("methodology_or_sources")
    if re.search(r"wa\.me|#contato|button-primary", html):
        score += 1
        reasons.append("has_cta")
    if "application/ld+json" in html:
        score += 1
        reasons.append("jsonld")
    if re.search(r"\b(garantimos|100%|sem risco)\b", html, re.I):
        score -= 2
        reasons.append("overclaim")
    if re.search(r"TODO|FIXME|lorem|internal only|pilot internal", html, re.I):
        score -= 2
        reasons.append("internal_or_placeholder")
    # diversity: entity counts in path
    if "/orgaos/" in rel or "/mercados/" in rel or "/concorrencia/" in rel:
        score += 1
        reasons.append("entity_cluster")

    if score >= 5:
        action = "promote"
    elif score >= 3:
        action = "revise"
    elif score >= 1:
        action = "consolidate"
    else:
        action = "reject"

    return {
        "path": "/" + rel.replace("\\", "/").rstrip("/") + "/",
        "words": words,
        "score": score,
        "action": action,
        "reasons": reasons,
        "content_sha12": hashlib.sha256(html.encode()).hexdigest()[:12],
    }


def main() -> int:
    pilot = ROOT / "piloto"
    pages = []
    for idx in sorted(pilot.rglob("index.html")):
        rel = idx.relative_to(ROOT).parent.as_posix()
        html = idx.read_text(encoding="utf-8", errors="replace")
        pages.append(classify(html, rel))

    # First wave: at most 5 highest-score pages as promote *candidates*
    # (still require valid human approval; never index /piloto/* directly)
    ranked = sorted(pages, key=lambda x: (-x["score"], x["path"]))
    for i, p in enumerate(ranked):
        if i < 5 and p["action"] in {"promote", "revise"} and p["score"] >= 2:
            p["action"] = "promote"
            slug = p["path"].strip("/").split("/")[-1] or f"item-{i}"
            p["proposed_final_url"] = f"/inteligencia/{slug}/"
            p["note"] = (
                "PROMOTE CANDIDATE only. Requires valid human approval. "
                "Final URL must not remain under /piloto/."
            )
            p["reasons"] = list(p.get("reasons") or []) + ["selected_wave1_max_5"]
        elif p["action"] == "promote":
            p["action"] = "revise"
            p["reasons"] = list(p.get("reasons") or []) + ["not_in_first_five"]

    counts = {}
    for p in pages:
        counts[p["action"]] = counts.get(p["action"], 0) + 1

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total": len(pages),
        "counts": counts,
        "max_promote_wave": 5,
        "rule": "Never publish /piloto/* as final indexable URL.",
        "pages": pages,
    }
    out = ROOT / "docs" / "pseo" / "PILOT-AUDIT.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "out": str(out.relative_to(ROOT)), "counts": counts}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
