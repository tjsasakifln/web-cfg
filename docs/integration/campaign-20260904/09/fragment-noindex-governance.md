# Fragment: noindex governance

CAMPAIGN_ID=09
ISSUE_OWNER=589

- target_path: `data/organic/noindex-governance-registry.json`
- operation: `insert_family_reason`
- stable_key: `private-project-technical-readiness`
- dependency: family declaration in `public-family-registry.json`
- test: `gate_instance_index_ready` must see `reason_code` for the family while the canary stays noindex
- rollback: delete the object with `family_id=private-project-technical-readiness`

```json
{
  "family_id": "private-project-technical-readiness",
  "reason_code": "canary_pending_index_evidence",
  "owner_issue": 589,
  "review_at": "2026-10-04",
  "note": "REMEDIABLE: canário isolado até método, captura 08, prova e gates verdes. Não indexar enquanto viver fora de /ferramentas/ ou sem captura persistida."
}
```
