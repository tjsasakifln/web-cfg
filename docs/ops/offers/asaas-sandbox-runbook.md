# Asaas Sandbox adapter runbook

Fail-closed Sandbox increment for web-cfg #88. Manual-first local journey is unchanged. This adapter is invoked only by the new functions `offer-checkout-sandbox` and `asaas-webhook-sandbox`.

**Proof class for this increment:** `CONTRACT_PROVEN`.  
**Remote class if credentials later exist:** `SANDBOX_LIVE_PROVEN` (alias `SANDBOX_PROVEN`).  
**Never:** `PRODUCTION_PROVEN`.

Declaration: no production endpoint, no real money, no public activation, no real PII.

#88 stays open. Publication, production key/webhook, and every real charge remain human gates (Governance#1).

## Official documentation consulted

Retrieved **2026-08-17**. Excerpts are contractual, not secrets. No real token is copied.

| Topic | URL | Doc `updatedAt` | Contractual excerpt |
| --- | --- | --- | --- |
| Sandbox host | https://docs.asaas.com/docs/sandbox | 2026-08-03 | Sandbox base `https://api-sandbox.asaas.com/v3`. Production base `https://api.asaas.com/v3`. Accounts, data and keys are not shared. |
| Authentication | https://docs.asaas.com/docs/autentica%C3%A7%C3%A3o | 2026-07-29 | Header is `access_token`, **not** `Authorization: Bearer`. Sandbox key prefix `$aact_hmlg_`. Production prefix `$aact_prod_`. |
| Checkout guide | https://docs.asaas.com/docs/asaas-checkout | 2026-06-30 | `POST /v3/checkouts`. `chargeTypes`: DETACHED / RECURRENT / INSTALLMENT. Creating a checkout is **not** payment. |
| Create checkout | https://docs.asaas.com/v3/reference/criar-novo-checkout | 2026-06-29 | Checkout `subscription` DTO has `cycle`, `endDate`, `nextDueDate` only. **No `maxPayments`.** Item `name` max 30. `callback` required. |
| Create subscription | https://docs.asaas.com/reference/criar-nova-assinatura | 2026-07-14 | `POST /v3/subscriptions` documents `maxPayments`. OpenAPI 3.0.0. Creating a subscription is not receipt of payment. |
| Create customer | https://docs.asaas.com/reference/create-new-customer | 2026-06-03 | `POST /v3/customers`. Duplicates are allowed; search `cpfCnpj` first. Do not use real third-party data (Sandbox may send notifications). |
| Retrieve payment | https://docs.asaas.com/reference/recuperar-uma-unica-cobranca | 2026-06-03 | `GET /v3/payments/{id}`. GET must have an empty body. Not a monitoring loop; use webhooks. |
| Webhooks | https://docs.asaas.com/docs/sobre-os-webhooks | 2026-06-25 | POST, at-least-once, persist event `id`, authenticate `asaas-access-token`, return 2xx quickly. |
| Payment events | https://docs.asaas.com/docs/payment-events | 2026-06-22 | Official names include CREATED, CONFIRMED, RECEIVED, OVERDUE, REFUNDED, DELETED. CONFIRMED ≠ funds available; RECEIVED = funds available. |
| Checkout events | https://docs.asaas.com/docs/checkout-events | 2026-06-22 | CHECKOUT_CREATED, CHECKOUT_CANCELED, CHECKOUT_EXPIRED, CHECKOUT_PAID. Idempotency field is `id`. |

Official request-level idempotency header was **not** found in the current docs. Local deterministic key + store put-if-absent is the required mechanism.

## Mode matrix

| Mode / input | Result |
| --- | --- |
| `ASAAS_MODE` unset / `disabled` (default) | 404 `feature_disabled` |
| `ASAAS_MODE=sandbox` without `CONFENGE_OFFER_SANDBOX_ENABLED=true` | 403 `sandbox_flag_required` |
| `ASAAS_MODE=sandbox` + flag, no admin token | 401 |
| `ASAAS_MODE=sandbox` + flag + admin, no `ASAAS_SANDBOX_API_KEY` | 503 `sandbox_secret_missing` |
| `ASAAS_MODE` anything else (including `production`) | fail closed `asaas_mode_blocked` |
| `ASAAS_SANDBOX_BASE_URL` pointing at `api.asaas.com` | 403 `production_base_url_blocked` |
| `$aact_prod_` key in a Sandbox var | 403 `production_key_blocked` |
| Redirect / final URL / checkout `link` to production host | blocked |
| `CONFENGE_OFFER_CATALOG_PUBLIC` | remains `false` |
| Production checkout / webhook / real-money flags | remain `false`; if forced on, config fails closed |

Production variables (`ASAAS_API_KEY`, `ASAAS_ACCESS_TOKEN`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL`) are never read as fallback.

## Allowlisted hosts

- API: `https://api-sandbox.asaas.com` and `https://api-sandbox.asaas.com/v3`
- Returned checkout link: `https://sandbox.asaas.com/...` only
- Blocked: `api.asaas.com`, `www.asaas.com`, `asaas.com`

## Request flow

```
POST /offer-checkout-sandbox
        ↓
method + ASAAS_MODE + sandbox flag + admin token (constant-time)
        ↓
parse JSON / size limit / allowlisted fixture PII
        ↓
registry offer_id + eligibility/capacity (read/import only)
        ↓
deterministic correlation_id + idempotency key (no PII)
        ↓
durable store put-if-absent
        ↓
Asaas Sandbox only:
  CFG-DIAG-EXP-v1 → POST /v3/checkouts DETACHED
  CFG-DIRB2G-180-v1 / 365 → POST /v3/subscriptions + maxPayments
  Flex / unbounded RECURRENT / INSTALLMENT / invented endDate
        → UNSUPPORTED_OFFER_BILLING_SHAPE
        ↓
minimize id/link + emit confenge.commercial_event.v1 checkout_created
  financial_confirmation=false  revenue=false
```

Webhook:

```
POST /asaas-webhook-sandbox
        ↓
flag + official header asaas-access-token only (constant-time)
  query / Authorization / x-webhook-token / access_token are not substitutes
        ↓
size + JSON + require provider event id
        ↓
put-if-absent processed:{id} applied:false
        ↓
map official event → existing canonical type
        ↓
status machine on object:{payment|checkout id}
  unknown → retained, never payment/revenue
  same status → idempotent
  forward → apply
  regressive / impossible → blocked, object unchanged
        ↓
put-if-absent canonical event, then mark applied:true
  append failure leaves applied:false so retry completes (HTTP 500 apply_incomplete)
        ↓
no additional mutating provider call
```

## Enable / disable

Defaults stay off. Merge of this PR does **not** authorize real charging, production checkout, production webhook, or any mutation of real money.

| Intent | Action |
| --- | --- |
| Keep disabled (default) | Leave `ASAAS_MODE` unset or `disabled`. Leave `CONFENGE_OFFER_SANDBOX_ENABLED` unset/false. |
| Enable Sandbox only | Human sets `ASAAS_MODE=sandbox` **and** `CONFENGE_OFFER_SANDBOX_ENABLED=true` **and** Sandbox secrets in the function environment. Both flags required. |
| Disable immediately | Unset both flags. Functions return 404 `feature_disabled` without calling Asaas. |
| Never enable production from this increment | `ASAAS_MODE=production`, `CONFENGE_PRODUCTION_CHECKOUT`, `CONFENGE_PRODUCTION_WEBHOOK`, `CONFENGE_REAL_MONEY` fail closed. |

Default API base is `https://api-sandbox.asaas.com/v3`. Production hosts (`api.asaas.com`, `www.asaas.com`, `asaas.com`) and `$aact_prod_` keys are rejected.

## Environment (Sandbox only)

Set in the function environment when a human later authorizes a Sandbox proof. Defaults stay off. Validate with `resolveConfig` / `requireSandboxRuntime`.

| Variable | Default | Validation |
| --- | --- | --- |
| `ASAAS_MODE` | `disabled` | only `disabled` or `sandbox` |
| `CONFENGE_OFFER_SANDBOX_ENABLED` | false | must be `true`/`1` for runtime |
| `ASAAS_SANDBOX_API_KEY` | empty | required for checkout; `$aact_hmlg_` (or `test_` in contract); `$aact_prod_` blocked |
| `ASAAS_SANDBOX_BASE_URL` | `https://api-sandbox.asaas.com/v3` | HTTPS + `api-sandbox.asaas.com` only |
| `ASAAS_SANDBOX_WEBHOOK_TOKEN` | empty | required for webhook; compared only to header `asaas-access-token` |
| `CONFENGE_OFFER_SANDBOX_ADMIN_TOKEN` | empty | required for checkout; header `x-confenge-sandbox-admin-token` |
| `ASAAS_SANDBOX_TIMEOUT_MS` | 8000 | clamped 500–20000 |
| `ASAAS_SANDBOX_STORE_DIR` | unset | optional file store for local/remote proof |

Production names (`ASAAS_API_KEY`, `ASAAS_ACCESS_TOKEN`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL`) are never read as fallback.

Do not persist keys. Do not request or create credentials from this increment.

## Tests

Hermetic contract (injected HTTP, no network, classified `CONTRACT_PROVEN`):

```bash
node tests/offers/asaas-sandbox/test_asaas_sandbox.mjs
node tests/offers/test_offers.mjs
```

Do not add an npm script; `package.json` stays untouched.

## Future Sandbox live proof (remote)

If — and only if — `ASAAS_SANDBOX_API_KEY`, `ASAAS_SANDBOX_WEBHOOK_TOKEN` and `CONFENGE_OFFER_SANDBOX_ADMIN_TOKEN` are already present in the environment:

```bash
ASAAS_MODE=sandbox \
CONFENGE_OFFER_SANDBOX_ENABLED=true \
node tests/offers/asaas-sandbox/live-proof.mjs
```

That command must use only `data/offers/fixtures/asaas-sandbox` identities, redact request/response, replay checkout and webhook, write a SHA256 manifest, and classify `SANDBOX_LIVE_PROVEN`. Cancel the Sandbox artifact if the API allows (`cancel checkout` / remove subscription) and the operator confirms.

If those variables are absent: do not ask, do not create, do not search files. Record `SANDBOX_CREDENTIALS_NOT_PRESENT` / `SANDBOX_REMOTE_RUN=NOT_CONFIGURED`. Absence of remote credentials does not block merge of the fail-closed hermetic increment.

## Rotate a secret without recording it

1. Generate the new Sandbox API key or webhook token in the Asaas Sandbox console. Do not paste it into git, fixtures, tickets, PR bodies or chat.
2. Write the new value only into the host EnvironmentFile (`/etc/confenge-web/runtime.env`) or the local secret store. Overwrite the old name in place. Do not use the leftover Netlify UI as production env.
3. Confirm rotation by invoking the hermetic suite (injected token) or a single admin checkout that returns 201/401 — never by printing the secret.
4. Logs and HTTP responses run through `redactProviderPayload`. If a log line would contain `$aact_` or the raw token, treat it as an incident; do not copy the line into the PR.
5. Old token is invalid immediately. In-flight Sandbox webhooks with the old header receive 401 and Asaas retries after you update the Sandbox webhook config to the new token.

## Inspect / reprocess a Sandbox webhook

Inspect (Sandbox namespace only):

- Processed record: store key `processed:<provider_event_id>` (`applied`, `decision`, `object_status`, `environment: sandbox`).
- Canonical event: `event:<event_id>` (id is a hash of the provider event id).
- Payment/checkout object: `object:<asaas payment or checkout id>`.
- File store: `ASAAS_SANDBOX_STORE_DIR` (hashed filenames). Blobs: store name `confenge-offers-sandbox`, key prefix `offers-sandbox/`.
- Responses include `environment: "sandbox"`, `transition` (`applied` / `idempotent` / `blocked` / `retained`) and `object_status`.

Reprocess:

- Safe retry is the same POST. If `applied:true`, response is 200 `duplicate` and the state machine does not run again.
- If apply crashed (`applied:false` / HTTP 500 `apply_incomplete`), the same event POST completes the append + transition deterministically.
- Do not delete `processed:` records to force a second apply. That can double-append only if the canonical `event:` put-if-absent is also removed; leave evidence in place.
- Unknown and blocked events stay audited. They never become payment or revenue.

## Distinguish Sandbox from production

| Surface | Sandbox signal | Production is not this increment |
| --- | --- | --- |
| Function names | `offer-checkout-sandbox`, `asaas-webhook-sandbox` | no production checkout/webhook function ships here |
| JSON body | `environment: "sandbox"` | never `production` |
| Logs | `environment: "sandbox"`, User-Agent `CONFENGE-web-cfg/asaas-sandbox` | no production UA |
| Hosts | `api-sandbox.asaas.com`, checkout link `sandbox.asaas.com` | `api.asaas.com` / `www.asaas.com` / `asaas.com` blocked |
| Store | `confenge-offers-sandbox` / `offers-sandbox/` | no read/write of a financial ledger |
| Proof class | `CONTRACT_PROVEN` or `SANDBOX_LIVE_PROVEN` | never `PRODUCTION_PROVEN` |
| Revenue flags | `payment=false`, `revenue=false`; checkout-created is not payment | Sandbox RECEIVED is not real revenue |

UI/catalog remains unpublished (`CONFENGE_OFFER_CATALOG_PUBLIC=false`). There is no production checkout button.

## Clean Sandbox data without touching real evidence

- Namespace is exclusively Sandbox (`confenge-offers-sandbox`, `offers-sandbox/`, `ASAAS_SANDBOX_STORE_DIR`). There is no production ledger in this repository.
- Default TTL is 48 hours on reservations. TTL expiry is not a license to wipe audit rows you still need for a Sandbox incident.
- To reset a **Sandbox** proof directory: delete only `ASAAS_SANDBOX_STORE_DIR` or the `confenge-offers-sandbox` blob store. Do not delete lead-store, Warmbly, or any production blob/store.
- Do not cancel, refund or delete production Asaas objects. This increment cannot reach production hosts.

## Remaining gates before production money

Merge of this PR does **not** authorize charging real money. Issue **#88 stays open**. Still required, each with a named human approver:

- Production Asaas account, API key (`$aact_prod_`), webhook URL/token and DNS (`api.confenge.com.br` / `/webhooks/asaas`) — naming only was approved; deploy is not.
- Legal terms, forum, early-exit formula and enforceability (counsel).
- Tax / NFS-e / CNAE / municipal item (accountant).
- Capacity inventory, overbooking controls and onboarding after first confirmed payment.
- Public catalog publication and brand/legal copy.
- Reconciliation consumer (Warmbly #47) and exception queue.
- Monitoring, secret rotation drill, rollback and kill-switch evidence on production flags.
- Individual authorization for every real charge, refund or cancellation.

Until those gates close, keep `ASAAS_MODE=disabled` in production.

## Storage

Function runtime requires durable put-if-absent (`@netlify/blobs` `onlyIfNew`, same pattern as `lead-store.cjs`). Process memory is not a serverless dedupe guarantee. If Blobs are unavailable the functions return 503 `store_unavailable`.

Canonical webhook apply is receive (`applied:false`) then put-if-absent event then object transition then `applied:true`. A crash between receive and apply is retried; a replay after apply is a no-op.

Test stores: in-memory or temp files.

## Future core integration

`journey.cjs` / `sandbox.cjs` were not edited. Wire the adapter later by importing `createAsaasSandboxProvider` from those modules after a human gate. The new functions already invoke the adapter directly. These functions do not emit public CORS; they are admin/webhook server-to-server endpoints.

## Rollback

Leave `ASAAS_MODE=disabled` and `CONFENGE_OFFER_SANDBOX_ENABLED` unset. Delete the two functions and `scripts/offers/providers/**` + `scripts/offers/stores/**` if the increment must be removed. No public page or catalog change to revert.
