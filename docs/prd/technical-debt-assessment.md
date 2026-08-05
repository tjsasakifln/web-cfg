# Technical Debt Assessment — FINAL

**Workflow:** brownfield-discovery · Phase 8  
**Agent:** @architect (final consolidation)  
**Date:** 2026-08-05  
**QA Gate:** APPROVED (Phase 7)  
**Branch baseline:** `feat/visitor-experience-redesign`  

Incorporates: DRAFT + db-specialist-review + ux-specialist-review + qa-review.

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total débitos catalogados | **48** (after specialist adds) |
| Críticos / P0 | **5** packages (store fail-closed, ops auth, design gates, CI store profile, memory ban) |
| Altos / P1 | **12** |
| Médios / P2 | **22** |
| Baixos / P3 | **9** |
| Esforço total estimado | **~220–360 horas** (engenharia; exclui owner-only email activation) |
| Arquitetura | Static inbound + Netlify Functions + Blobs — **intencional** |
| Maior risco de negócio | Misconfig de store/auth de leads + regressão visual “dashboard” |
| Maior alavanca | Export/query de leads + fechar redesign visitor |

CONFENGE não é um legado “quebrado”. É um **motor de inbound maduro** com débito de **escala operacional e manutenibilidade**, não de ausência de produto.

---

## Inventário completo de débitos

### Sistema (validado @architect + QA)

| ID | Débito | Severidade | Horas | Prioridade |
|----|--------|------------|-------|------------|
| SYS-01 | Content tree scale / source↔`_site` drift risk | Alto | 24–40 | P1 |
| SYS-02 | Dual CSS monolítico | Médio | 16–24 | P2 |
| SYS-03 | `script.js` monolítico | Médio | 12–20 | P2 |
| SYS-04 | Duplicação tool-compute js/cjs | Baixo | 2–4 | P3 |
| SYS-05 | `.env.example` genérico AIOX | Médio | 2–4 | P1 |
| SYS-06 | Overlay tooling AIOX no monorepo | Médio | 4–8 | P3 |
| SYS-07 | FormSubmit email PENDING | Médio | 2–8 | P2 |
| SYS-08 | CrUX field não claimable | Baixo–Médio | 4–8 | P3 |
| SYS-09 | *(merged → DATA-01/02)* | — | — | — |
| SYS-10 | Bus factor CLIs governança | Médio | 8–16 | P2 |
| SYS-11 | Artefatos release dirty | Médio | 4–8 | P2 |
| SYS-12 | Functions sem TypeScript | Baixo–Médio | 16–32 | P3 |
| SYS-13 | Memory fallback risco prod | **Crítico** | 4–8 | **P0** |
| SYS-14 | Throughput revisão humana editorial | Médio | process | P2 |

### Database / Data plane (validado @data-engineer)

| ID | Débito | Severidade | Horas | Prioridade |
|----|--------|------------|-------|------------|
| DATA-01 | List/scan Blobs O(n) | Alto | 24–40 | P1 |
| DATA-02 | Sem warehouse/CRM relacional | Alto | 40–80 | P1 |
| DATA-03 | Sem schema_version em records | Médio | 4–8 | P2 |
| DATA-04 | Multi-store misconfig | **Crítico** | 4–8 | **P0** |
| DATA-05 | Sem transações multi-entidade | Médio | 4–8 doc | P3 |
| DATA-06 | Dual path GSC insights | Médio | 4–8 | P2 |
| DATA-07 | Registries JSON dirty/ownership | Médio | 4–12 | P2 |
| DATA-08 | Env Supabase fantasma | Médio | 2–4 | P1 |
| DATA-09 | Email delivery incompleto | Médio | 2–8 | P2 |
| DATA-10 | Retention purge evidence | Médio | 4–8 | P2 |
| DATA-11 | Attribution join em memória | Médio | 16–24 | P1 |
| DATA-12 | Ops auth-only, sem defense-in-depth | **Alto** | 8–16 | **P0** |
| DATA-13 | Backup Blobs → owner store | Médio | 8–16 | P2 |
| DATA-14 | pSEO data pesado | Baixo | ongoing | P3 |
| DATA-15 | Tools localStorage only | Baixo | 0 | P3 (accept) |
| DATA-16 | DSAR não productizado | Médio | 8–16 | P2 |
| DATA-17 | Stage history não append-only | Médio | 8–12 | P2 |
| DATA-18 | Sem merge de identidade pessoa | Médio | 12–20 | P3 |
| DATA-19 | Ops over-fetch full records | Médio | 4–8 | P2 |
| DATA-20 | CI sem assert production store profile | **Alto** | 4–8 | **P0** |

### Frontend / UX (validado @ux-design-expert)

| ID | Débito | Severidade | Horas | Prioridade |
|----|--------|------------|-------|------------|
| UX-01 | Dual CSS sem primitivos | Médio | 16–24 | P2 |
| UX-02 | Regressão card-soup/dashboard | **Alto** | 4–8 | **P0** |
| UX-03 | Taxonomia residual hub | Médio | 4–12 | P1 |
| UX-04 | Form fallback messaging | Baixo–Médio | 2–4 | P2 |
| UX-05 | Checklist progressive states | Médio | 4–8 | P1 |
| UX-06 | Ritmo seções offers | Médio | ongoing | P2 |
| UX-07 | Sem storybook | Baixo–Médio | 16–24 | P3 |
| UX-08 | Contact float mobile | Baixo | 2–4 | P3 |
| UX-09 | Tool JS fragmentado | Médio | 8–16 | P2 |
| UX-10 | Thank-you shallow design | Baixo | 4–8 | P3 |
| UX-11 | Empty hubs | Médio | 2–6 | P1 |
| UX-12 | Visual regression CI parcial | Médio | 8–16 | P2 |
| UX-13 | Nav overload risk | Médio | 2–4 | P2 |
| UX-14 | Proof density uneven | Baixo–Médio | 4–8 | P2 |
| UX-15 | Tool → commercial CTA continuity | Médio | 4–8 | P1 |
| UX-16 | Form multi-step keyboard focus | Médio | 4–8 | P1 |
| UX-17 | Screenshots not required CI | Médio | 4–8 | P2 |

---

## Matriz de priorização final

### P0 — Safety & trust (Sprint 0 / first week)

| Package | IDs | Horas | DoD |
|---------|-----|-------|-----|
| Production store fail-closed | DATA-04, DATA-20, SYS-13 | 8–16 | CI + runtime reject memory/file in prod profile; smoke ops health |
| Ops auth hardening | DATA-12 | 8–16 | Rotation runbook, unauthorized tests, access log note |
| Anti-regression visual gates | UX-02 | 4–8 | design + visitor-redesign hard-fail documented in branch protection |

### P1 — Growth readiness & visitor finish

| Package | IDs | Horas |
|---------|-----|-------|
| Lead export + cohorts | DATA-01, DATA-11 | 40–64 |
| Env template product-real | SYS-05, DATA-08 | 2–4 |
| Visitor journey closure | UX-03, UX-05, UX-11, UX-15, UX-16 | 16–40 |
| Content/artifact hygiene plan | SYS-01 (phase A) | 8–16 |

### P2 — Maintainability & compliance

| Package | IDs | Horas |
|---------|-----|-------|
| CSS/JS modularization | SYS-02, SYS-03, UX-01, UX-09 | 36–60 |
| Data hygiene/compliance | DATA-03,06,07,10,13,16,17,19 | 40–72 |
| Ops/docs/email/release | SYS-07,09,10,11, DATA-09, UX-04,12–14,17 | 30–50 |

### P3 — Optional excellence

SYS-04,06,08,12 · DATA-05,14,15,18 · UX-07,08,10 · DATA-02 full dual-write only after export success

---

## Plano de resolução

### Fase A — Quick wins & safety (1–2 semanas)

1. Store production profile + CI assert  
2. Ops secret rotation + negative auth tests  
3. Confirm design gates in required checks  
4. Product `.env.example`  
5. Hub/empty-library residual fixes (if any left on branch)

### Fase B — Fundação dados & jornadas (2–4 semanas)

1. Nightly/on-demand lead export schema + job  
2. Precomputed attribution cohort JSON  
3. Checklist/tool CTA continuity + a11y focus  
4. Content ownership policy (generated vs source)

### Fase C — Otimização (4–8 semanas)

1. Modularize CSS tokens/components  
2. Split `script.js` modules  
3. DSAR CLI + retention purge evidence  
4. Blobs backup export  
5. Optional warehouse (DATA-02) if volume justifies  

### Fase D — Excelência (backlog)

TypeScript functions, storybook, CrUX program, person-level CRM merge  

---

## Riscos e mitigações (from QA)

| Risco | Mitigação |
|-------|-----------|
| Supabase no build público | Proibido por arquitetura; só export/warehouse offline |
| CSS refactor mid-redesign | Sequência B jornadas → C CSS |
| Token ops vazado | P0 rotation + least privilege |
| Gates bypass | Branch protection required checks |
| Escopo AIOX misturado | Epic boundary: product confenge only |

---

## Critérios de sucesso

| Critério | Medida |
|----------|--------|
| P0 closed | Zero path to memory store in production config; ops unauthorized denied; design gates green on main |
| P1 data | Export artifact produced in staging with schema tests |
| P1 UX | Visitor redesign journeys pass automated suite; axe on tools+obrigado |
| P2 | CSS modules or documented partial split; DSAR runbook executed once dry-run |
| No regression | Lab Lighthouse/a11y floors maintained on key URLs |
| Honesty | Production claims still evidence-backed under `docs/evidence/` |

---

## Explicit non-goals

- Rewrite as React/Next SPA  
- Move editorial content into SQL  
- Remove human editorial approval  
- “Fix” static architecture  

---

## Traceability

| Phase | Artifact |
|-------|----------|
| 1 | `docs/architecture/system-architecture.md` |
| 2 | `supabase/docs/SCHEMA.md`, `DB-AUDIT.md` |
| 3 | `docs/frontend/frontend-spec.md` |
| 4 | `docs/prd/technical-debt-DRAFT.md` |
| 5–7 | `docs/reviews/*` |
| 9 | `docs/reports/TECHNICAL-DEBT-REPORT.md` |
| 10 | `docs/stories/epic-technical-debt.md` + stories |

---

**Finalized by:** Orion orchestration / @architect role · 2026-08-05  
