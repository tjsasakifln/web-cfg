# Story 1.10 — Split `script.js` modules

**Epic:** EPIC-TD-001  
**Status:** Done  
**Priority:** P2  
**Phase:** C  
**Estimate:** 12–20h  
**IDs:** SYS-03  
**Executor:** @dev  
**Quality gate:** @qa  

## User story

As a maintainer, I need `script.js` split into form / nav / analytics modules with the same public behavior so changes are safer and testable.

## Business value

Reduces regression blast radius in visitor JS and makes form a11y/CTA work (1.8) maintainable without a TS rewrite.

## Acceptance criteria

1. **Given** modularized scripts, **when** visitor uses form/nav/analytics, **then** public behavior matches pre-split baselines.  
2. Form module isolated enough for form-funnel tests.  
3. Analytics module retains no-PII scrub rules (BR-PRIV-01).  
4. `test:form-funnel` + analytics PII tests green.

## Scope

### IN

- Split into form / nav / analytics (or equivalent cohesive modules)  
- Preserve public global behavior / load order  
- Update HTML script includes if needed  

### OUT

- TypeScript migration (P3)  
- Changing analytics event schema beyond module boundaries  
- Rewriting form commercial validation rules  

## Dependencies

- Soft: after 1.8 form a11y to avoid double churn; can land before if careful  

## Risks

| Risk | Mitigation |
|------|------------|
| Load-order bugs | form-funnel + tools e2e |
| PII regression in analytics | existing analytics PII tests |

## Definition of Done

- [x] Modules landed with same public behavior  
- [x] form-funnel + analytics PII green  
- [x] No secrets/PII new surfaces  

## Tasks

- [x] Map script.js responsibilities  
- [x] Extract form/nav/analytics modules  
- [x] Wire includes/build if needed  
- [x] Run form-funnel + analytics PII tests  

## Tests

- `npm run test:form-funnel`  
- Analytics PII tests  
- `npm run test:tools` if applicable  

## Reversa alignment

| Artifact | Constraint applied |
|----------|-------------------|
| `_reversa_sdd/domain.md` | BR-PRIV-01 analytics first-party without PII |
| `_reversa_sdd/lead-intake/requirements.md` | Form still posts same validated payload |
| `_reversa_sdd/architecture.md` | Client JS on static pages; no SPA |

**No invention:** Structural split only; no new product features.

## Dev Notes

- Preserve consent + lead payload field contracts.  
- Analytics scrub keys must remain enforced.  
- Source TD: SYS-03.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 1.0.0 | Expanded from P2 pack to full story | @sm |
| 2026-08-05 | 1.1.0 | Validated GO (8/10) — Status: Draft → Ready; BR-PRIV-01 + form contract cited | @po |
| 2026-08-05 | 2.0.0 | Status Ready → InProgress → InReview → Done; QA PASS; implementation complete | @dev / @qa |

## File List

- `js/modules/analytics.js`
- `js/modules/nav.js`
- `js/modules/form.js`
- `scripts/site/build_script_modules.mjs`
- `script.js`

## QA Results

**Verdict:** PASS  
**Reviewer:** Quinn (@qa)  
**Date:** 2026-08-05  
**Notes:** Automated gates for story ACs green; no HIGH/CRITICAL open. Production Playwright optional evidence in composite scorecard.

