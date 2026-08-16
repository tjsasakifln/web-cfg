"""Shared builders that feed the shipped gate — not a reimplementation."""

from __future__ import annotations

import copy
from typing import Any

from scripts.contract_analysis.approval import material_hash


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
            },
            {
                "kind": "FACT",
                "text": "O regime é preço unitário com quantitativos abertos por serviço.",
                "source_ref": "contrato",
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
