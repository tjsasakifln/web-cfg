# CONFENGE-WEB-BOFU-CHECKOUT-CONVERGENCE-01

**Verdict:** `BOFU_SEARCH_READY_CHECKOUT_PREPARED`

Decision state: **EXECUTE_NOW**. Executive front: BOFU search readiness + prepare-only contracting. Time to evidence: next 28-day GSC window on the six issue #128 service URLs. Leverage: **revenue + distribution**. 100 repetitions of this campaign would improve the system (named audit + catalog adapter), not mint 100 pages.

This is not rank #1. Google position is not claimed. DONE is removal of code-controlled defects.

## FACT

- Existing priority service routes remain one canonical landing each, HTTP-crawlable HTML, self-canonical to `https://confenge.com.br…`, `index,follow`, in sitemap, robots-coherent.
- #128 aditivos snippet hypothesis is **LANDED_IN_REPO**: title `Aditivos em obras públicas: documentos e margem | CONFENGE` (before: library boilerplate + “limites, serviços extras e pleitos”). Baseline: 12 impr / 0 clicks / pos 49.25 (`seo/gsc-2026-08-09`). Live rank is UNKNOWN until the next export.
- Indexable mapped `/conteudos/` keep editorial commercial bridges; `indexable_commercial_bridge_coverage = 1.0`. No new URL family. Noindex library was not massified. No thin 301 onto a pilar.
- Named-findings adversarial audit (`scripts/organic/bofu_adversarial.py`) is fail-closed on the criterion-3 defect classes. Shipped run: 0 findings.
- Intent matrix: `data/organic/bofu-intent-matrix.json`. Each row has exactly one preferred commercial destination. Bid Room is a child of Diretoria B2G.
- Checkout is prepare-only. `data/offers/flags.json`: `CONFENGE_OFFER_CATALOG_PUBLIC=false`, `production_checkout_enabled=false`, `production_webhook_enabled=false`, `real_money_mutation_enabled=false`, `ASAAS_MODE=disabled`. Catalog adapter consumes `data/offers/catalog.snapshot.json` + empty `provider-mapping.json`. No production Asaas API key. No real charge.
- Campaign jobs map onto existing dictionaries (aliases, same layer): `service_view` → `service_page_view`; `service_cta` → `cta_click`; commercial types in `confenge.commercial_event.v1`. Shipped journey producers emit `offer_selected`, `eligibility_submitted` (qualification), `capacity_decision`, `terms_accepted`, `checkout_created`, `payment_state_observed`, `onboarding_eligible`. Paused/retired/kill-switch resolve to `offer_not_contractable`. An accepted prior terms snapshot vs current offer version is `terms_drift`. Impression/click, lead, checkout object, payment received, contracted revenue, and pipeline stay uncollapsed. GSC query is not joined to a person.

## INFERENCE

- Completing truncated meta on medições / pré-licitação / auditoria to match the visible content-lead removes a schema/snippet defect without inventing claims.
- Labeling existing “não entra / não fit” blocks with `id="quando-nao-contratar"` makes the when-not-to-hire gate machine-checkable.

## UNKNOWN

- Next 28-day GSC clicks on service pillars.
- Live `content_to_service` counts in production analytics.
- Founder-filled Asaas product IDs.

## Not in this campaign

- #84 / #83 / #89, pSEO families, extra-cli / Warmbly / Governance / SmartLic / DNS, real charges, billing ledger.

## Tests

- `python3 -m pytest scripts/organic/tests/test_bofu_adversarial.py scripts/organic/tests/test_bofu_exposure.py`
- `node tests/offers/test_campaign_checkout_prepare.mjs`
- `node tests/offers/test_offers.mjs`
- `node tests/offers/test_checkout_negatives.mjs`
- `node tests/offers/asaas-sandbox/test_asaas_sandbox.mjs` (CONTRACT_PROVEN)
- `node tests/offers/asaas-production/test_asaas_production.mjs` (fail-closed path, CONTRACT_PROVEN)
- `npm run test:event-dictionary`, `test:attribution`, `test:analytics`
- `npm run validate:seo`, `test:inbound-gates`, `test:visible-parity`, `test:brand`, `test:authority`, `test:secrets-scan`, `test:bofu-dominance`
