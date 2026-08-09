"""Reproducible diagnosis of web-cfg + pSEO + GSC baseline state."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _count_html(root: Path, sub: str) -> int:
    d = root / sub
    if not d.exists():
        return 0
    return sum(1 for _ in d.rglob("index.html"))


def _read_json(path: Path) -> Any:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def build_diagnosis(root: Path) -> dict[str, Any]:
    root = Path(root)
    pseo_reg = _read_json(root / "data" / "pseo" / "registry.json") or {}
    ed_reg = _read_json(root / "data" / "editorial" / "EDITORIAL-REGISTRY.json") or {}
    disp = _read_json(root / "seo" / "content-disposition-2026-08-02.json") or {}
    markets = _read_json(root / "data" / "pseo" / "markets.json") or []
    problem_service = _read_json(root / "data" / "pseo" / "problem_service.json") or []

    gsc_dir = root / "seo" / "gsc-2026-07-30"
    gsc_pages: list[dict] = []
    gsc_queries: list[dict] = []
    if (gsc_dir / "Paginas.csv").exists():
        with (gsc_dir / "Paginas.csv").open(encoding="utf-8") as f:
            gsc_pages = list(csv.DictReader(f))
    if (gsc_dir / "Consultas.csv").exists():
        with (gsc_dir / "Consultas.csv").open(encoding="utf-8") as f:
            gsc_queries = list(csv.DictReader(f))

    def _num(row: dict, *keys: str) -> float:
        for k in keys:
            if k in row and row[k] not in (None, ""):
                try:
                    return float(str(row[k]).replace("%", "").replace(",", "."))
                except ValueError:
                    continue
        return 0.0

    clicks = sum(_num(r, "Cliques", "clicks") for r in gsc_pages)
    imps = sum(_num(r, "Impressões", "impressions") for r in gsc_pages)

    pseo_pages = pseo_reg.get("pages") or []
    pseo_status: dict[str, int] = {}
    for p in pseo_pages:
        s = str(p.get("status") or "?")
        pseo_status[s] = pseo_status.get(s, 0) + 1

    ed_pages = ed_reg.get("pages") or []
    ed_status: dict[str, int] = {}
    for p in ed_pages:
        s = str(p.get("status") or "?")
        ed_status[s] = ed_status.get(s, 0) + 1

    lib = disp.get("content_library_by_disposition") or {}

    service_paths = [
        "/reequilibrio-obras-publicas/",
        "/aditivos-obras-publicas/",
        "/medicoes-glosas-obras-publicas/",
        "/atrasos-prorrogacao-obras-publicas/",
        "/auditoria-orcamento-licitacao/",
        "/bid-room-licitacoes-obras/",
        "/defesa-margem-contratos-publicos/",
        "/defesa-tecnica-contratos-publicos/",
        "/acompanhamento-contratos-obras/",
        "/diretoria-b2g/",
        "/diagnostico-pre-licitacao/",
        "/diagnostico-b2g-360/",
    ]

    clusters = [
        {"id": "reequilibrio", "pillar": "/reequilibrio-obras-publicas/", "service": "reequilibrio-obras-publicas"},
        {"id": "aditivos", "pillar": "/aditivos-obras-publicas/", "service": "aditivos-obras-publicas"},
        {"id": "medicoes-pagamentos", "pillar": "/medicoes-glosas-obras-publicas/", "service": "medicoes-glosas-obras-publicas"},
        {"id": "atrasos-prorrogacao", "pillar": "/atrasos-prorrogacao-obras-publicas/", "service": "atrasos-prorrogacao-obras-publicas"},
        {"id": "orcamento-bdi", "pillar": "/auditoria-orcamento-licitacao/", "service": "auditoria-orcamento-licitacao"},
        {"id": "edital-proposta", "pillar": "/diagnostico-pre-licitacao/", "service": "bid-room-licitacoes-obras"},
        {"id": "gestao-contratual", "pillar": "/acompanhamento-contratos-obras/", "service": "acompanhamento-contratos-obras"},
        {"id": "inteligencia-mercado", "pillar": "/inteligencia/", "service": "metodologia-inteligencia"},
        {"id": "lei-14133", "pillar": "/lei-14133-obras/", "service": "defesa-margem-contratos-publicos"},
    ]

    bottlenecks = [
        {
            "id": "gsc-baseline-thin",
            "severity": "high",
            "detail": f"GSC export 2026-07-30: ~{int(clicks)} clicks / ~{int(imps)} impressions — discovery still early.",
        },
        {
            "id": "conteudos-noindex-mass",
            "severity": "high",
            "detail": f"Content library disposition: noindex={lib.get('noindex')}, manter={lib.get('manter')}, consolidar={lib.get('consolidar')}.",
        },
        {
            "id": "pseo-fail-closed",
            "severity": "medium",
            "detail": f"pSEO registry pages={len(pseo_pages)} statuses={pseo_status}; 0 publish without human+quality.",
        },
        {
            "id": "editorial-human-gate",
            "severity": "medium",
            "detail": f"Editorial pages={len(ed_pages)} statuses={ed_status}; INDEXABLE only after named human approve_cli.",
        },
        {
            "id": "ctr-striking-distance",
            "severity": "high",
            "detail": "sinapi-desonerado-nao-desonerado ~88 impressions / 0 clicks @ pos~7.75 — highest GSC improve lever.",
        },
        {
            "id": "organic-engine-gap",
            "severity": "high",
            "detail": "Prior state had pSEO export + GSC observatory but no unified SEO_OPPORTUNITIES scored by commercial value.",
        },
    ]

    doc: dict[str, Any] = {
        "schema_version": "organic-diagnosis-v1",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stack": {
            "web_cfg": "static HTML + Netlify functions (lead/collect/ops/nurture)",
            "build": "python scripts/pseo/build_site.py, editorial/build.py",
            "extra_cli": "Postgres datalake → python -m scripts.pseo.export_web_cfg → data/pseo",
            "organic_engine": "python -m scripts.organic (this module) + extra-cli scripts.organic",
        },
        "inventory": {
            "conteudos_html": _count_html(root, "conteudos"),
            "radar_html": _count_html(root, "radar"),
            "inteligencia_html": _count_html(root, "inteligencia"),
            "ferramentas_html": _count_html(root, "ferramentas"),
            "lei_14133_html": _count_html(root, "lei-14133-obras"),
            "guias_html": _count_html(root, "guias-contratos-obras"),
            "service_paths_expected": service_paths,
            "pseo_markets": len(markets) if isinstance(markets, list) else 0,
            "pseo_problem_service": len(problem_service) if isinstance(problem_service, list) else 0,
            "pseo_registry_pages": len(pseo_pages),
            "pseo_status": pseo_status,
            "editorial_pages": len(ed_pages),
            "editorial_status": ed_status,
            "content_disposition_library": lib,
        },
        "clusters": clusters,
        "gsc_baseline": {
            "export_dir": "seo/gsc-2026-07-30",
            "page_rows": len(gsc_pages),
            "query_rows": len(gsc_queries),
            "total_clicks": clicks,
            "total_impressions": imps,
            "top_pages": [
                {
                    "url": r.get("Páginas principais") or r.get("page"),
                    "clicks": _num(r, "Cliques", "clicks"),
                    "impressions": _num(r, "Impressões", "impressions"),
                    "position": _num(r, "Posição", "position"),
                }
                for r in sorted(
                    gsc_pages,
                    key=lambda x: -_num(x, "Impressões", "impressions"),
                )[:10]
            ],
            "top_queries": [
                {
                    "query": r.get("Top consultas") or r.get("query"),
                    "impressions": _num(r, "Impressões", "impressions"),
                    "position": _num(r, "Posição", "position"),
                }
                for r in sorted(
                    gsc_queries,
                    key=lambda x: -_num(x, "Impressões", "impressions"),
                )[:10]
            ],
        },
        "bottlenecks": bottlenecks,
        "governance": {
            "pseo": "fail-closed; score advisory; human review for publish",
            "editorial": "automated max EDITORIAL_REVIEWED; INDEXABLE via approve_cli named human",
            "organic": "HTML generation ≠ index permission; Indexability Quality Gate mandatory",
        },
    }

    doc["markdown"] = _to_markdown(doc)
    return doc


def _to_markdown(doc: dict[str, Any]) -> str:
    inv = doc["inventory"]
    gsc = doc["gsc_baseline"]
    lines = [
        "# Organic Inbound — Diagnóstico reproduzível",
        "",
        f"Gerado em: `{doc['generated_at']}`",
        "",
        "## Stack",
        "",
    ]
    for k, v in doc["stack"].items():
        lines.append(f"- **{k}**: {v}")
    lines += [
        "",
        "## Inventário",
        "",
        f"- Conteúdos HTML: {inv['conteudos_html']}",
        f"- Radar: {inv['radar_html']} · Inteligência: {inv['inteligencia_html']} · Ferramentas: {inv['ferramentas_html']}",
        f"- pSEO markets: {inv['pseo_markets']} · problem_service: {inv['pseo_problem_service']}",
        f"- pSEO registry: {inv['pseo_registry_pages']} → {inv['pseo_status']}",
        f"- Editorial: {inv['editorial_pages']} → {inv['editorial_status']}",
        f"- Disposition biblioteca: {inv['content_disposition_library']}",
        "",
        "## Baseline GSC",
        "",
        f"- Export: `{gsc['export_dir']}`",
        f"- Cliques: **{gsc['total_clicks']}** · Impressões: **{gsc['total_impressions']}**",
        "",
        "## Clusters canônicos",
        "",
    ]
    for c in doc["clusters"]:
        lines.append(f"- `{c['id']}` → pilar `{c['pillar']}` · serviço `{c['service']}`")
    lines += ["", "## Gargalos", ""]
    for b in doc["bottlenecks"]:
        lines.append(f"- **[{b['severity']}]** {b['id']}: {b['detail']}")
    lines += ["", "## Governança", ""]
    for k, v in doc["governance"].items():
        lines.append(f"- **{k}**: {v}")
    lines.append("")
    return "\n".join(lines)
