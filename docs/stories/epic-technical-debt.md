# Epic: Resolução de Débitos Técnicos — CONFENGE

**Epic ID:** EPIC-TD-001  
**Workflow:** brownfield-discovery · Phase 10  
**Agent:** @pm  
**Status:** Done — all stories 1.1–1.12 QA PASS  
**Date:** 2026-08-05  
**Source:** `docs/prd/technical-debt-assessment.md` + `docs/reports/TECHNICAL-DEBT-REPORT.md`  
**Reversa inputs:** `_reversa_sdd/` (domain, ADRs 004–007, lead-intake, permissions, architecture)

> Historical pre-cutover epic. Runtime dependencies below describe the 2026-08-05 execution and are superseded by `docs/architecture/RUNTIME-AUTHORITY.md`.

---

## Objetivo

Reduzir risco operacional e custo de evolução do site CONFENGE **sem reescrever a arquitetura static+functions**, fechando: (1) segurança do data plane de leads, (2) export/observabilidade comercial, (3) conclusão da experiência visitor-centered, (4) manutenibilidade CSS/JS e higiene de artefatos.

---

## Escopo

### IN

- P0 store fail-closed + CI production profile  
- P0 ops auth hardening  
- P0/P1 design gates as required quality bar  
- P1 lead export + attribution cohorts  
- P1 product `.env.example`  
- P1 visitor journey residual fixes (hub/tools/form a11y/CTA)  
- P2 CSS/JS modularization (incremental)  
- P2 DSAR/retention/backup/GSC single-source  
- Stories with automated tests named  

### OUT

- Migração para React/Next/SPA  
- Supabase no build público Netlify  
- Reescrita do motor editorial/pSEO  
- Refactors no framework AIOX (salvo se bloquear build do produto)  
- Dual-write CRM completo (DATA-02 full) — **fase futura** após export  

---

## Critérios de sucesso

1. Produção não consegue servir leads em MemoryStore  
2. Ops unauthenticated não lista leads  
3. `test:design` + visitor-redesign verdes e exigíveis  
4. Job/script de export de leads com schema testado  
5. Jornadas visitor (home, hub, checklist, tools CTA, form) com gates verdes  
6. Runbook DSAR dry-run executado uma vez com evidência  
7. Assessment links permanecem a fonte de verdade  

---

## Timeline & budget (premissa)

| Fase | Calendário | Horas | Orçamento @R$150/h |
|------|------------|-------|---------------------|
| A Safety | Sem 1–2 | 20–40 | R$ 3–6k |
| B Fundação | Sem 3–6 | 60–110 | R$ 9–16,5k |
| C Otimização | Sem 7–12 | 80–140 | R$ 12–21k |
| **Total epic** | **~8–12 sem** | **160–290** | **R$ 24–43,5k** |

(P3 opcional fora do budget core.)

---

## Dependências

- Historical pre-cutover dependency: access to Netlify env + Blobs
- Secrets ops/ntfy/Resend  
- Branch protection para required checks  
- Continuidade do redesign em `feat/visitor-experience-redesign` (merge strategy)  

---

## Lista de stories — status pós-validação PO (Ready wave)

| Story | Título | Prioridade | Fase | Status | File |
|-------|--------|------------|------|--------|------|
| 1.1 | Fail-closed lead store + CI production profile | P0 | A | **Done** | `story-1.1-fail-closed-lead-store.md` |
| 1.2 | Ops auth hardening + negative tests | P0 | A | **Done** | `story-1.2-ops-auth-hardening.md` |
| 1.3 | Design gates as non-bypass quality bar | P0 | A | **Done** | `story-1.3-design-gates-quality-bar.md` |
| 1.4 | Product-real `.env.example` | P1 | A | **Done** | `story-1.4-product-env-example.md` |
| 1.5 | Lead export pipeline + schema tests | P1 | B | **Done** | `story-1.5-lead-export-pipeline.md` |
| 1.6 | Attribution cohorts precompute | P1 | B | **Done** | `story-1.6-attribution-cohorts.md` |
| 1.7 | Visitor journey residual closure | P1 | B | **Done** | `story-1.7-visitor-journey-residual.md` |
| 1.8 | Form multi-step a11y + tool commercial CTA | P1 | B | **Done** | `story-1.8-form-a11y-tool-cta.md` |
| 1.9 | CSS token/primitives modularization (incremental) | P2 | C | **Done** | `story-1.9-css-token-primitives.md` |
| 1.10 | Split `script.js` modules | P2 | C | **Done** | `story-1.10-split-script-modules.md` |
| 1.11 | DSAR CLI + retention purge evidence | P2 | C | **Done** | `story-1.11-dsar-retention-purge.md` |
| 1.12 | GSC single-source + Blobs backup export | P2 | C | **Done** | `story-1.12-gsc-single-source-backup.md` |

Pack index (non-implementable): `story-1.9-1.12-pack-p2.md` — points to full 1.9–1.12 files.

**Implementation order:** `@dev` starts at **1.1** → 1.2 → 1.3 (P0), then 1.4–1.8 (note 1.6 depends on 1.5), then Phase C 1.9–1.12.

---

## Risks

| Risco | Mitigação |
|-------|-----------|
| Conflito com WIP redesign | Stories UX na mesma branch/estratégia de merge |
| Over-scope warehouse | Export first only |
| Secret rotation downtime | Dual-key window |

---

## Definition of Done (Epic)

- [x] Todas stories P0 Done com evidência  
- [x] P1 Done ou explicitamente deferred com reason  
- [x] Relatório executivo atualizado com “resolved vs remaining”  
- [x] Nenhum gate de design/lead regredido  

**Ready-wave DoD (this validation pass):** all 1.1–1.12 full story files Status Ready after @po validate-story-draft GO + Reversa reconciliation.

---

## Handoff

`@sm` expanded 1.9–1.12 from pack.  
`@po` validated GO on 1.1–1.12 (Draft → Ready).  
`@dev` inicia por **story 1.1**.  
`@devops` só após QA gate por story (branch protection for 1.3 docs handoff).  

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 1.0.0 | Epic draft from brownfield discovery Phase 10 | @pm |
| 2026-08-05 | 1.1.0 | Ready wave: all stories 1.1–1.12 Status Ready; P2 expanded; Reversa refs | @po |
| 2026-08-05 | 2.0.0 | All stories 1.1–1.12 implemented + QA PASS; epic TD closed for P0–P2 | @dev / @qa |
