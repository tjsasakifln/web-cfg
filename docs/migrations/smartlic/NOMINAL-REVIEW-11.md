# Nominal review — 11 REDIRECT_301 destinations (WEB-017)

Reviewed 2026-08-16 against local HTML in this checkout and live GET of `https://confenge.com.br/...` (see implementer scratch). Human accept of this set is still required. This file is the review packet, not an approval.

Inventory pin: `9c47b1b26e1dfb83cb8ea476091d9893931d17ce434ca54e7b6af933b85433fa`

None of the 11 targets is `https://confenge.com.br/` or `/consultoria-b2g/`. Unique destinations: 6.

| # | Legacy | Target | Local title / H1 | Intent match | Canonical | robots | Brand | Readiness |
|---|---|---|---|---|---|---|---|---|
| 1 | `/blog/aditivos-contratuais-o-que-sao-como-monitorar` | `/aditivos-obras-publicas/` | Aditivos em obras públicas: limites, serviços extras e pleitos | Same job: amendments / extra scope | `https://confenge.com.br/aditivos-obras-publicas/` | index,follow | CONFENGE only | ready |
| 2 | `/blog/orgaos-risco-atraso-pagamento-licitacao` | `/conteudos/atraso-pagamento-contrato-publico-suspender/` | Atraso de pagamento: pode suspender a obra pública? | **ADJUST:** payment-delay risk, not work-delay/prorrogação. Previous target `/atrasos-prorrogacao-obras-publicas/` failed this review. | `https://confenge.com.br/conteudos/atraso-pagamento-contrato-publico-suspender/` | index,follow | CONFENGE only | ready |
| 3 | `/glossario/aditivo-contratual` | `/aditivos-obras-publicas/` | same as #1 | Glossary term → same amendment pillar | same as #1 | index,follow | CONFENGE only | ready |
| 4 | `/glossario/mapa-de-riscos` | `/conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/` | Matriz de riscos pode impedir o reequilíbrio econômico-financeiro? | Mapa/matriz is the same allocation artefact | `https://confenge.com.br/conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/` | index,follow | CONFENGE only | ready |
| 5 | `/glossario/matriz-de-riscos` | same as #4 | same as #4 | Same artefact | same as #4 | index,follow | CONFENGE only | ready |
| 6 | `/glossario/medicao` | `/medicoes-glosas-obras-publicas/` | Medições, glosas e pagamentos em obras públicas | Measurement/glosa pillar | `https://confenge.com.br/medicoes-glosas-obras-publicas/` | index,follow | CONFENGE only | ready |
| 7 | `/glossario/reajuste` | `/reequilibrio-obras-publicas/` | Reequilíbrio econômico-financeiro de contratos de obras | Reajuste is an explicit lead/section of this pillar (reajuste vs recomposição) | `https://confenge.com.br/reequilibrio-obras-publicas/` | index,follow | CONFENGE only | ready |
| 8 | `/glossario/reequilibrio-economico-financeiro` | `/reequilibrio-obras-publicas/` | same as #7 | Term → same pillar | same as #7 | index,follow | CONFENGE only | ready |
| 9 | `/perguntas/indice-reajuste-contrato-publico` | `/reequilibrio-obras-publicas/` | same as #7 | Index/path for restatement is covered (índices oficiais; reajuste vs reequilíbrio) | same as #7 | index,follow | CONFENGE only | ready |
| 10 | `/perguntas/prazo-pagamento-contrato-publico` | `/conteudos/atraso-pagamento-contrato-publico-suspender/` | same as #2 | Late payment + documented contractor response | same as #2 | index,follow | CONFENGE only | ready |
| 11 | `/perguntas/reequilibrio-economico-financeiro` | `/reequilibrio-obras-publicas/` | same as #7 | Same primary question | same as #7 | index,follow | CONFENGE only | ready |

## HOLD / RETIRE (this review)

- 54 `HOLD_TARGET_NOT_READY`: empty `target`/`target_url`, `expected_http` 410, named future surface that is not a live URL. No HOLD row has a ready 1:1 CONFENGE page. Do not 301 by sunk cost.
- 1190 `RETIRE_410`: empty target, 410, justification present. Farms (fornecedores/orgaos/cnpj/contratos), SaaS/auth/billing, TI-outside-ICP, and non-equivalent editorial stay retired.

## Not claimed

Live SmartLic 301/410/Location is SmartLic#2115 / UNOBSERVED (Railway fallback 404; www TLS SAN mismatch). This review does not accept the set for the human; it records the implementer check.
