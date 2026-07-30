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

## Pendências externas

| Item | Status |
|------|--------|
| GSC: sitemap enviado/atualizado | **Feito** (operador, 2026-07-30) |
| Sitemap live coerente | **OK** — 132 URLs HTTPS, robots aponta `https://confenge.com.br/sitemap.xml` |
| GSC: inspeção de URL + pedido de indexação (prioritários) | **Pendente** (manual, ver lista abaixo) |
| GA4/Plausible com ID real | Pendente — não inventar ID |
| Cases/depoimentos | Pendente — autorização comercial |

### Sitemap verificado em produção (pós-envio GSC)

```
sitemap.xml → 200, 132 URLs, todas https://, barra final
robots.txt  → Sitemap: https://confenge.com.br/sitemap.xml
Prioritários no sitemap: SINAPI, demolição, atraso pagamento, adm. local, BDI diferenciado — sim
```

### Próximo passo recomendado no GSC (5–10 min)

**Inspeção de URL → Solicitar indexação** (não precisa esperar o crawl do sitemap):

1. `https://confenge.com.br/conteudos/sinapi-desonerado-nao-desonerado/`
2. `https://confenge.com.br/conteudos/demolicao-nao-prevista-obra-publica/`
3. `https://confenge.com.br/conteudos/atraso-pagamento-contrato-publico-suspender/`
4. `https://confenge.com.br/conteudos/administracao-local-orcamento-obra-publica/`
5. `https://confenge.com.br/conteudos/bdi-diferenciado-obra-publica/`

Em **Sitemaps**: confirmar status “Sucesso” e contagem ~132 URLs descobertas (pode levar horas).

Em **Páginas** / **Remoções**: não forçar remoção dos legados se já há 301; deixar consolidar.

### Medição (28 / 56 dias) a partir de agora

Comparar com baseline 14–28 jul 2026 (10 cliques / 325 imp):

- CTR e impressões da SINAPI e da lista zero-clique  
- Queda de impressões em HTTP / URLs fantasma  
- Cliques WhatsApp / forms (após analytics, se ligar)

## Evidência

- Curl: `/tmp/grok-goal-1b02ecba3a6c/implementer/evidence/prod-after-deploy-curl.log`
- Screenshot: `seo/screenshots/live-sinapi-post-redeploy.png` (se gerado)
- Revalidar: `node seo/scripts/playwright_prod_checklist.mjs`
