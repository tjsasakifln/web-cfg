# Warmbly inbound handoff (`confenge.inbound.v1`)

Consume-only pointer to the destination contract. Do not invent a parallel version.

- Warmbly PR: https://github.com/tjsasakifln/warmbly/pull/71
- Contract: `docs/confenge/inbound-ingest.md` on that PR
- Endpoint: `POST /api/v1/webhooks/confenge/inbound`
- Auth: `X-Warmbly-Signature: t=<unix>,v1=<hex(hmac_sha256(secret, "<unix>." + body))>` (5-minute skew)
- Auto-send stays off on Warmbly (`CONFENGE_AUTO_SEND_ENABLED=false`)

web-cfg is the capture authority. Warmbly is downstream operational action.

## Shipped path

```
visitor → money-asset / CTA
       → validate + persist lead (lead_id / receipt_id)
       → 201/200 capture response (no PII)
       → outbox row PENDING
       → server POST confenge.inbound.v1 (HMAC, no query PII)
       → Warmbly 201 create / 200 duplicate → DELIVERED
       → 5xx/timeout → RETRYABLE (same lead_id)
       → drain_inbound retries until DELIVERED or DEAD/BLOCKED
```

Never: POST Warmbly first, then persist. Never: browser → Warmbly.

`OPS_WEBHOOK_URL` remains the Slack-style `confenge.lead` notify (`X-Confenge-Signature`). It is a different HMAC and a thinner payload. Do not point it at Warmbly inbound.

## Source mapping

| Surface | Field | Value |
| --- | --- | --- |
| Analytics + lead store | `source` | `CONFENGE_WEB` |
| `confenge.inbound.v1` body | `source` | `CONFENGE_WEB` |
| Warmbly ingest example | `source` | illustrated as `web-cfg` — shipped value is `CONFENGE_WEB` |

Join key: `lead_id` / `receipt_id` (same value). Attribution that crosses the circuit when present: `route_family`, `asset_id`, `cta_id`, `correlation_id`, allowlisted UTMs, sanitized `landing_url`, `contract_public_id` (from stored `public_contract_id`).

Missing snapshot facts stay absent. CNPJ is never derived from a `public_id` prefix. `public_entity_id` is sent only when the form actually provided it.

## Env

See [ENV-VARS.md](./ENV-VARS.md). Required on both sides for a live handoff:

- `CONFENGE_INBOUND_WEBHOOK_URL` — HTTPS URL ending in `/api/v1/webhooks/confenge/inbound`
- `CONFENGE_INBOUND_WEBHOOK_SECRET` — shared HMAC secret (Netlify env + Warmbly env)
- Warmbly: `CONFENGE_AUTO_SEND_ENABLED=false`

Optional: `CONFENGE_INBOUND_ALLOWED_HOSTS`, `CONFENGE_INBOUND_MAX_ATTEMPTS` (8), `CONFENGE_INBOUND_TIMEOUT_MS` (8000).

Empty URL: capture still works; handoff `SKIPPED`. Staging/prod refuse non-HTTPS, PII on the query, missing secret, or host off the allowlist (`BLOCKED`, no POST).

Non-real records (`synthetic` / `qa` / `spam` / `internal`) persist locally and skip Warmbly so probes do not mint an INBOUND NOW action.

## Ops

- Counters (auth): `GET /.netlify/functions/ops?action=inbound_handoff`
- Drain due rows: `POST /.netlify/functions/ops?action=drain_inbound`
- Daily schedule calls drain when `OPS_TOKEN` is set.

States: `PENDING | DELIVERED | RETRYABLE | DEAD | BLOCKED | SKIPPED`.

## Rollback

1. Unset `CONFENGE_INBOUND_WEBHOOK_URL` and/or `CONFENGE_INBOUND_WEBHOOK_SECRET` in Netlify.
2. Redeploy is not required for skip: missing URL → no POST.
3. Lead capture continues (persist-first).
4. Do not point `OPS_WEBHOOK_URL` at the Warmbly inbound path.

Site-static rollback: [ROLLBACK.md](./ROLLBACK.md). Blobs of persisted leads are not deleted.

## Synthetic

Only when the inbound URL is reachable, the shared secret is set on both sides, and Warmbly auto-send is proven off. Use a clearly labeled synthetic (`SYNTHETIC-INBOUND`, `@example.com`). Do not generate a real contact. If any precondition is missing, record the exact blocker — do not fake INBOUND NOW.

Non-real records persist and **SKIP** Warmbly. A synthetic 201 is capture proof, not INBOUND NOW.

### Money-asset proof harness

```text
node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br
# or
npm run probe:money-asset:prod
```

This is the #60 probe (not `probe:lead`, which is jornada=operacao). It writes PROVEN/BLOCKED/UNKNOWN per step and exits non-zero unless capture + replay + INBOUND NOW + auto-send OFF are all proven.

If env is missing here:

```text
# Netlify production
CONFENGE_INBOUND_WEBHOOK_URL=https://<warmbly-host>/api/v1/webhooks/confenge/inbound
CONFENGE_INBOUND_WEBHOOK_SECRET=<shared>
# Warmbly
CONFENGE_AUTO_SEND_ENABLED=false
# This shell, to read ops counters
export OPS_TOKEN='<production ops token>'
export CONFENGE_AUTO_SEND_EVIDENCE=OFF
node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br /tmp/prod-proof.json
```

Ops chain (auth): `GET /.netlify/functions/ops?action=inbound_handoff` and `analytics_summary` expose `money_asset.events` (`asset_view` → `contract_analyzed` → `cta_view` → `cta_click` → `lead_created`) plus `money_asset.handoff` (`delivered`/`blocked`/`pending`/`retryable`/`skipped`/`dead`). No PII.

The next irreversible proof is a real qualified lead or a real rejection — not another synthetic.
