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

## Source vs generated

| Kind | Path | Role |
|---|---|---|
| Source | `scripts/contract_analysis/*.py` | Consume, gate, approval, render. |
| Source | `scripts/contract_analysis/fixtures/` | Labeled extra-cli + editorial fixtures. Never live. |
| Source | `docs/contracts/public-read-contract-analysis*` | Consumer contract. |
| Source | `data/editorial/contract-analysis/approvals.json` | Individual INDEX approvals (empty until official_live). |
| Generated | `analises-contratos-publicos/**/index.html` | Labeled noindex preview from `canary.v1.json`. |
| Generated | `docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS.*` | Canary report. |
| Pointer | `docs/editorial/CONTRACT_ANALYSIS_EDITORIAL_STATUS.*` | Alias of the canary report. |

Preview HTML is not an extra-cli official_live export. It stays `noindex`,
off every sitemap, `Disallow` in `robots.txt`, and `X-Robots-Tag` noindex.
