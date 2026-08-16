# Consumer contract — extra-cli `public-read-contract-analysis/1.0`

Status: **consumer ready against the extra-cli export layout.**
Owner (consumer): `web-cfg` / Análises Técnicas de Contratos Públicos (`tjsasakifln/web-cfg#83`).
Owner (producer): extra-cli `#400` (`python3 -m scripts.public_read export-contract-analysis`).
Schema: `public-read-contract-analysis/1.0`
Machine twin: [`public-read-contract-analysis-v1.json`](public-read-contract-analysis-v1.json)
Consumer guide (producer): extra-cli `docs/contracts/public-read-contract-analysis-consumer.md` (copied here).

This repository consumes a versioned SELECT-only export. It does not crawl,
extract facts, copy a DataLake or invent evidence packs.

## Export layout

```
DIR/
  manifest.json
  status-report.json
  analyses/<analysis_candidate_id>.json
```

`catalog_mode` is `fixture` or `official_live`. `claimed_live` on a fixture is
`fixture_as_live` and is `DATA_REJECT`. extra-cli emits only `DATA_READY` /
`DATA_HOLD` / `DATA_REJECT` (`publication_readiness` or `data_state`). That
value is never editorial INDEX.

Default official_live path (absent today):

- `data/extra-cli/public-read-contract-analysis/1.0/`

Labeled extra-cli fixture snapshot used by the canary:

- `scripts/contract_analysis/fixtures/extra-cli-export/`

## Honesty

- Fixture / `catalog_mode=fixture` / `claimed_live` on fixture cannot become
  `PUBLISHABLE_INDEX`, sitemap or indexable robots.
- `DATA_HOLD` and `DATA_REJECT` cannot become `PUBLISHABLE_INDEX`.
- `DATA_READY` is necessary and not sufficient.
- Editorial overlay may add interpretation; it cannot rewrite extra-cli facts.
- UNKNOWN stays UNKNOWN.

## Editorial INDEX

Owned by `contract-analysis-publication-gate/1.0`. Requires official_live,
`DATA_READY`, written analysis that survives anti-doorway, reputational
safety, author/reviewer, and an individual approval with material hash and
rollback. Never approve to fill a quota.
