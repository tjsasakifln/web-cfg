# ADVERSARIAL QA

Local targeted evidence (2026-08-20):

- pytest sitemap graph + market-answer clock: pass
- pytest discovery/canary registry/overlay: pass after cohort/allowlist/graph recognized noindex
- pytest BOFU frozen specs / ledger honesty / local-entity: pass
- pytest contract-analysis stale token: pass (2026-08-17 and generic tokens do not INDEX)
- node checkout negatives: pass (flag false, no pagar/checkout URL, old terms, price mismatch, unknown offer, double submit, store down)
- node search_observation contract: 15/15 (capability absent/present, 401, 422, 5xx, timeout, replay, literal query, query_hash, null counts, observed zero, synthetic, unknown destination, generic 2xx not DELIVERED)
- node attribution source-to-service: pass
- inbound gates: pass
- auto_send=false and production_checkout_enabled=false remain

## A. INDEX/SEO
- stale Market Answer: HTML noindex,nofollow; absent from sitemap-index children, sitemap.txt, IndexNow allowlist
- expired page was not put back in INDEX to greening CI

## B. PRIVACY
- search_observation rejects query and query_hash
- lead attribution allowlist unchanged except offer_id/terms_id
- no GSC literal query committed

## C. CONVERSION
- Diagnóstico Expansão is persist-first hand-raise for CFG-DIAG-EXP-v1
- offer-checkout with flags false returns 4xx
- Warmbly down does not fail lead capture

## D. EXPERIMENTS
- six frozen #128 HTML files not in the convergence exclusive HTML mutations
- #126/#127/#128 remain observe_only in demand-control excluded families
- synthetic search-observation SKIPPED

## E. HONESTY
- GSC overlay LIVE_JOB_OK, core_ready_for_product_decisions=false
- window totals remain null where incomplete
- click ≠ lead ≠ pipeline ≠ revenue
