# Story 1.4 — Product-real `.env.example`

**Epic:** EPIC-TD-001  
**Status:** Done  
**Priority:** P1  
**Phase:** A  
**Estimate:** 2–4h  
**IDs:** SYS-05, DATA-08  
**Executor:** @dev  
**Quality gate:** @qa  

## User story

As a developer onboarding to CONFENGE, I need `.env.example` to list **real product variables** (leads, ops, analytics), not unused AIOX cloud templates.

## Business value

Reduces misconfiguration risk (wrong secrets, phantom Supabase vars) and aligns local onboarding with the actual static+functions product surface documented in ops.

## Acceptance criteria

1. **Given** `.env.example`, **when** compared to `docs/ops/ENV-VARS.md` product set, **then** names align (product vars present; unused SaaS templates removed or clearly sectioned).  
2. Remove or clearly section-off unused Supabase/Vercel/Railway unless actually used by product runtime.  
3. Doc test or script asserts example ⊆ known product env names (or inverse allowlist).  
4. No secrets committed (example values only placeholders).

## Scope

### IN

- Rewrite `.env.example` from ENV-VARS.md product set  
- Optional AIOX section clearly labeled non-product  
- Lightweight honesty test under scripts/site or ops docs tests  

### OUT

- Rotating real secrets in Netlify  
- Adding new product features that need new env vars beyond docs  
- Implementing lead export (1.5)  

## Dependencies

- `docs/ops/ENV-VARS.md` as source of truth for product names  

## Risks

| Risk | Mitigation |
|------|------------|
| ENV-VARS.md incomplete | Cross-check lead/ops/collect function env reads |
| Breaking AIOX contributor workflows | Keep optional AIOX section labeled non-product |

## Definition of Done

- [x] `.env.example` product-aligned  
- [x] Honesty test or assert script green  
- [x] Secrets scan still green  

## Tasks

- [x] Rewrite `.env.example` from ENV-VARS.md  
- [x] Optional AIOX section clearly labeled non-product  
- [x] Add lightweight test under `scripts/site` or ops docs honesty  

## Tests

- `npm run test:ops-docs` (extend if needed)  
- `npm run test:secrets-scan`  

## Reversa alignment

| Artifact | Constraint applied |
|----------|-------------------|
| `_reversa_sdd/permissions.md` | Product secrets: OPS_TOKEN, Turnstile, Resend, Blobs — not multi-tenant SaaS |
| `_reversa_sdd/architecture.md` | Stack is static+functions Netlify; no public Supabase in Netlify build |
| `_reversa_sdd/lead-intake/requirements.md` | Env-driven store/rate-limit/Turnstile flags |
| `_reversa_sdd/deployment.md` | Deploy/env model for Netlify |

**No invention:** Only documents env already used by product + ops docs; epic OUT excludes Supabase on public Netlify build.

## Dev Notes

- Prefer placeholders like `changeme` / empty; never real tokens.  
- Product vars typically: lead/ops/analytics/nurture/Resend/Turnstile/ALLOWED_ORIGINS/LEAD_*.  
- Source TD: SYS-05, DATA-08.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 1.0.0 | Draft from brownfield epic EPIC-TD-001 | @sm |
| 2026-08-05 | 1.1.0 | Validated GO (8/10) — Status: Draft → Ready; Reversa architecture/permissions env model cited | @po |
| 2026-08-05 | 2.0.0 | Status Ready → InProgress → InReview → Done; QA PASS; implementation complete | @dev / @qa |

## File List

- `.env.example`
- `scripts/site/test_env_example_honesty.py`
- `docs/ops/ENV-VARS.md`

## QA Results

**Verdict:** PASS  
**Reviewer:** Quinn (@qa)  
**Date:** 2026-08-05  
**Notes:** Automated gates for story ACs green; no HIGH/CRITICAL open. Production Playwright optional evidence in composite scorecard.

