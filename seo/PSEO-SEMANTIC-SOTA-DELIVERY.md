# Delivery summary — pSEO semantic SOTA (reexport)

Date: 2026-07-31

## HEADs
- web-cfg: `a3764b46e9e1b88de6b364dc1386b65b4d9a2a68` (main)
- extra-cli: `07a55982858777c89b3b2f4311446b24c1f988c8` (feat/pseo-semantic-sota @ worktree `.worktrees/pseo-sota`)

## Snapshot
- dataset_hash: `cf1ba390e871cf5e16c9873d8a65f60c7b4af393c1bc92e1fa93731b2486d4ad`
- data_as_of: 2026-07-31
- classified_aec_contracts: 214 (from 11931 raw; reajustes excluded as non-primary)
- open_bids after filter: 36
- agencies: 1 · prices: 2 · opportunities: 6 · markets: 4

## Contenção + reexport
- Aprovações antigas revogadas; **publish=0**
- Caxias: 49→**36** contratos primários; nome **Prefeitura Municipal de Caxias do Sul** (sem MRS-)
- Radars: sem `/app/contratos/`, sem R$ 0,00; SC Indaial deduped (7→5)
- Labels: Paralelepípedo / Piauí / Manutenção Predial

## Decisões (oito)
| page_id | status | human_review | notes |
|---|---|---|---|
| agency-88830609 | reject | NEEDS_DATA_FIX | 1 fornecedor, span 0d, concentração 100% |
| price-manutenção RS | reject | NEEDS_DATA_FIX | 1 buyer/supplier, span 0d |
| price-paralelepípedo PI | reject | NEEDS_DATA_FIX | 12 obs < 15 |
| radar-edif-PR | **noindex** | NEEDS_DATA_FIX | quality-eligible após dedup; aguarda review humana |
| radar-pav-SC | **noindex** | NEEDS_DATA_FIX | quality-eligible após dedup; aguarda review humana |
| 3 cenários | reject | NEEDS_CONTENT_FIX | sem evidência claim-específica |

## Verificação
- extra-cli pytest tests/pseo: 51 passed
- web-cfg pseo:test: 23 passed
- pseo:validate: ok (0 publish, editorial publish_fail=0)
- Dataset/breadcrumb: humanizados; metodologia sem `— a —`

## Pendências
- Radars PR/SC quality-eligible mas **não aprovados** (sem bulk; checklist individual)
- Snapshot source_commit no manifest ainda aponta export run em b8b6c81; código tip é 07a55982 (reexport opcional para alinhar SHA)
- Playwright e2e não rodado neste ambiente
- Deploy: não (publish=0 é o estado correto)
