# Warmbly inbound handoff (`confenge.inbound.v1`)

Consume-only pointer to the destination contract. Do not invent a parallel version.

- Warmbly PR: https://github.com/tjsasakifln/warmbly/pull/71
- Contract: `docs/confenge/inbound-ingest.md` on that PR
- Canonical endpoint: `POST https://api.confenge.com.br/api/v1/webhooks/confenge/inbound`
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

- `CONFENGE_INBOUND_WEBHOOK_URL=https://api.confenge.com.br/api/v1/webhooks/confenge/inbound`
- `CONFENGE_INBOUND_WEBHOOK_SECRET` — shared HMAC secret (Netlify env + Warmbly env)
- `CONFENGE_INBOUND_CANARY_ENABLED=1`
- `CONFENGE_INBOUND_CANARY_ASSET_ID=diagnostico-defesa-margem`
- Warmbly: `CONFENGE_AUTO_SEND_ENABLED=false`

Optional: `CONFENGE_INBOUND_ALLOWED_HOSTS`, `CONFENGE_INBOUND_MAX_ATTEMPTS` (8), `CONFENGE_INBOUND_TIMEOUT_MS` (8000).

Keep the shared secret server-side only. Do not expose either the secret or a
signed inbound request to browser code.

Flag off or empty URL: capture still works; handoff `SKIPPED`. A canary asset other than `diagnostico-defesa-margem`, non-HTTPS in staging/prod, PII on the query, missing secret, or host off the allowlist is `BLOCKED` (no POST).

Non-real records (`synthetic` / `qa` / `spam` / `internal`) persist locally and skip Warmbly. The only exception is a synthetic receipt with all three guards: valid `X-Confenge-Probe`, `record_kind=synthetic`, and `CONFENGE_INBOUND_SYNTHETIC_CANARY_ENABLED=1`. Warmbly persists it as synthetic and excludes it from the real queue and denominators.

## Ops

- Counters and safe configuration state (auth): `GET /.netlify/functions/ops?action=inbound_handoff`
- Aggregate historical audit (auth): `GET /.netlify/functions/ops?action=audit_inbound_requeue`
- Strict historical recovery (auth): `POST /.netlify/functions/ops?action=requeue_inbound`
- Drain due rows: `POST /.netlify/functions/ops?action=drain_inbound`
- Daily schedule calls drain when `OPS_TOKEN` is set.

The authenticated response reports only `SET | UNSET` for the webhook URL and
secret, plus the resolved contract state `READY | UNSET | BLOCKED`. It never
returns either value. A committed value or a local shell variable is not proof
of the Netlify production environment; use this response after the production
deploy.

States: `PENDING | DELIVERED | RETRYABLE | DEAD | BLOCKED | SKIPPED`.

### Recovering historical `SKIPPED/not_configured`

The common drain never consumes `SKIPPED`. Historical recovery is a separate,
fail-closed operation. Start with the aggregate-only audit, then dry-run:

```bash
curl -fsS 'https://confenge.com.br/.netlify/functions/ops?action=audit_inbound_requeue' \
  -H "Authorization: Bearer $OPS_TOKEN"

curl -fsS -X POST 'https://confenge.com.br/.netlify/functions/ops?action=requeue_inbound' \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"mode":"eligible_only","dry_run":true}'
```

The response is counts only. A row is automatically eligible only when it is
exactly `SKIPPED/not_configured`, explicitly `record_kind=real`, explicitly
consented, has a valid join ID, is not DNC/suppressed and has no test identity.
Missing legacy kind or consent requires manual review. Non-real, QA, internal,
spam and reserved test identities are never requeued.

While this canary is active, mutation is narrower than the aggregate audit:
`canary_eligible_count` and the selected rows also must carry
`asset_id=diagnostico-defesa-margem` and pass the exact server-side canary
configuration. An eligible row from any other route is not changed to `PENDING`.

Execution requires an explicit bounded limit (`1..20`) and re-probes the
Warmbly health endpoint server-side. It refuses to mutate unless the configured
contract is `READY`, `auto_send_enabled=false` and `dispatch_attempted=false`:

```bash
# Canary: requeue at most one eligible row. This does not drain automatically.
curl -fsS -X POST 'https://confenge.com.br/.netlify/functions/ops?action=requeue_inbound' \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"mode":"eligible_only","dry_run":false,"limit":1}'

# Only after reviewing the canary result:
curl -fsS -X POST 'https://confenge.com.br/.netlify/functions/ops?action=drain_inbound' \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"limit":1}'
```

The drain aborts the remaining batch on `401/403` and on an abnormal retryable
failure rate. Repeating requeue does not move `PENDING` or `DELIVERED` rows.
Warmbly uses the same `lead_id` as its durable idempotency key, so a transport
retry cannot create a second commercial action.

## Rollback

1. Set `CONFENGE_INBOUND_CANARY_ENABLED=0` in Netlify (primary kill switch).
2. Optionally unset `CONFENGE_INBOUND_WEBHOOK_URL` and/or `CONFENGE_INBOUND_WEBHOOK_SECRET`.
3. Redeploy is not required for skip: flag off or missing URL → no POST.
4. Lead capture continues (persist-first).
5. Do not point `OPS_WEBHOOK_URL` at the Warmbly inbound path.

Site-static rollback: [ROLLBACK.md](./ROLLBACK.md). Blobs of persisted leads are not deleted.

## Synthetic

Only when the inbound URL is reachable, the shared secret is set on both sides, and Warmbly auto-send is proven off. Use a clearly labeled synthetic (`SYNTHETIC-INBOUND`, `@example.com`). Do not generate a real contact. If any precondition is missing, record the exact blocker — do not fake INBOUND NOW.

Default: non-real records persist and **SKIP** Warmbly. For the approved production proof only, enable `CONFENGE_INBOUND_SYNTHETIC_CANARY_ENABLED=1`, submit through the authenticated harness, reconcile the same receipt in both systems, then switch the flag off. The receipt remains explicitly synthetic and excluded from real pipeline metrics.

### Money-asset proof harness

```text
node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br
# or
npm run probe:money-asset:prod
```

This is the #60 probe (not `probe:lead`, which is jornada=operacao). It writes
PROVEN/BLOCKED/UNKNOWN per step and exits non-zero unless capture + replay + the
same synthetic receipt in web-cfg and Warmbly + auto-send OFF are all proven.
That proves the transport pipeline only; it does not increment or claim a real
qualified `INBOUND NOW` opportunity.

If env is missing here:

```text
# Netlify production
CONFENGE_INBOUND_WEBHOOK_URL=https://api.confenge.com.br/api/v1/webhooks/confenge/inbound
CONFENGE_INBOUND_WEBHOOK_SECRET=<shared>
# Warmbly
CONFENGE_AUTO_SEND_ENABLED=false
# This shell, to read ops counters
export OPS_TOKEN='<production ops token>'
export CONFENGE_AUTO_SEND_EVIDENCE=OFF
node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br /tmp/prod-proof.json
```

Ops chain (auth): `GET /.netlify/functions/ops?action=inbound_handoff` and `analytics_summary` expose `money_asset.events` (`asset_view` → `contract_analyzed` → `cta_view` → `cta_click` → `lead_persisted`, with compatibility key `lead_created`) plus `money_asset.handoff` (`delivered`/`blocked`/`pending`/`retryable`/`skipped`/`dead`). No PII.

The next irreversible proof is a real qualified lead or a real rejection — not another synthetic.
