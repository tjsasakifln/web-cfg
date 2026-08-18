"""Shared builders that feed the shipped gate — not a reimplementation."""

from __future__ import annotations

import copy
from typing import Any

from scripts.contract_analysis.approval import material_hash
from scripts.contract_analysis.quality import HUMAN_REVIEW_PENDING
from scripts.contract_analysis.tests.masterpiece_copy import (
    BODY,
    CANNOT,
    COUNTERPROOF,
    EXECUTIVE,
    FINDINGS,
    IMPLICATIONS,
    LIMITATIONS,
    METHOD,
    THESIS,
    UTILITY,
    WHY,
)


def complete_live_record(**overrides: Any) -> dict[str, Any]:
    """A record that the shipped gate can mark PUBLISHABLE_INDEX when alone."""
    rec: dict[str, Any] = {
        "id": "live-bdi-alpha",
        "slug": "live-bdi-alpha",
        "content_class": "ANALISE_TECNICA_CONTRATO_PUBLICO",
        "title": "Administração local absorve contas que a referência de edificações separa",
        "executive_summary": (
            "A composição publicada junta em uma só conta de administração local "
            "o que a árvore de referência do recorte de edificações abre em "
            "canteiro, equipe de apoio, mobilização e contingência. O achado é "
            "de arquitetura de indiretos, não de preço global."
        ),
        "why_analysis": (
            "Equipes comparam o BDI total como se fosse um único número. Sem "
            "abrir a administração local, a comparação e o posterior reequilíbrio "
            "por insumo isolado perdem âncora."
        ),
        "insight_singular": (
            "O valor informacional não é o percentual cheio de BDI: é o colapso "
            "de quatro contas de indiretos numa linha só. Sem decomposição, a "
            "amostra de preços do recorte não é denominador utilizável."
        ),
        "utility_beyond_source": (
            "A fonte entrega linhas. A análise entrega o protocolo: exigir "
            "memória da administração local antes de tratar o BDI como "
            "comparável e antes de protocolar reequilíbrio por insumo."
        ),
        "intent": "bdi",
        "ficha": {
            "empresa": "Construtora Live Alfa",
            "orgao": "Prefeitura de Live Sul",
            "municipio": "Live Sul",
            "uf": "SC",
            "objeto": "Reforma de unidade escolar",
            "valor_label": "R$ 12.400.000,00",
            "pncp_id": "LIVE-BDI-100",
            "regime": "preço unitário",
        },
        "facts": [
            {
                "kind": "FACT",
                "text": (
                    "A planilha publica BDI discriminado e reserva uma única "
                    "linha para administração local, omitindo canteiro e mobilização."
                ),
                "source_ref": "planilha",
                "locator": "planilha / BDI / administração local",
            },
            {
                "kind": "FACT",
                "text": "O regime é preço unitário com quantitativos abertos por serviço.",
                "source_ref": "contrato",
                "locator": "contrato / cláusula de regime",
            },
        ],
        "calculations": [
            {
                "kind": "CALCULATION",
                "text": (
                    "A administração local responde pela maior fatia dos indiretos "
                    "publicados; as contas de apoio aparecem zeradas, o que impede "
                    "rateio posterior por frente."
                ),
                "source_ref": "planilha",
                "locator": "planilha / BDI / administração local",
            }
        ],
        "interpretation": [
            {
                "kind": "INFERENCE",
                "text": (
                    "A concentração é atípica em relação à árvore de contas do "
                    "recorte. Atípico descreve forma de apresentar custo; não "
                    "autoriza falar em sobrepreço."
                ),
            }
        ],
        "cannot_conclude": (
            "Não se afirma preço acima do mercado, irregularidade, culpa ou "
            "ilegalidade. Também não se conclui como a contratada executará a composição."
        ),
        "sources": [
            {
                "label": "Planilha orçamentária",
                "url": "https://www.gov.br/pncp",
                "as_of": "2026-08-01",
                "document_id": "LIVE-BDI-100-planilha",
            }
        ],
        "methodology": (
            "Leitura das linhas de BDI publicadas e confronto estrutural com a "
            "árvore de contas do recorte de edificações. Sem reestimar preço."
        ),
        "limitations": (
            "Sem memória de cálculo interna da contratada. A árvore de referência "
            "não é teto legal de BDI."
        ),
        "as_of": "2026-08-01",
        "freshness": {"as_of": "2026-08-01", "max_age_days": 180},
        "author": {"name": "Engº Tiago Sasaki"},
        "reviewer": {"name": "Revisor Técnico Independente"},
        "maintenance_owner": "tiago.sasaki@confenge.com.br",
        "editorial_status": "approved",
        "approved_for_index": True,
        "source_kind": "official_live",
        "catalog_mode": "official_live",
        "claimed_live": True,
        "publication_readiness": "DATA_READY",
        "data_state": "DATA_READY",
        "is_fixture": False,
        "test_only": False,
        "rollback": "git:HEAD:contract-analysis-canary",
        "evidence_pack_version": "1.0",
        "evidence_pack_hash": "testhash",
        "content_hash": "live-content-hash-alpha",
        "coverage": {"status": "DECLARED", "record_count": 1, "as_of": "2026-08-01"},
        "producer_status": "official_live",
        "date_published": "2026-08-16",
        "date_modified": "2026-08-16",
        "cta": {
            "label": "Ver Diagnóstico de Defesa de Margem",
            "href": "/ferramentas/diagnostico-defesa-margem/",
            "text": "Ferramenta da sua empresa, sem relação com o contrato analisado.",
        },
    }
    rec.update(overrides)
    if rec.get("approved_for_index") and not rec.get("material_hash"):
        rec["material_hash"] = material_hash(rec)
    return rec


def entity_swap_clone(record: dict[str, Any]) -> dict[str, Any]:
    """Same analysis prose; only empresa, órgão, município and numbers change."""
    clone = copy.deepcopy(record)
    clone["id"] = "live-bdi-clone"
    clone["slug"] = "live-bdi-clone"
    ficha = clone.get("ficha") or {}
    ficha.update(
        {
            "empresa": "Construtora Live Beta",
            "orgao": "Prefeitura de Live Norte",
            "municipio": "Live Norte",
            "uf": "RS",
            "valor_label": "R$ 8.150.000,00",
            "pncp_id": "LIVE-BDI-200",
        }
    )
    clone["ficha"] = ficha
    return clone


def masterpiece_record(**overrides: Any) -> dict[str, Any]:
    """High-quality official_live draft. Must stop at HUMAN_REVIEW_PENDING."""
    claims = [
        {
            "claim_id": "c1",
            "kind": "FACT",
            "text": "O instrumento primário descreve pavimentação em preço unitário.",
            "source_ref": "contrato-01",
            "locator": "cláusula 1 / objeto",
        },
        {
            "claim_id": "c2",
            "kind": "FACT",
            "text": "A planilha inicial não descreve drenagem profunda com unidade e composição.",
            "source_ref": "planilha-01",
            "locator": "folha 3 / linhas de serviço",
        },
        {
            "claim_id": "c3",
            "kind": "FACT",
            "text": "O primeiro aditivo autoriza o uso do saldo residual.",
            "source_ref": "aditivo-01",
            "locator": "cláusula 2 / saldo",
        },
        {
            "claim_id": "c4",
            "kind": "FACT",
            "text": "O segundo aditivo descreve drenagem profunda e prorroga o prazo.",
            "source_ref": "aditivo-02",
            "locator": "cláusula 1 e cláusula 4",
        },
        {
            "claim_id": "c5",
            "kind": "CALCULATION",
            "text": "O valor alocado ao item novo cabe no saldo residual na competência do aditivo.",
            "source_ref": "aditivo-02",
            "locator": "quadro de valores",
            "formula": "saldo_autorizado - valor_item_novo",
            "unit": "BRL",
            "period": "2024-11",
            "base": "saldo Art. 125 do instrumento",
            "origin": "aditivo-02 quadro",
        },
        {
            "claim_id": "c6",
            "kind": "INTERPRETACAO",
            "text": "A sequência desloca a âncora de preço da quantidade residual para o item sem memória.",
            "source_ref": "mapa-01",
            "locator": "relação instrumento-aditivos-planilha",
        },
        {
            "claim_id": "c7",
            "kind": "FACT",
            "text": "Não há peer autorizado com o mesmo regime, unidade e cláusula de reajuste.",
            "source_ref": "peer-hold",
            "locator": "nota NOT_COMPARABLE do produtor",
        },
        {
            "claim_id": "c8",
            "kind": "UNKNOWN",
            "text": "UNKNOWN: um anexo não digitalizado poderia conter a memória do item.",
            "source_ref": "pacote",
            "locator": "lacuna documental",
        },
    ]
    rec: dict[str, Any] = {
        "id": "masterpiece-aditivo-art125",
        "slug": "saldo-art125-item-novo-ancora",
        "content_class": "ANALISE_TECNICA_CONTRATO_PUBLICO",
        "title": "Saldo residual absorve item novo e desloca a âncora de preço unitário",
        "h1": "Saldo residual absorve item novo e desloca a âncora de preço unitário",
        "meta_description": (
            "Como a sequência instrumento-aditivos transforma quantidade residual "
            "em envelope de item sem memória de preço."
        ),
        "executive_summary": EXECUTIVE,
        "why_analysis": WHY,
        "insight_singular": THESIS,
        "thesis": THESIS,
        "thesis_falsifiable": True,
        "utility_beyond_source": UTILITY,
        "counterproof": COUNTERPROOF,
        "cannot_conclude": CANNOT,
        "methodology": METHOD,
        "limitations": LIMITATIONS,
        "intent": "aditivo",
        "body": BODY,
        "ficha": {
            "empresa": "Construtora Litoral Sul",
            "orgao": "Prefeitura de Costa Clara",
            "municipio": "Costa Clara",
            "uf": "SC",
            "objeto": "Pavimentação de vias urbanas em regime de preço unitário",
            "valor_label": "R$ 18.700.000,00",
            "pncp_id": "LIVE-ADIT-125",
            "regime": "preço unitário",
        },
        "facts": [c for c in claims if c["kind"] == "FACT"],
        "calculations": [
            {
                "kind": "CALCULATION",
                "claim_id": "c5",
                "text": (
                    "Saldo autorizado 2.400.000 BRL menos valor alocado ao item novo "
                    "2.150.000 BRL resulta em 250.000 BRL de residual não consumido, "
                    "competência 2024-11, base Art. 125."
                ),
                "formula": "2400000 - 2150000 = 250000",
                "unit": "BRL",
                "period": "2024-11",
                "base": "saldo Art. 125",
                "reproducible": True,
                "source_ref": "aditivo-02",
                "locator": "quadro de valores",
                "origin": "aditivo-02",
            }
        ],
        "interpretation": [
            {"kind": "INFERENCE", "claim_id": "c6", "text": FINDINGS[0], "source_ref": "mapa-01", "locator": "síntese"},
            {"kind": "INFERENCE", "text": FINDINGS[1], "source_ref": "timeline", "locator": "ordem dos atos"},
            {"kind": "INFERENCE", "text": FINDINGS[2], "source_ref": "peer-hold", "locator": "NOT_COMPARABLE"},
        ],
        "findings": [
            {"text": FINDINGS[0], "claim_id": "c6"},
            {"text": FINDINGS[1], "claim_id": "c3"},
            {"text": FINDINGS[2], "claim_id": "c7"},
        ],
        "implications": list(IMPLICATIONS),
        "comparisons": [
            {
                "kind": "UNKNOWN",
                "outcome": "NOT_COMPARABLE",
                "text": (
                    "NOT_COMPARABLE: peers de empreitada global no mesmo município "
                    "não compartilham regime, unidade nem cláusula de reajuste."
                ),
            }
        ],
        "claims": claims,
        "source_claim_matrix": [
            {"claim_id": c["claim_id"], "source_id": c["source_ref"], "locator": c["locator"]}
            for c in claims
        ],
        "documents": [
            {"role": "primary", "family": "contrato", "label": "Instrumento contratual", "document_id": "contrato-01"},
            {"family": "aditivo", "label": "Termo aditivo 1", "document_id": "aditivo-01"},
            {"family": "aditivo", "label": "Termo aditivo 2", "document_id": "aditivo-02"},
            {"family": "planilha", "label": "Planilha orçamentária", "document_id": "planilha-01"},
        ],
        "document_map": [
            {"label": "Instrumento", "family": "contrato"},
            {"label": "Aditivo 1", "family": "aditivo"},
            {"label": "Aditivo 2", "family": "aditivo"},
            {"label": "Planilha", "family": "planilha"},
        ],
        "evidence_families": ["contrato", "aditivo", "planilha"],
        "timeline": [
            {"date": "2023-03-10", "text": "Assinatura do instrumento de preço unitário."},
            {"date": "2023-03-12", "text": "Publicação da planilha inicial."},
            {"date": "2024-09-02", "text": "Autorização do saldo residual."},
            {"date": "2024-11-18", "text": "Inclusão do item novo e prorrogação de prazo."},
        ],
        "sources": [
            {"label": "Instrumento", "document_id": "contrato-01", "url": "https://www.gov.br/pncp/contrato-01", "as_of": "2026-08-01", "family": "contrato"},
            {"label": "Aditivo 1", "document_id": "aditivo-01", "url": "https://www.gov.br/pncp/aditivo-01", "as_of": "2026-08-01", "family": "aditivo"},
            {"label": "Aditivo 2", "document_id": "aditivo-02", "url": "https://www.gov.br/pncp/aditivo-02", "as_of": "2026-08-01", "family": "aditivo"},
            {"label": "Planilha", "document_id": "planilha-01", "url": "https://www.gov.br/pncp/planilha-01", "as_of": "2026-08-01", "family": "planilha"},
        ],
        "defined_terms": [
            {"term": "âncora de preço", "definition": "Regra documental que permite recalcular."},
            {"term": "item novo", "definition": "Serviço sem linha na planilha inicial."},
            {"term": "saldo residual", "definition": "Valor autorizado pelo Art. 125."},
        ],
        "terms_defined": True,
        "as_of": "2026-08-01",
        "freshness": {"as_of": "2026-08-01", "max_age_days": 180, "stale": False},
        "author": {"name": "Rascunho editorial (autoria humana não confirmada)"},
        "reviewer": {},
        "solo_reviewer_disclosure": True,
        "human_authorship_confirmed": False,
        "maintenance_owner": "editorial-contract-analysis",
        "invalidation_keys": ["evidence_pack_hash", "content_hash"],
        "editorial_status": HUMAN_REVIEW_PENDING,
        "approved_for_index": False,
        "source_kind": "official_live",
        "catalog_mode": "official_live",
        "claimed_live": True,
        "publication_readiness": "DATA_READY",
        "data_state": "DATA_READY",
        "is_fixture": False,
        "test_only": False,
        "rollback": "git:revert:masterpiece-aditivo-art125",
        "evidence_pack_version": "1.0",
        "evidence_pack_hash": "masterpiece-evidence-hash",
        "content_hash": "masterpiece-content-hash",
        "content_hash_verified": True,
        "coverage": {"status": "DECLARED", "record_count": 4, "as_of": "2026-08-01"},
        "producer_status": "official_live",
        "citation_text": "CONFENGE. Saldo residual e âncora de preço. 2026-08-01.",
        "correction_route": "/correcoes/",
        "comparability_authorized": False,
        "date_published": "2026-08-16",
        "date_modified": "2026-08-16",
        "cta": {
            "label": "Ver Diagnóstico de Defesa de Margem",
            "href": "/ferramentas/diagnostico-defesa-margem/",
            "text": "Ferramenta da sua empresa, sem relação com o contrato analisado.",
        },
        "cta_is_primary_utility": False,
    }
    rec.update(overrides)
    return rec
