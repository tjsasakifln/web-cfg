# pSEO Semantic SOTA — Delivery (post-skeptic)

Date: 2026-07-31

## SHAs
| Repo | Branch | SHA |
|---|---|---|
| web-cfg | main |  |
| extra-cli | feat/pseo-semantic-sota |  |

## Snapshot
- dataset_hash: 
- source_commit: 
- data_as_of: 2026-07-31

## Skeptic gap resolution
| Gap | Fix |
|---|---|
| Near-dup opportunities (valor cents) |  rounds value; second-pass merge |
| §3.2 fields missing on items | Full export of document_type, official_status, closing_*, canonical_source_url, duplicate_group_id, classification_*, exclusion_reasons |
| Agency reajustes not separate | sample_metrics.price_adjustment_count=13, record_type_distribution, limitations text |
| Approval invalidation only dataset_hash | material signature + render hash invalidation |
| Registry review fields null | data_quality_metrics + current_material_signature populated on build |
| Manutencao unaccented | _arch_label humanized with accents |
| ISO dates in table | br_date() for visible cells; ISO kept in datetime attrs |
| Muro false positive | Full object includes recomposição asfáltica — legitimate pavement cluster (not FP) |
| Radar near-dup gate | semantic_radar_fails value-tolerant fold |
| CI |  runs test/build/validate/audit |
| Tests §11.12/14/13 | Dataset props, material title invalidation, scenario chrome |

## Decisions (eight)
| page_id | status | human_review | fails |
|---|---|---|---|
|  | reject | NEEDS_DATA_FIX | suppliers<3, temporal_span_days<180, exercises<2 |
|  | reject | NEEDS_DATA_FIX | buyers<3, suppliers<3, temporal_span_days<90 |
|  | reject | NEEDS_DATA_FIX | obs<15, primary_contracts<15, temporal_span_days<90 |
|  | noindex | NEEDS_DATA_FIX | — |
|  | noindex | NEEDS_DATA_FIX | — |
|  | reject | NEEDS_CONTENT_FIX | no_direct_budget_edital_evidence, no_claim_specific_evidence |
|  | reject | NEEDS_CONTENT_FIX | no_direct_sinapi_sicro_evidence, no_claim_specific_evidence |
|  | reject | NEEDS_CONTENT_FIX | no_direct_aditivo_evidence, no_claim_specific_evidence |

## Verification
- extra-cli pytest: 51 passed
- web-cfg pseo:test: 27 passed
- pseo:validate: ok (publish=0, editorial publish_fail=0)
- analytics + validate:seo: ok
- Evidence: 

## Pendências
1. Human audit/approve radars PR/SC individually (quality-eligible, noindex)
2. Playwright browsers optional in CI
3. No deploy while publish=0
