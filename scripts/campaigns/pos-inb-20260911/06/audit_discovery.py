#!/usr/bin/env python3
"""POS-INB-20260911/06 local discovery audit. No new dashboard. No Indexing API."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.discovery.http_client import FakeTransport, ProbeResponse, Transport
from scripts.discovery.inspect import inspect_url_layers, local_path_for_canonical
from scripts.discovery.probe import probe_asset
from scripts.discovery.schema import CANONICAL_ORIGIN, UNKNOWN
from scripts.discovery.url_inspection import inspect_urls
from scripts.revops.gsc_import_learning import (
    build_learning_queue,
    import_gsc_export,
    join_capture_stages,
)
from scripts.revops.search_demand_observatory import classify_snapshot_source, credential_blocker_record

PRIORITY_PATH = Path(__file__).with_name("priority_urls.json")
FOUNDER_DIR = ROOT / "scripts" / "revops" / "fixtures" / "gsc-founder-baseline-2026-09-02-08"
GENERIC_HUB = "/servicos/#servico-projeto"
CORRECT_DESTINATIONS = {
    "revisao": "/revisao-tecnica-projetos-engenharia/",
    "compatibilizacao": "/compatibilizacao-projetos-engenharia/",
    "complementares": "/projetos-complementares-engenharia/",
    "orcamento": "/quantitativos-orcamento-obras/",
}

ACQUISITION_PATHS: list[dict[str, Any]] = [
    {
        "need": "Levantar quantitativos ou orçar obra pública ou privada",
        "decision_content": "/conteudos/sinapi-desonerado-nao-desonerado/",
        "service": "/quantitativos-orcamento-obras/",
        "sample": "/casos/modelo-base-quantitativa-canonica/",
        "contact": "/quantitativos-orcamento-obras/#triagem-quantitativos",
    },
    {
        "need": "Revisar um projeto já elaborado",
        "decision_content": "/conteudos/como-contratar-compatibilizacao-projetos/",
        "service": "/revisao-tecnica-projetos-engenharia/",
        "sample": "/casos/demonstrativo-projeto-privado/",
        "contact": "/triagem-tecnica/#projetos",
    },
    {
        "need": "Registrar interferências entre disciplinas",
        "decision_content": "/conteudos/como-contratar-compatibilizacao-projetos/",
        "service": "/compatibilizacao-projetos-engenharia/",
        "sample": "/casos/demonstrativo-projeto-privado/",
        "contact": "/triagem-tecnica/#projetos",
    },
    {
        "need": "Completar disciplina complementar",
        "decision_content": "/conteudos/como-contratar-projetos-complementares/",
        "service": "/projetos-complementares-engenharia/",
        "sample": "/entregas/",
        "contact": "/triagem-tecnica/#projetos",
    },
    {
        "need": "Sustentar medição, glosa ou aditivo em obra pública",
        "decision_content": "/conteudos/limite-aditivo-25-50-obra-publica/",
        "service": "/aditivos-obras-publicas/",
        "sample": "/casos/",
        "contact": "/triagem-tecnica/",
    },
]


def load_priority(*, root: Path | None = None) -> list[dict[str, Any]]:
    payload = json.loads(PRIORITY_PATH.read_text(encoding="utf-8"))
    rows = []
    for item in payload.get("urls") or []:
        path = item["path"]
        rows.append(
            {
                **item,
                "canonical": urljoin(CANONICAL_ORIGIN + "/", path.lstrip("/")),
                "local_path": local_path_for_canonical(urljoin(CANONICAL_ORIGIN + "/", path.lstrip("/"))),
            }
        )
    return rows


def audit_local_urls(*, root: Path | None = None) -> dict[str, Any]:
    root = root or ROOT
    rows = []
    for item in load_priority(root=root):
        layers = inspect_url_layers(item["canonical"], root=root)
        layers["role"] = item["role"]
        layers["purchase_id"] = item["purchase_id"]
        layers["owner_campaign"] = item["owner_campaign"]
        layers["local_path"] = item["local_path"]
        hrefs = layers.get("internal_hrefs") or []
        wrong_hub = [
            href
            for href in hrefs
            if GENERIC_HUB in href
            and item["path"]
            not in {
                "/servicos/",
                "/parcerias-engenharia/",
            }
        ]
        layers["generic_hub_hrefs"] = wrong_hub
        layers["orphan"] = layers.get("source_local_file") != "present"
        rows.append(layers)
    return {
        "schema": "confenge.pos-inb-06-url-checklist/1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "indexed_from_sitemap": False,
        "sitemap_loc_is_not_indexed": True,
        "urls": rows,
        "count": len(rows),
    }


def live_probe_safe(
    canonical: str,
    *,
    transport: Transport | None = None,
    observed_at: str | None = None,
    timeout: float = 8.0,
    retries: int = 0,
) -> dict[str, Any]:
    """Live GET/HEAD. Transport/DNS failure is UNOBSERVED, never public 404."""
    stamp = observed_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        observation = probe_asset(
            {"id": canonical, "canonical": canonical},
            observed_at=stamp,
            transport=transport,
            timeout=timeout,
            retries=retries,
            include_head=True,
        )
    except Exception as exc:  # noqa: BLE001 — preserve UNKNOWN
        return {
            "canonical": canonical,
            "status": UNKNOWN,
            "observation": "unobserved",
            "public_availability": "UNOBSERVED",
            "http_status": None,
            "error": type(exc).__name__,
            "not_public_404": True,
            "indexed": UNKNOWN,
            "indexed_from_sitemap": False,
        }
    extras = observation.get("extras") or {}
    http = extras.get("http") or {}
    http_status = http.get("status")
    error = None
    if observation.get("status") == "UNAVAILABLE" or http_status is None:
        chain = http.get("chain") or []
        error = next((hop.get("error") for hop in chain if hop.get("error")), "unavailable")
        return {
            "canonical": canonical,
            "status": UNKNOWN,
            "observation": "unobserved",
            "public_availability": "UNOBSERVED",
            "http_status": None,
            "error": error,
            "not_public_404": True,
            "indexed": UNKNOWN,
            "indexed_from_sitemap": False,
            "reason_codes": observation.get("reason_codes") or [],
        }
    sitemap = extras.get("sitemap") or {}
    return {
        "canonical": canonical,
        "status": "observed",
        "observation": "observed",
        "public_availability": "observed",
        "http_status": http_status,
        "error": None,
        "not_public_404": True,
        "declared_canonical": extras.get("declared_canonical"),
        "indexability": extras.get("indexability"),
        "sitemap_membership": bool(sitemap.get("present")),
        "indexed": UNKNOWN,
        "indexed_from_sitemap": False,
        "reason_codes": observation.get("reason_codes") or [],
    }


def find_wrong_hub_links(*, root: Path | None = None) -> list[dict[str, Any]]:
    root = root or ROOT
    findings = []
    checks = [
        (
            "parcerias-engenharia/index.html",
            "05",
            "kit-revisao-destino",
            CORRECT_DESTINATIONS["revisao"],
        ),
        (
            "parcerias-engenharia/index.html",
            "05",
            "kit-complementares-destino",
            CORRECT_DESTINATIONS["complementares"],
        ),
        (
            "conteudos/como-contratar-projetos-complementares/index.html",
            "07",
            'href="/servicos/#servico-projeto"',
            CORRECT_DESTINATIONS["revisao"],
        ),
        (
            "conteudos/como-contratar-compatibilizacao-projetos/index.html",
            "07",
            'href="/servicos/#servico-projeto"',
            CORRECT_DESTINATIONS["revisao"],
        ),
    ]
    for rel, owner, marker, dest in checks:
        path = root / rel
        if not path.is_file():
            findings.append(
                {
                    "path": rel,
                    "owner_campaign": owner,
                    "status": "UNOBSERVED",
                    "marker": marker,
                }
            )
            continue
        text = path.read_text(encoding="utf-8")
        if marker in text and dest not in text:
            findings.append(
                {
                    "path": rel,
                    "owner_campaign": owner,
                    "status": "wrong_hub",
                    "marker": marker,
                    "current": GENERIC_HUB,
                    "correct": dest,
                }
            )
    prontidao = root / "ferramentas" / "prontidao-tecnica-obra-privada" / "index.html"
    if prontidao.is_file():
        text = prontidao.read_text(encoding="utf-8")
        map_missing = (
            CORRECT_DESTINATIONS["revisao"] not in text
            or CORRECT_DESTINATIONS["compatibilizacao"] not in text
        )
        if map_missing and "pptr-destination-map" in text:
            findings.append(
                {
                    "path": "ferramentas/prontidao-tecnica-obra-privada/index.html",
                    "owner_campaign": "04",
                    "status": "map_only_orcamento",
                    "marker": "pptr-destination-map",
                    "current": "/quantitativos-orcamento-obras/",
                    "correct": [
                        CORRECT_DESTINATIONS["revisao"],
                        CORRECT_DESTINATIONS["compatibilizacao"],
                    ],
                }
            )
    return findings


def build_queue_hypotheses(
    *,
    root: Path | None = None,
    founder: MappingLike | None = None,
) -> dict[str, Any]:
    root = root or ROOT
    founder = founder or import_gsc_export(FOUNDER_DIR, persist=False)
    findings = find_wrong_hub_links(root=root)
    pages = { (p.get("path") or ""): p for p in (founder.get("pages") or []) }
    hypotheses = [
        {
            "rank": 1,
            "diagnosis": "wrong_hub_when_dedicated_page_exists",
            "hypothesis": (
                "Kits de parceria e conteúdos de decisão ainda apontam revisão e "
                "complementares para /servicos/#servico-projeto embora as landings "
                "dedicadas já existam no fonte e no sitemap."
            ),
            "path": "/parcerias-engenharia/",
            "evidence": {
                "findings": [f for f in findings if f.get("status") == "wrong_hub"],
                "impressions": None,
                "page_grain_is_not_query": True,
            },
            "observable_metric": "cliques internos do kit para a landing dedicada (não ranking)",
            "minimal_change": (
                "05 troca destino dos kits revisão/complementares; 07 troca âncoras "
                "dos conteúdos de decisão para as landings dedicadas."
            ),
            "authorizes_ab_test": False,
            "commercial_failure_alert": False,
            "new_page_zero_impressions_is_not_failure": True,
        },
        {
            "rank": 2,
            "diagnosis": "prontidao_map_only_resolves_orcamento",
            "hypothesis": (
                "A ferramenta de prontidão recomenda revisão ou compatibilização no "
                "texto, mas o mapa de destino só resolve quantitativos/orçamento."
            ),
            "path": "/ferramentas/prontidao-tecnica-obra-privada/",
            "evidence": {
                "findings": [f for f in findings if f.get("status") == "map_only_orcamento"],
            },
            "observable_metric": "destino clicado a partir do resultado da ferramenta",
            "minimal_change": (
                "04 inclui no mapa as rotas /revisao-tecnica-projetos-engenharia/ e "
                "/compatibilizacao-projetos-engenharia/."
            ),
            "authorizes_ab_test": False,
            "commercial_failure_alert": False,
            "new_page_zero_impressions_is_not_failure": True,
        },
        {
            "rank": 3,
            "diagnosis": "page_grain_not_query_and_weak_internal_path",
            "hypothesis": (
                "As 30 impressões de /aditivos-obras-publicas/ e as 17 de "
                "/conteudos/sinapi-desonerado-nao-desonerado/ são métricas de PÁGINA, "
                "não prova de consulta 'sinapi desonerado' ou 'aditivos obra pública'. "
                "Não classificar página nova com zero impressões como fracasso."
            ),
            "path": "/aditivos-obras-publicas/",
            "evidence": {
                "aditivos_page": {
                    "impressions": (pages.get("/aditivos-obras-publicas/") or {}).get("impressions"),
                    "clicks": (pages.get("/aditivos-obras-publicas/") or {}).get("clicks"),
                    "position": (pages.get("/aditivos-obras-publicas/") or {}).get("position"),
                    "grain": "page",
                },
                "sinapi_page": {
                    "impressions": (pages.get("/conteudos/sinapi-desonerado-nao-desonerado/") or {}).get("impressions"),
                    "clicks": (pages.get("/conteudos/sinapi-desonerado-nao-desonerado/") or {}).get("clicks"),
                    "grain": "page",
                },
                "query_terms_of_six_clicks": UNKNOWN,
                "seven_days_not_causal": True,
            },
            "observable_metric": "impressões e cliques de PÁGINA no próximo intervalo completo equivalente",
            "minimal_change": (
                "10 não promove page grain a keyword no purchase-route-map; 07 mantém "
                "o artigo SINAPI apontando para auditoria de orçamento, não para hub genérico."
            ),
            "authorizes_ab_test": False,
            "commercial_failure_alert": False,
            "new_page_zero_impressions_is_not_failure": True,
        },
    ]
    learning = build_learning_queue(founder)
    return {
        "schema": "confenge.gsc-learning-queue/1.0",
        "max_items": 3,
        "count": len(hypotheses),
        "candidates": hypotheses,
        "authorizes_html_edit": False,
        "authorizes_publish": False,
        "authorizes_ab_test": False,
        "one_impression_is_not_failure": True,
        "seven_days_not_causal": True,
        "importer_queue_count": learning.get("count"),
        "capture_stages": join_capture_stages(
            clicks=(founder.get("dimensions") or {}).get("property", {}).get("clicks"),
            warmbly=None,
        ),
    }


# MappingLike alias without importing Mapping in the annotation at runtime for 3.9
MappingLike = dict[str, Any]


def release_annotation(*, domain_served_on: str | None = None) -> dict[str, Any]:
    """Release date is when the domain served the set, not commit or merge."""
    evidence = ROOT / "data" / "ops" / "first-verified-deploy.json"
    payload = json.loads(evidence.read_text(encoding="utf-8")) if evidence.is_file() else {}
    served = domain_served_on or payload.get("first_verified_deploy_at")
    return {
        "domain_served_on": served,
        "status": "observed" if served else UNKNOWN,
        "commit_is_not_publication": True,
        "pr_is_not_publication": True,
        "merge_669_is_not_domain_served_date": True,
        "note": "Comparar apenas janelas completas equivalentes. Sete dias escassos não provam lift.",
    }


def operator_gsc_command() -> dict[str, Any]:
    blocker = credential_blocker_record(site="sc-domain:confenge.com.br")
    return {
        "status": "EXTERNAL_EVIDENCE",
        "source_kind": "credential_failure",
        "pass": False,
        "command": (
            "GSC_SITE_URL=sc-domain:confenge.com.br "
            "GSC_CREDENTIALS_JSON=/path/to/service-account.json "
            "python3 scripts/revops/search_demand_observatory.py pull-api --days 7 --smoke"
        ),
        "inspect_command": (
            "python3 scripts/revops/search_demand_observatory.py inspect-urls "
            "--url https://confenge.com.br/quantitativos-orcamento-obras/ --smoke"
        ),
        "required_secret": blocker.get("required_secret"),
        "rows": None,
        "impressions": None,
        "indexing_api_called": False,
        "note": "Comando deixado para o operador. Não é operação ativa.",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="POS-INB 06 discovery audit")
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--inspect-api", action="store_true")
    args = parser.parse_args(argv)
    root = args.root if args.root.is_absolute() else ROOT / args.root
    checklist = audit_local_urls(root=root)
    founder = import_gsc_export(FOUNDER_DIR, persist=False, root=root)
    queue = build_queue_hypotheses(root=root, founder=founder)
    live_rows = []
    if args.live:
        for item in load_priority(root=root)[:3]:
            live_rows.append(live_probe_safe(item["canonical"]))
    inspection = None
    if args.inspect_api:
        inspection = inspect_urls([item["canonical"] for item in load_priority(root=root)[:3]])
    report = {
        "schema": "confenge.pos-inb-06-audit/1.0",
        "checklist": checklist,
        "acquisition_paths": ACQUISITION_PATHS,
        "wrong_hub_findings": find_wrong_hub_links(root=root),
        "queue": queue,
        "founder_source_kind": classify_snapshot_source(founder),
        "founder_as_of": founder.get("as_of"),
        "founder_extracted_at": founder.get("extracted_at"),
        "release": release_annotation(),
        "live_probes": live_rows,
        "url_inspection": inspection,
        "gsc_operator": operator_gsc_command(),
        "indexing_api_called": False,
    }
    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        out = args.out if args.out.is_absolute() else root / args.out
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
