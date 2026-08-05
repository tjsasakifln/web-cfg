# Story 1.3 — Design gates as non-bypass quality bar

**Epic:** EPIC-TD-001  
**Status:** Done  
**Priority:** P0  
**Phase:** A  
**Estimate:** 4–8h  
**IDs:** UX-02  
**Executor:** @dev  
**Quality gate:** @qa  

## User story

As product owner, I need design/visitor-redesign gates to be **required** so the site cannot regress to card-soup/dashboard patterns without failing CI.

## Business value

Visitor redesign is incomplete without enforceable gates; making design/copy checks required protects the UX quality bar and prevents silent visual/copy regressions.

## Acceptance criteria

1. Document which npm scripts are required: at least `test:design` (incl. visitor redesign) and `test:copy`.  
2. Branch protection / `docs/ops/REQUIRED-BRANCH-CHECKS.md` updated if needed (document intended checks; actual GitHub protection may need human @devops).  
3. Intentionally broken fixture (optional local) demonstrates gate failure mode — or document existing gate messages.  
4. No weakening of forbidden_patterns without an ADR note.

## Scope

### IN

- Inventory current CI required checks vs docs  
- Align docs + checks list  
- Confirm visitor-redesign tests run in `test:design` path  
- Short developer note in DESIGN-SYSTEM.md “gates are law”  

### OUT

- New visual pixel CI (P2 / UX-12)  
- Changing design tokens/CSS architecture (story 1.9)  
- Implementing remaining visitor UX fixes (1.7, 1.8)  

## Dependencies

- None blocking; complements WIP branch `feat/visitor-experience-redesign`  

## Risks

| Risk | Mitigation |
|------|------------|
| Branch protection not writable by agent | Document required checks; handoff to @devops for GitHub settings |
| Gate flakiness blocks merges | Prefer deterministic design/copy tests; document known flakes |

## Definition of Done

- [x] Required scripts documented and listed in ops branch-checks doc  
- [x] DESIGN-SYSTEM (or equivalent) notes gates are non-bypass  
- [x] `test:design` + `test:copy` runnable and documented as required  

## Tasks

- [x] Inventory current CI required checks vs docs  
- [x] Align docs + GitHub checks list  
- [x] Confirm visitor-redesign tests run in `test:design` path  
- [x] Short developer note in DESIGN-SYSTEM.md “gates are law”  

## Tests

- `npm run test:design`  
- `npm run test:copy`  
- `npm run test:visitor-redesign` if separate  

## Reversa alignment

| Artifact | Constraint applied |
|----------|-------------------|
| `_reversa_sdd/architecture.md` | Governança por gates CI fail-closed as policy engine |
| `_reversa_sdd/domain.md` | BR-PUB-* content gates; visitor journey conversion path |
| `_reversa_sdd/adrs/001-public-artifact-isolation.md` | Public surface auditável e fail-closed |
| `_reversa_sdd/adrs/002-human-gated-indexation.md` | Gates pré-publish (related quality culture; this story is design/CI bar not indexation) |

**No invention:** Does not invent new design system; enforces existing design/copy tests as quality bar.

## Dev Notes

- Actual `gh` branch protection changes are exclusive to @devops; story delivers docs + script inventory.  
- Forbidden_patterns changes need ADR — do not relax without note.  
- Source TD: UX-02.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 1.0.0 | Draft from brownfield epic EPIC-TD-001 | @sm |
| 2026-08-05 | 1.1.0 | Validated GO (8/10) — Status: Draft → Ready; Reversa gates/architecture cited; @devops handoff for GH protection noted | @po |
| 2026-08-05 | 2.0.0 | Status Ready → InProgress → InReview → Done; QA PASS; implementation complete | @dev / @qa |

## File List

- `docs/ops/REQUIRED-BRANCH-CHECKS.md`
- `docs/DESIGN-SYSTEM.md`
- `.github/workflows/site-ci.yml`

## QA Results

**Verdict:** PASS  
**Reviewer:** Quinn (@qa)  
**Date:** 2026-08-05  
**Notes:** Automated gates for story ACs green; no HIGH/CRITICAL open. Production Playwright optional evidence in composite scorecard.

