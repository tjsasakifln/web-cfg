# FINAL — CONFENGE-WEB-PRODUCTION-CONVERGENCE-04

Token: `PARTIAL_WITH_EXACT_RESIDUALS`

Netlify production `commit_ref` equals main. Graph, seven BOFU pages, Market Answer noindex, Data Desk noindex, checkout-off, and CSP are proven live. The token is not `PRODUCTION_CONVERGED` because the contract-analysis canary is not INDEX v2 and Warmbly `confenge.search_observation.v1` capability is not proven DELIVERED.

## FACT

- `origin/main` = `f767554bcdfb7594c1e079cd39791a7c9770ef22` (merge of #168 at 2026-08-20T04:22:07Z). Previous main: `4e1d3dbc5f9305bbdaabc03145e01ac91a39f3bd`.
- Netlify production deploy `6a8680f16e35db00084a9147`: `commit_ref` = `f767554bcdfb7594c1e079cd39791a7c9770ef22`, `state` = `ready`, `context` = `production`, `published_at` = `2026-08-20T04:22:48.226Z`.
- Homepage etag changed `b7e476cad9c06be46c98d9cde1536857-ssl` → `4b3870a8ed28bdc3cf988e3fc03f636c-ssl`.
- Graph: sitemap-index + four children + sitemap.txt = **64** unique locs, loc sets equal, no duplicates. Robots Sitemap line points only at `sitemap-index.xml`.
- Seven BOFU URLs HTTP 200, self-canonical, index,follow, in graph, CSP present:
  - `/defesa-margem-contratos-publicos/`
  - `/atrasos-prorrogacao-obras-publicas/`
  - `/defesa-tecnica-contratos-publicos/`
  - `/acompanhamento-contratos-obras/`
  - `/bid-room-licitacoes-obras/`
  - `/diretoria-b2g/`
  - `/diagnostico-b2g-expansao/` (hand-raise to `/.netlify/functions/lead`, terms `CFG-TERMS-B2B-2026-08-17-v1`, no `offer-checkout` in HTML)
- Market Answer `/inteligencia/valor-tipico-contratos-pavimentacao/`: HTTP 200 history, self-canonical, `noindex,nofollow`, absent from every sitemap child and `sitemap.txt`.
- Data Desk kit `/assets/data-desk/valor-tipico-contratos-pavimentacao-sc/v1/`: HTTP 200, `noindex,follow` (meta + `X-Robots-Tag`), off sitemap.
- Contract-analysis family: robots Disallow `/analises-contratos-publicos/`; listing `X-Robots-Tag: noindex, nofollow, noarchive`; off sitemap.
- Checkout POST `/.netlify/functions/offer-checkout` with flags false: HTTP 404 `{"ok":false,"error":"feature_disabled"}`.
- GSC job 32330638164 authenticated; repo overlay `LIVE_JOB_OK`; `core_ready_for_product_decisions=false`.
- Source PRs #160–#167 closed SUPERSEDED_BY_CONVERGENCE. Issues #151, #152, #153 closed. #157 and #83 remain HOLD.

## INFERENCE

- One merge + one production Netlify deploy replaced eight intermediate source-PR deploys.

## UNKNOWN

- Warmbly inbound health may still omit `confenge.search_observation.v1` (producer holds HELD/RETRYABLE; not DELIVERED).
- Map-pack / branded-search / organic lift.
- Live `content_to_service` counts in production analytics (contract is on shipped HTML/JS).

## BLOCKED

- Contract-analysis canary INDEX v2: stale 2026-08-17 token is invalid; twelve-item v2 gate was not proven; #83 stays open.
- IndexNow not submitted (`auto_send=false`).

## produção comprovada

- Yes for main SHA, Netlify `commit_ref`, graph (64), seven BOFU pages, Market Answer noindex/off-sitemap, Data Desk noindex/off-sitemap, checkout-off, CSP.
- No for #157 INDEX and search-observation DELIVERED.

## efeito comercial ainda não observado

- Yes: no claim of pipeline, revenue, map-pack win, or branded-search win.
