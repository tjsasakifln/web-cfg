# Story 1.7 — Visitor journey residual closure

**Epic:** EPIC-TD-001  
**Status:** Draft  
**Priority:** P1  
**Estimate:** 8–16h  
**IDs:** UX-03, UX-05, UX-11  

## User story

As a visitor, I need hub and tools journeys free of empty-library dead ends and internal taxonomy language so I can find help and complete checklist diagnosis.

## Acceptance criteria

1. Hub presents problem-led navigation; no empty library CTAs.  
2. Checklist progressive path intro→steps→diagnosis stable under `test:tools` / visitor redesign tests.  
3. No public copy with forbidden internal jargon per design/copy gates.  
4. Screenshots or existing evidence paths updated if visual changes.

## Tasks

- [ ] Audit remaining hub/pillar empty states on branch  
- [ ] Fix residual taxonomy strings  
- [ ] Ensure checklist states covered by tests  
- [ ] Run design/copy/hub-truth suites  

## Tests

- `npm run test:design`  
- `npm run test:hub-truth`  
- `npm run test:copy`  
- `npm run test:tools` / visitor redesign  

## Out of scope

- Full CSS modularization (1.9)  
