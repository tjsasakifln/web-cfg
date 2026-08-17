# Funnel event dictionary

**Schema:** `1.0.0`  
**Public source:** `CONFENGE_WEB`  
**Machine registry:** `netlify/functions/lib/event-registry.json`  
**Admit/minimize/reconcile:** `netlify/functions/lib/event-contract.cjs`

`confenge.com.br` is the only public surface. extra-cli owns facts. Warmbly owns commercial outcomes. This contract owns public event *names* so page view, engagement, completion, lead, qualified lead and pipeline cannot collapse.

## Envelope

Every admitted event carries:

| Field | Rule |
|---|---|
| `source` | Always `CONFENGE_WEB` |
| `schema_version` | Event schema, currently `1.0.0` |
| `asset_id` / `asset_family` / `route_family` | When known |
| `intent` | When known |
| `cta_id` / `cta_position` | When the event is a CTA |
| `correlation_id` / `idempotency_key` | When the producer has them |
| `consent` | `not_required` on aggregate events |
| `pii_policy` | `aggregate_allowlist_empty` |

The aggregate PII allowlist is empty. `nome`, `email`, `telefone`, CNPJ, query text and PII-like values are never admitted. Envelope identifiers (`correlation_id`, `idempotency_key`) follow the lead-core rule: UUID, `c-` prefix and timestamp keys are not treated as phone/CNPJ. `@` still fails on every field.

## Layers (denominators)

| Layer | Meaning | May become qualified lead / pipeline? |
|---|---|---|
| `page_view` | Impression | No |
| `engagement` | Interaction, including form start/submit and CTA | No |
| `completion` | Tool / analysis / X-Ray finished | No |
| `lead` | Persist / receipt / hand-raise | No |
| `qualified_lead` | Observed Warmbly/operator qualification only | — |
| `pipeline` | Observed Warmbly commercial outcome only | — |

`session_start` is a session marker. It is not a page view.

Missing Warmbly evidence stays `UNKNOWN`. Reconciliation never derives qualified lead or pipeline from an earlier stage.

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

`npm run test:event-dictionary` drives the shipped registry, `collect` handler and `confengeTrack`.
