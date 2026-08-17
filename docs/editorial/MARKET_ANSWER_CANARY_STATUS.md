# Market Answer canary status

**Recommendation:** `NEEDS_DATA`

**Candidate decision:** `NEEDS_DATA`: Qual é o valor típico dos contratos públicos de pavimentação?

**Demand:** `UNKNOWN` (UNKNOWN stays UNKNOWN)

**Data state:** official_live=`True` · producer_status=`OFFICIAL_LIVE` · fixture=`False`

**as_of:** `2026-08-17T11:29:23.193694+02:00` · content_hash=`de410553091aa22239c7c6e241f485d4b1a91da6459fce4d7bd412c41a42ac71`

## Gate results

- gate: `market-answer-publication-gate/1.0`
- indexable: `False`
- robots: `noindex,nofollow`
- sitemap: `False`

- `official_live`: `True`
- `claim_authorized`: `False`
- `coverage_sufficient`: `False`
- `freshness_current`: `True`
- `method_present`: `True`
- `limitations_present`: `True`
- `answerability`: `True`
- `singular_substance`: `True`
- `canonical_robots_sitemap_schema`: `False`
- `attribution`: `True`
- `refresh_owner`: `True`
- `human_approval_hash`: `False`
- `not_fixture`: `True`
- `grain_ticket_not_km`: `True`
- `no_national_claim_without_coverage`: `True`

Reason codes: `coverage_insufficient`, `claim_unauthorized`, `claim_current_publication_blocked`, `approval_hash_drift`, `index_hygiene_blocked`

Score `MARKET_ANSWER_VALUE_SCORE/1.0` total=`0.6708` · unknown components: demand, freshness

## Page / index state

- path: `/inteligencia/valor-tipico-contratos-pavimentacao/`
- canonical: `https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/`
- fixture marked: `False`
- rendered: /home/tjsasakifln/code/confenge/web-cfg-closeout-01/inteligencia/valor-tipico-contratos-pavimentacao/index.html

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

- `coverage_insufficient`
- `claim_unauthorized`
- `claim_current_publication_blocked`
- `approval_hash_drift`
- `index_hygiene_blocked`

## Next integration steps

- Wait for extra-cli Goal 03 official_live export (issues #400 market-answer addendum).
- Bind Goal 05 peer-group / #415 comparables only when COMPARABLE is fail-closed.
- Do not claim national coverage until extra-cli #302 closes the publishing-org denominator.
- Do not close web-cfg #84 until organic discovery → engagement → handoff → real outcome.
- Keep the canary noindex/off-sitemap until official_live + claim + coverage + human hash pass.

Do not close #84. Extra-cli #400/#415/#302 official_live market-answer payload is still absent.
