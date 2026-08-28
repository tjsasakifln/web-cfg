#!/usr/bin/env python3
"""Indexable boilerplate / slug-mold findings used by validate_seo.

Extracted so adversarial fixtures drive the same fingerprints as CI.
Noindex pages are fail-closed for indexability (they must not be counted
as an indexable pass) but mold on a noindex URL is not an indexable error.
"""
from __future__ import annotations

import re

from scripts.site.public_copy_scope import is_indexable_html

BOILERPLATE_FINGERPRINTS = (
    "A resposta não é automática",
    "O tema exige uma leitura conjunta",
    "a análise deve analisar",
    "causa, responsabilidade, impacto e valor",
    "a decisão correta depende",
    "Antes de aceitar, executar ou contestar, amarre fato",
    "Esse elemento altera o enquadramento porque define a obrigação",
    "A verificação deve partir de documentos contemporâneos, não de uma reconstrução",
    "O efeito técnico precisa ser conectado a prazo, quantidade, produtividade",
    "A comunicação deve registrar fato, impacto provável, providência solicitada",
    "A conclusão só se sustenta quando um terceiro consegue repetir",
    "permita auditoria por terceiro",
    "Garanta que",
    "como fazer ",
    "?.",
    "Organize a linha do.",
    "Pedido ligado a",
    "Posicione edital fixa",
    "Monte edital fixa",
    "Documente edital omisso",
    "Sem efeito no caminho crítico, o pedido sobre",
    "retórica sem anexo não substitui prova",
    "prova contemporânea vale mais que relato posterior",
    "vira glosa ou impasse de caixa",
    "no mesmo dia do evento",
    "Struture ",
    "só se sustenta com prova feita na hora dos fatos",
    "Trate revisar ",
    "Converta separar ",
    "Converta quantificar ",
    "Lance revisar ",
    "Comece por aqui na montagem do dossiê",
    "Valide este bloco antes de fechar números",
    "Cruze com o diário e a planilha no mesmo dia",
    "Deixe rastreável para um terceiro repetir o raciocínio",
    "Não deixe este item só na memória da equipe",
    "Se estiver frágil, priorize reforço documental",
    "amarre o efeito a prazo",
    "Ignore esse ponto e o restante da análise",
    "É um dos primeiros itens que o órgão",
    "Quando falha, o custo aparece tarde",
    "Feche este item antes de precificar",
    "A qualidade da prova aqui costuma separar",
    "Sem isso, qualquer conclusão sobre",
    "Foque em «",
    "antes de escalar o próximo passo",
    "costuma decidir se o pedido avança ou trava",
    "Analise distinguir",
    "Analise estruturar",
    "Quantifique examinar",
    "Decomponha conectar",
    "Decomponha distinguir",
    "Conecte caminho crítico às atividades do caminho crítico",
    "como regra do edital está definido",
    "Critério em foco:",
    "Para conduzir ",
    "Valide examinar",
    "prazo, quantidade, custo ou responsabilidade mensurável",
    "costuma ser o ponto que o órgão questiona primeiro",
    "só avança se estiver amarrado a prova",
    "Quantifique a quantificação",
    "Analise a análise",
    "Decomponha a decomposição",
    "Trate a análise de",
    "Ligue o exame de",
)

SLUG_ANSWER_RE = re.compile(
    r"Para conduzir [a-z0-9][a-z0-9 \-]{10,80},\s*separe obrigação contratual",
    re.I,
)


def editorial_mold_findings(html: str, slug: str, *, indexable: bool | None = None) -> dict:
    """Return indexable errors and the indexability decision for one page."""
    if indexable is None:
        indexable = is_indexable_html(html)
    errors: list[str] = []
    if not indexable:
        return {
            "indexable": False,
            "errors": [],
            "noindex_with_mold": any(bp in html for bp in BOILERPLATE_FINGERPRINTS)
            or bool(SLUG_ANSWER_RE.search(html)),
        }
    for fingerprint in BOILERPLATE_FINGERPRINTS:
        if fingerprint in html:
            errors.append(f"boilerplate residual {slug}: {fingerprint!r}")
    if SLUG_ANSWER_RE.search(html):
        errors.append(f"slug-stuffed answer mold {slug}")
    return {"indexable": True, "errors": errors, "noindex_with_mold": False}
