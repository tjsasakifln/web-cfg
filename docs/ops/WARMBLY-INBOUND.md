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

### Web-side `origin_class` (issue #706, 2026-09-19)

`netlify/functions/lib/lead-core.cjs` derives `lead.origin_class` at persist
time from the already-sanitized `utm_source`/`utm_medium` tokens and the
referrer **host** only (never the full URL, never a visitor value):

| Value | Rule |
| --- | --- |
| `campaign` | any `utm_source` or `utm_medium` present (`utm_medium=organic` included: UTM presence wins) |
| `search_organic` | no UTM and the referrer host, after `www.`, is `google.` / `bing.` / `duckduckgo.` / `yahoo.` / `ecosia.` (or a subdomain of one) |
| `referral` | no UTM and an external referrer on any other host |
| `direct_or_unknown` | no UTM and no referrer, or a referrer from the site itself (internal navigation). Never labelled `organic`. |

It is a server verdict, not an intake field: it is absent from `ATTR_ALLOWLIST`
and a posted `origin_class` is ignored. It is **not** the commercial origin
class of `data/revops/proposal-counting.v1.json` (`demonstrated_inbound`,
`outbound_assisted`, `mixed_or_unknown`, `expansion_existing_client`,
`paid_or_partner`): the web value is evidence Warmbly may read, and
`direct_or_unknown` never promotes to demonstrated inbound.

Scope and limits today:

- The `confenge.inbound.v1` body is unchanged. `origin_class` stays web-side and
  reaches operators through the ops export (`scripts/revops/export_leads.mjs`)
  once the stored row carries it; Warmbly's canonical origin field is still an
  open decision on #706 and nothing here pre-empts it.
- The public `/api/web/lead` response never includes it.
- Not yet in the durable row: `buildLeadRecord` in
  `netlify/functions/lib/lead-store.cjs` and `toExportRecord` in
  `scripts/revops/export_leads.mjs` each copy an explicit field list, and
  neither copies `origin_class` yet (one line in each, owned by the
  store/integrator, outside W7). Until then the value exists on the validated
  lead only. The focused tests in `scripts/site/test_lead_function.mjs`
  (`origin_class_*`) pin the derivation and tolerate either state of the row.
- Host matching accepts the engine label followed by a short public-suffix
  tail only (`google.com`, `google.com.br`, `images.google.co.uk`,
  `br.search.yahoo.com`); `notgoogle.com` or `google.com.<other-domain>` is
  `referral`.
- The form injects `referrer` only through the attribution session
  (`js/modules/nav.js`); when it is absent at submit time the lead is
  `direct_or_unknown`. Expect that class to dominate; it means "no evidence",
  not "direct traffic", and it contributes zero to any inbound reading.

### Next-action context in `message` (BOFU-FECHAMENTO-20260919, WS-A)

The `confenge.inbound.v1` body is unchanged; the versioned free-text
`message` ("Contexto do próximo passo: …") carries three additions, all
from sanitized server fields, never PII:

| Label | Source | When |
| --- | --- | --- |
| `situação declarada=<estagio>` | stored `estagio` (the situation the visitor chose on the home, or the server-derived `planejamento-contratacao-publica`; the pre-filled contracting-authority `estagio` is dropped back to the form's `asset_id` when the visitor picks a contractor event instead) | every lead whose `estagio` is not the route/asset id itself and not the `/entregas/` service family (which keeps `família de serviço=`) |
| `lado=orgao_contratante` | `contract_event=planejamento_contratacao` | the contracting authority declared itself on `/servicos-obras-publicas/#captura-contrato` |
| `objeto=`, `estágio da contratação=`, `regulamento=`, `origem do recurso=` | optional `procurement_object`, `procurement_stage` (enum), `procurement_regulation`, `funding_source` (enum) | present only when the visitor filled them; `procurement_object` / `procurement_regulation` are sanitized like `tema` (no e-mail, no long digit runs) |
| `entrega=CFG-Dnn` on the frozen pillars | derived in `lead-core.cjs` from the form's pre-rendered identity only (`estagio`/`asset_id`/`route_family`, never `landing_page`/`landing_url`, which are first-touch attribution) via `deliverables-registry.v1.json` when the form posts no `deliverable_id` | the eight pillar forms without a hidden `deliverable_id`; a posted value always wins; the derived id never opens product qualification, so a pillar hand-raise stays free of `qualification_gaps` |

The órgão keeps `journey=contrato` (no `orgao` journey in `ALLOWED_JOURNEYS`;
decision P-3): the side is the structured event above, and the situation is the
stored `estagio`. A dedicated Warmbly field for the side, the situation or the
procurement context remains a Warmbly decision; nothing here pre-empts it. The
orphan labels `certame_stage`, `contract_relation` and `entity_class` (unfilled
since MV-09) left the vector on 2026-09-19.

## Env

See [ENV-VARS.md](./ENV-VARS.md). Required on both sides for a live handoff:

- `CONFENGE_INBOUND_WEBHOOK_URL=https://api.confenge.com.br/api/v1/webhooks/confenge/inbound`
- `CONFENGE_INBOUND_WEBHOOK_SECRET` — shared HMAC secret (`/etc/confenge-web/runtime.env` + Warmbly env)
- Warmbly: `CONFENGE_AUTO_SEND_ENABLED=false`

Optional: `CONFENGE_INBOUND_ALLOWED_HOSTS`, `CONFENGE_INBOUND_MAX_ATTEMPTS` (8), `CONFENGE_INBOUND_TIMEOUT_MS` (8000).

Keep the shared secret server-side only. Do not expose either the secret or a
signed inbound request to browser code.

Empty URL: capture still works; handoff `SKIPPED`. Non-HTTPS in staging/prod, PII on the query, missing secret, or host off the allowlist is `BLOCKED` (no POST).

Non-real records (`qa` / `spam` / `internal` and unauthenticated synthetic
signals) persist locally and skip Warmbly. The sole exception is a
server-authenticated probe: it crosses the transport with
`record_kind=synthetic`, Warmbly stores an idempotent receipt, excludes it from
`INBOUND NOW/include_synthetic=0`, and creates no action. This proves transport
without manufacturing a commercial opportunity.

## Ops

- The queue a human works is Warmbly's INBOUND NOW (`GET /confenge/inbound`,
  operator session, loopback on the host through an ssh tunnel). It never
  notifies anyone and never dispatches; the only configured alert for a real
  lead is the Resend e-mail, and the daily `ops?action=leads` check is the
  backstop. Routine and per-`lead_id` lookup protocol: `LEAD-HANDLING.md`.
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
- Since 2026-09-18 the same drain also re-attempts the lead e-mail (Resend)
  for real rows still `delivery.email.status` `error`/`pending`, inside the
  provider's 24 h idempotency window and with the same
  `Idempotency-Key: lead-email/<lead_id>`; the response carries counts only
  (`email_retry.{attempted,delivered,retryable,in_flight,deferred}` and
  `email_reconcile_required` with `reconcile_reasons`). Rows outside the
  window, exhausted or with a payload mismatch are reported, never re-sent.
  Details and limits: `docs/ops/LEAD-HANDLING.md`.

The authenticated response reports only `SET | UNSET` for the webhook URL and
secret, plus the resolved contract state `READY | UNSET | BLOCKED`. It never
returns either value. A committed value or a local shell variable is not proof
of the production EnvironmentFile; use this response after restarting
`confenge-web-runtime.service`.

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

1. Unset `CONFENGE_INBOUND_WEBHOOK_URL` and/or `CONFENGE_INBOUND_WEBHOOK_SECRET` in `/etc/confenge-web/runtime.env` and restart `confenge-web-runtime.service`.
2. Restart is enough for skip: missing URL → no POST. Do not republish a leftover Netlify deploy.
3. Lead capture continues (persist-first).
4. Do not point `OPS_WEBHOOK_URL` at the Warmbly inbound path.

Site-static rollback: [ROLLBACK.md](./ROLLBACK.md). Host-owned filesystem leads are not deleted.

## Synthetic

Only when the inbound URL is reachable, the shared secret is set on both sides,
the server-only probe credential is configured, and Warmbly auto-send and
dispatch are proven off. Use the authenticated, clearly labeled synthetic
fixture (`SYNTHETIC-PROBE`, `@example.com`). Do not generate a real contact. If
any precondition is missing, fail before POST and record the exact blocker — do
not fake INBOUND NOW.

The authenticated synthetic record may reach Warmbly only as
`record_kind=synthetic`; its 201 plus an idempotent retry proves capture and
transport, but never proves a real commercial action, human consent or QCO.

### Money-asset published inspection (read-only)

```text
node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br
# or
npm run probe:money-asset:prod
```

This is the #60 inspection (not `probe:lead`, which is jornada=operacao). It
only GETs the published asset page and `sitemap.xml` over the canonical https
origin and writes PROVEN/BLOCKED/UNKNOWN for `page_live` and
`indexability_hygiene`. It never POSTs, never creates a lead (synthetic or
real), never reads ops counters and needs no credential: `OPS_TOKEN`,
`LEAD_PROBE_SECRET`, `CONFENGE_INBOUND_WEBHOOK_*` and
`CONFENGE_AUTO_SEND_EVIDENCE` are ignored when present. `capture`, `transport`
and `confirmacao_humana` are always `NOT_VERIFIED` in its report: authenticated
capture/transport proof belongs to `probe:lead:prod` (`synthetic_lead_probe.mjs`,
`LEAD_PROBE_SECRET` required), and the full loop remains blocked until one
genuine consented lead is reconciled with a Warmbly receipt/action while
auto-send is off.

Production environment this inspection cannot see (it does not read the host):

```text
# Production EnvironmentFile /etc/confenge-web/runtime.env
CONFENGE_INBOUND_WEBHOOK_URL=https://api.confenge.com.br/api/v1/webhooks/confenge/inbound
CONFENGE_INBOUND_WEBHOOK_SECRET=<shared>
# Warmbly
CONFENGE_AUTO_SEND_ENABLED=false
# This shell: no token is exported; the inspection is GET-only
node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br /tmp/prod-proof.json
```

Ops chain (auth): `GET /.netlify/functions/ops?action=inbound_handoff` and `analytics_summary` expose `money_asset.events` (`asset_view` → `contract_analyzed` → `cta_view` → `cta_click` → `lead_persisted`, with compatibility key `lead_created`) plus `money_asset.handoff` (`delivered`/`blocked`/`pending`/`retryable`/`skipped`/`dead`). No PII.

The next irreversible proof is a real qualified lead or a real rejection — not another synthetic.
