# Market Answer canary status

**Recommendation:** `PUBLISHABLE_INDEX`

**Candidate decision:** `PUBLISHABLE_INDEX`: Qual é o valor típico dos contratos públicos de pavimentação em Santa Catarina?

**Demand:** `UNKNOWN` (UNKNOWN stays UNKNOWN)

**Data state:** official_live=`True` · producer_status=`OFFICIAL_LIVE` · fixture=`False`

**as_of:** `2026-08-17T11:29:23.193694+02:00` · content_hash=`568880b7eacf30e2adaf7481945fa50cfc77039be10b27ffc6af0959bf6c6d9d`

## Gate results

- gate: `market-answer-publication-gate/1.1`
- indexable: `True`
- robots: `index,follow`
- sitemap: `True`

- `official_live`: `True`
- `claim_authorized`: `True`
- `coverage_sufficient`: `True`
- `freshness_current`: `True`
- `method_present`: `True`
- `limitations_present`: `True`
- `answerability`: `True`
- `singular_substance`: `True`
- `canonical_robots_sitemap_schema`: `True`
- `attribution`: `True`
- `refresh_owner`: `True`
- `human_approval_hash`: `True`
- `not_fixture`: `True`
- `grain_ticket_not_km`: `True`
- `no_national_claim_without_coverage`: `True`
- `geography_scope_ok`: `True`
- `copy_scope_coherent`: `True`
- `coverage_scope_matches`: `True`
- `n_positive`: `True`
- `missingness_present`: `True`
- `rendered_approval_bound`: `True`
- `national_gate_302`: `True`

Reason codes: none

Score `MARKET_ANSWER_VALUE_SCORE/1.0` total=`0.6708` · unknown components: demand, freshness

## Page / index state

- path: `/inteligencia/valor-tipico-contratos-pavimentacao/`
- canonical: `https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/`
- fixture marked: `False`
- rendered: /home/tjsasakifln/code/confenge/web-cfg-inbound-03/inteligencia/valor-tipico-contratos-pavimentacao/index.html

## Engagement events available

- `answer_view` (impression)
- `method_open` (engagement)
- `evidence_drilldown` (engagement)
- `analysis_click` (engagement)
- `xray_start` (engagement)
- `cta_view` (engagement)
- `cta_click` (engagement)
- `lead_receipt_correlated` (lead)
- `correction_open` (engagement)

Page view is not a lead. Impression, engagement, lead and pipeline stay separate.

## Blockers

- none

## Next integration steps

- Official_live SC payload is consumed SELECT-only. INDEX requires the hashed SC approval.
- Bind Goal 05 peer-group / #415 comparables only when COMPARABLE is fail-closed.
- Do not claim country-wide coverage until extra-cli #302 closes the publishing-org denominator.
- Do not close web-cfg #84 until organic discovery → engagement → handoff → real outcome.
- Keep query/filter/drill-down URLs noindex. Do not mint a pSEO matrix.

Do not close #84. Discovery/outcome remain residual after the SC index flip. extra-cli #302 remains required for any country-wide claim.
