# BOFU intent dominance — BOFU-CORE

**Campaign:** `CONFENGE-WEB-BOFU-INTENT-DOMINANCE-02`  
**As of:** 2026-08-19  
**Git head (origin/main pin):** `faadc16609210522c9ffaf32a7b944817f6c6214`  
**Decision state:** VALIDATE (ledger) / EXECUTE_NOW (honesty gates)  
**Leverage:** distribution, data, trust  
**Time to evidence:** this PR for the ledger; `gsc_live_state` is `LIVE_JOB_OK`  
**North Star:** inbound qualified pipeline / month — not page count

## Visitor job

An operator deciding BOFU work needs one ledger that says, for each
commercial family: which job, which canonical URL, which state, what
evidence exists, what overlaps, and what is the next test or kill —
without converting historical CSV or SERP samples into live rank.

## GSC live

- `gsc_live_state`: `LIVE_JOB_OK`
- recommendation: `observe_only`
- Actions run: `32322344062`
- rows (top-set only): `95` as_of `2026-08-17`
- core ready_for_product_decisions: `False`
- committed main last_sync: `gitignored_not_the_live_overlay`

Credentials are proven by isolated job `gsc` on run `32322344062`.
The 2026-08-09 CSV, redacted snapshots and SERP samples are **not** this
live pull. Top-rows-only, date gaps, mixed device and non-BR geo do not
authorize TOP* or HTML. PR #159 remains an observability candidate, not
main. Absence of a path in the returned top rows is not ranking zero.

## Coverage

- families: **13** (100% owner/state/reason)
- state counts: `COVERED`=5, `FROZEN`=6, `NO_CANONICAL`=2
- P0/P1 census missing: none
- official SERP position claimed: `False`

## Families

| ID | P | State | Owner | Issue | Reason | Edit now |
|---|---|---|---|---:|---|---|
| `aditivos` | P1 | `FROZEN` | `/aditivos-obras-publicas/` | 128 | frozen_issue_128 | no |
| `medicoes-pagamentos` | P1 | `FROZEN` | `/medicoes-glosas-obras-publicas/` | 128 | frozen_issue_128 | no |
| `reequilibrio` | P1 | `FROZEN` | `/reequilibrio-obras-publicas/` | 128 | frozen_issue_128 | no |
| `orcamento-bdi` | P1 | `FROZEN` | `/auditoria-orcamento-licitacao/` | 128 | frozen_issue_128 | no |
| `carteira-operacao` | P1 | `FROZEN` | `/diagnostico-b2g-360/` | 128 | frozen_issue_128 | no |
| `edital-proposta` | P1 | `FROZEN` | `/diagnostico-pre-licitacao/` | 128 | frozen_issue_128 | no |
| `defesa-margem` | P0 | `COVERED` | `/defesa-margem-contratos-publicos/` | 60 | canonical_page_exists_current_rank_unknown | no |
| `atrasos-prorrogacao` | P2 | `COVERED` | `/atrasos-prorrogacao-obras-publicas/` | 127 | canonical_page_exists_current_rank_unknown | no |
| `defesa-sancoes` | P2 | `COVERED` | `/defesa-tecnica-contratos-publicos/` | 61 | canonical_page_exists_current_rank_unknown | no |
| `gestao-contratual` | P2 | `COVERED` | `/acompanhamento-contratos-obras/` | 61 | canonical_page_exists_current_rank_unknown | no |
| `bid-room` | P2 | `COVERED` | `/bid-room-licitacoes-obras/` | 88 | canonical_page_exists_current_rank_unknown | no |
| `bid-readiness` | P1 | `NO_CANONICAL` | `issue:155` | 155 | gated_issue_no_public_page | no |
| `partner-integrity` | P1 | `NO_CANONICAL` | `issue:156` | 156 | gated_issue_no_public_page | no |

Frozen families stay FROZEN even when live top-rows show Spain/Chile
impressions or mixed devices. That is not a BR TOP* and not edit-now.

## Dependency graph

Required issues #61, #128, #151–#156 and PRs #157–#159 are nodes.

- **#128** owns the six frozen pillars.
- **#153** owns origin→service (`destination_service_id`). This slot does not edit `script.js`.
- **#155 / #156** are GATED families, not existing pages.
- **PR #157** is exactly one contract-analysis canary, not a BOFU family.
- **PR #158** is the Data Desk kit; this ledger is not a second target registry.
- **PR #159** is the observability producer candidate. `gsc_live_state` is `LIVE_JOB_OK`; PR #159 is not merged to main.

## SERP census

Up to four queries per P0/P1 family. Organic URLs are a **web_search_api
sample** with `ranking_context=UNKNOWN`, `personalization=UNKNOWN`,
`geo=UNKNOWN`, `device=UNKNOWN`. Local pack, paid and SERP features are
separated as `UNKNOWN` — they were not observed as distinct objects.
No evasive scraping. No single-query official position.

Notable sample facts (not ranks):

- `aditivos obras públicas` collides with *concrete admixture* intent.
- `glosa de medição obra pública` showed the owned article `/conteudos/glosa-de-medicao-obra-publica/`, not the pillar.
- `diagnóstico pré-licitação` and `diagnóstico B2G 360°` showed CONFENGE service URLs in this sample.
- `bdi diferenciado obra pública` showed `/auditoria-orcamento-licitacao/` in this sample.
- `prontidão licitação` / CEIS-CNEP samples did not show a CONFENGE landing (GATED).

## What this slot does not do

- Recreate the Organic Opportunity Engine.
- Edit HTML, analytics, sitemaps, offers or package files.
- Convert historical GSC, redacted snapshots or SERP samples into live rank.
- Open a second Data Desk target registry.
- Treat PR #157 as a new BOFU family.

## Rollback

Revert this PR. No public HTML changed.

