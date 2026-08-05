# Story 1.4 — Product-real `.env.example`

**Epic:** EPIC-TD-001  
**Status:** Draft  
**Priority:** P1  
**Estimate:** 2–4h  
**IDs:** SYS-05, DATA-08  

## User story

As a developer onboarding to CONFENGE, I need `.env.example` to list **real product variables** (leads, ops, analytics), not unused AIOX cloud templates.

## Acceptance criteria

1. `.env.example` names align with `docs/ops/ENV-VARS.md` product set.  
2. Remove or clearly section-off unused Supabase/Vercel/Railway unless actually used.  
3. Doc test or script asserts example ⊆ known product env names (or inverse allowlist).  
4. No secrets committed.

## Tasks

- [ ] Rewrite `.env.example` from ENV-VARS.md  
- [ ] Optional AIOX section clearly labeled non-product  
- [ ] Add lightweight test under `scripts/site` or ops docs honesty  

## Tests

- `npm run test:ops-docs` (extend if needed)  
