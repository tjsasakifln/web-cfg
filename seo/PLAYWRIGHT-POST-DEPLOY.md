# Playwright — pós-deploy Netlify (GitHub)

**Data:** 2026-07-30  
**Produção:** https://confenge.com.br  
**Commits no ar:** `de4cbef` (SEO) + `55d1927` (cache-bust `script.js?v=ced23fca5a`)

## Resultado

**25/25 checks passed** (contexto de browser limpo, cache desabilitado)

| Área | Status |
|------|--------|
| SINAPI title `qual usar?` | OK |
| `.lead-inline` (3) / `.compare-table` / `#checklist` / CPRB | OK |
| WhatsApp contextual “desonerado” | OK |
| `/llms.txt` `/sitemap.xml` `/robots.txt` | 200 |
| Form `origem` + prefill tema/mensagem | OK |
| `window.confengeTrack` | function |
| Form `checkValidity()` após preencher | true |
| Aditivo critérios `01`–`04` | OK |
| Redirects legados 301 | OK (9/9) |
| HTTP → HTTPS 301 | OK |
| Cache-bust `script.js?v=` | OK |

## Redirects live

| De | Status | Para |
|----|--------|------|
| `/servicos` | 301 | `/#atuacao` |
| `/blog` | 301 | `/conteudos/` |
| `/privacy-policy` | 301 | `/privacidade/` |
| `/contato` | 301 | `/#contato` |
| `/avcbclcb` | 301 | `/` |
| `/vision` | 301 | `/` |
| `/trabalhe-conosco` | 301 | `/#contato` |
| `/nexgen` | 301 | `/` |
| `/terms-and-conditions` | 301 | `/privacidade/` |
| `http://confenge.com.br/` | 301 | `https://confenge.com.br/` |

## Nota sobre cache de `script.js`

Na primeira rodada, o contexto Playwright ainda tinha **JS antigo em cache** (`decodedBodySize` 3 KB), o que fazia falhar prefill/analytics.  
Correção enviada: `script.js?v=ced23fca5a` + `_headers` com `max-age=3600, must-revalidate`.  
Após redeploy GitHub→Netlify, checklist limpo em contexto fresco.

## Pendências que **não** são de deploy (ainda manuais)

| Item | Por quê |
|------|---------|
| GSC: reenviar sitemap / pedir indexação SINAPI | Conta Google Search Console |
| GA4/Plausible com ID real | Criar propriedade; não inventar ID |
| Cases/depoimentos | Autorização comercial |

## Evidência

- Curl: `/tmp/grok-goal-1b02ecba3a6c/implementer/evidence/prod-after-deploy-curl.log`
- Screenshot: `seo/screenshots/live-sinapi-post-redeploy.png` (se gerado)
- Revalidar: `node seo/scripts/playwright_prod_checklist.mjs`
