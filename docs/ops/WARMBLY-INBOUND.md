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
- Warmbly: `CONFENGE_AUTO_SEND_ENABLED=false`

Optional: `CONFENGE_INBOUND_ALLOWED_HOSTS`, `CONFENGE_INBOUND_MAX_ATTEMPTS` (8), `CONFENGE_INBOUND_TIMEOUT_MS` (8000).

Keep the shared secret server-side only. Do not expose either the secret or a
signed inbound request to browser code.

Empty URL: capture still works; handoff `SKIPPED`. Non-HTTPS in staging/prod, PII on the query, missing secret, or host off the allowlist is `BLOCKED` (no POST).

Non-real records (`synthetic` / `qa` / `spam` / `internal`) persist locally and skip Warmbly so probes never manufacture a commercial action.

## Ops

- Counters and safe configuration state (auth): `GET /.netlify/functions/ops?action=inbound_handoff`.
  The response exposes only the versioned destination fingerprint
  (`WARMBLY_PRODUCTION_V1`, `UNEXPECTED`, or `MISSING`), never the configured URL.
- Production accepts the endpoint only as the exact string shown above; an
  explicit default port, credential, query, fragment, trailing slash, encoded
  path or other URL normalization is `UNEXPECTED` and remains fail-closed.
- The #267 proof sends `OPS_TOKEN` only to the exact canonical CONFENGE base and
  persists schema-closed numeric aggregates/category allowlists. A caller-
  controlled base, raw runtime object, arbitrary category or transport error is
  never written into the evidence artifact.
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

The committed issue-268 decision is `DEFER`, so execution currently returns
`409 backlog_policy_blocked` before mutation. A future execution requires a
separate versioned single-case authority that references the frozen decision
digest, records owner approval, proves the issue-267 reconciliation and sets an
exact approval reference. That authority carries only a non-reversible binding
digest for the approved join-key pair, never the raw `lead_id` or `receipt_id`,
and its approval window is at most 24 hours. Runtime also requires `limit=1`,
age at most 30 days and re-probes the Warmbly health endpoint server-side. It refuses to mutate
unless the configured contract is `READY`, `auto_send_enabled=false` and
`dispatch_attempted=false`:

```bash
# Future canary, only after a separate execution authority is committed.
curl -fsS -X POST 'https://confenge.com.br/.netlify/functions/ops?action=requeue_inbound' \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"mode":"eligible_only","dry_run":false,"limit":1,"approval_reference":"INBOUND-268-APPROVAL-v1"}'

# Only after reviewing the canary result:
curl -fsS -X POST 'https://confenge.com.br/.netlify/functions/ops?action=drain_inbound' \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"limit":1}'
```

The scheduled drain cannot bypass the policy: historical backlog rows carry a
versioned record-bound marker, are re-authorized, binding-checked, age-checked
and safety-probed immediately before delivery, with at most one backlog attempt per drain. The general drain
still aborts on `401/403` and on an abnormal retryable failure rate. Repeating
requeue does not move `PENDING` or `DELIVERED` rows.
Warmbly uses the same `lead_id` as its durable idempotency key, so a transport
retry cannot create a second commercial action.

## Rollback

1. Unset `CONFENGE_INBOUND_WEBHOOK_URL` and/or `CONFENGE_INBOUND_WEBHOOK_SECRET` in Netlify.
2. Redeploy is not required for skip: missing URL → no POST.
3. Lead capture continues (persist-first).
4. Do not point `OPS_WEBHOOK_URL` at the Warmbly inbound path.

Site-static rollback: [ROLLBACK.md](./ROLLBACK.md). Blobs of persisted leads are not deleted.

## Synthetic

Only when the inbound URL is reachable, the shared secret is set on both sides, and Warmbly auto-send is proven off. Use a clearly labeled synthetic (`SYNTHETIC-INBOUND`, `@example.com`). Do not generate a real contact. If any precondition is missing, record the exact blocker — do not fake INBOUND NOW.

Non-real records persist and **SKIP** Warmbly. A synthetic `201` proves capture only; it cannot prove the commercial handoff or close #230.

### Money-asset proof harness

```text
node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br
# or
npm run probe:money-asset:prod
```

This is the #60 probe (not `probe:lead`, which is jornada=operacao). It writes
PROVEN/BLOCKED/UNKNOWN per step. Synthetic capture and replay can pass, but the
full loop remains blocked until one genuine consented lead is reconciled with a
Warmbly receipt/action while auto-send is off.

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
