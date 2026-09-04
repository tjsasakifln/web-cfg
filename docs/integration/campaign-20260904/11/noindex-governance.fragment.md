# Fragment: noindex governance

- `target_path`: `data/organic/noindex-governance-registry.json`
- `operation`: `insert_route`
- `stable_key`: `/grande-florianopolis/`
- `depends_on`: public artifact membership (this fragment is useful only after the HTML leaves `docs/`)
- `teste`: inbound noindex governance gate lists the route as REMEDIABLE until goal 99 flips it
- `rollback`: remove the route entry; HTML meta robots already contain `noindex`

## Payload

```json
{
  "route": "/grande-florianopolis/",
  "reason_code": "fixture_preview_staging",
  "class": "REMEDIABLE",
  "owner_issue": 579,
  "as_of": "2026-09-04",
  "review_by": "goal-99",
  "note": "Local hub shipped noindex. Indexation requires offer, proof, credential, capture, conflict, public-family and distinct-answer."
}
```
