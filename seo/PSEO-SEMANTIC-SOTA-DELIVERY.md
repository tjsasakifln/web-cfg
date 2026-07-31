# pSEO Semantic SOTA — Before × After (final)

Date: 2026-07-31

## SHAs
| Repo | Branch | SHA |
|---|---|---|
| web-cfg | main | `13937505742e4c312afa3f3d9c4e6a740c1f6936` |
| extra-cli | feat/pseo-semantic-sota | `66e78218e2ecae0b856fd5085c812598cf86e187` |

## Snapshot
- dataset_hash: `ae0ba7dd06a469910454e41b12f0d5c8ad1dc1900ccd08161d495270ac8e996a`
- source_commit: `66e78218e2ecae0b856fd5085c812598cf86e187`
- data_as_of: 2026-07-31
- key counts: agencies=1, prices=2, opportunities=6, aec_contracts=214

## Registry
- status counts: {'noindex': 6, 'reject': 13}
- **publish: 0**

## Before × After
| Item | Antes | Depois |
|---|---|---|
| Páginas publish/indexáveis | 8 APPROVED | **0 publish** |
| Caxias contratos | 49 (com reajustes) | **36 primários** |
| Nome Caxias | MRS-PREFEITURA… | **Prefeitura Municipal de Caxias do Sul** |
| Score compensa falha | sim | **não** (gates semânticos) |
| Link /app/contratos/ em radar | sim | **0** |
| R$ 0,00 valor ausente | sim | **não informado** |
| Duplicatas Indaial/SC | sim | **dedup fingerprint** |
| Slug interno na UI | sim | **humanizado** |
| Meta cortada mid-word | sim | **soft truncate** |
| evidence_count genérico | sustentava claim | **reject sem sinal direto** |
| Bulk auto-approve | risco | **checklist + audit PAGE_ID** |
| Editorial audit | ausente | **publish_fail=0** (P0 residual só em reject) |
| Learn/metrics | docs | **learn.py + metrics/** |
| Intent map | ausente | **pseo-query-map + cannibalization** |

## Decisões finais (oito)
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

## Verificação
- extra-cli `pytest tests/pseo`: **51 passed**
- web-cfg `pseo:test`: **23 passed**
- `pseo:validate`: ok (editorial publish_fail=0, p0 residual=14 only on reject gates)
- `test:analytics`: ANALYTICS_UNIT_OK
- `validate:seo`: VALIDATION_OK
- `pseo:audit --skip-determinism`: ok
- Playwright: CLI 1.62 present; browsers not installed in project — structural HTML fallback in scratch `playwright-env.txt`

## Pendências reais
1. Aprovar individualmente radars PR/SC (`noindex` quality-eligible) via `review.py audit` + checklist — **sem bulk**.
2. Playwright e2e: `npm i -D @playwright/test && npx playwright install` se CI precisar.
3. Deploy Netlify: **não** enquanto publish=0 (estado correto).
4. Expandir datalake (tempo/diversidade) se quiser Caxias/preços elegíveis **sem baixar thresholds**.

## Política
Zero páginas indexáveis é sucesso enquanto os dados não sustentarem publicação.
