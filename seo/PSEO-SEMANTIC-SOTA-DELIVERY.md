# pSEO Semantic SOTA — Delivery (post-skeptic)

Date: 2026-07-31

## SHAs
| Repo | Branch | SHA |
|---|---|---|
| web-cfg | main | `0473c807d17ade24fdb3c51b75e6adf2d836067c` |
| extra-cli | feat/pseo-semantic-sota | `6108210312d587d108a29464e4edafefc9d5cb15` |

## Snapshot
- dataset_hash: `423c6e379c3127bc3d2c5ae243375686e8b04ae4c22e7ffbb6dcfe49f76591ae`
- source_commit: `de401aecc5b8471d632e0af7c4b38a40fa70706d`
- data_as_of: 2026-07-31

## Skeptic gap resolution
| Gap | Fix |
|---|---|
| Near-dup opportunities (valor cents) | near_duplicate_key rounds value; second-pass merge |
| Section 3.2 fields missing on items | Full export of document_type, official_status, closing_*, canonical_source_url, duplicate_group_id, classification_*, exclusion_reasons |
| Agency reajustes not separate | sample_metrics.price_adjustment_count=13, record_type_distribution |
| Approval invalidation only dataset_hash | material signature + render hash invalidation |
| Registry review fields null | data_quality_metrics + current_material_signature on build |
| Manutencao unaccented | _arch_label humanized with accents |
| ISO dates in table | br_date() visible; ISO only in datetime attrs |
| Muro false positive | Full object has recomposicao asfaltica — legitimate pavement |
| Radar near-dup gate | semantic_radar_fails value-tolerant fold |
| CI | .github/workflows/pseo.yml |
| Tests 11.12/14/13 | Dataset props, material title invalidation, scenario chrome |

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
- pseo:validate: ok (publish=0, editorial publish_fail=0)
- analytics + validate:seo: ok
- Evidence: implementer/skeptic-evidence.txt

## Pendencias
1. Human audit/approve radars PR/SC individually (quality-eligible, noindex)
2. Playwright browsers optional in CI
3. No deploy while publish=0
