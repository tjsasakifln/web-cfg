# pSEO Semantic SOTA — Delivery (post-skeptic final)

Date: 2026-07-31

## SHAs
| Repo | Branch | SHA |
|---|---|---|
| web-cfg | main | `c31f5ed3a24ad0335b1bc235202411a8031d2079` (docs tip; code at 8689dbc/00a595b stack) |
| extra-cli | feat/pseo-semantic-sota | `6108210312d587d108a29464e4edafefc9d5cb15` |

## Snapshot
- dataset_hash: `423c6e379c3127bc3d2c5ae243375686e8b04ae4c22e7ffbb6dcfe49f76591ae`
- source_commit: `6108210312d587d108a29464e4edafefc9d5cb15`
- data_as_of: 2026-07-31
- registry counts: {'noindex': 6, 'reject': 13}

## Skeptic resolutions
1. Near-dup opportunities collapsed via rounded near_duplicate_key.
2. Opportunity items export full section 3.2 fields.
3. Agency sample_metrics include price_adjustment_count=13 + record_type_distribution.
4. Approval invalidation: dataset_hash + material signature + render hash.
5. Registry populates data_quality_metrics + current_material_signature.
6. UI: accented labels, BR dates in tables, no MRS- prefix.
7. Radar near-dup semantic gate; CI workflow pseo.yml; Dataset/material tests.
8. Muro SC item is legitimate pavement (recomposicao asfaltica in full object).

## Decisions (eight)
| page_id | status | human_review | fails |
|---|---|---|---|
| `agency-88830609` | reject | NEEDS_DATA_FIX | suppliers<3, temporal_span_days<180, exercises<2 |
| `price-manutencao-predial-engenharia-rs-manutencao-predial` | reject | NEEDS_DATA_FIX | buyers<3, suppliers<3, temporal_span_days<90 |
| `price-pavimentacao-infraestrutura-viaria-pi-paralelepipedo` | reject | NEEDS_DATA_FIX | obs<15, primary_contracts<15, temporal_span_days<90 |
| `radar-edificacoes-publicas-pr` | noindex | NEEDS_DATA_FIX | — |
| `radar-pavimentacao-infraestrutura-viaria-sc` | noindex | NEEDS_DATA_FIX | — |
| `prob-orcamento-edital` | reject | NEEDS_CONTENT_FIX | no_direct_budget_edital_evidence, no_claim_specific_evidence |
| `prob-sinapi-sicro` | reject | NEEDS_CONTENT_FIX | no_direct_sinapi_sicro_evidence, no_claim_specific_evidence |
| `prob-aditivos-margem` | reject | NEEDS_CONTENT_FIX | no_direct_aditivo_evidence, no_claim_specific_evidence |

## Verification
- extra-cli pytest: 51 passed
- web-cfg pseo:test: 27 passed
- pseo:validate: ok publish=0 editorial_pf=0
- No deploy (publish=0).

## Pendencias
1. Individual human approval for quality-eligible radars PR/SC.
2. Optional Playwright browser install in CI.
