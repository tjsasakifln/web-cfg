# UX Specialist Review

**Workflow:** brownfield-discovery · Phase 6  
**Agent:** @ux-design-expert (Uma)  
**Date:** 2026-08-05  
**Input:** `docs/prd/technical-debt-DRAFT.md` + `docs/frontend/frontend-spec.md`  

---

## 1. Context validation

Visitor redesign branch is the correct baseline. Historical card-soup/dashboard issues are **real** (AUDIT.md) and partially remediated. UX debt is mostly **consistency + maintainability**, not “no design system”.

---

## 2. Débitos validados

| ID | Veredito | Severidade | Horas | Prioridade | Impacto UX |
|----|----------|------------|-------|------------|------------|
| UX-01 | Confirmado | Medium | 16–24 | P2 | Long-term consistency |
| UX-02 | **Confirmado — keep P0** | **High** | 4–8 | **P0** | Premium trust; business risk if gates skip |
| UX-03 | Confirmado (in progress on branch) | Medium | 4–12 remaining | P1 | Cognitive load |
| UX-04 | Confirmado (watch) | Low–Medium | 2–4 | P2 | Trust |
| UX-05 | Confirmado | Medium | 4–8 | P1 | Tool completion |
| UX-06 | Confirmado | Medium | 2–4 / offer | P2 | Offer clarity |
| UX-07 | Confirmado but **defer** | Low–Medium | 16–24 | P3 | Team efficiency only |
| UX-08 | **Adjust** | Low | 2–4 | P3 | Intentional hide if header WA exists — verify |
| UX-09 | Confirmado | Medium | 8–16 | P2 | Dev-UX; secondary to visitor UX |
| UX-10 | Confirmado | Low | 4–8 | P3 | Post-convert polish |
| UX-11 | Confirmado | Medium | 2–6 | P1 | Dead-end prevention |
| UX-12 | Confirmado | Medium | 8–16 | P2 | Regression detection |
| SYS-02 | Confirmado (pairs UX-01) | Medium | — | P2 | Same CSS program |
| SYS-03 | Partial UX impact | Medium | — | P2 | Form reliability |

---

## 3. Débitos adicionados

| ID | Débito | Severidade | Horas | Prioridade | Impacto UX |
|----|--------|------------|-------|------------|------------|
| UX-13 | Nav label overload risk if brand.json grows again | Medium | 2–4 | P2 | Decision paralysis |
| UX-14 | Inconsistent proof density across offers vs home | Low–Medium | 4–8 | P2 | Credibility |
| UX-15 | Tool result “next step” CTA not always equal weight to commercial CTA | Medium | 4–8 | P1 | Conversion continuity |
| UX-16 | Accessibility of multi-step form focus management under keyboard | Medium | 4–8 | P1 | a11y debt latent |
| UX-17 | Screenshot evidence after/ not wired as required CI artifact on every PR | Medium | 4–8 | P2 | Process |

---

## 4. Respostas ao Architect

1. **Coverage of redesign:** Strong on home, hub, checklist, articles; **tools secondary + thank-you** still lighter — track UX-10/UX-15.  
2. **Gates:** Design/copy/visitor-redesign are effectively hard for intentional quality; keep **hard-fail**. False positives rare if HTML follows archetypes.  
3. **Contact float:** Document as intentional with **header/footer WhatsApp** compensating on small screens; if missing, elevate UX-08 to P2.  
4. **Checklist abandonment metrics:** Not in repo as product analytics dashboard — recommend Plausible/custom events per step (ties DATA-11).  
5. **CSS modularization vs redesign finish:** **Finish redesign consistency first (P1)**, then modularize CSS (P2). Don’t refactor CSS mid-visual migration.  

---

## 5. Priorização (perspectiva UX)

1. **Never regress to dashboard/card soup** (UX-02 + gates)  
2. **Close visitor journeys** (UX-03, 05, 11, 15, 16)  
3. **Maintainability** of styles/scripts (UX-01, 09, SYS-02/03)  
4. **Playground/storybook** only after journeys stable (UX-07)  

---

## 6. Recomendações de design

| Tema | Recomendação |
|------|----------------|
| Hierarchy | One primary CTA per view; secondary WhatsApp quieter |
| Hub | Problem question first; no inventory vanity metrics |
| Tools | Always end with **one** commercial next step |
| Articles | Answer-first; single lateral CTA |
| Motion | Keep reduced-motion; no fake metrics animations |
| QA | Expand axe to all three tools + each obrigado page |

---

## 7. Effort summary (UX-owned)

| Priority | Hours |
|----------|-------|
| P0 | 4–8 |
| P1 | 16–34 |
| P2 | 40–70 |
| P3 | 20–36 |
| **Total** | **~80–150h** (includes shared CSS work with system) |

**Specialist sign-off on DRAFT UX section:** APPROVED with additions UX-13–17 and sequencing note (redesign before CSS package).
