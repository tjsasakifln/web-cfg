# CONFENGE conversion / SEO remediation — factual result

Date: 2026-08-02  
Production: https://confenge.com.br  
Baseline pre-change main: `90cebc457fbb9a8d6c74c7483ef944651c30d401`

## Deploy identity

Live `/.well-known/build-info.json` (re-check after each deploy):

- commit, build_time, environment, schema — see endpoint and `docs/evidence/section-20-smoke.txt`

## Conversion architecture (live)

| Journey | Market need | Primary CTA | Confirmation | Lead API |
| --- | --- | --- | --- | --- |
| A | Contrato sob pressão | Enviar documentos para análise inicial | `/obrigado-contrato` | `jornada=contrato` |
| B | Edital / proposta | Enviar edital para triagem | `/obrigado-edital` | `jornada=edital` |
| C | Operação B2G | Diagnosticar a operação B2G | `/obrigado-operacao` | `jornada=operacao` |

Homepage first viewport: conventional category, construtoras, economic problem, benefit, EESC-USP proof, primary CTA + urgent WhatsApp.

## Production lead delivery (verified)

Endpoint: `POST https://confenge.com.br/.netlify/functions/lead`  
Evidence: `docs/evidence/lead-delivery-verification.json`

| Journey | receipt_id | ntfy message_id | poll match |
| --- | --- | --- | --- |
| contrato | `515106b8202de7c3c8c806fe` | `Cpx9KeEkW1A6` | yes |
| edital | `efb5d6a66aab08d9edd45566` | `ZSkKzCw5hwcT` | yes |
| operacao | `c37294d9e2f30c00d01738bb` | `966NRmzQwfgT` | yes |

Delivery channel: **ntfy** publish + external poll-back (operational notification).  
FormSubmit email remains secondary (HTTP 403 until owner activates activation email).  
WhatsApp remains document handoff path for sensitive files.

## Production Lighthouse lab (mobile)

Evidence: `docs/evidence/lighthouse-production-2026-08-02.json`

| URL | Perf | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 100 | 100 | 100 | 100 | ≤2.5s | 0 | 0 |
| `/diretoria-b2g/` | 100 | 100 | 100 | 100 | ≤2.5s | 0 | 0 |
| `/defesa-margem-contratos-publicos/` | 100 | 100 | 100 | 100 | ≤2.5s | 0 | 0 |
| `/bid-room-licitacoes-obras/` | 100 | 100 | 100 | 100 | ≤2.5s | 0 | 0 |
| `/conteudos/` | 100 | 100 | 100 | 100 | ≤2.5s | 0 | 0 |

Field CWV: `PENDING_FIELD_DATA`

## Content disposition

Evidence: `seo/content-disposition-2026-08-02.md`

- Mechanical generic phrases removed from 116 articles
- 97 thin/template pages: `noindex,follow` + removed from sitemap
- Priority/handcrafted pages remain indexable

## Before → after

| Item | Before | After |
| --- | --- | --- |
| Category language | Diretoria B2G first | Consultoria para licitações e contratos… |
| CTAs | One generic | Three journeys |
| Form | Single long form | Two-step + `/.netlify/functions/lead` |
| Lead proof | HTML only | receipt_id + ntfy delivery verified |
| Thin content | Indexable | noindex + out of sitemap |
| Release SHA | git clean/smudge | build-info from deploy env |
| build-info | 404 | Live |

## Acceptance matrix

`docs/evidence/section-20-acceptance.json`

## PENDING_FIELD_DATA

- Field Core Web Vitals (CrUX)
- Search Console ranking / CTR
- Conversion rate under real traffic
- FormSubmit email after owner activation

## Limits

- Netlify Forms native HTML POST remains non-functional (404); function path is the operational form backend
- FormSubmit needs one activation click by `tiago.sasaki@confenge.com.br`
- ntfy topic is secret-by-URL; set `NTFY_TOPIC` on Netlify to rotate
- Full editorial rewrite of noindexed library pages still open
