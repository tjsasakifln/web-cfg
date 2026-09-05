# Fragment — public-ia-map consumes taxonomy

- **campaign_id:** 02
- **target_path:** `data/site/public-ia-map.json`
- **operation:** add `taxonomy_contract` pin and optional `nucleus_id` on journeys/hubs
- **stable_key:** `taxonomy_contract` / `journeys[].nucleus_id`
- **owner_after:** campaign 08 + goal 97
- **depends_on:** `data/corporate/taxonomy.v1.json`
- **test:** `scripts/site/test_public_ia.py` continues to assert current three B2G purchase situations until HTML/IA change (`KEEP_VERTICAL`)
- **rollback:** restore map without taxonomy pin; header/footer HTML unchanged

Campaign 02 must not edit this file. Current journeys remain edital / contrato /
operacao on the B2G vertical.

Suggested pin:

```json
{
  "taxonomy_contract": {
    "id": "CONFENGE_CORPORATE_TAXONOMY",
    "version": "1.0.0-draft.20260904",
    "content_sha256": "PIN_COMMITTED_SHA256_FROM_data/corporate/taxonomy.v1.json"
  }
}
```

Missing or divergent hash must fail closed. Do not copy nucleus content into
the IA map.
