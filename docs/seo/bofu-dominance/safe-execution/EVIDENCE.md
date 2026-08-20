# Evidence — CONFENGE-WEB-BOFU-SAFE-EXECUTION-01

as_of: 2026-08-19.  
source_kind: in-repo HTML + named gates. Current live GSC overlay is `LIVE_JOB_OK` with `core_ready_for_product_decisions=false`. PR #159 freeze recorded `credential_failure`.

## Visitor jobs (distinct)

| URL | Job |
|---|---|
| `/defesa-margem-contratos-publicos/` | Recurring umbrella of detecção, documentação, cálculo e decisão. Not the #60 tool. |
| `/atrasos-prorrogacao-obras-publicas/` | Causa, responsabilidade, caminho crítico e registro contemporâneo. Not the #127 chuva canary. |
| `/defesa-tecnica-contratos-publicos/` | Subsídio técnico, não advocacia, representação ou promessa de êxito. |
| `/acompanhamento-contratos-obras/` | Rotina preventiva e recorrente. Not a reactive duplicate. |

## Gates

- `python3 -m pytest tests/bofu_dominance/safe_execution -q` twice: 13 passed.
- `npm run validate:seo`, `test:brand`, `test:authority`, `test:copy`, `test:visible-parity` twice: exit 0.
- Diff vs `origin/main` confined to the four page folders, `docs/seo/bofu-dominance/safe-execution/**`, `tests/bofu_dominance/safe_execution/**`.
- CTA hrefs taken from `origin/main` remain. #153 body attrs on defesa-margem and atrasos kept; missing body attrs added on defesa-técnica and acompanhamento.
- PR #159 `observe_only` snapshot does not include the four URLs.

## Rollback

Revert the four `index.html` files. Campaign docs and tests are evidence-only.
