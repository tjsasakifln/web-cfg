"""Editorial release cohorts.

This module intentionally contains no renderer, registry or CLI imports.  It
keeps the release-policy constants available without creating an import cycle
between the approval CLI, the truth audit and the registry state machine.
"""

from __future__ import annotations


# The only URLs that may be made indexable by this release policy.
# lei-limite-25-50 was consolidated (301) onto
# /conteudos/limite-aditivo-25-50-obra-publica/ (CFG10X-09). It remains in
# WAVE1_IDS as EDITORIAL_REVIEWED / noindex so the JSON can still be tested.
FIRST_COHORT_IDS = (
    "guia-checklist-aditivo",
    "lei-item-novo-desconto",
)
FIRST_COHORT_SET = frozenset(FIRST_COHORT_IDS)

# Eight reviewed pages stay noindex for a future, separately approved release.
WAVE1_IDS = frozenset(
    {
        "guia-checklist-aditivo",
        "guia-docs-reequilibrio",
        "guia-glosa",
        "guia-notificacao-atraso",
        "lei-art124-alteracao-obra",
        "lei-atraso-administracao",
        "lei-item-novo-desconto",
        "lei-limite-25-50",
        "lei-parcela-incontroversa",
        "lei-reequilibrio-reajuste",
        "lei-servico-sem-aditivo",
    }
)
REJECTED_IDS = frozenset({"jur-sumula-260-art"})

