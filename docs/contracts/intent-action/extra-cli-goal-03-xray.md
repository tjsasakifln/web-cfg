# extra-cli Goal 03 — B2G X-Ray consumer contract (draft)

Status: **absent upstream**. web-cfg consumes labeled fixtures until extra-cli ships a versioned SELECT-only pack.

Expected schema name: `public-read-b2g-xray/1.0` (fixtures use `0.1-draft`).

## extra-cli decides

| extra-cli | consumer |
| --- | --- |
| DATA_READY | may render facts. Not permission to index. Maps to X-Ray `READY`. |
| DATA_HOLD + coverage | `NEEDS_DATA` |
| DATA_HOLD + freshness expired | `STALE` |
| no row for CNPJ | `NOT_FOUND` |
| policy / rights block | `BLOCKED` |
| transport / pack error | `ERROR` |
| never INDEX | editorial / #84 |

Fixture packs (`catalog_mode=fixture`, `claimed_live=false`) are not live. `claimed_live` on a fixture is `DATA_REJECT`.

## Forbidden in the factual payload

risco, risk_score, dor, pain_score, irregularidade, credit_score, or any equivalent score.

## Required when READY

company public name, observed portfolio (n, value sum, orgaos, UFs, period), evidence contract public ids, limitations, as_of, method_version, schema_version.

Ticket contratual is not custo por km.
