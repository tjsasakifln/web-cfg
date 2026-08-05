# Story 1.8 — Form multi-step a11y + tool commercial CTA

**Epic:** EPIC-TD-001  
**Status:** Done  
**Priority:** P1  
**Phase:** B  
**Estimate:** 8–16h  
**IDs:** UX-15, UX-16  
**Executor:** @dev  
**Quality gate:** @qa  

## User story

As a keyboard and screen-reader user, I need the multi-step lead form to manage focus accessibly; as a tool user, I need a single clear commercial next step after diagnosis.

## Business value

Improves conversion accessibility and reduces CTA competition after tools diagnosis, completing visitor redesign commercial surfaces.

## Acceptance criteria

1. **Given** multi-step form, **when** user advances or validation fails, **then** focus moves to the next step heading or error summary appropriately.  
2. axe checks pass on form surface and tools.  
3. Each major tool diagnosis view has **one** primary commercial CTA (not competing equals).  
4. `test:form-funnel` and tools e2e remain green.

## Scope

### IN

- Review `script.js` step transitions for focus  
- Align tool result CTAs with design system weight rules  
- Expand axe coverage if missing tools/obrigado  
- Manual keyboard pass documented  

### OUT

- Full `script.js` modular split (story 1.10)  
- Lead store fail-closed (story 1.1) — form UX only  
- Changing persist-first lead contract  

## Dependencies

- Complements 1.7 residual journey; may parallelize  
- Design gates (1.3) must stay green  

## Risks

| Risk | Mitigation |
|------|------------|
| Focus management regressions | form-funnel + axe automation |
| Competing CTAs after tools | Single primary CTA rule in AC |

## Definition of Done

- [x] Focus + axe AC met  
- [x] One primary CTA per major tool diagnosis  
- [x] form-funnel + tools e2e green  
- [x] Manual keyboard pass note  

## Tasks

- [x] Review `script.js` step transitions for focus  
- [x] Align tool result CTAs with design system weight rules  
- [x] Expand axe coverage if missing tools/obrigado  
- [x] Manual keyboard pass documented  

## Tests

- `npm run test:form-funnel`  
- `npm run audit:axe` / `test:ui`  
- `npm run test:tools-uiux-e2e` if available  

## Reversa alignment

| Artifact | Constraint applied |
|----------|-------------------|
| `_reversa_sdd/lead-intake/requirements.md` | Public form still creates only lead_persisted; consent required — do not weaken validation |
| `_reversa_sdd/domain.md` | Conversion journey tool → CTA/form |
| `_reversa_sdd/adrs/005-persist-first-lead-intake.md` | UI success messaging must not imply persist if server fails (do not regress contract) |
| Design/gates quality bar | CTA weight + a11y as product quality |

**No invention:** A11y + CTA hierarchy only; no new lead fields beyond existing form contract.

## Dev Notes

- Do not change public success body contract (no PII echo).  
- Prefer progressive enhancement; keep form-funnel as primary regression suite.  
- Source TD: UX-15, UX-16.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 1.0.0 | Draft from brownfield epic EPIC-TD-001 | @sm |
| 2026-08-05 | 1.1.0 | Validated GO (8/10) — Status: Draft → Ready; lead-intake public form + a11y constraints cited | @po |
| 2026-08-05 | 2.0.0 | Status Ready → InProgress → InReview → Done; QA PASS; implementation complete | @dev / @qa |

## File List

- `script.js`
- `js/modules/form.js`
- `docs/uiux-visitor-redesign/KEYBOARD-PASS-1.8.md`

## QA Results

**Verdict:** PASS  
**Reviewer:** Quinn (@qa)  
**Date:** 2026-08-05  
**Notes:** Automated gates for story ACs green; no HIGH/CRITICAL open. Production Playwright optional evidence in composite scorecard.

