# Content cannibalization report — Wave 1 vs `/conteudos/`

**Date:** 2026-08-02 (final audit)  
**Policy:** Prefer one indexable URL per intent. Unapproved Wave 1 pages are `noindex` and out of sitemaps until named human approval. Canonical only when there is a real editorial relationship — not as a mask for duplication.

## Matrix (explicit disposition)

| URL nova (Wave 1) | URL potencialmente concorrente | Intenção Wave 1 | Intenção concorrente | Sobreposição | Vencedor | Ação recomendada |
|---|---|---|---|---|---|---|
| `/lei-14133-obras/art-124-alteracao-contratual-obra/` | `/conteudos/aditivo-qualitativo-quantitativo/` (noindex); `/aditivos-obras-publicas/` (serviço) | Aplicação arts. 124–126 | Guia genérico / oferta comercial | Baixa–média | Wave 1 (legal) | **manter ambas**; serviço permanece comercial |
| `/lei-14133-obras/limite-25-50-aditivo-obra/` | `/conteudos/limite-aditivo-25-50-obra-publica/` (**index,follow**) | Teto 25%/50% art. 125 | Mesma consulta de teto | **Alta** | Wave 1 após HUMAN_APPROVED | **reescrever/consolidar**: após indexar Wave 1, **noindex** o conteudos (ou canonical real se unificar) |
| `/lei-14133-obras/preco-item-novo-desconto-proposta/` | `/conteudos/desconto-da-proposta-em-item-novo-aditivo/` (**index,follow**) | Art. 127 + desconto | Desconto em item novo | **Alta** | Wave 1 após aprovação | **consolidar**: noindex conteudos após Wave 1 indexable |
| `/lei-14133-obras/reequilibrio-reajuste-repactuacao/` | `/conteudos/reajuste-repactuacao-reequilibrio-diferenca/` (noindex); `/reequilibrio-obras-publicas/` | Distinção reajuste/repactuação/reequilíbrio | Guia / serviço | Média / baixa | Wave 1 | **manter** Wave 1 + serviço; conteudos noindex |
| `/lei-14133-obras/atraso-imputavel-administracao/` | `/conteudos/atraso-obra-culpa-administracao/` (**index,follow**) | Art. 115 §1 prova/efeitos | Culpa da Administração | **Alta** | Wave 1 (texto §1 corrigido) | **consolidar**: noindex conteudos após Wave 1 indexable |
| `/lei-14133-obras/parcela-incontroversa-medicao-pagamento/` | `/conteudos/parcela-incontroversa-medicao-contrato-publico/` (noindex) | Art. 143 | Parcela incontroversa | Alta | Wave 1 | **manter** Wave 1; não reindexar conteudos |
| `/lei-14133-obras/servico-executado-sem-termo-aditivo/` | `/conteudos/servico-executado-sem-termo-aditivo/` (**noindex**) | Art. 132 risco/prova | Mesmo tema | Alta | Wave 1 | **já consolidado** (conteudos noindex); não dual-index |
| `/guias-contratos-obras/checklist-pedido-aditivo/` | (sem equivalente indexable forte) | Checklist operacional aditivo | — | Baixa | Wave 1 | **manter** |
| `/guias-contratos-obras/documentos-pedido-reequilibrio/` | `/conteudos/documentos-reequilibrio-obra-publica/` (noindex) | Dossiê reequilíbrio | Lista documentos | Média–alta | Wave 1 | **manter** Wave 1; conteudos noindex |
| `/guias-contratos-obras/contestar-glosa-medicao/` | `/conteudos/glosa-de-medicao-obra-publica/` (noindex); `/conteudos/glosa-por-qualidade-obra-publica/` (index) | Checklist contestação + art. 143 | Glosa qualidade | Média | Manter se ângulos distintos | **manter ambas** se Wave 1 = rito/contestação e conteudos = qualidade; related links; sem canonical cruzado artificial |
| `/guias-contratos-obras/responder-notificacao-atraso/` | `/conteudos/resposta-notificacao-atraso-obra-publica/` (**index,follow**) | Roteiro resposta notificação | Resposta notificação atraso | **Alta** | Wave 1 após aprovação | **consolidar**: noindex conteudos após Wave 1 indexable |
| `/jurisprudencia-contratos-obras/tcu-sumula-260-art-obras/` | — | Súmula 260 ART | — | — | **REJECTED** | **noindex** + fora de sitemaps até dossiê TCU completo |

## Dual-index risk (current)

While Wave 1 is unapproved: **no dual-index** with new routes (all Wave 1 `noindex`, empty editorial sitemaps).

After human approval of a high-overlap Wave 1 URL, **required follow-up before GSC push of those intents as dual winners**:

1. Choose canonical winner (prefer Wave 1 when deeper legal devices + fresher sources).
2. Set `noindex` on the losing `/conteudos/` URL (or real canonical if content is truly merged).
3. Update main `sitemap.xml`.
4. Re-run editorial build and site build.

## Rejected jurisprudence

`/jurisprudencia-contratos-obras/tcu-sumula-260-art-obras/` → **REJECTED** until:

- full official Súmula 260 text;
- official approval date;
- stable verifiable TCU URL;
- ART / autoria técnica / responsabilidade profissional distinctions grounded in the enunciado.
