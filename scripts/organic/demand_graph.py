"""Demand graph: persona → problem → question → intent → Confenge service.

Not a keyword list. Semantic needs map to one opportunity node even when
queries vary textually.
"""

from __future__ import annotations

from typing import Any

DEMAND_INPUTS: list[dict[str, Any]] = [
    {
        "id": "gsc-current",
        "kind": "google_search_console",
        "path": "data/revops/gsc/insights_latest.json",
        "as_of": "2026-07-30",
        "limitations": "Aggregate search evidence; never joined query-to-lead.",
    },
    {
        "id": "smartlic-historical",
        "kind": "pending_migration_evidence",
        "path": "https://github.com/tjsasakifln/web-cfg/pull/68",
        "as_of": "2026-08-14",
        "state": "PENDING_ACCEPTANCE",
        "limitations": "SmartLic donor GSC exports exist only in unmerged PR #68; current SmartLic GSC API state is UNKNOWN.",
    },
    {
        "id": "live-serp-2026-08-14",
        "kind": "live_search_observation",
        "path": "data/organic/search-baseline-2026-08-14.json",
        "as_of": "2026-08-14",
        "limitations": "Observed result sample, not rank tracking or exhaustive index coverage.",
    },
    {
        "id": "commercial-jobs",
        "kind": "commercial_questions_and_objections",
        "path": "index.html#jornadas",
        "as_of": "2026-08-14",
        "limitations": "Current positioning and operator knowledge; win/loss denominators are UNKNOWN.",
    },
    {
        "id": "public-read-v1",
        "kind": "public_data_capability",
        "path": "https://github.com/tjsasakifln/extra-cli/blob/main/docs/contracts/public-read-v1.md",
        "as_of": "2026-08-14",
        "limitations": "SELECT-only producer contract; live consumer query health must be verified separately.",
    },
    {
        "id": "service-economics",
        "kind": "commercial_economics",
        "path": None,
        "as_of": "2026-08-14",
        "state": "UNKNOWN",
        "limitations": "No versioned ticket, close-rate or contribution-margin baseline was available.",
    },
]

STAGE_BY_INTENT = {
    "tofu": "problem_awareness",
    "mofu": "solution_evaluation",
    "bofu": "commercial_decision",
}

NODE_DECISION_FIELDS: dict[str, dict[str, Any]] = {
    "need-reequilibrio-pleito": {
        "asset": "/ferramentas/checklist-reequilibrio/",
        "unique_utility": "Fail-closed documentary readiness check with central blockers, correction order and local-only answers.",
        "hypothesis": "A contractor facing margin erosion will use a private readiness check before requesting a technical second reading.",
    },
    "need-aditivo-limite": {
        "asset": "/ferramentas/limite-acrescimos-supressoes/",
        "unique_utility": "Separates additions and suppressions and exposes the decision inputs instead of returning a context-free percentage.",
        "hypothesis": "A contract engineer near an amendment limit will value a transparent calculation and request case review when assumptions are uncertain.",
    },
    "need-medicao-glosa": {
        "asset": "/medicoes-glosas-obras-publicas/",
        "unique_utility": "Connects measurement facts, proof and cash impact to an engineering-specific evidence workflow.",
        "hypothesis": "A contractor with retained cash will prefer an evidence workflow over generic legal copy and request a measurement review.",
    },
    "need-sinapi-desonerado": {
        "asset": "/conteudos/sinapi-desonerado-nao-desonerado/",
        "unique_utility": "Relates the selected SINAPI regime to BDI, payroll charges and proposal-margin consequences.",
        "hypothesis": "An estimator comparing SINAPI regimes will progress to an audit when the page makes the margin consequence explicit.",
    },
    "need-atraso-prorrogacao": {
        "asset": "/ferramentas/matriz-atraso-obra/",
        "unique_utility": "Structures cause, responsibility, evidence and time impact without asserting an unsupported legal conclusion.",
        "hypothesis": "A contract manager under schedule pressure will use the matrix to find evidence gaps and request a second reading.",
    },
    "need-edital-orcamento": {
        "asset": "/auditoria-orcamento-licitacao/",
        "unique_utility": "Frames bid/no-bid around budget provenance, executability and margin rather than tender volume.",
        "hypothesis": "A bid team with an inconsistent budget will seek a technical audit before committing proposal capital.",
    },
    "need-benchmark-mercado": {
        "asset": "/radar/nacional-obras-publicas/",
        "unique_utility": "Uses normalized contract evidence with visible methodology and limitations for reuse and comparison.",
        "hypothesis": "Original, reusable contract evidence will earn citations and create qualified market-intelligence conversations.",
    },
    "need-gestao-contratual": {
        "asset": "/acompanhamento-contratos-obras/",
        "unique_utility": "Maps recurring contract-control failures to an explicit continuous operating routine and next decision.",
        "hypothesis": "A director with recurring contract leakage will choose a diagnostic when continuous-routine fit is made concrete.",
    },
    "need-defesa-margem-diagnostico": {
        "asset": "/ferramentas/diagnostico-defesa-margem/",
        "unique_utility": "Turns a public contract identifier into a provenance-bearing factual reading that preserves UNKNOWN instead of inventing legal credit.",
        "hypothesis": "A contractor with a named public contract will request a CONFENGE second reading after seeing official facts and explicit UNKNOWN gaps.",
    },
}

# Canonical demand nodes grounded in CONFENGE service inventory
DEMAND_NODES: list[dict[str, Any]] = [
    {
        "id": "need-reequilibrio-pleito",
        "persona": "diretor-construtora",
        "problem": "Contrato de obra pública virou prejuízo ou a equação original se rompeu",
        "question": "Quando cabe reequilíbrio e como estruturar um pleito defensável?",
        "intent": "bofu",
        "jtbd": "Proteger margem e decidir se vale montar pleito de reequilíbrio agora",
        "cluster": "reequilibrio",
        "service_slug": "reequilibrio-obras-publicas",
        "service_path": "/reequilibrio-obras-publicas/",
        "related_queries": [
            "reequilíbrio econômico financeiro obra pública",
            "pedido de reequilíbrio contrato público",
            "reajuste ou reequilíbrio obra pública",
        ],
        "cta": "Analisar viabilidade de reequilíbrio",
        "funnel": "bofu",
        "existing_url": "/reequilibrio-obras-publicas/",
    },
    {
        "id": "need-aditivo-limite",
        "persona": "engenheiro-contratos",
        "problem": "Acréscimos/supressões se aproximam dos limites legais",
        "question": "Como contar o limite de 25%/50% e o que documentar no aditivo?",
        "intent": "mofu",
        "jtbd": "Calcular saldo de aditivo e evitar pedido sem base",
        "cluster": "aditivos",
        "service_slug": "aditivos-obras-publicas",
        "service_path": "/aditivos-obras-publicas/",
        "related_queries": [
            "aditivos obra pública",
            "limite aditivo 25 50 obra pública",
            "acréscimo e supressão contrato público",
        ],
        "cta": "Revisar estratégia de aditivo",
        "funnel": "mofu",
        "tool_path": "/ferramentas/limite-acrescimos-supressoes/",
        "existing_url": "/aditivos-obras-publicas/",
    },
    {
        "id": "need-medicao-glosa",
        "persona": "engenheiro-obra",
        "problem": "Medição glosada, critério inventado ou parcela retida",
        "question": "Como contestar glosa e proteger o fluxo de caixa?",
        "intent": "bofu",
        "jtbd": "Recuperar medição e documentar nexo com o contrato",
        "cluster": "medicoes-pagamentos",
        "service_slug": "medicoes-glosas-obras-publicas",
        "service_path": "/medicoes-glosas-obras-publicas/",
        "related_queries": [
            "glosa de medição obra pública",
            "medição de obra pública rejeitada",
            "parcela incontroversa medição",
        ],
        "cta": "Revisar medição e glosa",
        "funnel": "bofu",
        "existing_url": "/medicoes-glosas-obras-publicas/",
    },
    {
        "id": "need-sinapi-desonerado",
        "persona": "orcamentista",
        "problem": "Dúvida sobre base SINAPI desonerada vs não desonerada no edital",
        "question": "Qual base usar e como alinhar BDI e encargos?",
        "intent": "mofu",
        "jtbd": "Evitar erro de base que destrói margem na proposta",
        "cluster": "orcamento-bdi",
        "service_slug": "auditoria-orcamento-licitacao",
        "service_path": "/auditoria-orcamento-licitacao/",
        "related_queries": [
            "desonerado e não desonerado",
            "sinapi desonerado ou não desonerado",
            "desonerado ou não desonerado",
        ],
        "cta": "Auditar orçamento e BDI do edital",
        "funnel": "mofu",
        "existing_url": "/conteudos/sinapi-desonerado-nao-desonerado/",
    },
    {
        "id": "need-atraso-prorrogacao",
        "persona": "gerente-contratos",
        "problem": "Atraso imputável à Administração ou risco de notificação",
        "question": "Como documentar prorrogação e responder notificação?",
        "intent": "mofu",
        "jtbd": "Proteger prazo e evitar sanção indevida",
        "cluster": "atrasos-prorrogacao",
        "service_slug": "atrasos-prorrogacao-obras-publicas",
        "service_path": "/atrasos-prorrogacao-obras-publicas/",
        "related_queries": [
            "prorrogação prazo obra pública",
            "notificação atraso obra pública",
            "atraso imputável administração",
        ],
        "cta": "Montar defesa de prazo",
        "funnel": "mofu",
        "tool_path": "/ferramentas/matriz-atraso-obra/",
        "existing_url": "/atrasos-prorrogacao-obras-publicas/",
    },
    {
        "id": "need-edital-orcamento",
        "persona": "licitacoes",
        "problem": "Edital com orçamento inconsistente ou referência duvidosa",
        "question": "Participar, impugnar ou auditar a planilha antes da proposta?",
        "intent": "bofu",
        "jtbd": "Decidir se a licitação é economicamente segura",
        "cluster": "edital-proposta",
        "service_slug": "auditoria-orcamento-licitacao",
        "service_path": "/auditoria-orcamento-licitacao/",
        "related_queries": [
            "orçamento incompleto edital obra pública",
            "auditoria orçamento licitação",
            "sinapi ou sicro obra pública",
        ],
        "cta": "Auditar edital e orçamento",
        "funnel": "bofu",
        "existing_url": "/auditoria-orcamento-licitacao/",
    },
    {
        "id": "need-benchmark-mercado",
        "persona": "diretor-construtora",
        "problem": "Não sabe se valor/duração/alterações do contrato são 'normais'",
        "question": "Isso é normal no mercado público de obras?",
        "intent": "tofu",
        "jtbd": "Comparar o próprio caso com evidência agregada do mercado",
        "cluster": "inteligencia-mercado",
        "service_slug": "metodologia-inteligencia",
        "service_path": "/metodologia-inteligencia/",
        "related_queries": [
            "benchmark contratos obras públicas",
            "mediana valor contrato obra pública",
        ],
        "cta": "Entender como a inteligência de mercado apoia decisões",
        "funnel": "tofu",
        "requires_data_moat": True,
    },
    {
        "id": "need-gestao-contratual",
        "persona": "proprietario-construtora",
        "problem": "Contratos públicos sem rotina de gestão geram prejuízo silencioso",
        "question": "Quando vale consultoria de acompanhamento contratual vs equipe própria?",
        "intent": "bofu",
        "jtbd": "Decidir se contrata apoio externo para gestão B2G",
        "cluster": "gestao-contratual",
        "service_slug": "acompanhamento-contratos-obras",
        "service_path": "/acompanhamento-contratos-obras/",
        "related_queries": [
            "consultoria B2G engenharia construtora",
            "gestão de contratos de obras públicas",
        ],
        "cta": "Diagnosticar gestão contratual B2G",
        "funnel": "bofu",
        "existing_url": "/acompanhamento-contratos-obras/",
    },
    {
        "id": "need-defesa-margem-diagnostico",
        "persona": "diretor-construtora",
        "problem": "Contrato público em execução sem leitura factual de margem, prazos e eventos",
        "question": "O que este contrato público já mostra — e o que permanece UNKNOWN — antes de pedir uma segunda leitura?",
        "intent": "bofu",
        "jtbd": "Partir de um contrato real e decidir se vale pedir segunda leitura técnica",
        "cluster": "defesa-margem",
        "service_slug": "defesa-margem-contratos-publicos",
        "service_path": "/defesa-margem-contratos-publicos/",
        "related_queries": [
            "defesa de margem contrato público",
            "diagnóstico contrato obra pública",
            "segunda leitura contrato público",
        ],
        "cta": "Quero uma segunda leitura deste contrato",
        "funnel": "bofu",
        "existing_url": "/ferramentas/diagnostico-defesa-margem/",
    },
]


def demand_map() -> dict[str, Any]:
    """Export demand graph as versioned artifact structure."""
    by_cluster: dict[str, list[str]] = {}
    by_intent: dict[str, list[str]] = {}
    nodes: list[dict[str, Any]] = []
    for raw in DEMAND_NODES:
        n = dict(raw)
        decision = NODE_DECISION_FIELDS[n["id"]]
        n.update(
            {
                "icp": n["persona"],
                "stage": STAGE_BY_INTENT[n["intent"]],
                "asset": decision["asset"],
                "unique_utility": decision["unique_utility"],
                "evidence": ["gsc-current", "smartlic-historical", "live-serp-2026-08-14", "commercial-jobs"],
                "confenge_offer": n["service_path"],
                "success_metric": "qualified_commercial_opportunity_created",
                "experiment": {
                    "decision_state": "VALIDATE",
                    "hypothesis": decision["hypothesis"],
                    "target_query_job": n["jtbd"],
                    "commercial_offer": n["service_path"],
                    "pipeline_mechanism": "useful_asset → contextual_CTA → attributable_lead → operator_next_action → qualified_conversation",
                    "publication_canary_size": "one canonical asset or family",
                    "promotion_threshold": "unique usefulness + crawl/index quality + engaged use or citation + commercial signal",
                    "kill_deindex_threshold": "thin or duplicate intent, unresolved factual defect, or no engaged/citation/commercial reason after the evidence cycle",
                    "maintenance_owner": "web-cfg public surface; extra-cli only where data-backed",
                    "maintenance_cost": "UNKNOWN until the first 28-day operating cycle",
                    "evidence_plan": {
                        "day_7": "crawl, index coverage, tool completion and attribution integrity",
                        "day_28": "engaged usage, citations/links and qualified commercial signals",
                        "day_90": "qualified pipeline, maintenance cost and promote/hold/deindex decision",
                    },
                },
            }
        )
        nodes.append(n)
        by_cluster.setdefault(n["cluster"], []).append(n["id"])
        by_intent.setdefault(n["intent"], []).append(n["id"])
    graph = {
        "schema_version": "organic-demand-v2",
        "model": "query/problem → user job → ICP → stage → asset → unique utility → evidence → CTA → CONFENGE offer → success metric",
        "inputs": DEMAND_INPUTS,
        "nodes": nodes,
        "by_cluster": by_cluster,
        "by_intent": by_intent,
        "principle": (
            "Agrupar variantes textuais da mesma necessidade em um único nó. "
            "Não criar uma página por keyword."
        ),
    }
    validate_demand_map(graph)
    return graph


def validate_demand_map(graph: dict[str, Any]) -> None:
    """Fail closed when a proposed asset lacks a commercial decision chain."""
    required = {
        "problem",
        "jtbd",
        "icp",
        "stage",
        "asset",
        "unique_utility",
        "evidence",
        "cta",
        "confenge_offer",
        "success_metric",
        "experiment",
    }
    input_ids = {row.get("id") for row in graph.get("inputs", [])}
    if "service-economics" not in input_ids:
        raise ValueError("demand graph must preserve service economics as evidence or UNKNOWN")
    for node in graph.get("nodes", []):
        missing = sorted(key for key in required if not node.get(key))
        if missing:
            raise ValueError(f"{node.get('id', 'UNKNOWN')} missing required demand fields: {', '.join(missing)}")
        experiment = node["experiment"]
        for key in ("hypothesis", "publication_canary_size", "promotion_threshold", "kill_deindex_threshold", "maintenance_owner", "maintenance_cost", "evidence_plan"):
            if not experiment.get(key):
                raise ValueError(f"{node['id']} missing experiment.{key}")


def match_queries_to_nodes(queries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attach GSC query rows to demand nodes by substring overlap."""
    matches: list[dict[str, Any]] = []
    for qrow in queries:
        q = str(qrow.get("query") or qrow.get("Top consultas") or "").lower()
        if not q:
            continue
        best = None
        best_hits = 0
        for node in DEMAND_NODES:
            hits = 0
            for rq in node.get("related_queries") or []:
                tokens = [t for t in rq.lower().split() if len(t) > 3]
                if sum(1 for t in tokens if t in q) >= max(2, len(tokens) // 2):
                    hits += 1
                if rq.lower() in q or q in rq.lower():
                    hits += 2
            # cluster token hits
            for tok in node["cluster"].replace("-", " ").split():
                if len(tok) > 3 and tok in q:
                    hits += 1
            if hits > best_hits:
                best_hits = hits
                best = node
        if best and best_hits > 0:
            matches.append(
                {
                    "query": q,
                    "node_id": best["id"],
                    "hits": best_hits,
                    "impressions": float(qrow.get("impressions") or qrow.get("Impressões") or 0),
                    "clicks": float(qrow.get("clicks") or qrow.get("Cliques") or 0),
                    "position": float(qrow.get("position") or qrow.get("Posição") or 0),
                    "ctr": float(qrow.get("ctr") or 0),
                }
            )
    return matches
