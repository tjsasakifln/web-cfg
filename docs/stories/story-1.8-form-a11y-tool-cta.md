# Story 1.8 — Form multi-step a11y + tool commercial CTA

**Epic:** EPIC-TD-001  
**Status:** Draft  
**Priority:** P1  
**Estimate:** 8–16h  
**IDs:** UX-15, UX-16  

## User story

As a keyboard and screen-reader user, I need the multi-step lead form to manage focus accessibly; as a tool user, I need a single clear commercial next step after diagnosis.

## Acceptance criteria

1. Multi-step form moves focus to the next step heading/error summary appropriately.  
2. axe checks pass on form surface and tools.  
3. Each major tool diagnosis view has **one** primary commercial CTA (not competing equals).  
4. `test:form-funnel` and tools e2e remain green.

## Tasks

- [ ] Review `script.js` step transitions for focus  
- [ ] Align tool result CTAs with design system weight rules  
- [ ] Expand axe coverage if missing tools/obrigado  
- [ ] Manual keyboard pass documented  

## Tests

- `npm run test:form-funnel`  
- `npm run audit:axe` / `test:ui`  
- `npm run test:tools-uiux-e2e` if available  
