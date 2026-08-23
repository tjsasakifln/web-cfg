# BOFU production closure — 2026-08-22

Status at this commit: `BOFU_GUARDS_COHERENT` and
`BOFU_COMMERCIAL_DOD_GENERALIZED`. Production handoff is intentionally not
claimed without a consented real contact and an observable Warmbly receipt.

## Provenance and decision gate

- `BASE_SHA`: `2086e7138d87d9fe92f509b4748b1e59e7260107`
- `FINAL_SHA`: `f3319adf684e842d60bb696f47e34e48ddbdae94`
- Repository/public authority: `tjsasakifln/web-cfg`, `confenge.com.br`
- Affected ADR: `ADR-STRAT-002`; no boundary change, so no ADR amendment
- Decision state: `EXECUTE_NOW`
- Executive front: `COMPOUNDING SYSTEM`, supporting `REVENUE NOW`
- Time to evidence: code and guards in this change; production configuration
  state immediately after deploy; real-loop evidence only after a real visitor
  gives consent
- Leverage: automation, revenue and trust
- North Star: qualified commercial opportunity; form count, message count and
  page count do not substitute for it
- Repetition test: 100 registered loops reuse one evaluator and improve a
  common contract. They do not require 100 copied scripts. One hundred
  synthetic submissions still create zero commercial evidence.

Visitor job: a B2G buyer can understand a contractual offer without SLA drift,
take an attributable next action and enter a persist-first commercial handoff.

Acquisition/conversion hypothesis: coherent contractual claims plus a reusable,
fail-closed loop contract reduce semantic loss between commercial surface,
capture and Warmbly. This change does not claim demand or pipeline lift.

Data owner/contract: offer facts come from
`data/offers/catalog.snapshot.json`; commercial loops come from
`data/money_asset/commercial-loops.v1.json`; web-cfg persists capture and emits
`confenge.inbound.v1` with source `CONFENGE_WEB`; Warmbly owns receipt, action
and downstream outcome. All reads from the destination were operational and
read-only. No PII is committed here.

## #231 — contractual SLA semantics

Status: `PASS`.

The authoritative snapshot contains `sla_business_days: "10-15"`. The public
claim is generated into a bounded HTML block as `Prazo de entrega: 10 a 15 dias
úteis`, with the contractual start event preserved: acceptance, financial
confirmation, necessary inputs and initial meeting or written waiver.

`scripts/offers/contractual_claims.cjs` parses the snapshot interval, renders
the claim and fails `--check` when the checked-in HTML drifts. The adversarial
organic audit now compares an interval as an interval, not as a set of numeric
tokens. A catalog SLA with no rendered delivery claim also fails closed.

Explicit fixtures:

| Claim | Expected | Observed |
| --- | --- | --- |
| `10–15 dias úteis` | PASS | PASS |
| `10 a 15 dias úteis` | PASS | PASS |
| `entre 10 e 15 dias úteis` | PASS | PASS |
| `até 15 dias úteis` | FAIL | `SLA_NOT_IN_CATALOG` |
| `15 dias úteis` | FAIL | `SLA_NOT_IN_CATALOG` |
| `10 dias úteis` | FAIL | `SLA_NOT_IN_CATALOG` |
| `5–15 dias úteis` | FAIL | `SLA_NOT_IN_CATALOG` |
| `10–20 dias úteis` | FAIL | `SLA_NOT_IN_CATALOG` |
| `até 10 dias úteis` | FAIL | `SLA_NOT_IN_CATALOG` |

An authoritative snapshot change changes the generated expectation and makes
`test:offers` fail until the HTML is regenerated coherently.

## #233 — `priceValidUntil` specification reconciliation

Status: `PASS`, fail closed.

The original acceptance is refined to the only non-invented rule:

```text
real expiry present → emit priceValidUntil
expiry UNKNOWN/absent → omit property
never infer
```

Only `price_valid_until` or `effective_to` can authorize the property. A real
ISO date is emitted; absence omits it; an attempted options-layer fallback is
ignored; malformed authoritative expiry throws. Availability remains:

- `APPROVED + kill_switch=false + capacity_required=false` → `InStock`
- `kill_switch=true` → `SoldOut`

The current snapshot has no real expiry, so omission is correct.

## #239 — generalized Commercial DoD

Status: `EXECUTE_NOW`, `PASS` for generalization, `BLOCKED` for real outcomes.

The versioned registry declares two enabled real loops evaluated by one pure
decision mechanism:

1. `defesa-margem-segunda-leitura`:
   `/ferramentas/diagnostico-defesa-margem/` →
   `/defesa-margem-contratos-publicos/`
2. `defesa-tecnica-handraise`:
   `/defesa-tecnica-contratos-publicos/` → on-page `#captura-pilar`

Both have `surface_ready=true`, `capture_ready=true` and
`attribution_ready=true`. Both remain `handoff_ready=false`,
`commercial_event=false` and `qualified_pipeline="UNKNOWN"` pending real
operational evidence. The evaluator receives facts as input and performs no
HTTP or environment reads. Tests prove that a third registry row uses the same
evaluator, and that `synthetic`, `qa`, `spam` and `internal` never become
pipeline.

Deterministic per-loop evidence:
`docs/evidence/commercial-dod/loops.v1.json`.

## #230 — maximum honest production state

### Authority-separated environment state

No secret value was read, printed or committed.

| Item | Local shell | Production authority | Evidence |
| --- | --- | --- | --- |
| `CONFENGE_INBOUND_WEBHOOK_URL` | `UNSET` | `UNKNOWN` until the new authenticated safe state is deployed | committed value is not env proof |
| `CONFENGE_INBOUND_WEBHOOK_SECRET` | `UNSET` | `UNKNOWN` until the new authenticated safe state is deployed | committed value is not env proof |
| `OPS_TOKEN` | `UNSET` | `SET` in GitHub Actions | authenticated ops proof run succeeded |
| `REVOPS_TOKEN` | `UNSET` | `SET` in GitHub Actions | secret name only |
| `CONFENGE_AUTO_SEND_ENABLED` | `UNSET` | `false` on Warmbly host | read-only boolean check over `ec-prod` |
| Warmbly inbound secret | not applicable | `SET` on Warmbly host | read-only presence check over `ec-prod` |

The web-cfg authenticated `inbound_handoff` response now exposes only safe
`SET | UNSET` presence and `READY | UNSET | BLOCKED` contract state. It never
returns URL or secret values. The post-deploy workflow is the authority for the
two Netlify states above.

### Production observations before this deploy

- GitHub Actions run
  `https://github.com/tjsasakifln/web-cfg/actions/runs/32609349404`:
  authenticated health, inbound counters and commercial-only funnel all HTTP
  200.
- Counters at the observation boundary: `persisted=123`, `delivered=0`,
  `skipped=123`, `pending=0`, `retryable=0`, `blocked=0`, `dead=0`.
- Official command:
  `node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br`.
  It produced a synthetic capture HTTP 201, idempotent replay HTTP 200 with the
  same receipt, no PII in the response and notify/email skipped. It exited 2 as
  designed because a synthetic record cannot prove Warmbly handoff.
- Unsigned POST to the canonical Warmbly endpoint returned HTTP 401. This
  proves endpoint/auth enforcement, not a valid receipt.
- `auto_send=false`: `PROVEN` on the Warmbly action host.
- `consented_real_contact=MISSING`.
- `Warmbly handoff=BLOCKED` for a real loop.
- `commercial_event=FALSE`.
- `qualified_pipeline=UNKNOWN`.

Safe artifacts:

- `docs/evidence/bofu-production-closure/inbound-counters-proof-32609349404.json`
- `docs/evidence/bofu-production-closure/money-asset-prod-proof-2026-08-23.json`
- `docs/evidence/commercial-dod/facts.closure.v1.json`

### External action contract

The two Netlify items below are provisional until the post-deploy authenticated
response resolves them. They must not be removed based on local or committed
values.

```text
ITEM:
CONFENGE_INBOUND_WEBHOOK_URL

STATE:
UNKNOWN

OWNER:
CONFENGE Netlify production operator

WHERE_TO_SET:
Netlify production environment for confenge.com.br

VERIFY:
gh workflow run revops-scheduled.yml --repo tjsasakifln/web-cfg --ref main -f job=inbound-proof

SUCCESS_EVIDENCE:
Authenticated artifact reports configuration.webhook_url=SET and configuration.contract=READY.

FAILURE_CONSEQUENCE:
Capture can persist, but the Warmbly handoff is skipped and cannot be called production-ready.
```

```text
ITEM:
CONFENGE_INBOUND_WEBHOOK_SECRET

STATE:
UNKNOWN

OWNER:
CONFENGE Netlify production operator

WHERE_TO_SET:
Netlify production environment for confenge.com.br; value must match the existing Warmbly inbound HMAC secret

VERIFY:
gh workflow run revops-scheduled.yml --repo tjsasakifln/web-cfg --ref main -f job=inbound-proof

SUCCESS_EVIDENCE:
Authenticated artifact reports configuration.webhook_secret=SET and configuration.contract=READY without exposing the value.

FAILURE_CONSEQUENCE:
The handoff is blocked or skipped; a capture receipt cannot become a Warmbly receipt.
```

```text
ITEM:
consented_real_contact

STATE:
MISSING

OWNER:
Real B2G visitor and CONFENGE commercial operator

WHERE_TO_SET:
Nowhere. Observe a genuine visitor voluntarily submitting an enabled canonical BOFU form; do not create a person or use example.com.

VERIFY:
node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br

SUCCESS_EVIDENCE:
Same real lead_id is persisted first, received by Warmbly and associated with an observable action while auto_send=false.

FAILURE_CONSEQUENCE:
The real loop remains unproven; commercial_event stays false and qualified_pipeline stays UNKNOWN.
```

```text
ITEM:
Warmbly receipt/action for a consented real contact

STATE:
BLOCKED

OWNER:
Warmbly/CONFENGE commercial operator

WHERE_TO_SET:
No manual fabrication. Observe the matching receipt/action after the real persisted lead reaches the canonical inbound endpoint.

VERIFY:
node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br

SUCCESS_EVIDENCE:
Matching lead_id/receipt_id and observable Warmbly action with no automatic outbound contact.

FAILURE_CONSEQUENCE:
Production transport and commercial action remain unproven even if all code gates are green.
```

## Quality gates

Supported runtime: Node `20.19.0`. The complete requested sequence exited 0:

| Gate | Result |
| --- | --- |
| `npm test` | PASS |
| `npm run test:bofu-dominance` | PASS, 70 tests |
| `npm run test:inbound-gates` | PASS |
| `npm run test:conversion` | PASS |
| `npm run test:analytics` | PASS |
| `npm run test:pseo-attribution` | PASS |
| `npm run test:offers` | PASS, 82 offer tests plus checkout preparation |
| `npm run test:checkout-negatives` | PASS |
| `npm run test:authority` | PASS |
| `npm run test:visible-parity` | PASS |
| `npm run test:cta-whatsapp` | PASS |
| `npm run test:sitemap-graph` | PASS, 21 tests |
| `npm run validate:seo` | PASS, 0 errors; existing warnings retained |
| `npm run organic:test` | PASS, 189 tests |
| `npm run test:lead-function` | PASS, 17 tests |
| `npm run test:inbound-handoff` | PASS, 17 tests |
| `npm run test:lead-store-production` | PASS |
| `npm run test:ops-auth` | PASS |
| explicit SLA adversarial fixtures | PASS, 3 accepted and 6 rejected as specified |

`test:ui` inside `npm test` reported `UI_GEOMETRY_UNAVAILABLE` because the
local Chromium image lacked `libnspr4`; the gate honestly records that state
and does not claim a browser geometry pass. CI remains the required browser
authority. No threshold was reduced and no test was removed.

Analytics: existing allowlisted events and `CONFENGE_WEB` attribution are
preserved; PII remains absent from analytics and committed evidence. The new
loop report treats form presence as infrastructure only.

Rollback: revert this change for code/copy/registry rollback. For transport,
unset the two Netlify inbound variables; capture continues persist-first and no
Warmbly POST occurs. Do not delete stored leads. The previous one-loop evidence
history remains in `docs/evidence/web-011/` and is not rewritten as a past
success.

## Decision contract at this evidence boundary

```text
BOFU_CODE_READY=true
BOFU_COMMERCIAL_DOD_GENERALIZED=true
BOFU_PRODUCTION_HANDOFF_READY=false
BOFU_REAL_LOOP_PROVEN=false
BOFU_REVENUE_CONVERGENCE_READY=false
BLOCKED_EXTERNAL_ACTION=CONFENGE_INBOUND_WEBHOOK_URL,CONFENGE_INBOUND_WEBHOOK_SECRET,consented_real_contact,Warmbly receipt/action
```

> Um comprador B2G real pode hoje entrar em qualquer rota comercial canônica relevante, tomar uma próxima ação coerente, ser capturado/atribuído sem perda semântica e chegar ao sistema operacional comercial da CONFENGE sem intervenção técnica?

`PARTIAL`

- Netlify production inbound URL/secret state is not yet proven.
- No consented real contact exists for the proof.
- No matching Warmbly receipt/action for a consented real contact is observable.
