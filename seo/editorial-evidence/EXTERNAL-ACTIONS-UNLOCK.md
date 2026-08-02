# Exact external actions to unlock Wave 1 indexation

**Terminal status until done:** `BLOCKED_WITH_EXACT_EXTERNAL_ACTIONS`  
**Automated system cannot complete these steps.**

## Prerequisite (already done by pipeline)
- 11 pages at `EDITORIAL_REVIEWED` (naturalness, sources, CTAs, no internal terms)
- 1 jurisprudence page `REJECTED` until official Súmula dossier complete
- Production pages live with `noindex,follow`
- Editorial sitemaps empty (0 URLs)
- `npm run editorial:test` → 14 passed

## Action A — Named human approval (required)

For **each** page_id below, a real person (e.g. Tiago Sasaki) must run:

```bash
cd /mnt/d/webcfg   # or clone path

python3 scripts/editorial/approve_cli.py \
  --reviewer "Tiago Sasaki" \
  --page-id PAGE_ID \
  --notes "NOTES_AT_LEAST_20_CHARS_DESCRIBING_WHAT_WAS_CHECKED" \
  --sources SOURCE_IDS \
  --indexable
```

| page_id | URL | Suggested --sources |
|---------|-----|---------------------|
| lei-art124-alteracao-obra | /lei-14133-obras/art-124-alteracao-contratual-obra/ | lei-14133-art124,lei-14133-art125,lei-14133-art126-132,lei-14133-planalto,agu-alteracoes-contratuais-2024 |
| lei-limite-25-50 | /lei-14133-obras/limite-25-50-aditivo-obra/ | lei-14133-art125,lei-14133-art124,lei-14133-art126-132,lei-14133-planalto,agu-alteracoes-contratuais-2024 |
| lei-item-novo-desconto | /lei-14133-obras/preco-item-novo-desconto-proposta/ | lei-14133-art126-132,lei-14133-art124,lei-14133-planalto,agu-alteracoes-contratuais-2024,sinapi-caixa |
| lei-reequilibrio-reajuste | /lei-14133-obras/reequilibrio-reajuste-repactuacao/ | lei-14133-art130-131,lei-14133-art136,lei-14133-planalto |
| lei-atraso-administracao | /lei-14133-obras/atraso-imputavel-administracao/ | lei-14133-art115,lei-14133-planalto,lei-14133-art130-131 |
| lei-parcela-incontroversa | /lei-14133-obras/parcela-incontroversa-medicao-pagamento/ | lei-14133-art141-143,lei-14133-planalto |
| lei-servico-sem-aditivo | /lei-14133-obras/servico-executado-sem-termo-aditivo/ | lei-14133-art124,lei-14133-art126-132,lei-14133-planalto,agu-alteracoes-contratuais-2024 |
| guia-checklist-aditivo | /guias-contratos-obras/checklist-pedido-aditivo/ | lei-14133-art124,lei-14133-art125,lei-14133-planalto,agu-alteracoes-contratuais-2024 |
| guia-docs-reequilibrio | /guias-contratos-obras/documentos-pedido-reequilibrio/ | lei-14133-art130-131,lei-14133-art136,lei-14133-planalto |
| guia-glosa | /guias-contratos-obras/contestar-glosa-medicao/ | lei-14133-art141-143,lei-14133-planalto |
| guia-notificacao-atraso | /guias-contratos-obras/responder-notificacao-atraso/ | lei-14133-art115,lei-14133-planalto |

**Example notes:**  
`"Planalto arts. 124–125 conferidos em 2026-08-02; CTAs contextuais OK; sem promessa de resultado jurídico."`

**Rejected IDs (do not approve until dossier fixed):**  
`jur-sumula-260-art` — need official Súmula text, approval date, stable TCU URL.

## Action B — Rebuild + deploy after approvals

```bash
npm run editorial:build
npm run editorial:test
# deploy (Netlify on push to main, or local build:site)
```

Confirm:
- approved pages: `robots=index,follow`
- `sitemap-editorial.xml` contains only approved URLs
- https://confenge.com.br/.well-known/build-info.json matches deploy commit

## Action C — Search Console
Submit when non-empty:
- https://confenge.com.br/sitemap-editorial.xml
- https://confenge.com.br/sitemap-jurisprudencia.xml (if any)
- https://confenge.com.br/sitemap-index.xml

## Action D — Cannibalization after first INDEXABLE overlaps
For each approved Wave 1 URL that competes with a `manter` `/conteudos/` page:
1. Choose canonical winner
2. noindex or canonicalize loser
3. Update `sitemap.xml`
See `CONTENT-CANNIBALIZATION-REPORT.md`

## Action E — Optional byline
Set `author_is_tiago: true` in page JSON only after Tiago personal review; re-approve (hash invalidates).

## Definition of unlocked
- ≥1 page `INDEXABLE` with named human approval
- In production sitemap + index,follow
- Then reassess terminal toward `COMPLETE_EDITORIAL_PSEO_INBOUND_OPERATIONAL`
