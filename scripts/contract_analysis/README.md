# Contract-analysis editorial family (#83)

Fail-closed consumer of extra-cli `public-read-contract-analysis/1.0`
(manifest + `analyses/<id>.json`) plus the publication gate.

```bash
python3 -m scripts.contract_analysis build
python3 -m scripts.contract_analysis validate
python3 -m pytest scripts/contract_analysis/tests -q
```

`catalog_mode=fixture` and `claimed_live` on a fixture stay `noindex`.
`DATA_HOLD` / `DATA_REJECT` cannot INDEX. Absent official_live export uses
the labeled extra-cli fixture snapshot and keeps `index_count=0`.
