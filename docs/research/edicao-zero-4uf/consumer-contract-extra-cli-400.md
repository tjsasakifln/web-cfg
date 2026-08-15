# Consumer contract — extra-cli #400

Status: **consumer-ready, producer absent.**  
Owner (consumer): `web-cfg` / EDIÇÃO ZERO (`tjsasakifln/web-cfg#65`, PR #73).  
Owner (producer): `extra-cli` issue [#400](https://github.com/tjsasakifln/extra-cli/issues/400).  
Schema id: `extra-cli.public_read.research_aggregate.v1`  
Schema version: `1.0.0`  
Consumer id: `web-cfg/flagship-research`

This is the SELECT-only read model this repository will accept as the
national/census input for **one** flagship edition. It is not a second
DataLake, not a crawler, and not a generic chart API. `public_read_v1`
(extra-cli #354) remains the entity/tender/contract family; it does **not**
authorize a Brazilian census claim.

Until a versioned export of this schema lands and passes the national claim
gate, the live edition stays on the checksummed 4-UF `data/pseo` snapshot as
**preview only**: `NEEDS_DATA`, `noindex,nofollow`, off sitemap.

## Grain / keys

One row = one published market cell.

| Key | Meaning |
| --- | --- |
| `uf` | IBGE UF code (`AC`…`TO` plus `DF`) |
| `archetype_id` | Primary AEC archetype (`pavimentacao-infraestrutura-viaria`, `edificacoes-publicas`, …) |
| `period_start` / `period_end` | Inclusive civil dates of the cell window |

Optional grain for ticket cells (distinct query, never mixed with volume cells):
`uf × archetype_id × price_floor_brl`.

The consumer never re-aggregates microdata. Absence of a cell is UNKNOWN,
not zero.

## Denominator

National claims require an explicit denominator object:

```json
{
  "id": "pncp-publishing-orgs-<competence>",
  "label": "órgãos/unidades publicantes do recorte nacional auditável",
  "source": "named extra-cli national-universe contract + competence",
  "expected_ufs": 27,
  "observed_ufs": 27,
  "competence": "YYYY-MM"
}
```

Four published markets are **not** a denominator. The 4-UF snapshot
`aec_confirmed` count and the candidate inventory are coverage-gap evidence,
not a Brazilian universe.

## Geographic / temporal coverage

National claim requires **all** of:

- `coverage.national_universe_complete === true`
- `coverage.uf_count >= 27` and `coverage.ufs` lists those UFs
- `coverage.period_start` and `coverage.period_end` present
- `coverage.national_denominator` present and non-empty

Fewer UFs, a missing UF list, or `national_universe_complete=false` yields
reason code `COVERAGE_INSUFFICIENT`. Temporal holes in a claimed national
window yield `COVERAGE_TEMPORAL_INSUFFICIENT`. The 4-UF recorte may still
render as preview; it may not be titled Brazil.

## Value semantics

| Field | Meaning | Not |
| --- | --- | --- |
| `contract_count` | Distinct contract instruments after exporter primary-archetype dedup | Tenders, aditivos as extra contracts, “obras no Brasil” |
| `total_value_brl` | Nominal BRL of the contract instrument as ingested | Unit price, practiced m², deflated reais |
| `buyer_count` / `supplier_count` | Distinct identities in that cell | National market share |
| `p25` / `median` / `p75` | Percentiles of the **price-cell** query (own denominator) | `markets.json` median, unit price |

Null stays null. The consumer does not coerce UNKNOWN to 0.

## Provenance

Required on the export and on every answered consumer metric:

`source`, `snapshot_hash`/`dataset_hash`, `as_of`, `cutoff`, `denominator`,
`filters`, `dedup_logic`, `value_semantics`, `exclusions`, `limitation`.

Plus export-level `provenance.tables`, `provenance.query_versions`,
`provenance.method`, `provenance.source_commit_sha`, `provenance.source_run_id`.

## as_of / freshness

- `data_as_of` and `freshness.as_of` are the observation cutoff (record dates),
  not only `generated_at`.
- `freshness.max_age_days` is part of the contract (default **30**).
- Age is `(now_utc.date - as_of).days`. Age `>` max_age_days →
  `FRESHNESS_STALE`. Stale exports never unlock `PUBLISH` / index / sitemap.

## UNKNOWN / reason_codes

`unknowns.reason_codes` is a list (may be empty). Blocking codes include:

| Code | Meaning |
| --- | --- |
| `RESEARCH_READ_MODEL_ABSENT` | No versioned #400 export at the consumer path |
| `SCHEMA_MISMATCH` | `schema` ≠ `extra-cli.public_read.research_aggregate.v1` |
| `CONSUMER_MISMATCH` | `consumer` ≠ `web-cfg/flagship-research` |
| `COVERAGE_INSUFFICIENT` | < 27 UFs or `national_universe_complete` is not true |
| `COVERAGE_TEMPORAL_INSUFFICIENT` | Claimed national window has undocumented holes |
| `NATIONAL_DENOMINATOR_MISSING` | No explicit national denominator |
| `FRESHNESS_STALE` | `as_of` older than `max_age_days` |
| `AS_OF_MISSING` | No usable `data_as_of` / `freshness.as_of` |
| `PROVENANCE_INCOMPLETE` | Missing method/tables/hash |
| `VALUE_SEMANTICS_MISSING` | Values not described |
| `UNKNOWN_VALUE_ON_DENOMINATOR` | Denominator itself is UNKNOWN |
| `EXPORT_UNREADABLE` | File present but not valid JSON / required shape |

Producer-supplied UNKNOWN on a cell remains UNKNOWN in the consumer.

## National claim gate

`PUBLISH`, sitemap promotion, `index,follow`, and national/census language
are allowed only when the shipped function
`evaluate_national_claim_gate` returns `passed=true`.

`passed` requires: schema+consumer match, coverage, denominator,
freshness, provenance, value semantics, and no blocking UNKNOWN on the
denominator. A valid but insufficient or stale export is **evaluated** and
then discarded as the edition source; the 4-UF snapshot remains the preview.

`extra_cli_public_read_export_consumed` is true only when that versioned
export was selected as the metrics input (gate passed). Peeking at a failing
export does not flip the flag.

## Expected on-disk path

```text
data/extra-cli/research-aggregate-v1/export.json
```

Override: `python3 -m scripts.research build --read-model PATH`.

Do not copy extra-cli datalake rows into this repository. The consumer reads
a versioned export; it does not recreate the producer.

## Exact current block (live tree)

As of this consumer landing, extra-cli #400 has **no** producer export in
the well-known path. Live build reason code: `RESEARCH_READ_MODEL_ABSENT`.
Verdict stays `NEEDS_DATA`. Four UFs are not Brazil.
