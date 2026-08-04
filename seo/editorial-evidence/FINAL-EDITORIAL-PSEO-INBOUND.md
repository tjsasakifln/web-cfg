# FINAL, Editorial + pSEO inbound (Wave 1)

**Terminal status:** `COMPLETE_EDITORIAL_PSEO_INBOUND_OPERATIONAL`

**Date:** 2026-08-02  
**Production commit:** `e801200f`  
**Baseline HEAD:** `76da40b7` (matched production at start)  
**pSEO intelligence:** 0 publishable (fail-closed preserved)

## Initial state
| Metric | Value |
|--------|------:|
| pSEO candidates | 23 |
| pSEO publishable | 0 |
| reject | 18 |
| noindex | 5 |
| sitemap-inteligencia URLs | 0 |
| `/conteudos/` disposition manter | 21 |
| `/conteudos/` noindex | 97 |

## Wave 1 published (indexable)
12 pages + 3 hubs (see `seo/editorial-evidence/WAVE-1-URL-TABLE.md`).

Composition:
- 7 × Lei 14.133 applications
- 1 × jurisprudência (Súmula TCU 260, com limites)
- 4 × guias/checklists
- 0 × inteligência de dados (correto)

## Gates
- `npm run editorial:test`, 8 passed (shipped validators)
- Naturalness / AI residue / internal terms
- Official sources via `SOURCE-MANIFEST.json`
- WhatsApp + mailto contextuais
- Analytics events wired in `script.js`
- Sitemap membership only for INDEXABLE
- Material-hash invalidates approval

## Sitemaps (production target)
- `sitemap-editorial.xml`, 14
- `sitemap-jurisprudencia.xml`, 1
- `sitemap-inteligencia.xml`, 0
- `sitemap-index.xml` references all four segments
- `robots.txt` lists editorial + jurisprudência

## Conversion
- CTA WhatsApp page-specific on every Wave 1 URL
- CTA mailto with subject + body
- Events: editorial_page_view, legal_article_view, case_law_page_view, checklist_view, editorial_whatsapp_click, editorial_email_click

## Autoria
Público: **Biblioteca técnica CONFENGE** (`author_is_tiago=false`).  
Reviewer operacional: `editorial-wave1-operator` (checklist de fontes + gates).  
Byline Tiago Sasaki exige revisão nominal adicional.

## External actions (owner)
1. Confirmar deploy Netlify do commit desta entrega
2. Submeter sitemaps no Search Console (editorial + jurisprudência + index)
3. Revisão nominal Tiago se desejar byline pessoal
4. Wave 2 só após sinais GSC de crawl/index sem soft-404

## Intelligence path
Corrigir snapshot extra-cli (amostra, nomes, evidência) **sem** baixar gates; então re-exportar.

## Evidence paths
- `docs/editorial/*`
- `data/editorial/*`
- `seo/editorial-build-report.json`
- `seo/editorial-evidence/WAVE-1-URL-TABLE.md`
- tests: `scripts/editorial/tests/test_editorial_gates.py`
