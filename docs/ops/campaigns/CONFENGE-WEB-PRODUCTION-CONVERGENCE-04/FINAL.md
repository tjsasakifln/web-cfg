# FINAL — CONFENGE-WEB-PRODUCTION-CONVERGENCE-04

Token: `PARTIAL_WITH_EXACT_RESIDUALS`

Netlify production `commit_ref` equals `origin/main` (`154b1d2a`). Graph, seven BOFU pages, Market Answer noindex, Data Desk noindex, checkout-off, CSP, and persist-first search-observation callers are proven live. The token is not `PRODUCTION_CONVERGED` because the contract-analysis canary is not INDEX v2 and Warmbly `confenge.search_observation.v1` is not proven DELIVERED.

## FACT

- `origin/main` = `70ba0cd4d4cdc0ceadb3a7de1e9e9e7e305e367d` (merge of #172). Published product line remains the #170 graph/pages at `154b1d2a` plus GSC-honesty/discovery:test CI. Previous published: `154b1d2a8ab254ad0213cdb2fdb9cb46cfcb094b` / `6a868f64beb71a000870758b`.
- Live `/.well-known/build-info.json`: `commit` = `70ba0cd4d4cdc0ceadb3a7de1e9e9e7e305e367d`, `deploy_id` = `6a8698d8e7a3b00008ac36d2`, `environment` = `production`.
- Homepage etag `5ff2889b469de55250a924e1ca9a3f4e-ssl`. CSP present (`default-src 'self'`).
- Graph: sitemap-index + four children + sitemap.txt = **64** unique locs, loc sets equal to each other and to `origin/main:sitemap.txt`. Robots Sitemap line points only at `sitemap-index.xml`. `audit_graph`: `market_answer_indexable=false`, `market_answer_in_graph=false`, `ok=true`.
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
- Search-observation producer is wired: persist-first FileStore/Blobs `search-obs/`, ops produce/drain, scheduled `search-observation-tick`. DELIVERED not proven.
- GSC overlay `LIVE_JOB_OK`; `core_ready_for_product_decisions=false`.
- Source PRs #160–#167 already closed SUPERSEDED_BY_CONVERGENCE (absorbed by #168). #170 merged. #157 and #83 remain HOLD.
- IndexNow: prepare dry-run accepted `/defesa-margem-contratos-publicos/` (`sent=false`). No HTTP POST. Graph loc set matches live (not a divergence blocker). CLI `--send` is refused; `send_default=false`.

## INFERENCE

- Two production merges (#168 content, #170 persist-first/GSC honesty/scanner/Chrome) replaced eight intermediate source-PR deploys.

## UNKNOWN

- Warmbly inbound health may still omit `confenge.search_observation.v1` (producer holds HELD; not DELIVERED).
- Map-pack / branded-search / organic lift.
- Live `content_to_service` counts in production analytics (contract is on shipped HTML/JS).

## BLOCKED

- Contract-analysis canary INDEX v2: stale 2026-08-17 token is invalid; twelve-item v2 gate was not proven; #83 stays open.
- IndexNow POST: CLI is prepare-only (`--send` refused). `send_default=false`. Loc set unchanged at 64 versus previous production. Frozen #128 and observe_only URLs excluded. This is not a graph-divergence blocker.

## produção comprovada

- Yes for main SHA, Netlify `commit_ref` `70ba0cd4` / deploy `6a8698d8e7a3b00008ac36d2`, graph (64), seven BOFU pages, Market Answer noindex/off-sitemap, Data Desk noindex/off-sitemap, checkout-off, CSP, persist-first search-observation callers.
- No for #157 INDEX and search-observation DELIVERED.

## efeito comercial ainda não observado

- Yes: no claim of pipeline, revenue, map-pack win, or branded-search win.
