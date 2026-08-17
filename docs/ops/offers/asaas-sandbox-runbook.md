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
flag + asaas-access-token (constant-time) + size + JSON
        ↓
require provider event id
        ↓
put-if-absent processed:{id}
        ↓
map official event → existing canonical type
        ↓
unknown → commercial_exception / UNKNOWN
pending/created → never paid
checkout_created → never revenue
        ↓
no additional mutating provider call
```

## Environment (Sandbox only)

Set in the function environment when a human later authorizes a Sandbox proof. Defaults stay off.

- `ASAAS_MODE=disabled|sandbox`
- `CONFENGE_OFFER_SANDBOX_ENABLED=false`
- `ASAAS_SANDBOX_API_KEY` (`$aact_hmlg_…` only)
- `ASAAS_SANDBOX_BASE_URL` optional, allowlisted
- `ASAAS_SANDBOX_WEBHOOK_TOKEN`
- `CONFENGE_OFFER_SANDBOX_ADMIN_TOKEN`

Do not persist keys. Do not request or create credentials from this increment.

## Tests

Contract (injected HTTP, classified `CONTRACT_PROVEN`):

```bash
node tests/offers/asaas-sandbox/test_asaas_sandbox.mjs
node tests/offers/test_offers.mjs
```

Do not add an npm script; `package.json` stays untouched.

## Future Sandbox live proof

If — and only if — `ASAAS_SANDBOX_API_KEY`, `ASAAS_SANDBOX_WEBHOOK_TOKEN` and `CONFENGE_OFFER_SANDBOX_ADMIN_TOKEN` are already present in the environment:

```bash
ASAAS_MODE=sandbox \
CONFENGE_OFFER_SANDBOX_ENABLED=true \
node tests/offers/asaas-sandbox/live-proof.mjs
```

That command must use only `data/offers/fixtures/asaas-sandbox` identities, redact request/response, replay checkout and webhook, write a SHA256 manifest, and classify `SANDBOX_LIVE_PROVEN`. Cancel the Sandbox artifact if the API allows (`cancel checkout` / remove subscription) and the operator confirms.

If those variables are absent: do not ask, do not create, do not search files. Record `SANDBOX_CREDENTIALS_NOT_PRESENT`.

## Storage

Function runtime requires durable put-if-absent (`@netlify/blobs` `onlyIfNew`, same pattern as `lead-store.cjs`). Process memory is not a serverless dedupe guarantee. If Blobs are unavailable the functions return 503 `store_unavailable`.

Test stores: in-memory or temp files.

## Future core integration

`journey.cjs` / `sandbox.cjs` were not edited. Wire the adapter later by importing `createAsaasSandboxProvider` from those modules after a human gate. The new functions already invoke the adapter directly.

## Rollback

Leave `ASAAS_MODE=disabled` and `CONFENGE_OFFER_SANDBOX_ENABLED` unset. Delete the two functions and `scripts/offers/providers/**` + `scripts/offers/stores/**` if the increment must be removed. No public page or catalog change to revert.
