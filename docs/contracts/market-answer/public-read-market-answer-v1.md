# `public-read-market-answer/1.0`

Expected extra-cli Goal 03 consumer contract for
`web-cfg / market-answer / valor-típico-contratos-pavimentacao` (web-cfg #84).

extra-cli does not ship this family in `docs/contracts/` yet. This file is the
consumer-side encoding of extra-cli #400 Market Answer addendum plus the
payload fields required by #84. It is SELECT-only. It is not a second
datalake.

## Grain

`valor_integral_nominal` — integral nominal BRL of the contract instrument.

Not custo/km, not unit price, not a deflated series. If physical quantity
later becomes documentary, that is a new method/grain, not a derivation from
this ticket.

## Required payload

- `question_id`, `typology_id`, `method_id`, `schema`
- `grain = valor_integral_nominal`
- `statistics.{median,p25,p75,n,currency,unit}`
- `period`, `geography` (no silent BR)
- `distribution` buckets
- `contract_refs` / `evidence_refs`
- `peer_group` / `method_refs` (#415 when present; else `HOLD_FOR_DATA`)
- `as_of`, `coverage`, `freshness`, `missingness`
- `limitations`, `UNKNOWN` / `unknown_fields`, `reason_codes`
- `claim.authorization_state`
- `content_hash`, `schema_hash`, `producer_sha`
- `official_live`, `producer_status`

## Fixture vs live

| Field | Fixture canary | Official live (absent today) |
|---|---|---|
| `official_live` | `false` | `true` |
| `producer_status` | `CONTRACT_FIXTURE` | `OFFICIAL_LIVE` |
| `claim.authorization_state` | `FIXTURE_NOT_AUTHORIZABLE` | `AUTHORIZED` only after producer claim gate |
| INDEX | never | only after web-cfg human hash + coverage/freshness |

`claimed_live` on a fixture is rejected by the adapter.

## What extra-cli decides

Facts, quartiles, coverage, freshness, peer-group status, reason codes,
`official_live`. Never INDEX, never CONFENGE narrative, never CTA.

## What web-cfg decides

Candidate record, `MARKET_ANSWER_VALUE_SCORE` (including UNKNOWN demand),
editorial/index state, URL, schema.org, robots/sitemap, CTA, attribution.
