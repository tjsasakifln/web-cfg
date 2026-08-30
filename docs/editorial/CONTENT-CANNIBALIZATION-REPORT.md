# Content cannibalization report — Wave 1 vs `/conteudos/`

> **SUPERSEDED_EVIDENCE (2026-08-29):** snapshot histórico da análise feita em 2026-08-02; não é uma superfície operacional de decisão. A consulta geral 25%/50% tem owner terminal em `/conteudos/limite-aditivo-25-50-obra-publica/`, e `/lei-14133-obras/limite-25-50-aditivo-obra/` está `MIGRATED` com 301 direto. Use `data/organic/legacy-url-inventory.json`, `docs/editorial/EDITORIAL-INVENTORY.json` e `docs/editorial/WAVE1-FIRST-COHORT.md` para o estado ativo.

**Date:** 2026-08-02  
**Policy:** Prefer one indexable URL per intent. Unapproved Wave 1 pages are `noindex` and out of sitemaps until named human approval.

## Matrix

| Intent | Preferred (when Wave 1 HUMAN_APPROVED) | Current indexable competitor | Action taken |
|--------|----------------------------------------|------------------------------|--------------|
| Limite 25%/50% | `/lei-14133-obras/limite-25-50-aditivo-obra/` | `/conteudos/limite-aditivo-25-50-obra-publica/` (manter, deep) | Wave 1 noindex until approval; keep conteudos until human chooses winner + canonical |
| Serviço sem aditivo | `/lei-14133-obras/servico-executado-sem-termo-aditivo/` | `/conteudos/servico-executado-sem-termo-aditivo/` | **noindex + removed from sitemap.xml** (disposition consolidar) |
| Item novo / desconto | `/lei-14133-obras/preco-item-novo-desconto-proposta/` | `/conteudos/desconto-da-proposta-em-item-novo-aditivo/` (manter) | Wave 1 noindex pending approval; related links cross-wired |
| Reequilíbrio vs reajuste | `/lei-14133-obras/reequilibrio-reajuste-repactuacao/` | conteudos variants already noindex | OK |
| Atraso Administração | `/lei-14133-obras/atraso-imputavel-administracao/` | `/conteudos/atraso-obra-culpa-administracao/` (manter) | Wave 1 noindex pending; no dual-index while unapproved |
| Parcela incontroversa | `/lei-14133-obras/parcela-incontroversa-medicao-pagamento/` | conteudos already noindex | OK |
| Notificação atraso | `/guias-contratos-obras/responder-notificacao-atraso/` | `/conteudos/resposta-notificacao-atraso-obra-publica/` (manter) | Wave 1 noindex pending |
| Checklist aditivo | `/guias-contratos-obras/checklist-pedido-aditivo/` | none equivalent indexable | OK |

## Dual-index risk
While Wave 1 is unapproved, **no dual-index** with new routes (all Wave 1 `noindex`, empty editorial sitemaps).

After human approval of a Wave 1 URL that overlaps a `manter` conteudos page, required follow-up:
1. Choose canonical winner (prefer Wave 1 if deeper legal devices + fresher sources).
2. Set `rel=canonical` or noindex the loser.
3. Update main `sitemap.xml`.
4. Re-run editorial build.

## Rejected jurisprudence
`/jurisprudencia-contratos-obras/tcu-sumula-260-art-obras/` → **REJECTED** until specific official Súmula text, approval date, and stable TCU URL are verified (portal search root is insufficient).
