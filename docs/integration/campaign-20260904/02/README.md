# Campaign 02 integration fragments (2026-09-04)

Producer: `CONFENGE_CORPORATE_TAXONOMY/1.0.0-draft.20260904`
Path: `data/corporate/taxonomy.v1.json`

Consumers pin `contract_id`, `contract_version` and `content_sha256`. Do not
copy the schema into a second authority. Draft sibling IDs are fixtures for
goal 97, not runtime fallbacks.

## Nucleus IDs

- `expert_evidence_assistance`
- `property_valuation`
- `building_engineering_documentation`
- `occupational_safety`
- `public_works_b2g`

## For later campaigns

| Campaign | Consume |
| --- | --- |
| 03 capture/handoff | nucleus_id on intake; `CONFENGE_WEB`; `outbound_eligible=false`; `auto_send=false`; do not put CRM in web-cfg |
| 08 offer catalog / IA | reference nucleus_id; do not duplicate taxonomy content; apply public-ia-map + brand fragments with HTML |
| 09 authority pages | credentials stay factual; specialist page may outgrow “consultor B2G” without inventing proof |
| 10 home/nav/footer | read taxonomy for chrome; keep B2G equity; do not require umbrella copy before HTML changes |
| 11 local | geo_field_rule; no doorway 5×N city pages |
| 97/99 | apply registry/package.json/site-ci fragments |

## Files this campaign refused to edit

`data/organic/public-family-registry.json`, `data/site/public-ia-map.json`,
`data/site/brand.json`, `package.json`, `.github/**`, home/nav/footer/forms,
offer and credential registries, `/conflitos/`.
