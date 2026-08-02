# CONFENGE conversion / SEO remediation result

Date: 2026-08-02  
Baseline main SHA (pre-change): `90cebc457fbb9a8d6c74c7483ef944651c30d401`  
Production host: https://confenge.com.br

## Implemented

1. **Homepage** — conventional category first; three journeys A/B/C; lean narrative; proprietary labels after plain language.
2. **Lead capture** — multi-step form → `POST /.netlify/functions/lead` issues `receipt_id`; journey confirmations; WhatsApp fallback.
3. **Analytics** — funnel events without PII; automated tests.
4. **Content** — generic boilerplate stripped; 97 thin pages `noindex,follow` and removed from sitemap.
5. **Release** — no git SHA filters; `/.well-known/build-info.json` from deploy env.

## Production lead receipts (verified)

Endpoint: `https://confenge.com.br/.netlify/functions/lead`  
Evidence file: `docs/evidence/production-lead-receipts.json`

| Journey | receipt_id | received_at (UTC) |
| --- | --- | --- |
| contrato (A) | `4d187329bb2217a7b1f62090` | 2026-08-02T13:34:48.095Z |
| edital (B) | `1a7c63794b9d3f2893d15893` | 2026-08-02T13:34:48.810Z |
| operacao (C) | `635e665f037117bd43840cfc` | 2026-08-02T13:34:49.226Z |

Upstream mail (FormSubmit) returned HTTP 403 until the site owner activates that form by email. Receipt issuance on the production edge is independent and verified.

## Production Lighthouse lab (mobile, 2026-08-02)

Source: `docs/evidence/lighthouse-production-2026-08-02.json`

| URL | Perf | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 100 | 100 | 100 | 100 | 1.49s | 0 | 0 |
| `/diretoria-b2g/` | 100 | 100 | 100 | 100 | 1.22s | 0 | 0 |
| `/defesa-margem-contratos-publicos/` | 100 | 100 | 100 | 100 | 1.37s | 0 | 0 |
| `/bid-room-licitacoes-obras/` | 100 | 100 | 100 | 100 | 1.38s | 0 | 0 |
| `/conteudos/` | 100 | 100 | 100 | 100 | 1.22s | 0 | 0 |

Field Core Web Vitals: `PENDING_FIELD_DATA`.

## Before → after

| Surface | Before | After |
| --- | --- | --- |
| Hero category | Diretoria B2G first | Consultoria para licitações e contratos… |
| CTAs | Single generic | Three journey CTAs |
| Form | All fields at once | Two-step + production receipt API |
| Confirmations | One page | Journey-specific + protocol |
| Thin content | Indexable templates | 97 `noindex` + out of sitemap |
| build-info | 404 | Live commit identity |
| Git filters | PLACEHOLDER clean/smudge | Removed |

## Limits

- FormSubmit email delivery requires one-time activation by `tiago.sasaki@confenge.com.br` (403 until activated). Lead **receipt** is already issued by production function.
- Full editorial rewrite of library depth still open; thin pages are out of index.
- pSEO leaves stay under editorial containment.
- Field rankings/conversion: `PENDING_FIELD_DATA`.

## CI

site-ci green on conversion commits with Lighthouse Node API runner (see GitHub Actions on `main`).
