# Story 1.1 — Fail-closed lead store + CI production profile

**Epic:** EPIC-TD-001  
**Status:** Draft  
**Priority:** P0  
**Estimate:** 8–16h  
**IDs:** DATA-04, DATA-20, SYS-13  

## User story

As a site operator, I need production lead intake to **refuse to run** with MemoryStore or unsafe fallbacks, so leads are never acknowledged without durable persistence.

## Acceptance criteria

1. **Given** `NODE_ENV=production` or Netlify `CONTEXT=production`, **when** Blobs/store cannot be created, **then** lead API returns non-2xx and does **not** claim success.  
2. **Given** `LEAD_ALLOW_MEMORY_FALLBACK` is set in production profile, **when** tests/CI run production profile, **then** gate **fails**.  
3. **Given** unit tests with MemoryStore, **when** profile is `test`, **then** MemoryStore still allowed.  
4. Documented checklist in `docs/ops/` for verifying Netlify env has no memory fallback.  
5. Existing lead function tests remain green; new tests cover fail-closed paths.

## Tasks

- [ ] Audit `createStore` / env selection in `lead-store.cjs` + `lead.cjs`  
- [ ] Implement production profile hard fail  
- [ ] Add `DATA-20` CI/unit tests  
- [ ] Ops verification checklist  
- [ ] Smoke: local prod-like env simulation  

## Tests

- `npm run test:lead-function`  
- New cases: production profile + missing blobs → error  
- `npm run test:secrets-scan` still green  

## Out of scope

- Building full warehouse (1.5)  
- Changing public form UX  
