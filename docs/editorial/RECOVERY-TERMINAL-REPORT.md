# Recovery terminal report — clean inbound launch

## Terminal status

`READY_FOR_NAMED_HUMAN_APPROVAL`

## What this is

Base editorial coerente, segura e auditável. **Não** é “site 10/10”.  
Nenhuma aprovação humana foi carimbada por automação.

## Editorial state (derived)

| Surface | Count | Indexation |
|---------|------:|------------|
| Wave 1 awaiting human | 11 | `noindex,follow` |
| Wave 1 rejected (`jur-sumula-260-art`) | 1 | `noindex` / out of sitemaps |
| Wave 1 HUMAN_APPROVED / INDEXABLE | 0 / 0 | — |
| Legacy `/conteudos/` indexable public guides | 22 | `index,follow` (pre-existing) |
| Hub claimed guides | 22 | derived, not hardcoded 120 |
| Editorial sitemap locs | 0 | empty until human approval |
| pSEO publish | 0 | blocked / operational zero |

## Preserved from PR #10/#11 intent

- Correção da alegação pública de 120 guias → inventário real (22 indexáveis)
- Naturalidade / remoção de copy de máquina em páginas indexáveis
- Shell de marca (nav/footer) alinhado a `brand.json`
- CTAs por jornada
- Gates de naturalidade, superfície, brand, conversão, similaridade
- Pacote de revisão humana Wave 1 (sem decisões carimbadas)
- Matriz de canibalização (indexação bloqueada até decisão humana)

## Discarded from PR #11 contamination

- ~1937 HTML em `inteligencia/*` (bulk gerado)
- Aprovações `INDEXABLE` / revisor Tiago sem evidência humana válida
- Briefs/national engine noise em massa
- ~1.19M linhas de artefato/efêmero
- Declarações operacionais prematuras

## Governance hardenings

- `approve_cli.py` exige checklist completo, `--material-hash`, `--confirm`, revisor humano, bloqueio em CI
- `review.py set … APPROVED` exige o mesmo; bulk/`ALL`/tester bloqueados
- `scripts/editorial/truth.py` deriva contagens únicas; falha em contradições
- Testes negativos cobrem checklist ausente/parcial, revisor vazio, bulk, CI, hash

## External actions

Ver `docs/editorial/EXTERNAL-ACTIONS-RECOVERY.md`.

## Supersedes

PRs #10 e #11 — substituídas por esta recovery limpa a partir de `main`.
