# Story 1.7 — Visitor journey residual closure

**Epic:** EPIC-TD-001  
**Status:** Done  
**Priority:** P1  
**Phase:** B  
**Estimate:** 8–16h  
**IDs:** UX-03, UX-05, UX-11  
**Executor:** @dev  
**Quality gate:** @qa  

## User story

As a visitor, I need hub and tools journeys free of empty-library dead ends and internal taxonomy language so I can find help and complete checklist diagnosis.

## Business value

Closes residual visitor-centered redesign gaps that hurt conversion and trust; keeps problem-led navigation aligned with B2G journey language (contrato/edital/operacao…).

## Acceptance criteria

1. **Given** hub surfaces, **when** visitor navigates, **then** navigation is problem-led and has no empty library CTAs.  
2. Checklist progressive path intro→steps→diagnosis stable under `test:tools` / visitor redesign tests.  
3. No public copy with forbidden internal jargon per design/copy gates.  
4. Screenshots or existing evidence paths updated if visual changes.

## Scope

### IN

- Audit remaining hub/pillar empty states on redesign branch  
- Fix residual taxonomy strings  
- Ensure checklist states covered by tests  
- Run design/copy/hub-truth suites  

### OUT

- Full CSS modularization (story 1.9)  
- Form multi-step a11y + tool commercial CTA (story 1.8)  
- Editorial/pSEO pipeline rewrites  

## Dependencies

- Story 1.3 design gates preferred as quality bar (can parallelize but gates must stay green)  
- Branch continuity: `feat/visitor-experience-redesign`  

## Risks

| Risk | Mitigation |
|------|------------|
| Merge conflict with WIP redesign | Same branch strategy per epic risks |
| Copy over-correction | Use existing forbidden_patterns / test:copy |

## Definition of Done

- [x] AC green under design/hub-truth/copy/tools tests  
- [x] No empty-library CTAs on audited hubs  
- [x] Evidence paths updated if visuals change  

## Tasks

- [x] Audit remaining hub/pillar empty states on branch  
- [x] Fix residual taxonomy strings  
- [x] Ensure checklist states covered by tests  
- [x] Run design/copy/hub-truth suites  

## Tests

- `npm run test:design`  
- `npm run test:hub-truth`  
- `npm run test:copy`  
- `npm run test:tools` / visitor redesign  

## Reversa alignment

| Artifact | Constraint applied |
|----------|-------------------|
| `_reversa_sdd/domain.md` | Jornada values (`jornada`: contrato/edital/operacao…); visitor conversion journey; B2G glossary for public language |
| `_reversa_sdd/architecture.md` | Content → tool → CTA/form conversion path |
| `_reversa_sdd/adrs/006-legacy-410-not-soft-404.md` | Abandoned product URLs stay 410, not soft-404 home (do not reintroduce) |
| Design gates (story 1.3 / Reversa quality culture) | Forbidden internal jargon / card-soup regressions |

**No invention:** Residual closure only; no new product verticals.

## Dev Notes

- Public copy must not expose internal registry/taxonomy jargon.  
- Prefer problem-led labels over internal content types.  
- Source TD: UX-03, UX-05, UX-11.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 1.0.0 | Draft from brownfield epic EPIC-TD-001 | @sm |
| 2026-08-05 | 1.1.0 | Validated GO (8/10) — Status: Draft → Ready; domain journey + design gates aligned | @po |
| 2026-08-05 | 2.0.0 | Status Ready → InProgress → InReview → Done; QA PASS; implementation complete | @dev / @qa |

## File List

- `scripts/site/test_visitor_redesign.py`
- `docs/uiux-visitor-redesign/`

## QA Results

**Verdict:** PASS  
**Reviewer:** Quinn (@qa)  
**Date:** 2026-08-05  
**Notes:** Automated gates for story ACs green; no HIGH/CRITICAL open. Production Playwright optional evidence in composite scorecard.

