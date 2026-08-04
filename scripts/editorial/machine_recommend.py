#!/usr/bin/env python3
"""Machine recommendations for Wave 1, NEVER human approval.

Outputs RECOMMEND_APPROVE | RECOMMEND_REVISE | RECOMMEND_CONSOLIDATE | RECOMMEND_REJECT
per page into docs/editorial/WAVE1-MACHINE-RECOMMENDATIONS.json.

Does not stamp HUMAN_APPROVED or INDEXABLE.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.editorial.registry import load_registry  # noqa: E402


def _page_path(url: str) -> Path | None:
    if not url:
        return None
    rel = url.strip("/")
    cand = ROOT / rel / "index.html"
    if cand.is_file():
        return cand
    return None


def recommend_page(page: dict) -> dict:
    pid = page.get("page_id") or ""
    status = page.get("status") or ""
    url = page.get("url") or page.get("public_path") or ""
    if status == "REJECTED" or pid == "jur-sumula-260-art":
        return {
            "page_id": pid,
            "url": url,
            "recommendation": "RECOMMEND_REJECT",
            "reasons": ["already_rejected_or_jurisprudence_blocked"],
            "risk": "high",
        }

    reasons: list[str] = []
    risk = "low"
    rec = "RECOMMEND_APPROVE"
    path = _page_path(url)
    html = path.read_text(encoding="utf-8") if path and path.is_file() else ""

    if not html:
        return {
            "page_id": pid,
            "url": url,
            "recommendation": "RECOMMEND_REVISE",
            "reasons": ["html_missing"],
            "risk": "high",
        }

    if "noindex" in html.lower() and "index,follow" not in html.lower():
        reasons.append("still_noindex_expected_pre_approval")

    # Language / CTA / sources checks (machine only)
    if len(html) < 4000:
        reasons.append("thin_html")
        risk = "medium"
        rec = "RECOMMEND_REVISE"
    if not re.search(r'href=["\']https?://', html):
        reasons.append("few_or_no_external_sources")
        risk = "medium"
        rec = "RECOMMEND_REVISE"
    if not re.search(r"wa\.me|#contato|button-primary", html):
        reasons.append("weak_cta")
        risk = "medium"
        rec = "RECOMMEND_REVISE"
    if re.search(r"\b(garantimos|100%|sem risco|aprovado pelo google)\b", html, re.I):
        reasons.append("overclaim_language")
        risk = "high"
        rec = "RECOMMEND_REVISE"
    if "application/ld+json" not in html:
        reasons.append("missing_jsonld")
        rec = "RECOMMEND_REVISE"

    # Cannibalization hint: similar titles in registry
    title_m = re.search(r"<title>([^<]+)</title>", html, re.I)
    title = (title_m.group(1) if title_m else "")[:120]

    return {
        "page_id": pid,
        "url": url,
        "title": title,
        "registry_status": status,
        "recommendation": rec,
        "reasons": reasons or ["machine_checks_passed"],
        "risk": risk,
        "note": "Machine recommendation only, not human approval.",
    }


def main() -> int:
    reg = load_registry()
    pages = reg.get("pages") or []
    out_pages = [recommend_page(p) for p in pages]
    counts: dict[str, int] = {}
    for p in out_pages:
        counts[p["recommendation"]] = counts.get(p["recommendation"], 0) + 1
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "human_approved_count": 0,
        "indexable_count": 0,
        "note": "RECOMMEND_* is not HUMAN_APPROVED. Named human must run approve_cli.py.",
        "counts": counts,
        "pages": out_pages,
    }
    dest = ROOT / "docs" / "editorial" / "WAVE1-MACHINE-RECOMMENDATIONS.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Ops UI copy (no secrets)
    ops = ROOT / "ops" / "data"
    # keep private - write under data/editorial
    priv = ROOT / "data" / "editorial" / "WAVE1-MACHINE-RECOMMENDATIONS.json"
    priv.parent.mkdir(parents=True, exist_ok=True)
    priv.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "out": str(dest.relative_to(ROOT)), "counts": counts}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
