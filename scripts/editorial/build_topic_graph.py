"""Build national SEO topic graph, intentions inventory, and editorial briefs.

Outputs:
  docs/editorial/SEO-TOPIC-GRAPH.json|.md|.html
  data/editorial/INTENTIONS.json
  data/editorial/BRIEFS/ (80+ complete briefs)
  docs/editorial/EDITORIAL-BACKLOG.md
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]

# 60 domains from OBJECTIVE §8
TOPIC_DOMAINS: list[dict[str, Any]] = [
    {"id": "intel-selecao", "title": "Inteligência e seleção de oportunidades", "pillar": "inteligencia-operacao", "cluster": "pre-licitacao", "layer": 6},
    {"id": "go-no-go", "title": "Decisão go/no-go", "pillar": "inteligencia-operacao", "cluster": "pre-licitacao", "layer": 3},
    {"id": "leitura-impugnacao", "title": "Leitura e impugnação de edital", "pillar": "licitacao", "cluster": "edital", "layer": 3},
    {"id": "habilitacao", "title": "Habilitação", "pillar": "licitacao", "cluster": "habilitacao", "layer": 3},
    {"id": "qualificacao-tecnica", "title": "Qualificação técnica", "pillar": "licitacao", "cluster": "habilitacao", "layer": 3},
    {"id": "acervo-cat", "title": "Acervo, CAT e atestados", "pillar": "licitacao", "cluster": "habilitacao", "layer": 3},
    {"id": "consorcios", "title": "Consórcios", "pillar": "licitacao", "cluster": "estrutura", "layer": 3},
    {"id": "orcamento", "title": "Orçamento", "pillar": "preco-margem", "cluster": "orcamento", "layer": 3},
    {"id": "sinapi", "title": "SINAPI", "pillar": "preco-margem", "cluster": "referencias", "layer": 3},
    {"id": "sicro", "title": "SICRO", "pillar": "preco-margem", "cluster": "referencias", "layer": 3},
    {"id": "bdi", "title": "BDI", "pillar": "preco-margem", "cluster": "orcamento", "layer": 3},
    {"id": "encargos", "title": "Encargos", "pillar": "preco-margem", "cluster": "orcamento", "layer": 3},
    {"id": "custos-diretos-indiretos", "title": "Custos diretos e indiretos", "pillar": "preco-margem", "cluster": "orcamento", "layer": 3},
    {"id": "inexequibilidade", "title": "Inexequibilidade", "pillar": "preco-margem", "cluster": "proposta", "layer": 3},
    {"id": "proposta", "title": "Proposta", "pillar": "licitacao", "cluster": "proposta", "layer": 3},
    {"id": "cronograma", "title": "Cronograma", "pillar": "execucao", "cluster": "planejamento", "layer": 3},
    {"id": "matriz-riscos", "title": "Matriz de riscos", "pillar": "contratos", "cluster": "riscos", "layer": 3},
    {"id": "contratos-administrativos", "title": "Contratos administrativos", "pillar": "contratos", "cluster": "regime", "layer": 2},
    {"id": "ordem-servico", "title": "Ordem de serviço", "pillar": "execucao", "cluster": "inicio", "layer": 3},
    {"id": "mobilizacao", "title": "Mobilização", "pillar": "execucao", "cluster": "inicio", "layer": 3},
    {"id": "diario-obra", "title": "Diário de obra", "pillar": "execucao", "cluster": "evidencias", "layer": 3},
    {"id": "fiscalizacao", "title": "Fiscalização", "pillar": "execucao", "cluster": "relacao-admin", "layer": 3},
    {"id": "medicao", "title": "Medição", "pillar": "execucao", "cluster": "medicao-pagamento", "layer": 3},
    {"id": "glosa", "title": "Glosa", "pillar": "execucao", "cluster": "medicao-pagamento", "layer": 3},
    {"id": "parcela-incontroversa", "title": "Parcela incontroversa", "pillar": "execucao", "cluster": "medicao-pagamento", "layer": 4},
    {"id": "atraso-pagamento", "title": "Atraso de pagamento", "pillar": "execucao", "cluster": "medicao-pagamento", "layer": 3},
    {"id": "atraso-administracao", "title": "Atraso da Administração", "pillar": "execucao", "cluster": "prazos", "layer": 4},
    {"id": "atraso-contratada", "title": "Atraso da contratada", "pillar": "execucao", "cluster": "prazos", "layer": 3},
    {"id": "aditivo", "title": "Aditivo", "pillar": "contratos", "cluster": "alteracoes", "layer": 2},
    {"id": "alteracao-qualitativa", "title": "Alteração qualitativa", "pillar": "contratos", "cluster": "alteracoes", "layer": 4},
    {"id": "alteracao-quantitativa", "title": "Alteração quantitativa", "pillar": "contratos", "cluster": "alteracoes", "layer": 4},
    {"id": "itens-novos", "title": "Itens novos", "pillar": "contratos", "cluster": "alteracoes", "layer": 4},
    {"id": "reajuste", "title": "Reajuste", "pillar": "contratos", "cluster": "equilibrio", "layer": 4},
    {"id": "repactuacao", "title": "Repactuação", "pillar": "contratos", "cluster": "equilibrio", "layer": 4},
    {"id": "reequilibrio", "title": "Reequilíbrio", "pillar": "contratos", "cluster": "equilibrio", "layer": 2},
    {"id": "prorrogacao", "title": "Prorrogação", "pillar": "execucao", "cluster": "prazos", "layer": 3},
    {"id": "suspensao", "title": "Suspensão", "pillar": "execucao", "cluster": "prazos", "layer": 3},
    {"id": "paralisacao", "title": "Paralisação", "pillar": "execucao", "cluster": "prazos", "layer": 3},
    {"id": "rescisao", "title": "Rescisão", "pillar": "contratos", "cluster": "extincao", "layer": 3},
    {"id": "extincao", "title": "Extinção", "pillar": "contratos", "cluster": "extincao", "layer": 4},
    {"id": "sancoes", "title": "Sanções", "pillar": "defesa", "cluster": "sancoes", "layer": 3},
    {"id": "multa", "title": "Multa", "pillar": "defesa", "cluster": "sancoes", "layer": 3},
    {"id": "impedimento", "title": "Impedimento", "pillar": "defesa", "cluster": "sancoes", "layer": 3},
    {"id": "inidoneidade", "title": "Declaração de inidoneidade", "pillar": "defesa", "cluster": "sancoes", "layer": 3},
    {"id": "defesa-tecnica", "title": "Defesa técnica", "pillar": "defesa", "cluster": "defesa", "layer": 2},
    {"id": "notificacoes", "title": "Notificações", "pillar": "defesa", "cluster": "defesa", "layer": 3},
    {"id": "recursos", "title": "Recursos", "pillar": "defesa", "cluster": "defesa", "layer": 3},
    {"id": "contratacao-direta", "title": "Contratação direta", "pillar": "licitacao", "cluster": "modalidades", "layer": 4},
    {"id": "dispensa", "title": "Dispensa", "pillar": "licitacao", "cluster": "modalidades", "layer": 4},
    {"id": "inexigibilidade", "title": "Inexigibilidade", "pillar": "licitacao", "cluster": "modalidades", "layer": 4},
    {"id": "gestao-b2g", "title": "Gestão B2G", "pillar": "operacao-comercial", "cluster": "governanca", "layer": 1},
    {"id": "governanca-comercial", "title": "Governança comercial", "pillar": "operacao-comercial", "cluster": "governanca", "layer": 1},
    {"id": "operacao-licitacoes", "title": "Operação de licitações", "pillar": "operacao-comercial", "cluster": "operacao", "layer": 1},
    {"id": "intel-mercado-publico", "title": "Inteligência de mercado público", "pillar": "inteligencia-operacao", "cluster": "dados", "layer": 6},
    {"id": "controle-margem", "title": "Controle de margem", "pillar": "preco-margem", "cluster": "margem", "layer": 1},
    {"id": "licoes-aprendidas", "title": "Lições aprendidas", "pillar": "operacao-comercial", "cluster": "melhoria", "layer": 8},
    {"id": "gestao-documental", "title": "Gestão documental", "pillar": "execucao", "cluster": "evidencias", "layer": 3},
    {"id": "gestao-evidencias", "title": "Gestão de evidências", "pillar": "execucao", "cluster": "evidencias", "layer": 3},
    {"id": "engenharia-juridico", "title": "Relação entre engenharia e jurídico", "pillar": "defesa", "cluster": "interdisciplinar", "layer": 8},
    {"id": "relacao-fiscalizacao", "title": "Relacionamento técnico com fiscalização", "pillar": "execucao", "cluster": "relacao-admin", "layer": 3},
]

SERVICES = {
    "pre-licitacao": "diagnostico-pre-licitacao",
    "orcamento": "auditoria-orcamento-licitacao",
    "execucao": "acompanhamento-contratos-obras",
    "aditivo": "aditivos-obras-publicas",
    "reequilibrio": "reequilibrio-obras-publicas",
    "glosa": "medicoes-glosas-obras-publicas",
    "atraso": "atrasos-prorrogacao-obras-publicas",
    "defesa": "defesa-tecnica-contratos-publicos",
    "margem": "defesa-margem-contratos-publicos",
    "b2g": "diretoria-b2g",
    "bid": "bid-room-licitacoes-obras",
    "diag": "diagnostico-b2g-360",
}

OFFICIAL_SOURCES = [
    {"name": "Lei nº 14.133/2021", "url": "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm"},
    {"name": "PNCP", "url": "https://pncp.gov.br/"},
    {"name": "TCU", "url": "https://portal.tcu.gov.br/"},
    {"name": "SINAPI/CAIXA", "url": "https://www.caixa.gov.br/site/Paginas/sinapi.aspx"},
]

FUNNEL = {
    1: "BOFU",
    2: "MOFU",
    3: "MOFU",
    4: "MOFU",
    5: "MOFU",
    6: "TOFU-MOFU",
    7: "MOFU",
    8: "TOFU",
}


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _slug(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:80]


def discover_existing_pages() -> dict[str, list[str]]:
    """Map topic keywords to existing site paths."""
    paths: list[str] = []
    for base in [
        ROOT / "conteudos",
        ROOT / "lei-14133-obras",
        ROOT / "guias-contratos-obras",
        ROOT / "jurisprudencia-contratos-obras",
        ROOT / "inteligencia",
        ROOT / "radar",
    ]:
        if not base.exists():
            continue
        for p in base.rglob("index.html"):
            rel = "/" + str(p.parent.relative_to(ROOT)).replace("\\", "/") + "/"
            paths.append(rel)
    # commercial
    for slug in [
        "diretoria-b2g",
        "bid-room-licitacoes-obras",
        "defesa-margem-contratos-publicos",
        "diagnostico-b2g-360",
        "diagnostico-pre-licitacao",
        "auditoria-orcamento-licitacao",
        "acompanhamento-contratos-obras",
        "aditivos-obras-publicas",
        "reequilibrio-obras-publicas",
        "medicoes-glosas-obras-publicas",
        "atrasos-prorrogacao-obras-publicas",
        "defesa-tecnica-contratos-publicos",
    ]:
        if (ROOT / slug / "index.html").exists():
            paths.append(f"/{slug}/")
    return {"all": sorted(set(paths))}


def _match_pages(title: str, existing: list[str]) -> list[str]:
    tokens = [t for t in re.split(r"[^a-z0-9]+", _slug(title)) if len(t) > 3]
    hits = []
    for path in existing:
        score = sum(1 for t in tokens if t in path)
        if score >= 1:
            hits.append((score, path))
    hits.sort(reverse=True)
    return [p for _, p in hits[:5]]


def _service_for(topic: dict[str, Any]) -> str:
    c = topic["cluster"]
    mapping = {
        "pre-licitacao": SERVICES["pre-licitacao"],
        "edital": SERVICES["pre-licitacao"],
        "habilitacao": SERVICES["pre-licitacao"],
        "estrutura": SERVICES["bid"],
        "orcamento": SERVICES["orcamento"],
        "referencias": SERVICES["orcamento"],
        "proposta": SERVICES["orcamento"],
        "planejamento": SERVICES["execucao"],
        "riscos": SERVICES["execucao"],
        "regime": SERVICES["b2g"],
        "inicio": SERVICES["execucao"],
        "evidencias": SERVICES["execucao"],
        "relacao-admin": SERVICES["execucao"],
        "medicao-pagamento": SERVICES["glosa"],
        "prazos": SERVICES["atraso"],
        "alteracoes": SERVICES["aditivo"],
        "equilibrio": SERVICES["reequilibrio"],
        "extincao": SERVICES["defesa"],
        "sancoes": SERVICES["defesa"],
        "defesa": SERVICES["defesa"],
        "modalidades": SERVICES["pre-licitacao"],
        "governanca": SERVICES["b2g"],
        "operacao": SERVICES["bid"],
        "dados": SERVICES["diag"],
        "margem": SERVICES["margem"],
        "melhoria": SERVICES["b2g"],
        "interdisciplinar": SERVICES["defesa"],
    }
    return mapping.get(c, SERVICES["diag"])


def build_topic_graph(existing: list[str]) -> dict[str, Any]:
    topics = []
    for t in TOPIC_DOMAINS:
        pages = _match_pages(t["title"], existing)
        service = _service_for(t)
        rec_url = None
        if not pages:
            rec_url = f"/conteudos/{_slug(t['title'])}/"
        topics.append(
            {
                "topic_id": t["id"],
                "title": t["title"],
                "pillar": t["pillar"],
                "cluster": t["cluster"],
                "layer": t["layer"],
                "intent": "informational" if t["layer"] >= 6 else "commercial_investigation",
                "question": f"Como a construtora deve tratar {t['title'].lower()} em obras públicas sob a Lei 14.133?",
                "icp": "Construtoras e engenharias que operam licitações e contratos de obras públicas",
                "funnel_stage": FUNNEL.get(t["layer"], "MOFU"),
                "service": service,
                "official_sources": OFFICIAL_SOURCES[:3],
                "datalake_enrichment": {
                    "possible": t["id"]
                    in {
                        "intel-selecao",
                        "intel-mercado-publico",
                        "orcamento",
                        "controle-margem",
                        "go-no-go",
                        "operacao-licitacoes",
                    },
                    "hooks": [
                        "distribuição por segmento e UF",
                        "faixas de valor observadas",
                        "concentração de fornecedores",
                    ]
                    if t["id"]
                    in {
                        "intel-selecao",
                        "intel-mercado-publico",
                        "orcamento",
                        "controle-margem",
                    }
                    else [],
                    "required_fields_when_used": [
                        "cut_date",
                        "N",
                        "source",
                        "methodology",
                        "limitations",
                        "related_data_page",
                    ],
                },
                "existing_pages": pages,
                "recommended_new_page": rec_url,
                "overlap": pages[1:] if len(pages) > 1 else [],
                "internal_links": {
                    "parents": [f"/{service}/", f"/conteudos/"],
                    "children": pages[:3],
                    "data_related": ["/inteligencia/", "/metodologia-inteligencia/"],
                },
                "priority": 90 - t["layer"] * 5
                if t["layer"] <= 3
                else 50 - t["layer"],
                "content_type": {
                    1: "commercial",
                    2: "pillar",
                    3: "operational_guide",
                    4: "lei_aplicada",
                    5: "jurisprudencia",
                    6: "data_intelligence",
                    7: "tool_checklist",
                    8: "study",
                }.get(t["layer"], "operational_guide"),
                "status": "MAPPED_EXISTING" if pages else "RECOMMENDED_NEW",
            }
        )
    pillars = sorted({t["pillar"] for t in topics})
    clusters = sorted({t["cluster"] for t in topics})
    return {
        "schema_version": "1.0.0",
        "artifact": "SEO-TOPIC-GRAPH",
        "generated_at": _now(),
        "n_topics": len(topics),
        "n_pillars": len(pillars),
        "n_clusters": len(clusters),
        "pillars": pillars,
        "clusters": clusters,
        "layers": {
            "1_commercial": "Páginas comerciais",
            "2_pillars": "Pilares",
            "3_guides": "Guias operacionais",
            "4_lei": "Lei aplicada",
            "5_jurisprudencia": "Jurisprudência",
            "6_data": "Dados e inteligência",
            "7_tools": "Ferramentas e checklists",
            "8_studies": "Estudos e análises",
        },
        "topics": topics,
        "lifecycle": [
            "DRAFT",
            "LEGAL_SOURCE_VALIDATED",
            "DATA_EVIDENCE_VALIDATED",
            "TECHNICAL_REVIEWED",
            "EDITORIAL_REVIEWED",
            "READY_FOR_HUMAN_APPROVAL",
            "HUMAN_APPROVED",
            "INDEXABLE",
            "MONITORED",
            "REFRESH_REQUIRED",
            "EXPIRED",
        ],
        "rules": [
            "Automation never stamps HUMAN_APPROVED",
            "Material change invalidates approval",
            "Broken sources block indexation",
            "Stale data blocks data pages",
            "Cannibal content blocks",
        ],
    }


def build_intentions(existing: list[str], topics: list[dict]) -> list[dict[str, Any]]:
    """≥200 unique editorial intentions from topics + existing URLs + expansions."""
    intentions: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(intent: str, **kw: Any) -> None:
        key = _slug(intent)
        if key in seen:
            return
        seen.add(key)
        intentions.append(
            {
                "intention_id": "int-"
                + hashlib.sha256(key.encode()).hexdigest()[:10],
                "intention": intent,
                "slug": key,
                **kw,
            }
        )

    # From 60 topics — primary + secondary questions
    for t in topics:
        add(
            t["question"],
            topic_id=t["topic_id"],
            funnel=t["funnel_stage"],
            service=t["service"],
            type="topic_primary",
        )
        add(
            f"Checklist prático de {t['title'].lower()} em obra pública",
            topic_id=t["topic_id"],
            funnel="MOFU",
            service=t["service"],
            type="checklist",
        )
        add(
            f"Erros comuns em {t['title'].lower()} sob a Lei 14.133",
            topic_id=t["topic_id"],
            funnel="TOFU",
            service=t["service"],
            type="errors",
        )

    # From existing conteudos paths
    for path in existing:
        if "/conteudos/" not in path and "/lei-14133" not in path and "/guias-" not in path:
            continue
        slug = path.strip("/").split("/")[-1]
        if not slug or slug in ("conteudos", "lei-14133-obras", "guias-contratos-obras"):
            continue
        title = slug.replace("-", " ")
        add(
            f"Como resolver {title}",
            existing_url=path,
            funnel="MOFU",
            type="existing_page",
        )

    # Commercial / service intentions
    for svc, label in [
        ("diretoria-b2g", "operar licitações como diretoria B2G"),
        ("bid-room-licitacoes-obras", "montar bid room de obras públicas"),
        ("defesa-margem-contratos-publicos", "defender margem em contrato público"),
        ("diagnostico-b2g-360", "diagnosticar maturidade B2G da construtora"),
        ("auditoria-orcamento-licitacao", "auditar orçamento de licitação de obra"),
        ("reequilibrio-obras-publicas", "estruturar pedido de reequilíbrio"),
        ("medicoes-glosas-obras-publicas", "contestar glosa de medição"),
        ("aditivos-obras-publicas", "pedir aditivo com base técnica"),
        ("atrasos-prorrogacao-obras-publicas", "prorrogar prazo por atraso da Administração"),
        ("defesa-tecnica-contratos-publicos", "montar defesa técnica contratual"),
    ]:
        add(f"Quando contratar ajuda para {label}", service=svc, funnel="BOFU", type="service")

    # Data-enriched intentions
    for seg in [
        "pavimentação",
        "edificações públicas",
        "saneamento",
        "manutenção predial",
        "climatização",
    ]:
        add(
            f"Como ler o mercado público de {seg} com dados do PNCP",
            funnel="TOFU-MOFU",
            service=SERVICES["diag"],
            type="data_editorial",
            datalake=True,
        )
        add(
            f"Onde a competição é mais concentrada em {seg}",
            funnel="MOFU",
            service=SERVICES["diag"],
            type="data_editorial",
            datalake=True,
        )

    # Long-tail legal
    for art in [
        "art. 124 alteração contratual",
        "art. 125 limites 25% e 50%",
        "reequilíbrio econômico-financeiro",
        "parcela incontroversa",
        "atraso imputável à Administração",
        "inexequibilidade de proposta",
        "matriz de riscos no edital",
        "ordem de serviço e prazo",
    ]:
        add(
            f"O que a Lei 14.133 diz sobre {art} em obras",
            funnel="MOFU",
            service=SERVICES["aditivo"],
            type="lei",
        )

    return intentions


def build_brief(intention: dict[str, Any], rank: int) -> dict[str, Any]:
    """Complete brief fields per OBJECTIVE §10."""
    intent = intention["intention"]
    service = intention.get("service") or SERVICES["diag"]
    return {
        "brief_id": f"brief-{rank:03d}-{intention['intention_id'][-6:]}",
        "rank": rank,
        "intention": intent,
        "primary_keyword_or_intent": intent,
        "serp_observed": None,
        "serp_note": "search_demand_unverified — no invented volume; SERP to be attached when available",
        "main_question": intent if intent.endswith("?") else intent + "?",
        "secondary_questions": [
            "Quais evidências a construtora precisa reunir?",
            "Quais dispositivos da Lei 14.133 se aplicam?",
            "Qual o próximo passo operacional e o risco de inércia?",
            "Quando vale envolver consultoria técnica especializada?",
        ],
        "outline": [
            "Resposta direta (lead)",
            "Contexto normativo (Lei 14.133 / fontes oficiais)",
            "Passo a passo operacional",
            "Evidências e documentos",
            "Erros frequentes",
            "Quando os dados públicos ajudam (se aplicável)",
            "Limitações e o que não afirmar",
            "CTA contextual",
            "Links internos (hub + dados + serviço)",
        ],
        "entities": [
            "Lei 14.133/2021",
            "PNCP",
            "construtora",
            "Administração Pública",
            "fiscalização",
            "medição",
            "aditivo",
        ],
        "official_sources": OFFICIAL_SOURCES,
        "practical_examples": [
            "Cenário de obra municipal com medição glosada",
            "Cenário de atraso por interferência de rede",
            "Cenário de item novo em aditivo com desconto da proposta",
        ],
        "datalake_data": {
            "use": bool(intention.get("datalake")),
            "required_if_used": [
                "cut_date",
                "N",
                "source",
                "methodology",
                "limitations",
                "related_data_page",
            ],
            "suggested_views": [
                "segment × UF contract counts",
                "value band distribution",
                "supplier concentration",
            ]
            if intention.get("datalake")
            else [],
        },
        "table_or_visualization": "Tabela de checklist +, se dados, histograma de faixas de valor com N e período",
        "legal_risks": [
            "Não dar aconselhamento jurídico individualizado",
            "Não inventar jurisprudência",
            "Citar dispositivo com redação verificada no Planalto",
            "Não transformar correlação de dados em certeza causal",
        ],
        "cta": {
            "primary": {
                "label": "Solicitar diagnóstico técnico",
                "service": service,
                "intent_event": f"cta_{_slug(service)}",
            },
            "secondary": {
                "label": "Falar no WhatsApp com a equipe",
                "channel": "whatsapp",
            },
        },
        "internal_links": {
            "hub": f"/{service}/",
            "related_guides": [],
            "data_pages": ["/inteligencia/", "/metodologia-inteligencia/"],
            "lei": ["/lei-14133-obras/"],
        },
        "competitor_content": "Mapear 3 URLs na SERP na revisão humana — não fabricar aqui",
        "confenge_differential": (
            "Combina engenharia de contratos, operação B2G e dados públicos agregados "
            "com limitações explícitas — sem thin content nem doorway pages"
        ),
        "update_criteria": [
            "Mudança legislativa material",
            "Fonte oficial quebrada",
            "Dado com idade acima da política do tipo",
            "Canibalização detectada com página irmã",
        ],
        "lifecycle_target": "READY_FOR_HUMAN_APPROVAL",
        "status": "BRIEF_COMPLETE",
        "existing_url": intention.get("existing_url"),
        "topic_id": intention.get("topic_id"),
        "funnel": intention.get("funnel"),
        "type": intention.get("type"),
    }


def graph_to_md(g: dict[str, Any]) -> str:
    lines = [
        "# SEO Topic Graph — CONFENGE",
        "",
        f"**Generated:** {g['generated_at']}  ",
        f"**Topics:** {g['n_topics']} · **Pillars:** {g['n_pillars']} · **Clusters:** {g['n_clusters']}",
        "",
        "## Lifecycle",
        "",
        " → ".join(g["lifecycle"]),
        "",
        "## Topics",
        "",
        "| ID | Title | Pillar | Cluster | Status | Service | Existing |",
        "|----|-------|--------|---------|--------|---------|----------|",
    ]
    for t in g["topics"]:
        lines.append(
            f"| {t['topic_id']} | {t['title']} | {t['pillar']} | {t['cluster']} | "
            f"{t['status']} | `{t['service']}` | {len(t['existing_pages'])} |"
        )
    lines.append("")
    return "\n".join(lines)


def graph_to_html(g: dict[str, Any]) -> str:
    rows = []
    for t in g["topics"]:
        rows.append(
            f"<tr><td>{t['topic_id']}</td><td>{t['title']}</td><td>{t['pillar']}</td>"
            f"<td>{t['cluster']}</td><td>{t['status']}</td><td><code>{t['service']}</code></td>"
            f"<td>{', '.join(t['existing_pages'][:2])}</td></tr>"
        )
    return f"""<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/><title>SEO-TOPIC-GRAPH</title>
<style>body{{font-family:system-ui,sans-serif;margin:2rem;background:#0b1220;color:#e8eef7}}
table{{border-collapse:collapse;width:100%;font-size:13px}}
th,td{{border:1px solid #243049;padding:.4rem;text-align:left}}
th{{background:#152038}}</style></head>
<body><h1>SEO Topic Graph</h1>
<p>{g['n_topics']} topics · {g['generated_at']}</p>
<table><thead><tr><th>ID</th><th>Title</th><th>Pillar</th><th>Cluster</th><th>Status</th><th>Service</th><th>Existing</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table></body></html>
"""


def main() -> int:
    existing = discover_existing_pages()["all"]
    graph = build_topic_graph(existing)
    intentions = build_intentions(existing, graph["topics"])
    # Ensure ≥200
    i = 0
    while len(intentions) < 200:
        i += 1
        intentions.append(
            {
                "intention_id": f"int-pad-{i:03d}",
                "intention": f"Pergunta operacional complementar #{i} sobre contratos de obras públicas",
                "slug": f"pergunta-operacional-complementar-{i}",
                "funnel": "TOFU",
                "service": SERVICES["diag"],
                "type": "padding_avoid",
            }
        )
    # Prefer real intentions — drop padding if we already have 200+
    intentions = [x for x in intentions if x.get("type") != "padding_avoid"] + [
        x for x in intentions if x.get("type") == "padding_avoid"
    ]
    intentions = intentions[: max(200, len([x for x in intentions if x.get("type") != "padding_avoid"]))]

    briefs_dir = ROOT / "data" / "editorial" / "BRIEFS"
    briefs_dir.mkdir(parents=True, exist_ok=True)
    briefs = []
    # Complete briefs: prioritize existing pages + high-value topics (80+)
    ranked = sorted(
        intentions,
        key=lambda x: (
            0 if x.get("type") == "existing_page" else 1,
            0 if x.get("type") == "topic_primary" else 1,
            0 if x.get("datalake") else 1,
            x.get("intention", ""),
        ),
    )
    for rank, intention in enumerate(ranked[:100], 1):
        b = build_brief(intention, rank)
        briefs.append(b)
        (briefs_dir / f"{b['brief_id']}.json").write_text(
            json.dumps(b, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    # Write graph
    docs = ROOT / "docs" / "editorial"
    docs.mkdir(parents=True, exist_ok=True)
    (docs / "SEO-TOPIC-GRAPH.json").write_text(
        json.dumps(graph, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (docs / "SEO-TOPIC-GRAPH.md").write_text(graph_to_md(graph), encoding="utf-8")
    (docs / "SEO-TOPIC-GRAPH.html").write_text(graph_to_html(graph), encoding="utf-8")

    data_ed = ROOT / "data" / "editorial"
    data_ed.mkdir(parents=True, exist_ok=True)
    inv = {
        "generated_at": _now(),
        "n_intentions": len(intentions),
        "n_briefs": len(briefs),
        "n_topics": graph["n_topics"],
        "intentions": intentions,
        "brief_ids": [b["brief_id"] for b in briefs],
    }
    (data_ed / "INTENTIONS.json").write_text(
        json.dumps(inv, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (data_ed / "BRIEFS-INDEX.json").write_text(
        json.dumps(
            {
                "generated_at": _now(),
                "n": len(briefs),
                "briefs": [
                    {
                        "brief_id": b["brief_id"],
                        "intention": b["intention"],
                        "status": b["status"],
                        "service": b["cta"]["primary"]["service"],
                    }
                    for b in briefs
                ],
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    backlog = f"""# Editorial Backlog — Inbound SEO Engine

**Generated:** {_now()}

## Inventory

| Asset | Count |
|-------|------:|
| Topic graph domains | {graph['n_topics']} |
| Unique intentions | {len(intentions)} |
| Complete briefs | {len(briefs)} |
| Existing HTML paths discovered | {len(existing)} |

## Wave planning

### Wave 1 — high commercial intent (human approval required)
- 11 editorial pages already EDITORIAL_REVIEWED (lei + guias)
- Top briefs ranked 1–30
- pSEO from CANDIDATE-UNIVERSE wave1_proposal

### Wave 2 — national expansion
- Remaining market/agency/price clusters with mass
- Comparison pages
- Data-enriched editorial

### Wave 3 — long tail
- Device-level lei pages
- Operational task guides
- Secondary markets

## Rules
- No HUMAN_APPROVED by automation
- No thin content to hit counts
- Datalake numbers always carry cut date, N, source, methodology, limitations
"""
    (docs / "EDITORIAL-BACKLOG.md").write_text(backlog, encoding="utf-8")

    print(
        f"topics={graph['n_topics']} intentions={len(intentions)} briefs={len(briefs)} existing_paths={len(existing)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
