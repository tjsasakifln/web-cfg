# Epic: Resolução de Débitos Técnicos — CONFENGE

**Epic ID:** EPIC-TD-001  
**Workflow:** brownfield-discovery · Phase 10  
**Agent:** @pm  
**Status:** Draft (ready for prioritization)  
**Date:** 2026-08-05  
**Source:** `docs/prd/technical-debt-assessment.md` + `docs/reports/TECHNICAL-DEBT-REPORT.md`  

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

- Acesso Netlify env + Blobs  
- Secrets ops/ntfy/Resend  
- Branch protection para required checks  
- Continuidade do redesign em `feat/visitor-experience-redesign` (merge strategy)  

---

## Lista de stories

| Story | Título | Prioridade | Fase |
|-------|--------|------------|------|
| 1.1 | Fail-closed lead store + CI production profile | P0 | A |
| 1.2 | Ops auth hardening + negative tests | P0 | A |
| 1.3 | Design gates as non-bypass quality bar | P0 | A |
| 1.4 | Product-real `.env.example` | P1 | A |
| 1.5 | Lead export pipeline + schema tests | P1 | B |
| 1.6 | Attribution cohorts precompute | P1 | B |
| 1.7 | Visitor journey residual closure | P1 | B |
| 1.8 | Form multi-step a11y + tool commercial CTA | P1 | B |
| 1.9 | CSS token/primitives modularization (incremental) | P2 | C |
| 1.10 | Split `script.js` modules | P2 | C |
| 1.11 | DSAR CLI + retention purge evidence | P2 | C |
| 1.12 | GSC insights single-source + Blobs backup export | P2 | C |

Stories detalhadas: `docs/stories/story-1.1-*.md` … `story-1.12-*.md` (core set 1.1–1.8 written fully; 1.9–1.12 summarized in story pack).

---

## Risks

| Risco | Mitigação |
|-------|-----------|
| Conflito com WIP redesign | Stories UX na mesma branch/estratégia de merge |
| Over-scope warehouse | Export first only |
| Secret rotation downtime | Dual-key window |

---

## Definition of Done (Epic)

- [ ] Todas stories P0 Done com evidência  
- [ ] P1 Done ou explicitamente deferred com reason  
- [ ] Relatório executivo atualizado com “resolved vs remaining”  
- [ ] Nenhum gate de design/lead regredido  

---

## Handoff

`@sm` pode quebrar stories adicionais a partir desta epic.  
`@dev` inicia por **story 1.1**.  
`@devops` só após QA gate por story.  
