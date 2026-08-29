# Funnel event dictionary

**Schema:** `1.1.0`  
**Public source:** `CONFENGE_WEB`  
**Machine registry:** `netlify/functions/lib/event-registry.json`  
**Admit/minimize/reconcile:** `netlify/functions/lib/event-contract.cjs`  
**Source→service:** [docs/seo/source-to-service/CONTRACT.md](../seo/source-to-service/CONTRACT.md)

`confenge.com.br` is the only public surface. extra-cli owns facts. Warmbly owns commercial outcomes. This contract owns public event *names* so page view, engagement, completion, lead, qualified lead and pipeline cannot collapse.

## Envelope

Every admitted event carries:

| Field | Rule |
|---|---|
| `source` | Always `CONFENGE_WEB` |
| `schema_version` | Event schema; `content_to_service` is `1.1.0` |
| `asset_id` / `asset_family` / `route_family` | When known |
| `source_path` / `source_asset_id` / `source_asset_family` | Required on `content_to_service` |
| `destination_path` / `destination_service_id` | Canonical dest on `content_to_service`. Unknown dest is `UNKNOWN_SERVICE` |
| `intent` | When known |
| `cta_id` / `cta_position` | When the event is a CTA |
| `offer_id` / `next_action_id` | Versioned commercial identity and next action when known; never free text |
| `correlation_id` / `idempotency_key` / `event_id` | When the producer has them. `event_id` dedupes one physical click |
| `session_id` / `lead_id` / `opportunity_id` / `proposal_id` / `sale_id` | Stable non-PII join keys for the closed loop. Public browser→receipt uses `sess-` / `lead-`; `opp-` / `prop-` / `sale-` arrive only in Warmbly observations. Never email, phone or free text |
| `journey` | Versioned journey token when known |
| `consent` | `not_required` on aggregate events |
| `pii_policy` | `aggregate_allowlist_empty` |

The aggregate PII allowlist is empty. `nome`, `email`, `telefone`, CNPJ, query text, description/note/comment/free-text fields and PII-like values are never admitted. Join identifiers are validated against their complete declared patterns: `sess-`, `lead-` (plus the rollback-compatible legacy 24-hex lead id), `opp-`, `prop-` and `sale-`. `correlation_id`, `idempotency_key` and `event_id` remain non-PII technical tokens; `@` still fails on every field.

## Layers (denominators)

| Layer | Meaning | May become qualified lead / pipeline? |
|---|---|---|
| `page_view` | Impression | No |
| `engagement` | Interaction, including form start/submit and CTA | No |
| `completion` | Tool / analysis / X-Ray finished | No |
| `lead` | Persist / receipt / hand-raise | No |
| `qualified_lead` | Observed Warmbly qualification only | — |
| `pipeline` | Observed Warmbly commercial outcome only | — |

`session_start` is a session marker. It is not a page view.

`content_to_service` stays on the engagement layer. Aggregator `funnel_layers` reports `transition`, `lead`, `qualified`, `pipeline`, and `won_lost` as separate series. `qualified` / `pipeline` / `won_lost` are observed Warmbly inputs only (#88). Absence of a series is `UNKNOWN`, never numeric zero.

Missing Warmbly evidence stays `UNKNOWN`. Reconciliation never derives qualified lead or pipeline from an earlier stage.

A visitor-initiated `wa.me` activation emits one `whatsapp_click`. When the link
names a versioned commercial hand-raise, that same event carries `offer_id`,
`next_action_id`, `cta_id`, `cta_position` and one `event_id`; its validated
`CFG-WA-*` conversation marker is the event's `correlation_id`, not a redundant
PII-shaped property. It must not be paired with a second alias or CTA event for
the same physical click.

## Compatibility

Documented aliases are rewritten to a canonical name in the **same** layer. They are not a second count and they do not change layer.

Material aliases:

- `lead_created` → `lead_persisted`
- `qualified_scroll` → `scroll_depth`
- `content_to_service_click` / `pseo_to_service` → `content_to_service`
- `service_cta_click` / `offer_cta_click` / `diagnostic_cta_click` / `critical_decision_cta_click` / `pseo_cta_click` → `cta_click`
- `tool_use` → `tool_start`; `tool_result` → `tool_complete`
- `form_start` / `pseo_form_start` → `lead_form_start`

`conversion` is retired (catch-all inflates pipeline). `journey_nav_click` is retired (embarked `data-event-name` without versioned semantics). `custom_*` is rejected.

`qualified_lead` and `pipeline` are `admission: observed_only`. Collect and `confengeTrack` reject them (`observed_owner_only`). Reconciliation accepts counts only from a Warmbly observation; fixture/synthetic/`official_live: false` stay `UNKNOWN` and do not promote a stage.

## Owners

- Public producers and collect: `web-cfg`
- `qualified_lead` and `pipeline`: `warmbly` (reserved; no web-cfg derivation)

## Tests

`npm run test:event-dictionary` drives the shipped registry, `collect` handler and `confengeTrack`. Closed-loop join (session → lead → opportunity → proposal → sale) is `npm run test:revops` via `scripts/revops/test_closed_loop.mjs`. The CI report never derives `qualified_lead` / pipeline / won from collect events.
