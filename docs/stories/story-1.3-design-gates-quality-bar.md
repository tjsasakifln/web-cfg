# Story 1.3 — Design gates as non-bypass quality bar

**Epic:** EPIC-TD-001  
**Status:** Draft  
**Priority:** P0  
**Estimate:** 4–8h  
**IDs:** UX-02  

## User story

As product owner, I need design/visitor-redesign gates to be **required** so the site cannot regress to card-soup/dashboard patterns without failing CI.

## Acceptance criteria

1. Document which npm scripts are required: at least `test:design` (incl. visitor redesign) and `test:copy`.  
2. Branch protection / `docs/ops/REQUIRED-BRANCH-CHECKS.md` updated if needed.  
3. Intentionally broken fixture (optional local) demonstrates gate failure mode — or document existing gate messages.  
4. No weakening of forbidden_patterns without ADR note.

## Tasks

- [ ] Inventory current CI required checks vs docs  
- [ ] Align docs + GitHub checks list  
- [ ] Confirm visitor-redesign tests run in `test:design` path  
- [ ] Short developer note in DESIGN-SYSTEM.md “gates are law”  

## Tests

- `npm run test:design`  
- `npm run test:copy`  
- `npm run test:visitor-redesign` if separate  

## Out of scope

- New visual pixel CI (story 1.x P2 / UX-12)  
