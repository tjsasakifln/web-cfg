# pSEO Semantic SOTA — Delivery (post-Mariópolis near-dup)

Date: 2026-07-31

## SHAs
| Repo | Branch | SHA |
|---|---|---|
| web-cfg | main | `e596f0ef4079eae34c0a7facdc506c53cf5bcbb6` |
| extra-cli | feat/pseo-semantic-sota | `01123735ed0e240b0adf2233269ac947fa6d56c2` |

## Snapshot
- dataset_hash: `faf85d953e46b6c39c20a649cba4adb7d23a754df0048151bb68dc14a4c1c333`
- source_commit: `01123735ed0e240b0adf2233269ac947fa6d56c2`
- data_as_of: 2026-07-31
- registry counts: {'reject': 13, 'noindex': 6}

## Mariópolis residual fix
1. **Producer** `_cluster_near_duplicates`: missing/not_informed valor merges into sole known-value bucket under same org|objeto|closing; keep prefers `value_status=known`.
2. **Consumer** `semantic_radar_fails`: base key omits valor; missing+known same base → `duplicate_items`.
3. **Render** radar table uses `money_or_ni(valor, value_status)` → "não informado" instead of "—".
4. **Evidence**: `radar-edificacoes-publicas-pr` open=10 (was 11); single Mariópolis row `…000119` valor `1230482.04` known; `semantic_radar_fails=[]`; quality_eligible=True; status=noindex (awaits individual human approval).

## Skeptic resolutions (cumulative)
1. Near-dup opportunities collapsed (rounded valor + missing↔known).
2. Opportunity items export full section 3.2 fields.
3. Agency sample_metrics include price_adjustment_count + record_type_distribution.
4. Approval invalidation: dataset_hash + material signature + render hash.
5. Registry populates data_quality_metrics + current_material_signature.
6. UI: accented labels, BR dates, money_or_ni on radar, no MRS- prefix.
7. Radar near-dup semantic gate; CI workflow pseo.yml; Dataset/material tests.
8. Muro SC item is legitimate pavement.

## Verification
- extra-cli pytest tests/pseo: **52 passed**
- web-cfg scripts/pseo/tests: **28 passed**
- export validate: ok
- build: publish=0, noindex=6, reject=13
- No deploy (publish=0).

## Pendencias
1. Individual human approval for quality-eligible radars (no bulk).
2. Optional Playwright browser install in CI.
