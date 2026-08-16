# Conversion canary report (#88)

**Recommendation: `READY_BEHIND_FLAG`**

Matrix `intent-action-matrix/1.0` v1.0.0. Primary CTA: `Veja sua empresa neste mercado`. Flag `conversion_market_answer_xray` is off.

## Journey states

READY, NEEDS_DATA, NOT_FOUND, STALE, BLOCKED, ERROR. Fixtures are `catalog_mode=fixture`, `claimed_live=false`. No risco/dor/irregularidade scores.

## Synthetic E2E

| step | result |
| --- | --- |
| X-Ray first POST | 201, receipt `71a97d497cfb9f552b812934`, persist then handoff SKIPPED (not commercial), `auto_send=false` |
| X-Ray replay same idempotency key | 200, same receipt, store count 1 |
| Public URL | `https://confenge.com.br/piloto/conversao-xray/` — no CNPJ |
| Hand-raise + forced timeout | 201, receipt kept, `handoff=RETRYABLE`, persist-before-handoff true |
| Hand-raise replay | 200 idempotent, no second persist |

## Attribution

Keep-list includes asset_family, market_answer_id, analysis_id, intent/question class, asset/method/schema version, CTA, source/referrer, drill-down origin, correlation/idempotency, public refs when needed, consent_state, handoff_status. Aggregate analytics use `cnpj_hash` only.

PR #85 mapper still drops several of those fields. Adapter stores them and sends `payload.conversion` (Goal 09 fixture).

## Instrumentation

Client emits form_start, field_abandonment (CNPJ blur empty), xray_complete/error/timeout, cta_click, handraise_complete. CNPJ/name/email/phone stripped from events and from the URL via `history.replaceState`.

## Blockers / integration

- extra-cli Goal 03 live pack
- #84 published Market Answer page
- Warmbly Goal 09 / #47 consume extension
- Real asset → CTA → lead → action/outcome (leaves issue 88 OPEN)

## Tests

`npm run test:conversion` — 28 passed, 0 failed. Frozen libs unchanged.
