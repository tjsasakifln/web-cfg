# Consumer guide — `public-read-contract-analysis/1.0`

Audience: `web-cfg / contract-analysis family` (`tjsasakifln/web-cfg#83`).

This pack is the only official answer extra-cli gives to “what facts may I
show about this contract analysis?”. Do not query internal tables to invent
copy, scores, peers or readiness. Do not redo #414 scoring or #415 peer
computation.

## What extra-cli decides (and what it does not)

| extra-cli | consumer |
|---|---|
| `DATA_READY` — FACTUAL pack is usable | may render the facts. **Not** permission to index. |
| `DATA_HOLD` — facts exist but are stale or a new observation arrived | must not present as current; refresh and retry |
| `DATA_REJECT` — facts are not usable; see `reason_codes` | must not present as a ready analysis |
| never `INDEX` | editorial INDEX / homepage / SEO / CTA is yours |

A fixture pack (`catalog_mode=fixture`) is for reconciliation and canary
wiring. It is not live. `claimed_live` on a fixture is always `DATA_REJECT`
with `fixture_as_live`.

## Shipped command

```bash
python3 -m scripts.public_read export-contract-analysis --payload PATH --out DIR
python3 -m scripts.public_read export-contract-analysis --fixture PATH --out DIR
```

`--fixture` forces the labeled-fixture path and never treats the catalog as
live.

Re-run the same command to refresh. There is no separate job.

## Export layout

```
DIR/
  manifest.json
  status-report.json
  status-report.md
  summary.csv
  analyses/<analysis_candidate_id>.json
  analyses/previous/<analysis_candidate_id>.<content_hash>.json
```

`manifest.json` and every analysis bundle carry `schema` =
`public-read-contract-analysis/1.0` and a `content_hash` of the canonical
JSON (hash computed after canonicalize, then attached). Two runs on the same
input to an empty directory must be byte-identical.

When a later run invalidates one analysis (retification, new document set,
material observation), only that file is rewritten. The previous hashed
payload is kept under `analyses/previous/`. Other analyses stay untouched.

## How to render one analysis

1. Read `analyses/<id>.json`.
2. Stop if `data_state` is not `DATA_READY`.
3. Treat `DATA_READY` as “facts are usable”, **not** as permission to index.
4. Use `reason_summary`, `timeline`, `calculations` and `limitations` as written.
5. Show `as_of` / `freshness.source_as_of` and treat the pack as expired at
   `freshness.expires_at`.
6. Cite `official_refs`. Honor `epistemic_classes`:
   `UNKNOWN` is not zero; `INFERENCE` is not a `FACT`.
7. Read `peer_group.status`. `NOT_COMPARABLE` or `ABSENT` is honest, not a
   chart. Do not invent a peer group.
8. Do not upgrade a fact into a legal conclusion.

## Canary / first editorial slice

Read `status-report.json`:

- `selected_candidate_ids` — deterministic 5–10 when that many `DATA_READY`
  candidates exist.
- If `selected_count < 5`, `reason_codes` are the exact shortfall reasons.
  Do not invent replacements.

Angles (`preco_bdi`, `reajuste_reequilibrio`, `aditivos_valor`, `prazo`,
`comparavel`, `exceptional`) are descriptive only. An empty angle is omitted.
A lower-quality candidate is never selected just to fill an angle.

## Field dictionary (public)

| Field | Meaning |
|---|---|
| `analysis_candidate_id` | Stable analysis grain |
| `canonical_contract_ids` | Official contract IDs |
| `candidate_score.value` | Producer score (number or null). Null is UNKNOWN, not zero. |
| `candidate_score.version` / `schema` | Producer score identity |
| `reason_summary` | Factual producer summary |
| `evidence_pack_version` / `evidence_pack_hash` | Evidence identity |
| `peer_group.status` | `PEER_VALID` \| `PEER_WEAK` \| `NOT_COMPARABLE` \| `ABSENT` |
| `peer_group.metrics` | Producer metrics already computed (never recomputed here) |
| `peer_group.version` / `content_hash` | Peer-group identity |
| `timeline` | Copied factual events |
| `official_refs` | Public-safe official locators |
| `calculations` | Typed calculations (`name`, `value`, `unit`, `epistemic_class`) |
| `epistemic_classes` | `FACT` \| `CALCULATION` \| `INFERENCE` \| `UNKNOWN` |
| `as_of` | Evidence cutoff |
| `freshness.generated_at` | Declared pack time (not wall-clock) |
| `coverage` | Known/missing honesty |
| `limitations` | Documented bounds |
| `safety_flags` | Honesty flags; includes `data_ready_is_not_index_permission` |
| `data_state` | `DATA_READY` \| `DATA_HOLD` \| `DATA_REJECT` |
| `data_state_facts` | Why that value |
| `reason_codes` | Closed vocabulary in the JSON twin |
| `catalog_mode` | `fixture` or `official_live` |

## Closed `reason_codes`

`producer_missing`, `stale_evidence`, `score_version_mismatch`,
`source_conflict`, `contract_updated_after_evidence_pack`,
`material_observation_after_pack`, `candidate_rejected_after_refresh`,
`fixture_as_live`, `NOT_COMPARABLE`.

`NOT_COMPARABLE` is informational. It does not by itself reject a usable
score + evidence pack.

## What must never appear

- Secrets, tokens, DSNs, internal module paths, brand marks, private raw blobs.
- Unnecessary person-level PII (emails, phones, raw CPF digits).
- `INDEX` as a data-state or producer decision.
- Legal conclusions (right, imbalance, loss, “should adjust”).
- Treating UNKNOWN as zero.
- Treating `DATA_READY` as permission to index.

## Compatibility

Additive nullable fields only within `/1.0`. A new required field or a
changed meaning needs `/2.0` or a documented overlap.
