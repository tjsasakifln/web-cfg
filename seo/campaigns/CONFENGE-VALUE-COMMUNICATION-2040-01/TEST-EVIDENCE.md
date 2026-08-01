# Test evidence

## Commands

```bash
npm test
npm run build:site
npm run validate:seo
npm run audit:public-artifact
```

## Results (campaign run)

| Suite | Result |
| --- | --- |
| `pseo:test` | 91 passed, 2 skipped |
| `test:analytics` | ANALYTICS_UNIT_OK |
| `test:pseo-attribution` | PSEO_ATTRIBUTION_OK + WHATSAPP_E2E_OK |
| `test:brand` | 14/14 OK |

## Brand gates added

`scripts/site/test_brand_contract.py` + `npm run test:brand`:

- brand/proof/cases integrity
- home copy + form fields
- offer pages + canonicals
- forbidden phrases (with negation allowance)
- radar empty state
- pillar commercial bridges
- sitemap offers
- FAQ JSON-LD sync

## Snapshot integrity fix

Filled missing `evidence_kind` on 5 problem_service rows; recomputed `dataset_hash` / checksums / registry alignment (required for fail-closed snapshot).
