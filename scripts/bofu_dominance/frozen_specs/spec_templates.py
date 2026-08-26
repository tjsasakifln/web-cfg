"""Authoring templates for frozen specs. Snapshot fields are filled from live HTML at write time."""

from __future__ import annotations

from typing import Any

GSC_OTHER = {
    "gsc_live_available": False,
    "source_kind": "LIVE_JOB_OK",
    "ready_for_product_decisions": False,
    "authorizes_html_edit": False,
    "other_evidence_decision": {
        "decision": "USE_HISTORICAL_EXPORT_AND_ISSUE_128_BASELINE",
        "sources": [
            "seo/gsc-2026-08-09",
            "docs/ops/ORGANIC-GROWTH-REPORT.md",
            "https://github.com/tjsasakifln/web-cfg/issues/128",
        ],
        "invented_live_metrics": False,
        "reason": "PR #159 live Search Analytics is LIVE_JOB_OK. Specs use seo/gsc-2026-08-09 plus the six-URL table in #128. Absence is not zero.",
    },
}

DEMAND_CONTROL = {
    "pr": 159,
    "authorizes_html_edit": False,
    "source_kind": "LIVE_JOB_OK",
    "ready_for_product_decisions": False,
    "bofu_observe_only": True,
    "earliest_safe_action_at": "2026-09-16",
}

ISSUE_128 = {
    "issue": 128,
    "state": "LANDED_AWAITING_LIVE_EVIDENCE",
    "commercial_click_share": 0.0,
    "evidential_close": False,
}

EXTRA_CLI = {
    "pr_435": {
        "state": "COMPARABLE",
        "publication_authorization": False,
        "use": "factual_input_only",
    },
    "pr_437": {
        "verdict": "PARTIAL",
        "national_claim_authorized": False,
        "use": "factual_input_only",
    },
    "publication_authorization": False,
    "national_claim_authorized": False,
}


def _common(
    slug: str,
    path: str,
    family: str,
    gsc_row: dict[str, Any],
) -> dict[str, Any]:
    return {
        "slug": slug,
        "path": path,
        "family": family,
        "campaign": "CONFENGE-WEB-BOFU-FROZEN-PILLAR-SPECS-01",
        "mode": "PREPARE_ONLY",
        "html_mutation": False,
        "corresponding_issue": 128,
        "earliest_safe_action_at": "2026-09-16",
        "evidential_close": False,
        "demand_control_citation": DEMAND_CONTROL,
        "issue_128_baseline": {**ISSUE_128, "gsc_row": gsc_row},
        "extra_cli_inputs": EXTRA_CLI,
        "gsc_precondition": GSC_OTHER,
        "success_metrics": {
            "commercial_click_share": "no longer 0% on a 28-day GSC window after gate, or an explicit kill note that demand is informational-only at this volume",
            "service_url_clicks": "at least one click on this service URL in the next complete 28d GSC window, or the pillar leaves the documented position band",
            "north_star": "inbound qualified pipeline / month; impressions on /conteudos/ are not success",
            "denominator": "historical seo/gsc-2026-08-09 until GSC live is ready_for_product_decisions=true",
        },
        "kill_metrics": {
            "bridges_and_snippet_shipped_service_clicks_still_zero": "if 28d GSC after observation still shows service clicks=0 while content clicks hold, the gap is offer/SERP not linking; #88/#60 own the next move",
            "noisy_n": "do not treat impressions < 30 as significance; do not invent live metrics from LIVE_JOB_OK",
            "cannibalization": "kill the hypothesized snippet if a sibling indexable URL captures the owned query after the change",
        },
        "revert_metrics": {
            "trigger": "revert the hash-bound patch if CTR/position on the owned query does not move while position is stable, or if a sibling cannibalizes the same non-brand intent",
            "method": "restore the bound content_sha256 of the pillar HTML; do not blanket-redirect",
        },
    }


TEMPLATES: dict[str, dict[str, Any]] = {
    "aditivos-obras-publicas": {
        **_common(
            "aditivos-obras-publicas",
            "/aditivos-obras-publicas/",
            "aditivos",
            {"impressions": 12, "clicks": 0, "position": 49.25},
        ),
        "visitor_job": "Enquadrar uma mudança de obra (acréscimo, supressão, item novo, serviço extra) em fato documentado, preço justificável e decisão formal antes de executar sem cobertura.",
        "serp_census": {
            "family": "aditivos",
            "as_of": "2026-08-19",
            "rank_status": "UNKNOWN",
            "note": "SERP ranks are not invented. GSC historical position for this URL is 49.25 (seo/gsc-2026-08-09). Live rank tracking was not run.",
            "competitors": [
                {
                    "url": "https://www.jusbrasil.com.br/artigos/alteracoes-contratuais-aditivos-nas-obras-publicas/1289579327",
                    "kind": "legal_article",
                    "intent": "informational_legal",
                },
                {
                    "url": "https://prefeitura.sp.gov.br/web/procuradoria_geral/w/cejur/cejur-debate-aditivos-em-contratos-de-obras-públicas-com-base-na-lei-n-1413321",
                    "kind": "public_sector_event",
                    "intent": "informational_lei_14133",
                },
                {
                    "url": "https://www.interempresas.net/ObrasPublicas/494172-Master-Builders-Solutions-referente-mundial-en-aditivos-para-la-Construccion.html",
                    "kind": "chemical_admixture_vendor",
                    "intent": "negative_chemical_aditivos",
                },
            ],
            "intent_gaps": [
                "Query 'aditivos obras públicas' collides with concrete-admixture SERPs; the commercial job (documentos, limite 25/50, margem) is under-served by generic legal explainers.",
                "No observed contractor-side decision utility that names when NOT to hire. CONFENGE already has that block; it is not yet a ranking claim.",
                "CONFENGE rank for the generic query is UNKNOWN; GSC shows pos 49.25 / 0 clicks / 6 query impressions on 'aditivos obras públicas'.",
            ],
        },
        "query_ownership": {
            "owned": [
                "aditivos obras públicas",
                "aditivos em obras públicas",
            ],
            "supporting_not_owned_by_pillar": [
                "aditivo qualitativo e quantitativo",
                "limite aditivo 25 50 obra pública",
            ],
            "gsc_query_row": {
                "query": "aditivos obras públicas",
                "impressions": 6,
                "clicks": 0,
                "position": 35.0,
                "source": "seo/gsc-2026-08-09/Consultas.csv",
            },
        },
        "negative_queries": [
            "aditivos para concreto / aditivos químicos / Master Builders",
            "aditivo de prazo sem mudança de escopo (atrasos family)",
            "SmartLic product or legacy brand queries",
        ],
        "cannibalization": {
            "status": "RISK_DECLARED_NOT_MEASURED_LIVE",
            "note": "PR #159 cannibalization detector returned NOT_CANNIBALIZATION on a LIVE_JOB_OK empty set; that is not a live all-clear.",
            "siblings": [
                {
                    "url": "/conteudos/aditivo-qualitativo-quantitativo/",
                    "robots": "noindex,follow",
                    "gsc": "22 impr / 0 clicks / pos 6.09",
                    "owner": "#127 KEEP_NOINDEX unless human rewrite",
                },
                {
                    "url": "/conteudos/limite-aditivo-25-50-obra-publica/",
                    "gsc": "14 impr / 0 clicks / pos 11.0",
                    "note": "pillar H2 already defers the 25/50 question to this guide",
                },
            ],
        },
        "before_after_blocks": [
            {
                "block": "h1",
                "before": "Aditivos e serviços extras em obras públicas: documentar, precificar e decidir",
                "after": "Aditivos em obras públicas: documentar, precificar e decidir",
                "why": "Front-load the GSC query lead already present in <title> so H1 and snippet agree. No new section.",
            },
            {
                "block": "title_meta_canonical",
                "before": "title already = Aditivos em obras públicas: documentos e margem | CONFENGE; canonical present; meta specific",
                "after": "keep title/meta/canonical; do not re-run the #128 snippet that already shipped",
                "why": "Issue #128 snippet pass already landed (LANDED_AWAITING_LIVE_EVIDENCE). This patch is the next hypothesized alignment, not a second snippet rewrite of title.",
            },
            {
                "block": "schema",
                "before": "CollectionPage + Service + FAQPage + BreadcrumbList",
                "after": "unchanged in this patch; Service remains; do not publish extra-cli COMPARABLE as schema",
                "why": "CollectionPage is a hub signal; changing @type is a larger experiment than this frozen draft.",
            },
            {
                "block": "cta",
                "before": "hero → /ferramentas/diagnostico-defesa-margem/; bridge WhatsApp 'Enquadrar o evento contratual'",
                "after": "unchanged",
                "why": "CTA/offer code is out of scope for this campaign.",
            },
        ],
        "evidence_proof_needed": [
            "Live GSC 28d on /aditivos-obras-publicas/ vs 12/0 @ 49.25 — requires GSC_CREDENTIALS_JSON or a new manual export. LIVE_JOB_OK is not zero.",
            "Query 'aditivos obras públicas' clicks/position vs 6/0 @ 35.",
            "Content→service transitions remain UNKNOWN without analytics export.",
            "extra-cli PR #435 COMPARABLE (publication_authorization=false) must not appear as a public case on this page. Proof-needed only if a later offer cites a named contract.",
            "Do not close #128 on deploy; evidential close needs the 28d GSC window.",
        ],
    },
    "medicoes-glosas-obras-publicas": {
        **_common(
            "medicoes-glosas-obras-publicas",
            "/medicoes-glosas-obras-publicas/",
            "medicoes-pagamentos",
            {"impressions": 8, "clicks": 0, "position": 7.88},
        ),
        "visitor_job": "Recuperar medição, contestar glosa e transformar serviço executado em valor recebido com prova contemporânea.",
        "serp_census": {
            "family": "medicoes-pagamentos",
            "as_of": "2026-08-19",
            "rank_status": "UNKNOWN",
            "note": "Do not invent pillar rank. Supporting article /conteudos/glosa-de-medicao-obra-publica/ was observed in the web sample; GSC historical CTR there is 12.5% (8 impr / 1 click).",
            "competitors": [
                {
                    "url": "https://licitacoesecontratos.tcu.gov.br/4-3-7-criterios-de-medicao-e-de-pagamento-2/",
                    "kind": "tcu_manual",
                    "intent": "informational_administration",
                },
                {
                    "url": "https://www.migalhas.com.br/depeso/231732/o-instituto-da-glosa--retencao-de-pagamentos-nos-contratos-administrativos",
                    "kind": "legal_doctrine",
                    "intent": "informational_legal",
                },
                {
                    "url": "https://effecti.com.br/glosa-contrato-publico/",
                    "kind": "saas_explainer",
                    "intent": "informational_generic_contracts",
                },
                {
                    "url": "https://confenge.com.br/conteudos/glosa-de-medicao-obra-publica/",
                    "kind": "own_supporting",
                    "intent": "informational_contractor",
                },
            ],
            "intent_gaps": [
                "Money query 'glosa de medição obra pública' already has a CONFENGE supporting URL with a click; the service pillar has 8 impr / 0 clicks. Transfer problem, not missing page.",
                "Generic glosa explainers (health-plan / TIC / public-controladoria) pollute the term.",
                "Pillar rank UNKNOWN beyond GSC pos 7.88.",
            ],
        },
        "query_ownership": {
            "owned": [
                "medições glosas obras públicas",
                "glosa de medição obra pública (service landing, after transfer)",
            ],
            "supporting_not_owned_by_pillar": [
                "glosa de medição obra pública → currently /conteudos/glosa-de-medicao-obra-publica/",
                "medição rejeitada obra pública → /conteudos/medicao-de-obra-publica-rejeitada/",
                "fiscal não assina medição",
            ],
            "gsc_supporting": {
                "glosa de medição obra pública": {
                    "impressions": 8,
                    "clicks": 1,
                    "position": 4.0,
                }
            },
        },
        "negative_queries": [
            "glosa de convênio médico / plano de saúde",
            "glosa TCU as auditoria de contas (controladoria, not contractor cash)",
            "glosa em contratos de TIC / NMS",
        ],
        "cannibalization": {
            "status": "RISK_OWN_SUPPORTING_OUTRANKS_PILLAR",
            "note": "Indexable supporting URLs hold the clicks. Do not 301 them onto the pillar. Do not index noindex siblings to feed the pillar (#127).",
            "siblings": [
                {
                    "url": "/conteudos/glosa-de-medicao-obra-publica/",
                    "gsc": "8 impr / 1 click / pos 4.0 / CTR 12.5%",
                },
                {
                    "url": "/conteudos/medicao-de-obra-publica-rejeitada/",
                    "gsc": "6 impr / 1 click / pos 5.5 / CTR 16.67%",
                },
                {
                    "url": "/conteudos/atraso-na-medicao-obra-publica/",
                    "gsc": "10 impr / 0 clicks / pos 8.1",
                },
            ],
        },
        "before_after_blocks": [
            {
                "block": "meta_og_schema_description",
                "before": "...valor efetivamente… (truncated ellipsis in meta, og:description and CollectionPage description)",
                "after": "...valor efetivamente recebido. (same sentence as visible lead)",
                "why": "Hygiene snippet. No new claims. Completes a truncated description already on-page.",
            },
            {
                "block": "title_h1",
                "before": "Medições, glosas e pagamentos em obras públicas | CONFENGE",
                "after": "unchanged",
                "why": "Title and H1 already agree. Do not front-load a query owned by a high-CTR supporting article.",
            },
            {
                "block": "cta",
                "before": "hero WhatsApp generic 'Analisar uma demanda'; bridge 'Enquadrar um risco contratual'",
                "after": "unchanged in this campaign (offer/CTA out of scope)",
                "why": "HTML/CTA freeze.",
            },
        ],
        "evidence_proof_needed": [
            "28d GSC on the pillar vs 8/0 @ 7.88 and on glosa supporting vs 8/1 @ 4.0 — do not join query to a lead.",
            "Whether a later snippet on the pillar steals the supporting click (cannibalization kill).",
            "Analytics content→service still UNKNOWN.",
            "extra-cli PARTIAL/COMPARABLE not applicable as published proof on this page.",
        ],
    },
    "reequilibrio-obras-publicas": {
        **_common(
            "reequilibrio-obras-publicas",
            "/reequilibrio-obras-publicas/",
            "reequilibrio",
            {"impressions": 4, "clicks": 0, "position": 7.75},
        ),
        "visitor_job": "Decidir se cabe reequilíbrio agora e estruturar evento, matriz de riscos, nexo e impacto auditável — sem confundir com reajuste.",
        "serp_census": {
            "family": "reequilibrio",
            "as_of": "2026-08-19",
            "rank_status": "UNKNOWN",
            "note": "data/organic/search-baseline-2026-08-14.json records CONFENGE_NOT_OBSERVED for 'reequilíbrio contrato obra pública consultoria' and NO_CURRENT_ASSET_RESULT_OBSERVED for site:confenge.com.br/reequilibrio-obras-publicas. Absence in a sample is not non-indexation.",
            "competitors": [
                {
                    "url": "https://licitacoesecontratos.tcu.gov.br/6-2-2-1-1-reequilibrio-economico-financeiro-recomposicao-ou-revisao-2/",
                    "kind": "tcu_manual",
                    "intent": "informational_administration",
                },
                {
                    "url": "https://zenite.blog.br/metodologia-ao-restabelecimento-do-equilibrio-economico-financeiro-inicial-em-contratos-de-obras-publicas/",
                    "kind": "legal_blog",
                    "intent": "informational_methodology",
                },
                {
                    "url": "https://contreinamentos.com.br/curso/reajuste-e-reequilibrio-economico-financeiro-nas-obras-publicas/",
                    "kind": "course",
                    "intent": "commercial_training",
                },
            ],
            "intent_gaps": [
                "SERP is doctrine/TCU/course. Contractor decision utility (when NOT to mount the pleito, nexo, no deferment promise) is the gap CONFENGE already wrote.",
                "CONFENGE not observed on the 2026-08-14 focused sample. Rank UNKNOWN.",
            ],
        },
        "query_ownership": {
            "owned": [
                "reequilíbrio econômico-financeiro obra pública",
                "reequilíbrio contrato obra pública",
            ],
            "supporting_not_owned_by_pillar": [
                "curva abc reequilíbrio → /conteudos/curva-abc-reequilibrio-contrato/",
                "matriz de riscos reequilíbrio",
            ],
            "gsc_supporting": {
                "curva abc reequilíbrio": {
                    "impressions": 5,
                    "clicks": 1,
                    "position": 4.4,
                }
            },
        },
        "negative_queries": [
            "reajuste ordinário / índice contratual (not reequilíbrio)",
            "reequilíbrio econômico-financeiro without obras públicas",
            "national coverage / national claim copy (extra-cli #437 national_claim_authorized=false)",
        ],
        "cannibalization": {
            "status": "RISK_DECLARED_NOT_MEASURED_LIVE",
            "siblings": [
                {
                    "url": "/conteudos/curva-abc-reequilibrio-contrato/",
                    "gsc": "7 impr / 1 click / pos 4.43",
                },
                {
                    "url": "/ferramentas/checklist-reequilibrio/",
                    "note": "tool vs service; keep distinct jobs",
                },
            ],
        },
        "before_after_blocks": [
            {
                "block": "title_og",
                "before": "Reequilíbrio econômico-financeiro de obra pública: o que é e quando cabe | CONFENGE (~82 chars)",
                "after": "Reequilíbrio econômico-financeiro de obra pública | CONFENGE (align with H1; under desktop soft-max 60 for the non-brand span is still tight — record char count at apply time)",
                "why": "Title/H1 alignment and truncation risk. Do not add invented legal percentages.",
            },
            {
                "block": "schema",
                "before": "CollectionPage ItemList numberOfItems=1 with position=7",
                "after": "unchanged in this patch (list hygiene is a later, evidence-gated edit)",
                "why": "Do not silently rewrite ItemList from extra-cli facts.",
            },
            {
                "block": "cta",
                "before": "hero → diagnóstico de defesa de margem; WhatsApp 'Enquadrar o reequilíbrio'",
                "after": "unchanged",
                "why": "CTA freeze.",
            },
        ],
        "evidence_proof_needed": [
            "URL inspection in GSC/Bing remains the index diagnostic; the 2026-08-14 sample is not proof of non-indexation.",
            "28d GSC vs 4/0 @ 7.75.",
            "Do not cite extra-cli PR #435 COMPARABLE paving peer group as a reequilíbrio case. publication_authorization=false.",
            "Do not cite extra-cli PR #437 PARTIAL as a national coverage claim. national_claim_authorized=false.",
        ],
    },
    "auditoria-orcamento-licitacao": {
        **_common(
            "auditoria-orcamento-licitacao",
            "/auditoria-orcamento-licitacao/",
            "orcamento-bdi",
            {"impressions": 3, "clicks": 0, "position": 9.0},
        ),
        "visitor_job": "Encontrar itens que concentram risco de preço/BDI/referência e conhecer a margem real antes de assumir a obra.",
        "serp_census": {
            "family": "orcamento-bdi",
            "as_of": "2026-08-19",
            "rank_status": "UNKNOWN",
            "note": "Web sample returned the CONFENGE pillar URL with the H1/og string 'Auditoria de orçamento, BDI, SINAPI e preço | CONFENGE', which is NOT the current <title>. Rank number UNKNOWN.",
            "competitors": [
                {
                    "url": "https://licitacoesecontratos.tcu.gov.br/4-4-3-6-orcamento-detalhado-do-custo-global-da-obra/",
                    "kind": "tcu_manual",
                    "intent": "informational_administration",
                },
                {
                    "url": "https://www.orcafascio.com/papodeengenheiro/bdi-em-obras-publicas",
                    "kind": "saas_explainer",
                    "intent": "informational_bdi",
                },
                {
                    "url": "https://repositorio.cgu.gov.br/bitstream/1/44963/5/Manual_de_Auditoria_de_Obras_Publicas_II.pdf",
                    "kind": "cgu_audit_manual",
                    "intent": "negative_controladoria_auditoria",
                },
                {
                    "url": "https://www.filipemachadoengenharia.com/artigos/auditoria-tecnica-licitacao-publica-obra/",
                    "kind": "peer_contractor_article",
                    "intent": "commercial_adjacent",
                },
            ],
            "intent_gaps": [
                "Query language 'auditoria de obras públicas' often means CGU/TCU controladoria, not a contractor pre-bid audit. Negative-query hygiene matters.",
                "SINAPI money queries belong to /conteudos/sinapi-desonerado-nao-desonerado/ (#126). Pillar must not steal that experiment.",
                "Pillar GSC: 3/0 @ 9.0 — anecdotal.",
            ],
        },
        "query_ownership": {
            "owned": [
                "auditoria de orçamento licitação obras",
                "BDI obras públicas (service, not the supporting article)",
            ],
            "not_owned": [
                "desonerado e não desonerado / sinapi desonerado → #126 URL",
                "bdi diferenciado obra pública → /conteudos/bdi-diferenciado-obra-publica/ (2 clicks / 11 impr, benchmark not rewrite)",
            ],
        },
        "negative_queries": [
            "auditoria TCU/CGU de obras públicas (controle externo)",
            "SINAPI table download / tabela SINAPI 2026 as a destination",
            "national SINAPI coverage claims (extra-cli #437 not authorized)",
        ],
        "cannibalization": {
            "status": "RISK_TITLE_CONTAINS_SINAPI",
            "siblings": [
                {
                    "url": "/conteudos/sinapi-desonerado-nao-desonerado/",
                    "gsc": "89 impr / 1 click / pos 7.27",
                    "owner": "#126 observe_only until 2026-09-16",
                },
                {
                    "url": "/conteudos/bdi-diferenciado-obra-publica/",
                    "gsc": "11 impr / 2 clicks / CTR 18.18%",
                },
            ],
        },
        "before_after_blocks": [
            {
                "block": "title",
                "before": "Orçamento, BDI e SINAPI em obras públicas | CONFENGE",
                "after": "Auditoria de orçamento, BDI, SINAPI e preço | CONFENGE",
                "why": "Align <title> with H1 and og:title (already what the web sample displayed). Apply only after gate; still do not rewrite the #126 SINAPI article.",
            },
            {
                "block": "meta_og_schema_description",
                "before": "...preenchimento mecânico de…",
                "after": "...preenchimento mecânico de planilha.",
                "why": "Complete truncated description already visible in the lead.",
            },
            {
                "block": "when_not_to_hire",
                "before": "H3 'Quando NÃO contratar?' exists without id=quando-nao-contratar / data-when-not-hire",
                "after": "same TAYA section gains id and data-when-not-hire so the pillar matches the #128 when-not-to-hire check without new copy",
                "why": "Hygiene / consistency with the other five pillars. No new URL.",
            },
        ],
        "evidence_proof_needed": [
            "Do not apply while #126 is in 14/28-day observation if the title change would re-front SINAPI as the pillar query.",
            "28d GSC vs 3/0 @ 9.0.",
            "extra-cli COMPARABLE paving group is not a BDI audit proof and must not be published here.",
        ],
    },
    "diagnostico-b2g-360": {
        **_common(
            "diagnostico-b2g-360",
            "/diagnostico-b2g-360/",
            "carteira-operacao",
            {"impressions": 1, "clicks": 0, "position": 15.0},
        ),
        "visitor_job": "Mapear onde a operação B2G de obras perde tempo, margem e controle, e sair com um plano de 90 dias — not a generic 'vender para o governo' quiz.",
        "serp_census": {
            "family": "carteira-operacao",
            "as_of": "2026-08-19",
            "rank_status": "UNKNOWN",
            "note": "Web sample shows CONFENGE on branded/offer queries. Generic 'diagnóstico B2G' is occupied by free quizzes. Do not invent rank.",
            "competitors": [
                {
                    "url": "https://www.redeb2g.com.br/",
                    "kind": "generic_b2g_platform",
                    "intent": "free_maturity_quiz",
                },
                {
                    "url": "https://diagnosticob2g.com.br/",
                    "kind": "generic_b2g_diagnostic",
                    "intent": "licitacoes_generic",
                },
                {
                    "url": "https://conquistagov.com.br/",
                    "kind": "b2g_consulting",
                    "intent": "contracts_generic_not_obras",
                },
                {
                    "url": "https://b2gsmart.com.br/",
                    "kind": "licitacoes_saas",
                    "intent": "monitor_editais",
                },
            ],
            "intent_gaps": [
                "Generic B2G diagnostics are not obras-públicas margin-defense. CONFENGE unique utility is the engineering/contract portfolio, not a 5-dimension quiz.",
                "GSC 1 impr / 0 clicks / pos 15 — anecdotal. Brand query 'confenge' is separate (4 impr / 1 click).",
            ],
        },
        "query_ownership": {
            "owned": [
                "diagnóstico B2G 360 CONFENGE",
                "diagnóstico operação B2G obras públicas",
            ],
            "not_owned": [
                "diagnóstico B2G gratuito",
                "diretoria B2G fracionada (sibling offer /diretoria-b2g/)",
            ],
        },
        "negative_queries": [
            "diagnóstico B2G gratuito / quiz de maturidade",
            "B2G glossário (business-to-government definition)",
            "SmartLic / legacy brand",
        ],
        "cannibalization": {
            "status": "RISK_OFFER_CLUSTER",
            "siblings": [
                {"url": "/diretoria-b2g/", "note": "continuous retainer vs one-shot diagnostic"},
                {"url": "/#contato?jornada=operacao", "note": "hero CTA already points here"},
            ],
        },
        "before_after_blocks": [
            {
                "block": "og_title",
                "before": "og:title = Mapeie onde a frente pública perde tempo, margem e controle.",
                "after": "og:title = Diagnóstico da Operação em Obras Públicas | CONFENGE (match <title>; keep the sentence as visible lead)",
                "why": "Snippet/social title mismatch. Canonical already present (href-before-rel). Do not touch offer copy.",
            },
            {
                "block": "canonical",
                "before": "present as link href=... rel=canonical",
                "after": "unchanged",
                "why": "Parser must accept either attribute order; this is not a missing canonical.",
            },
            {
                "block": "schema",
                "before": "WebPage + Service (no CollectionPage)",
                "after": "unchanged; do not add AggregateRating or national claims",
                "why": "Offer page already uses Service. extra-cli facts stay unpublished.",
            },
        ],
        "evidence_proof_needed": [
            "28d GSC vs 1/0 @ 15.0 — n is anecdotal; kill if the og:title change does not produce a click and n stays < 30.",
            "Do not treat extra-cli national coverage PARTIAL as proof of the diagnostic offer.",
            "Qualified conversation from jornada=operacao remains the commercial evidence (#88/#60), not this patch.",
        ],
    },
    "diagnostico-pre-licitacao": {
        **_common(
            "diagnostico-pre-licitacao",
            "/diagnostico-pre-licitacao/",
            "edital-proposta",
            {"impressions": 1, "clicks": 0, "position": 18.0},
        ),
        "visitor_job": "Decidir participar, esclarecer, impugnar, ajustar estrutura ou abandonar um edital de obra pública antes de imobilizar a equipe na proposta.",
        "serp_census": {
            "family": "edital-proposta",
            "as_of": "2026-08-19",
            "rank_status": "UNKNOWN",
            "note": "Web sample returned the CONFENGE pillar on the branded/offer query. Generic 'como analisar edital' is TOFU legal/SaaS. Rank UNKNOWN.",
            "competitors": [
                {
                    "url": "https://conlicitacao.com.br/como-analisar-um-edital-de-licitacao/",
                    "kind": "saas_howto",
                    "intent": "informational_generic_edital",
                },
                {
                    "url": "https://schiefler.adv.br/edital-de-licitacao/",
                    "kind": "law_firm",
                    "intent": "informational_legal",
                },
                {
                    "url": "https://metalicitacoes.com.br/os-10-principais-pontos-a-serem-observados-em-um-edital-para-licitacoes-de-obras-publicas/",
                    "kind": "listicle",
                    "intent": "informational_obras",
                },
                {
                    "url": "https://www.youtube.com/watch?v=RmPXRMjPOg8",
                    "kind": "video_howto",
                    "intent": "informational",
                },
            ],
            "intent_gaps": [
                "TOFU 'como ler um edital' ≠ BOFU 'diagnóstico pré-licitação para obras com matriz de riscos e exequibilidade'.",
                "Pillar GSC 1/0 @ 18 anecdotal.",
                "Bid Room is a sibling commercial format; do not keyword-variant this URL into Bid Room.",
            ],
        },
        "query_ownership": {
            "owned": [
                "diagnóstico pré-licitação obras públicas",
                "análise de edital de obra pública (service)",
            ],
            "not_owned": [
                "empreitada global ou preço unitário → /conteudos/empreitada-preco-global-preco-unitario/",
                "comprovação de exequibilidade → /conteudos/comprovacao-exequibilidade-proposta-obra/",
                "bid room licitações obras → /bid-room-licitacoes-obras/",
            ],
        },
        "negative_queries": [
            "como analisar edital (generic goods/services)",
            "impugnação de edital as standalone legal product",
            "tenders/licitações TOFU without contractor margin job (#60 VALIDATE next, not this pillar rewrite)",
        ],
        "cannibalization": {
            "status": "RISK_OFFER_AND_LIBRARY",
            "siblings": [
                {"url": "/bid-room-licitacoes-obras/", "note": "execution format vs diagnostic decision"},
                {
                    "url": "/conteudos/empreitada-preco-global-preco-unitario/",
                    "note": "library guide listed on this pillar",
                },
            ],
        },
        "before_after_blocks": [
            {
                "block": "meta_og_schema_description",
                "before": "...transformar uma vitória na licitação em um…",
                "after": "...transformar uma vitória na licitação em um contrato ruim.",
                "why": "Complete truncated description already in the visible lead.",
            },
            {
                "block": "title_h1_canonical",
                "before": "Diagnóstico pré-licitação para obras públicas | CONFENGE; canonical present",
                "after": "unchanged",
                "why": "Already aligned. Do not doorway-keyword 'análise de edital'.",
            },
            {
                "block": "cta",
                "before": "hero generic WhatsApp; bridge 'Avaliar uma oportunidade'",
                "after": "unchanged",
                "why": "CTA/offer freeze.",
            },
        ],
        "evidence_proof_needed": [
            "28d GSC vs 1/0 @ 18.0.",
            "Do not publish extra-cli COMPARABLE contract as a pre-bid case study (publication_authorization=false).",
            "Kill if the meta completion does not move CTR while n stays anecdotal, or if Bid Room cannibalizes the same query.",
        ],
    },
}
