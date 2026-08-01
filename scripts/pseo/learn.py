#!/usr/bin/env python3
"""Learning loop: read versioned metrics and produce recommendations only.

Never mutates publish state or auto-approves pages.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
METRICS = ROOT / "data" / "pseo" / "metrics"


FUNNEL_STAGES = (
    "not_discovered",
    "discovered_not_crawled",
    "crawled_not_indexed",
    "indexed_no_impression",
    "impression_no_click",
    "click_no_interaction",
    "interaction_no_cta",
    "cta_no_submit",
    "submit_no_qualification",
    "qualified_no_meeting",
    "meeting_no_proposal",
    "proposal_no_contract",
    "cluster_winner",
    "cluster_with_revenue",
)


def classify_funnel_stage(
    *,
    indexation_status: str | None,
    impressions: float,
    clicks: float,
    sessions: float,
    interactions: float,
    cta: float,
    form_submit: float,
    qualified: float,
    meeting: float,
    proposal: float,
    contract: float,
    revenue: float,
) -> str:
    """Map metrics to funnel problem class — observational only."""
    idx = (indexation_status or "").upper()
    if revenue > 0:
        return "cluster_with_revenue"
    if contract > 0:
        return "cluster_winner"
    if proposal > 0 and contract <= 0:
        return "proposal_no_contract"
    if meeting > 0 and proposal <= 0:
        return "meeting_no_proposal"
    if qualified > 0 and meeting <= 0:
        return "qualified_no_meeting"
    if form_submit > 0 and qualified <= 0:
        return "submit_no_qualification"
    if cta > 0 and form_submit <= 0:
        return "cta_no_submit"
    if interactions > 0 and cta <= 0:
        return "interaction_no_cta"
    if clicks > 0 and sessions > 0 and interactions <= 0 and cta <= 0:
        return "click_no_interaction"
    if impressions > 0 and clicks <= 0:
        return "impression_no_click"
    if idx in {"INDEXED", "PASS"} and impressions <= 0:
        return "indexed_no_impression"
    if idx in {"CRAWLED", "CRAWLED_CURRENTLY_NOT_INDEXED"}:
        return "crawled_not_indexed"
    if idx in {"DISCOVERED", "DISCOVERED_CURRENTLY_NOT_INDEXED"}:
        return "discovered_not_crawled"
    return "not_discovered"



def load_month(kind: str, yyyymm: str) -> dict[str, Any]:
    path = METRICS / kind / f"{yyyymm}.json"
    if not path.exists():
        return {"period": yyyymm, "pages": {}, "missing": True}
    return json.loads(path.read_text(encoding="utf-8"))


def classify_recommendation(page_id: str, gsc: dict, ana: dict, crm: dict, reg_page: dict | None) -> dict[str, Any]:
    """Return typed recommendation — never irreversible mutation."""
    impressions = float(gsc.get("impressions") or 0)
    clicks = float(gsc.get("clicks") or 0)
    ctr = float(gsc.get("ctr") or 0)
    sessions = float(ana.get("sessions") or 0)
    cta = float(ana.get("cta") or 0)
    form_submit = float(ana.get("form_submit") or 0)
    qualified = float(crm.get("qualified_contact") or 0)
    status = (reg_page or {}).get("status")
    score = (reg_page or {}).get("indexability_score") or 0

    problems: list[str] = []
    actions: list[str] = []

    if status == "reject":
        problems.append("indexation_blocked_quality")
        actions.append("fix_data_or_copy_before_reconsidering")
    elif status == "noindex":
        if score >= 80:
            problems.append("indexation_pending_human_review")
            actions.append("run review.py audit and complete checklist if quality holds")
        else:
            problems.append("indexation_quality_below_threshold")
            actions.append("improve sample independence and editorial substance")

    if impressions < 10 and status == "publish":
        problems.append("discovery")
        actions.append("review target queries in pseo-query-map; do not expand clusters yet")
    if impressions >= 50 and ctr < 0.02:
        problems.append("ctr")
        actions.append("rewrite title/meta for intent match; check SERP cannibalization")
    if sessions >= 20 and cta == 0:
        problems.append("low_interaction")
        actions.append("strengthen executive answer and contextual CTA")
    if cta >= 5 and form_submit == 0:
        problems.append("low_conversion")
        actions.append("inspect form friction and offer clarity")
    if form_submit >= 3 and qualified == 0:
        problems.append("unqualified_leads")
        actions.append("tighten ICP messaging and pre-qualify on page")
    if qualified >= 2 and float(crm.get("meeting") or 0) >= 1:
        problems.append("winner_signal")
        actions.append("keep URL; document playbook; do not clone thin variants")

    if not problems:
        problems.append("insufficient_signal")
        actions.append("wait for minimum traffic before cluster expansion")

    funnel = classify_funnel_stage(
        indexation_status=(reg_page or {}).get("indexation_status")
        or (reg_page or {}).get("gsc_verdict"),
        impressions=impressions,
        clicks=clicks,
        sessions=sessions,
        interactions=float(ana.get("table_interact") or ana.get("related_click") or 0),
        cta=cta,
        form_submit=form_submit,
        qualified=qualified,
        meeting=float(crm.get("meeting") or 0),
        proposal=float(crm.get("proposal") or 0),
        contract=float(crm.get("contract") or 0),
        revenue=float(crm.get("revenue") or 0),
    )
    return {
        "page_id": page_id,
        "problems": problems,
        "actions": actions,
        "funnel_stage": funnel,
        "auto_mutate": False,
        "auto_publish": False,
        "metrics": {
            "impressions": impressions,
            "clicks": clicks,
            "ctr": ctr,
            "sessions": sessions,
            "cta": cta,
            "form_submit": form_submit,
            "qualified_contact": qualified,
            "status": status,
        },
    }


def run_learn(yyyymm: str) -> dict[str, Any]:
    gsc = load_month("gsc", yyyymm)
    ana = load_month("analytics", yyyymm)
    crm = load_month("crm", yyyymm)
    reg_path = ROOT / "data" / "pseo" / "registry.json"
    by_id = {}
    if reg_path.exists():
        reg = json.loads(reg_path.read_text(encoding="utf-8"))
        by_id = {p["page_id"]: p for p in reg.get("pages") or []}

    page_ids = set()
    for blob in (gsc, ana, crm):
        page_ids.update((blob.get("pages") or {}).keys())
    page_ids.update(by_id.keys())

    recs = []
    for pid in sorted(page_ids):
        recs.append(
            classify_recommendation(
                pid,
                (gsc.get("pages") or {}).get(pid) or {},
                (ana.get("pages") or {}).get(pid) or {},
                (crm.get("pages") or {}).get(pid) or {},
                by_id.get(pid),
            )
        )

    out = {
        "period": yyyymm,
        "recommendation_count": len(recs),
        "policy": "recommendations_only_no_auto_publish",
        "recommendations": recs,
    }
    out_path = ROOT / "seo" / f"pseo-learn-{yyyymm}.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md = [f"# pSEO learn {yyyymm}", "", "Somente recomendações — sem mutação automática de publish.", ""]
    for r in recs[:40]:
        md.append(f"## `{r['page_id']}`")
        md.append(f"- problems: {', '.join(r['problems'])}")
        md.append(f"- actions: {'; '.join(r['actions'])}")
        md.append("")
    (ROOT / "seo" / f"pseo-learn-{yyyymm}.md").write_text("\n".join(md), encoding="utf-8")
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--period", default="2026-07", help="YYYY-MM")
    args = ap.parse_args(argv)
    out = run_learn(args.period)
    print(json.dumps({"period": out["period"], "recommendation_count": out["recommendation_count"], "auto_mutate": False}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
