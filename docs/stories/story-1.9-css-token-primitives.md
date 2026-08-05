# Story 1.9 — CSS token/primitives modularization (incremental)

**Epic:** EPIC-TD-001  
**Status:** Done  
**Priority:** P2  
**Phase:** C  
**Estimate:** 16–24h  
**IDs:** SYS-02, UX-01  
**Executor:** @dev  
**Quality gate:** @qa  

## User story

As a frontend maintainer, I need shared CSS tokens/primitives as a single source so tools and pages do not drift visually and token changes are safe.

## Business value

Reduces CSS duplication and visual regression risk; incremental modularization without a full design-system rewrite.

## Acceptance criteria

1. **Given** shared tokens file(s), **when** tools/pages stylesheets load, **then** they import primitives from a single source of truth.  
2. No intentional visual regression on home + checklist (`test:design`, screenshots/evidence).  
3. Token naming documented briefly for contributors.  
4. Design gates remain green (`test:design`).

## Scope

### IN

- Extract shared tokens/primitives incrementally  
- Update tools CSS to import primitives  
- Regression via design tests / screenshots  

### OUT

- Full design-system rewrite  
- TypeScript migration  
- Changing brand strategy  

## Dependencies

- Prefer after 1.3/1.7 so residual UX is stable (soft dependency)  

## Risks

| Risk | Mitigation |
|------|------------|
| Visual drift | design tests + screenshots |
| Big-bang CSS rewrite | Incremental extraction only |

## Definition of Done

- [x] Shared tokens single source  
- [x] Tools import primitives  
- [x] test:design green  

## Tasks

- [x] Inventory current token/CSS duplication  
- [x] Extract primitives module  
- [x] Wire tools + key pages imports  
- [x] Run design + screenshot evidence  

## Tests

- `npm run test:design`  
- Screenshot/evidence paths for home + checklist  

## Reversa alignment

| Artifact | Constraint applied |
|----------|-------------------|
| `_reversa_sdd/architecture.md` | Static multi-page; no SPA rewrite |
| Epic OUT | No React/Next migration |
| Design gates quality bar | Visual non-regression |

**No invention:** Incremental CSS only per TD SYS-02/UX-01.

## Dev Notes

- Do not move public assets outside public artifact allowlist.  
- Prefer existing CSS architecture over new frameworks.  
- Source TD: SYS-02, UX-01.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 1.0.0 | Expanded from P2 pack to full story | @sm |
| 2026-08-05 | 1.1.0 | Validated GO (8/10) — Status: Draft → Ready; architecture static-site constraint cited | @po |
| 2026-08-05 | 2.0.0 | Status Ready → InProgress → InReview → Done; QA PASS; implementation complete | @dev / @qa |

## File List

- `styles-tokens.css`
- `styles.css`
- `styles-tools.css`
- `docs/DESIGN-TOKENS.md`

## QA Results

**Verdict:** PASS  
**Reviewer:** Quinn (@qa)  
**Date:** 2026-08-05  
**Notes:** Automated gates for story ACs green; no HIGH/CRITICAL open. Production Playwright optional evidence in composite scorecard.

