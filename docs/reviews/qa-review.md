# QA Review — Technical Debt Assessment

**Workflow:** brownfield-discovery · Phase 7  
**Agent:** @qa (Quinn)  
**Date:** 2026-08-05  
**Inputs:**

- `docs/prd/technical-debt-DRAFT.md`  
- `docs/reviews/db-specialist-review.md`  
- `docs/reviews/ux-specialist-review.md`  
- Architecture / SCHEMA / frontend-spec  

---

## Gate Status: **APPROVED**

Assessment is complete enough to finalize and plan. No critical gaps that block Phase 8–10. Findings below are incorporated into final priorities.

---

## 1. Gaps identificados

| Gap | Severity | Mitigation |
|-----|----------|------------|
| Exact production lead volume unknown | Medium | P1 export still justified; measure in ops health first story |
| Runtime verification of Netlify env (memory fallback off) not executed in this YOLO pass | **High** | Story must include live ops checklist + config assert |
| CrUX / field perf not in debt matrix as observability epic item | Low | Keep SYS-08 P3 |
| Security penetration test beyond static review | Medium | DATA-12 includes audit; optional external review later |
| AIOX tooling debt may distract product backlog | Medium | Explicit epic scope boundary: product only |
| No automated test listed that fails when `LEAD_ALLOW_MEMORY_FALLBACK=1` in production profile | **High** | Add gate test (DATA-20) |

---

## 2. Riscos cruzados

| Risco | Áreas | Mitigação |
|-------|-------|-----------|
| Shipping redesign without design gates | UX + Sistema + SEO | Hard-fail `test:design` / visitor-redesign in CI |
| “Fix” data by adding Supabase to public build | Data + Deploy | Forbidden; warehouse/export only |
| CSS refactor during redesign | UX + Sistema | Sequence: finish journeys → then modularize |
| Ops token leak exposes all leads | Data + Security | P0 rotation + least privilege |
| Dirty release artifacts confuse prod identity | Sistema + Ops | Hygiene story; ignore rules already partially exist |
| Email channel false confidence | Data + Ops + UX | Status page honesty in ops docs |

---

## 3. Dependências validadas

```text
P0 safety (DATA-04/12/20, SYS-13, UX-02 gates)
    → P1 visitor journey closure (UX-03/05/11/15/16)
    → P1 data export (DATA-01/11)  [parallel with journey after P0]
    → P2 CSS/JS modularization (SYS-02/03, UX-01/09)
    → P2 compliance (DATA-10/13/16)
    → P3 TS/storybook/CrUX
```

**Order is sound.** No circular blockers. DATA-02 (full CRM DB) **depends on** successful export path design (DATA-01) — do not start dual-write first.

---

## 4. Testes requeridos pós-resolução

| Debt cluster | Tests required |
|--------------|----------------|
| Store fail-closed | Unit: production profile rejects memory; deploy smoke `ops health` |
| Ops auth | Negative tests unauthorized → 401/403 |
| Design gates | Existing design/copy/visitor-redesign must stay green |
| Hub/tools UX | `test:hub-truth`, `test:tools`, `test:tools-uiux-e2e`, axe tools+obrigado |
| Lead export | Fixture test: N leads → export file schema valid |
| Env template | Doc test: `.env.example` names ⊆ ENV-VARS.md product set |
| GSC single source | Test: hash(data/ops/gsc-insights) == functions copy after build step |
| Retention/DSAR | Script dry-run test + manual checklist evidence |

**Regression pack (always):**  
`npm test` subset — at minimum: lead-function, form-funnel, design, copy, inbound-gates, secrets-scan, analytics PII.

---

## 5. Quality of the assessment itself

| Check | Result |
|-------|--------|
| Traceability to source docs | Pass |
| Severities calibrated by specialists | Pass |
| Non-debts explicit (static arch intentional) | Pass |
| Effort ranges present | Pass |
| Invention avoided (no fake Supabase schema) | Pass |
| Actionable stories possible | Pass |

---

## 6. NFR snapshot

| NFR | Current | Debt risk |
|-----|---------|-----------|
| Security | Good API hygiene | Ops token & store fallback |
| Performance (lab) | Excellent | Content weight growth |
| A11y | Excellent lab/axe | Multi-step focus (UX-16) |
| Maintainability | Mixed | Monolith CSS/JS + content scale |
| Observability | Partial | Export + CrUX + step events |
| Reliability leads | Good write path | Fallback misconfig |

---

## 7. Parecer final

**APPROVED** for final assessment and epic planning.

Conditions (non-blocking but must appear in final plan):

1. P0 package is first sprint — no cosmetic refactors before store/auth/gates.  
2. Epic scope excludes AIOX framework churn unless it blocks product builds.  
3. Each story carries explicit test names from section 4.  

**Gate decision logged:** APPROVED · Quinn (@qa) · 2026-08-05
