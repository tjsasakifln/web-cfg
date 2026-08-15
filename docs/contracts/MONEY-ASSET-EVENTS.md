# Money Asset event names

Asset: Diagnóstico de Defesa de Margem em Contratos Públicos  
`asset_id`: `diagnostico-defesa-margem`  
`route_family`: `defesa-margem-diagnostico`  
Source: `CONFENGE_WEB`

These names are first-party collector events (`/.netlify/functions/collect`)
plus lead persist. They are not vanity metrics.

| Event | When | Props (no PII) |
|---|---|---|
| `organic_landing` | first view of the asset from a referrer / UTM | `route_family`, `asset_id`, `source`, `referrer_host` |
| `asset_view` | page load | `route_family`, `asset_id` |
| `contract_selected` | visitor submits an identifier that matches a snapshot record | `route_family`, `asset_id`, `public_id_slug` |
| `contract_analyzed` | diagnosis rendered | `route_family`, `asset_id`, `public_id_slug`, `unknown_count`, `official_count` |
| `cta_view` | CTA block visible | `route_family`, `asset_id`, `cta_id` |
| `cta_click` | CTA submit control activated | `route_family`, `asset_id`, `cta_id` |
| `lead_created` | lead function returns persisted id | `route_family`, `asset_id`, `public_id_slug` (also stored as `lead_persisted`) |
| `qualified_lead` | reserved — only when a later operator/Warmbly signal exists | `route_family`, `asset_id` |

Lead persist allowlist (server): `asset_id`, `route_family`, `public_contract_id`,
`public_entity_id`, `public_id_slug`, `correlation_id`, `cnpj` (only when the
form actually sent them), plus existing journey / UTM / origem fields.

Warmbly inbound (`confenge.inbound.v1`) maps stored `public_contract_id` →
`contract_public_id` and stored `public_entity_id` → `entity_public_id`.
Source on the wire is `CONFENGE_WEB` (same as analytics). The Warmbly example
string `web-cfg` is not emitted. CNPJ / `public_entity_id` stay absent on the
money-asset snapshot (`organ.tax_identifier_export` is null) — they are not
invented from the `public_id` prefix or the organ display name.

Never send `nome`, `email`, `telefone`, `mensagem`, raw CNPJ or free-text
identifier in analytics. `public_id_slug` is a digit-sparse slug, not the
official number.
