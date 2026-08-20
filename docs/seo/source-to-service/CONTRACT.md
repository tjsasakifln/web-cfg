# Source → service attribution contract

**Issue:** [#153](https://github.com/tjsasakifln/web-cfg/issues/153)  
**Schema:** `1.1.0` (`event-registry.json` `source_to_service`)  
**Public source:** `CONFENGE_WEB`  
**Decision state:** VALIDATE / P1 attribution

Closes the observable chain `source asset/path → destination service/path → CTA → persisted lead → observed outcome` without PII, without GSC query↔person joins, and without deriving Warmbly outcomes from clicks.

## One click, one event

A classified transition produces exactly one admitted canonical event: `content_to_service` (alias `content_to_service_click` / `pseo_to_service`, same engagement layer).

Duplicate listeners on the same physical click (generic `a[href]` plus `[data-event-name]`) share an `event_id`. The client track path and the collector `admitBatch` ignore a repeated `event_id`.

## Minimum fields

| Field | Rule |
|---|---|
| `source_path` | Canonical origin path (no host/query/fragment) |
| `source_asset_id` | From `data-asset-id` or last path segment |
| `source_asset_family` | From `data-asset-family` or origin family (`editorial` / `data` / `tool`) |
| `destination_path` | Canonical dest path (no host/query/fragment) |
| `destination_service_id` | Registry dest id, or `UNKNOWN_SERVICE` |
| `cta_id` | From `data-cta-id` when present |
| `route_family` | From `data-route-family` when present |
| `event_id` | Dedupe key for the physical click |
| `schema_version` | `1.1.0` on this event |
| `source` | Always `CONFENGE_WEB` |
| session / `correlation_id` | Already-admitted envelope ids only |

No email, phone, CNPJ, document id, raw query, or free-text PII.

`#155` / `#156` may later emit `source_asset_id` / `destination_service_id` on this same envelope without a document or CNPJ. Admit already accepts that payload.

## Classification

A transition is classified only when:

1. Origin family is editorial (`/conteudos/`, `/lei-14133-obras/`, `/jurisprudencia-contratos-obras/`, `/guias-contratos-obras/`, `/analises-contratos-publicos/`), data (`/inteligencia/`, `/radar/`), or tool (`/ferramentas/`).
2. Destination is an internal canonical service/offer **or** an internal non-chrome path that is not another origin-family URL.

Known destinations (fail-closed: anything else that still classifies is `UNKNOWN_SERVICE`, never a guessed service):

- `/auditoria-orcamento-licitacao/` → `auditoria-orcamento-licitacao`
- `/medicoes-glosas-obras-publicas/` → `medicoes-glosas-obras-publicas`
- `/aditivos-obras-publicas/` → `aditivos-obras-publicas`
- `/reequilibrio-obras-publicas/` → `reequilibrio-obras-publicas`
- `/atrasos-prorrogacao-obras-publicas/` → `atrasos-prorrogacao-obras-publicas`
- `/defesa-tecnica-contratos-publicos/` → `defesa-tecnica-contratos-publicos`
- `/diagnostico-pre-licitacao/` → `diagnostico-pre-licitacao`
- `/acompanhamento-contratos-obras/` → `acompanhamento-contratos-obras`
- `/diretoria-b2g/` → `diretoria-b2g`
- `/diagnostico-b2g-360/` → `diagnostico-b2g-360`
- `/bid-room-licitacoes-obras/` → `bid-room-licitacoes-obras`
- `/defesa-margem-contratos-publicos/` → `defesa-margem-contratos-publicos`
- `/ferramentas/diagnostico-defesa-margem/` → `diagnostico-defesa-margem`

External / `tel:` / `sms:` clicks emit `outbound_click`. `wa.me` emits `whatsapp_click`. `mailto:` emits `email_click`. `#contato` remains `cta_click`. Those are not transitions.

## Destination canonicalization

`canonicalizeDestination` stores path only. Host, query, fragment, and PII-like values are dropped. A destination that is not in the map is `UNKNOWN_SERVICE`.

## Matrix and funnel layers

`aggregateEvents` publishes `origin_destination.by_day[]` cells with `count`, `rate`, `view_denominator`, `engagement_denominator`, plus `coverage` and `unknown`. A missing day or missing origin series is absent / `UNKNOWN` — never numeric zero (PR #159).

`funnel_layers` is the absence-safe series: `transition`, `lead`, `qualified`, `pipeline`, `won_lost`. Clicks never populate `qualified` / `pipeline` / `won_lost`. Those stay observed-only (#88). Sibling `funnel` from `reconcileFunnel` is admitted-event counts only and is not the #153 absence-safe report.

## Assisted path and lead join

`attributeLeads` joins only by permitted `session_id` / `sid` / `correlation_id`. Classified clicks carry the visit `correlation_id` already minted for the lead form, so a lead with only `correlation_id` joins `event.props.correlation_id`. A GSC or raw query string is never a join key and never stored on the cohort row.

Assisted transitions keep `destination_path` and `destination_service_id` (not only origin `e.path`). If the session has a transition and the persisted lead lacks destination (or the dest disagrees), the row shows `discrepancy` and `UNKNOWN` rather than a synthesized destination.

## Owners

| Plane | Owner |
|---|---|
| Public click / collect / anonymous matrix | `web-cfg` |
| Canonical facts / identity | `extra-cli` (not this contract) |
| Qualified / pipeline / won / lost | `warmbly` (#88) |
| Indexable content→service links | #128 (not reopened here) |

## Tests

`npm run test:attribution` drives shipped `script.js` click/track, shipped `admitEvent` / `collect`, and shipped `aggregateEvents` / `attributeLeads` against current HTML `data-*` / `href` fixtures.
