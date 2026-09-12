# Fragment: public-family registry

- `target_path`: `data/organic/public-family-registry.json`
- `operation`: `insert_family`
- `stable_key`: `grande-florianopolis-hub`
- `owner_issue`: 579
- `depends_on`: campaign 08 capture (#580) terminal action; campaign 04 credentials (#243/#581) if the family is later priced; goal 97 noindex membership; goal 99 for indexation
- `teste`: `npm run inbound:gates` must list the family only after the route is in the public artifact. Until then the prototype stays outside `_conversion_files()`. Distinct-answer: one route, seven families as anchors.
- `rollback`: delete the family object with `id=grande-florianopolis-hub`. Do not 301 `/grande-florianopolis/` to `/`.

## Payload (do not apply in campaign 11)

```json
{
  "id": "grande-florianopolis-hub",
  "visitor_job": "Identificar o núcleo técnico, se há visita/inspeção, documentos mínimos e iniciar triagem sem material sensível na Grande Florianópolis.",
  "profile": "commercial_content",
  "terminal_action": "capture_form_or_whatsapp",
  "match": { "routes": ["/grande-florianopolis/"] },
  "gate_coverage": { "conversion": "full", "copy": "full", "accessibility": "full" },
  "declared_at": "PENDING_GOAL_97",
  "owner_issue": 579,
  "index_evidence": {
    "substrate": "first_party_publication",
    "not_applicable": ["official_live", "citable_source"],
    "reason": "Hub de primeira parte; não representa registro PNCP/external_record.",
    "authority": "ADR-STRAT-002 + #579",
    "declared_at": "PENDING_GOAL_97",
    "owner_issue": 579
  },
  "debt": [],
  "note": "Keep noindex until goal 99. Do not declare INDEX here."
}
```
