# Pre-flight — CONFENGE-WEB-BOFU-SAFE-EXECUTION-01

as_of: 2026-08-19 (America/Sao_Paulo campaign day).  
source_kind: `git fetch origin main` + GitHub issue/PR bodies + in-repo HTML SHA-256.

## Reconcile

| Ref | State at fetch | Relation to this slot |
|---|---|---|
| `origin/main` | `faadc16609210522c9ffaf32a7b944817f6c6214` | Branch `campaign/confenge-bofu-safe-execution-01` created from this SHA. Working tree matched origin/main before exclusive-area edits. |
| #60 | open (reopened). First vertical / Diagnóstico de Defesa de Margem. Tool lives at `/ferramentas/diagnostico-defesa-margem/`. | Do not edit the tool. Defesa de margem page remains the recurring umbrella (detecção / documentação / cálculo / decisão). |
| #127 | open. Human noindex gate. Canary preference: `/conteudos/chuva-prorrogacao-prazo-obra-publica/`. | Do not edit the chuva canary. Atrasos/prorrogações landing owns causa, responsabilidade, caminho crítico, registro contemporâneo. |
| #128 | open. BOFU pillars in observation: `/aditivos-obras-publicas/`, `/medicoes-glosas-obras-publicas/`, `/reequilibrio-obras-publicas/`, `/auditoria-orcamento-licitacao/`, `/diagnostico-b2g-360/`, `/diagnostico-pre-licitacao/`. | Frozen. Not in exclusive area. |
| #153 | open. Single content→service transition with destination fields (`data-cta-id`, `data-route-family`, `data-asset-id`, `data-journey`, `data-offer-id`, `data-event-name`). | Preserve existing attributes. Add missing body/CTA attrs on defesa-técnica and acompanhamento without renaming values on atrasos/defesa-margem. |
| PR #159 | draft at campaign freeze. Head `feba68928ab997229028a66bb25d3b3b5a439206`. GSC loop at that head: `credential_failure` / BLOCKED. Current shipped overlay: `LIVE_JOB_OK`, `core_ready_for_product_decisions=false`. | Observe_only queue is the contamination set. |

## Exclusive-area proof vs `observe_only`

Frozen snapshot: [`observe-only-queue-pr-159.json`](observe-only-queue-pr-159.json).

PR #159 next-action queue (also in the PR body):

1. `observe_only` `/conteudos/sinapi-desonerado-nao-desonerado/` (#126)
2. `observe_only` `/aditivos-obras-publicas/` (#128)
3. `observe_only` `/conteudos/chuva-prorrogacao-prazo-obra-publica/` (#127)

Safe-execution URLs, none of which appear in that set:

- `/defesa-margem-contratos-publicos/`
- `/atrasos-prorrogacao-obras-publicas/`
- `/defesa-tecnica-contratos-publicos/`
- `/acompanhamento-contratos-obras/`

## Before freeze

Machine: [`BEFORE-FREEZE.json`](BEFORE-FREEZE.json) (title, H1, meta, canonical, JSON-LD, body data-attrs, primary CTA hrefs, SHA-256).  
Performance: [`performance-before.json`](performance-before.json) from `python3 scripts/site/audit_performance.py` (static budget, not Lighthouse).

| Slug | SHA-256 (prefix) | Body #153 attrs before |
|---|---|---|
| defesa-margem-contratos-publicos | `03252ad2b069` | present (`data-cta-id`, `data-route-family`, `data-asset-id`, `data-journey`, `data-offer-id`) |
| atrasos-prorrogacao-obras-publicas | `18996343a345` | present (`data-cta-id`, `data-route-family`, `data-asset-id`, `data-journey`) |
| defesa-tecnica-contratos-publicos | `2f32ce50be3a` | absent on `<body>` |
| acompanhamento-contratos-obras | `92a5ed662316` | absent on `<body>` |

## SERP census

See [`SERP-CENSUS.md`](SERP-CENSUS.md). Current live GSC overlay is `LIVE_JOB_OK` (`core_ready_for_product_decisions=false`). PR #159 freeze recorded `credential_failure`. Absence is not recorded as zero.
