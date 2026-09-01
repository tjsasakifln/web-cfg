# BOFU intent dominance — BOFU-CORE

**Campaign:** `CONFENGE-WEB-BOFU-INTENT-DOMINANCE-02`
**As of:** 2026-08-31
**Git head (origin/main pin):** `81c600b7c26dcc606d3a03e648ecd9820d9c1c37`
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
authorize TOP* or HTML. Merged PR #159 is historical implementation, not
an operational owner or rank claim. Absence from returned top rows is not ranking zero.

## Coverage

- families: **15** (100% owner/state/reason)
- state counts: `COVERED`=7, `FROZEN`=6, `NO_CANONICAL`=2
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
| `diagnostico-expansao` | P0 | `COVERED` | `/diagnostico-b2g-expansao/` | — | canonical_page_exists_current_rank_unknown | no |
| `diretoria-b2g` | P0 | `COVERED` | `/diretoria-b2g/` | — | canonical_page_exists_current_rank_unknown | no |
| `bid-readiness` | P1 | `NO_CANONICAL` | `gap:bid-readiness` | — | closed_without_demand_or_authorized_current_contract | no |
| `partner-integrity` | P1 | `NO_CANONICAL` | `gap:partner-integrity` | 156 | gated_issue_no_public_page | no |

Frozen families stay FROZEN even when live top-rows show Spain/Chile
impressions or mixed devices. That is not a BR TOP* and not edit-now.

## Dependency graph

Issues #61, #128, historical #151–#155, open #156 and PRs #157–#159 remain provenance nodes.

- **#128** owns the six frozen pillars.
- The `web-cfg/attribution-contract` owns origin→service; closed #153 is historical.
- Closed #155 is a historical no-demand-evidence gap; open #156 is externally blocked.
- Closed-unmerged PR #157 remains a canary reference, not a BOFU family.
- Merged PR #158 is historical Data Desk implementation; this ledger is not a second registry.
- Merged **PR #159** is the historical observability implementation. `gsc_live_state` is `LIVE_JOB_OK`; top-row evidence still does not authorize rank or demand claims.

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
- Treat historical PRs or closed issues as current operational owners.

## Rollback

Revert this PR. No public HTML changed.
