"""Operational GSC loop → human + machine growth report."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from scripts.organic.gsc_loader import load_gsc_dir, normalize_path
from scripts.organic.metrics import commercial_exposure_metrics
from scripts.organic.serp_ctr import find_ctr_opportunities, load_ctr_config
from scripts.organic.service_map import audit_link_coverage, map_content_to_service


def _svc(path: str) -> str | None:
    fit = map_content_to_service(path)
    return fit.get("service_path") if fit.get("matched") else None


def build_growth_report(
    root: Path,
    gsc_dir: Path,
    *,
    opportunities_doc: dict[str, Any] | None = None,
) -> dict[str, Any]:
    gsc = load_gsc_dir(gsc_dir)
    config = load_ctr_config()
    pages = gsc["pages"]
    queries = gsc["queries"]
    devices = gsc["devices"]
    page_device = gsc["page_device"]

    ctr_opps = find_ctr_opportunities(
        pages, root=root, config=config, queries=queries, force_priority=True
    )
    coverage = audit_link_coverage(root)
    metrics = commercial_exposure_metrics(
        pages, config=config, link_coverage=coverage, ctr_opportunities=ctr_opps
    )

    # Emerging rank: position 4–15, impressions growing (use current snapshot)
    emerging = [
        p
        for p in pages
        if 4 <= float(p.get("position") or 0) <= 15
        and float(p.get("impressions") or 0) >= float(config.get("min_impressions") or 10)
    ]
    emerging.sort(key=lambda p: float(p.get("position") or 99))

    # High traffic low commercial connection
    high_low: list[dict[str, Any]] = []
    for p in pages:
        path = p.get("path") or ""
        if not path.startswith("/conteudos/"):
            continue
        if float(p.get("impressions") or 0) < 15:
            continue
        fit = map_content_to_service(path)
        html_path = root / path.strip("/") / "index.html"
        html = html_path.read_text(encoding="utf-8", errors="replace") if html_path.exists() else ""
        has_bridge = "data-commercial-bridge" in html or "commercial-bridge" in html
        has_link = bool(fit.get("service_path") and fit["service_path"] in html)
        if fit.get("matched") and (not has_link or not has_bridge):
            high_low.append(
                {
                    "path": path,
                    "impressions": p.get("impressions"),
                    "service_path": fit.get("service_path"),
                    "has_service_link": has_link,
                    "has_bridge": has_bridge,
                }
            )

    # Low exposure services
    commercial_prefixes = config.get("commercial_path_prefixes") or []
    low_svc = [
        p
        for p in pages
        if any((p.get("path") or "").startswith(pref) for pref in commercial_prefixes)
        and float(p.get("impressions") or 0) < 20
    ]

    # Cannibalization heuristic: multiple content paths sharing cluster tokens
    # Simple: same first token cluster from service_map with both GSC rows
    by_cluster: dict[str, list[str]] = {}
    for p in pages:
        path = p.get("path") or ""
        fit = map_content_to_service(path)
        if fit.get("matched") and path.startswith("/conteudos/"):
            by_cluster.setdefault(fit["cluster_id"], []).append(path)
    cannibal = {k: v for k, v in by_cluster.items() if len(v) >= 4}

    # Desktop vs mobile
    device_section = {
        "devices": devices,
        "page_device_rows": len(page_device),
        "page_device_estimated": any(r.get("estimated") for r in page_device),
        "interpretation": (
            "SERP CTR occurs before visit. Mobile zero-click with impressions is first a "
            "snippet/position/intent question, not automatic layout proof."
        ),
    }

    actions: list[dict[str, Any]] = []
    for opp in ctr_opps[:15]:
        path = opp["path"]
        actions.append(
            {
                "what_happened": (
                    f"URL em posição {opp.get('gsc', {}).get('position')} com "
                    f"{opp.get('gsc', {}).get('impressions')} impressões e CTR "
                    f"{(opp.get('ctr_gap') or {}).get('ctr')}"
                ),
                "why_it_matters": "Impressões competitivas sem clique desperdiçam autoridade emergente",
                "url": path,
                "evidence": opp.get("gsc"),
                "recommended_action": (
                    "Revisar title/meta front-loaded; não clickbait; "
                    + (
                        "candidata a indexação humana"
                        if "robots_noindex" in (opp.get("issues") or [])
                        else "otimizar snippet"
                    )
                ),
                "related_service": (opp.get("service_fit") or {}).get("service_path"),
                "expected_commercial_impact": "medium" if float((opp.get("gsc") or {}).get("impressions") or 0) >= 20 else "low",
                "confidence": opp.get("confidence"),
                "class": "ctr_gap",
                "serp_diagnosis": {
                    "issues": opp.get("issues"),
                    "title": opp.get("title"),
                    "meta_description": opp.get("meta_description"),
                    "h1": opp.get("h1"),
                },
            }
        )

    for p in low_svc[:8]:
        actions.append(
            {
                "what_happened": f"Serviço com baixa exposição: {p.get('path')}",
                "why_it_matters": "BOFU fraco enquanto TOFU/MOFU concentra impressões",
                "url": p.get("path"),
                "evidence": p,
                "recommended_action": "Reforçar internal links e supporting content; não forçar ranking genérico",
                "related_service": p.get("path"),
                "expected_commercial_impact": "high",
                "confidence": 0.5,
                "class": "low_service_exposure",
            }
        )

    for row in high_low[:10]:
        actions.append(
            {
                "what_happened": f"Conteúdo com tráfego e ponte comercial fraca: {row['path']}",
                "why_it_matters": "Autoridade informacional não transfere para serviço",
                "url": row["path"],
                "evidence": row,
                "recommended_action": "Bridge editorial + link semântico ao serviço",
                "related_service": row.get("service_path"),
                "expected_commercial_impact": "medium",
                "confidence": 0.55,
                "class": "high_traffic_low_commercial_link",
            }
        )

    doc = {
        "schema_version": "organic-growth-report-v1",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "gsc_export": gsc["export_id"],
        "gsc_totals": gsc["totals"],
        "aggregation_note": gsc["aggregation_note"],
        "metrics": metrics,
        "link_coverage": {
            k: coverage[k]
            for k in coverage
            if k
            in {
                "content_pages_scanned",
                "mapped",
                "content_to_service_link_coverage",
                "commercial_bridge_coverage",
                "indexable_mapped",
                "indexable_content_to_service_link_coverage",
                "indexable_commercial_bridge_coverage",
                "service_to_supporting_content_coverage",
            }
        },
        "sections": {
            "emerging_rank": emerging[:20],
            "ctr_gap": ctr_opps,
            "emerging_queries": sorted(
                queries, key=lambda q: -float(q.get("impressions") or 0)
            )[:25],
            "high_traffic_low_commercial_link": high_low,
            "low_service_exposure": low_svc,
            "cannibalization_clusters": cannibal,
            "decay": [],  # requires multi-export delta; filled when 2+ exports compared
            "desktop_mobile": device_section,
            "refresh_opportunities": [
                o
                for o in ctr_opps
                if "robots_noindex" not in (o.get("issues") or [])
            ][:10],
            "internal_linking_opportunities": high_low,
            "new_content_only_if_evidenced": [
                {
                    "rule": "Só propor URL nova se intent distinto + evidência GSC/datalake + gate indexability",
                    "candidates": [],
                }
            ],
        },
        "actions": actions,
        "opportunities_engine_ref": {
            "total": (opportunities_doc or {}).get("counts", {}).get("total"),
            "bofu": (opportunities_doc or {}).get("counts", {}).get("bofu"),
        },
        "hypotheses_not_proven": [
            "Title/meta changes will lift CTR — validate with post-deploy GSC export",
            "Commercial bridges will lift content→service transitions — needs analytics",
            "Mobile 0-click is SERP-side; layout not causal without post-click evidence",
        ],
    }
    return doc


def render_growth_markdown(doc: dict[str, Any]) -> str:
    m = doc.get("metrics") or {}
    lines = [
        "# Organic Growth Report",
        "",
        f"**generated_at:** {doc.get('generated_at')}",
        f"**gsc_export:** {doc.get('gsc_export')}",
        "",
        f"> {doc.get('aggregation_note')}",
        "",
        "## Métricas de exposição",
        "",
        f"- informational_impression_share: `{m.get('informational_impression_share')}`",
        f"- commercial_impression_share: `{m.get('commercial_impression_share')}`",
        f"- commercial_click_share: `{m.get('commercial_click_share')}`",
        f"- serp_ctr_gap opportunities: `{(m.get('serp_ctr_gap') or {}).get('opportunity_count')}`",
        f"- content_to_service_link_coverage: `{m.get('content_to_service_link_coverage')}`",
        f"- commercial_bridge_coverage: `{m.get('commercial_bridge_coverage')}`",
        f"- service_to_supporting_content_coverage: `{m.get('service_to_supporting_content_coverage')}`",
        "",
        "## Ações recomendadas",
        "",
    ]
    for a in doc.get("actions") or []:
        lines.extend(
            [
                f"### {a.get('class')}: `{a.get('url')}`",
                f"- **O que aconteceu:** {a.get('what_happened')}",
                f"- **Por que importa:** {a.get('why_it_matters')}",
                f"- **Ação:** {a.get('recommended_action')}",
                f"- **Serviço:** {a.get('related_service')}",
                f"- **Impacto comercial esperado:** {a.get('expected_commercial_impact')}",
                f"- **Confiança:** {a.get('confidence')}",
                "",
            ]
        )
    lines.extend(
        [
            "## Hipóteses (não medidas)",
            "",
        ]
    )
    for h in doc.get("hypotheses_not_proven") or []:
        lines.append(f"- {h}")
    lines.append("")
    return "\n".join(lines)


def write_growth_report(
    root: Path,
    gsc_dir: Path,
    *,
    out_json: Path,
    out_md: Path,
    opportunities_doc: dict[str, Any] | None = None,
) -> dict[str, Any]:
    doc = build_growth_report(root, gsc_dir, opportunities_doc=opportunities_doc)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    out_md.write_text(render_growth_markdown(doc), encoding="utf-8")
    return doc
