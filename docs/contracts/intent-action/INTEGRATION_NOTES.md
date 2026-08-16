# Integration notes — conversion layer (#88)

This branch does **not** edit the PR #85 / shared capture files:

- `netlify/functions/lib/inbound-handoff.cjs`
- `netlify/functions/lib/lead-core.cjs`
- `netlify/functions/lib/lead-store.cjs`

CNPJ-only X-Ray persist lives in `scripts/conversion/intake-core.cjs` and `netlify/functions/market-answer-intake.cjs`. Commercial hand-raise calls the frozen libs only through `scripts/conversion/adapter.cjs`.

## PR #85 interface gaps

`lead-core.validateAndNormalize` requires nome + (telefone|email) + consent + estagio. That is correct for a commercial hand-raise and **wrong** for X-Ray. Isolated intake is the legal path.

`lead-core.pickAttribution` / `ATTR_ALLOWLIST` do not keep:

- `market_answer_id`
- `method_version`
- `schema_version`
- `asset_version`
- `question_class`
- `cta` (copy)
- `drill_down_origin`
- `consent_state`
- `handoff_status`

`inbound-handoff.mapLeadToInboundV1` additionally drops `intent` and `idempotency_key`. It does keep `asset_family`, `analysis_id`, `cta_id`, `correlation_id`, `route_family`, `asset_id`, `evidence_pack_version`, public contract/entity ids, and consent.

The adapter:

1. Persists the full conversion attribution on the receipt (`conversion_attribution`).
2. Builds `confenge.inbound.v1` via the frozen mapper.
3. Merges dropped fields under `payload.conversion` (Goal 09 compatibility).
4. Sets `auto_send=false`.
5. POSTs with `signWarmblyInbound` / `resolveInboundConfig` (exported; no file edit).

Until the shared mapper is extended **after** PR #85 merges, Warmbly consumers must read `conversion.*` for the extra fields. See `data/conversion/fixtures/warmbly-goal-09-event.v1.json`.

## extra-cli Goal 03 (X-Ray factual)

No consumer-bound `public-read-b2g-xray` export exists in this checkout. The conversion layer requests that contract and, while absent, uses labeled fixtures (`catalog_mode=fixture`, `source_kind=labeled_fixture`, `claimed_live=false`) under `data/conversion/fixtures/xray-*.v1.json`.

Do not treat those fixtures as live. Do not set `claimed_live`.

Required later from extra-cli Goal 03:

- states equivalent to READY / NEEDS_DATA / NOT_FOUND / STALE / BLOCKED / ERROR
- no risco / dor / irregularidade scores
- as_of, freshness, method/schema versions, public contract/entity refs
- SELECT-only, versioned, deterministic

## extra-cli / inbound Goal 06

Goal 06 (handoff + attribution join on the extra-cli/Warmbly side) is not implemented here. This layer emits:

- persist-first receipt
- `source=CONFENGE_WEB`
- correlation / idempotency ids
- asset_family, market_answer_id, intent/question class, CTA, drill-down origin

Join key: `lead_id` / `receipt_id`. X-Ray request receipts are `record_kind=request` and **do not** POST to Warmbly (`handoff.SKIPPED`, reason `not_commercial` / `consent_absent`). Only a consented hand-raise transports.

## Warmbly Goal 09

Compatibility fixture: `data/conversion/fixtures/warmbly-goal-09-event.v1.json`.

Parse that file as the event Warmbly Goal 09 / issue #47 should accept. It is labeled non-live. It does not include raw CNPJ.

Warmbly #47 remains the outcome owner. Warmbly #55 remains the latency owner. SLA stays `UNKNOWN`. `CONFENGE_AUTO_SEND_ENABLED` must stay false. This branch never enables auto-send or messaging.

## Issue #90

Not authorized. `ainda_nao_pronto` is citation/download only. No opt-in control is shipped.

## Feature flag

`data/conversion/canary-flag.json` → `enabled: false`. Override with `CONVERSION_CANARY=1`. Tests set `NODE_ENV=test`.

Recommendation in the canary report is `READY_BEHIND_FLAG` until a real extra-cli Goal 03 payload and a published #84 page reconcile asset → CTA → lead → action/outcome. Leaves issue 88 OPEN on this PR.
