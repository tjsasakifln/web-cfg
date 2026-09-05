# Fragment — public-family-registry nucleus field

- **campaign_id:** 02
- **target_path:** `data/organic/public-family-registry.json`
- **operation:** add optional `nucleus_id` on each family (schema-minimum)
- **stable_key:** `families[].nucleus_id`
- **owner_after:** goal 97
- **depends_on:** `CONFENGE_CORPORATE_TAXONOMY/1.0.0-draft.20260904` (`data/corporate/taxonomy.v1.json`)
- **test:** fail closed when `nucleus_id` is present and not in the taxonomy; current families without the field remain valid until applied
- **rollback:** omit the field; conversion gate is unchanged

Do not edit the registry in campaign 02. Current `home` visitor_job stays B2G
(`KEEP_VERTICAL`) until campaign 08 ships the umbrella home.

Suggested shape:

```json
{
  "id": "home",
  "nucleus_id": "public_works_b2g"
}
```

Coordination: `CONFENGE_CORPORATE_TAXONOMY/1.0.0-draft.20260904`.
