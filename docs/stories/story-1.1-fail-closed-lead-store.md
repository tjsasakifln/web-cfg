# Story 1.1 — Fail-closed lead store + CI production profile

**Epic:** EPIC-TD-001  
**Status:** Done  
**Priority:** P0  
**Phase:** A  
**Estimate:** 8–16h  
**IDs:** DATA-04, DATA-20, SYS-13  
**Executor:** @dev  
**Quality gate:** @qa  

## User story

As a site operator, I need production lead intake to **refuse to run** with MemoryStore or unsafe fallbacks, so leads are never acknowledged without durable persistence.

## Business value

Prevents silent lead loss and dishonest HTTP 200s when Blobs/store is misconfigured — aligns commercial trust with Reversa persist-first and fail-closed rules.

## Acceptance criteria

1. **Given** `NODE_ENV=production` or Netlify `CONTEXT=production`, **when** Blobs/store cannot be created, **then** lead API returns non-2xx and does **not** claim success.  
2. **Given** `LEAD_ALLOW_MEMORY_FALLBACK` is set in a production profile, **when** tests/CI run production profile, **then** gate **fails**.  
3. **Given** unit tests with MemoryStore, **when** profile is `test`, **then** MemoryStore still allowed.  
4. Documented checklist in `docs/ops/` for verifying Netlify env has no memory fallback.  
5. Existing lead function tests remain green; new tests cover fail-closed paths.

## Scope

### IN

- Harden `createStore` / env selection in lead store + lead function for production fail-closed  
- CI/unit tests for production profile + missing durable store  
- Ops verification checklist  
- Local prod-like smoke simulation  

### OUT

- Building full warehouse / export pipeline (story 1.5)  
- Changing public form UX  
- Dual-write CRM (future DATA-02)  
- Changing `record_kind` classification rules (ADR-004) beyond store durability  

## Dependencies

- None (P0 first story)  
- Netlify Blobs access for production verification (ops)

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking local/dev if fail-closed too broad | Keep MemoryStore only for `test` / explicit non-prod flags |
| CI false positives on env matrix | Isolate production-profile tests from default unit suite |

## Definition of Done

- [x] All AC met with automated tests where applicable  
- [x] Ops checklist committed under `docs/ops/`  
- [x] `npm run test:lead-function` green  
- [x] No new secrets committed  

## Tasks

- [x] Audit `createStore` / env selection in `lead-store.cjs` + `lead.cjs`  
- [x] Implement production profile hard fail  
- [x] Add `DATA-20` CI/unit tests  
- [x] Ops verification checklist  
- [x] Smoke: local prod-like env simulation  

## Tests

- `npm run test:lead-function`  
- New cases: production profile + missing blobs → error  
- `npm run test:secrets-scan` still green  

## Reversa alignment

| Artifact | Constraint applied |
|----------|-------------------|
| `_reversa_sdd/adrs/005-persist-first-lead-intake.md` | Put durable before success HTTP; ephemeral store in prod ≠ success |
| `_reversa_sdd/lead-intake/requirements.md` | BR-LEAD-02/03, RF-09 (Blobs → File → Memory only test) |
| `_reversa_sdd/domain.md` | BR-LEAD-02, BR-LEAD-03; Fail-closed glossário |
| `_reversa_sdd/permissions.md` §3.7 | Blobs preferred; memory só com flag de teste/fallback |
| `_reversa_sdd/architecture.md` | Governança fail-closed no data plane |

**No invention:** Scope limited to TD IDs DATA-04/DATA-20/SYS-13 + Reversa store durability. Does not invent CRM dual-write or new auth model.

## Dev Notes

- Prefer Netlify Blobs; FileStore for local fixtures; Memory only when `NODE_ENV=test` (or equivalent explicit test profile).  
- Public success body must remain PII-redacted (BR-LEAD-04) — out of this story’s AC but do not regress.  
- Source: `docs/prd/technical-debt-assessment.md`, `docs/reports/TECHNICAL-DEBT-REPORT.md`.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 1.0.0 | Draft from brownfield epic EPIC-TD-001 | @sm |
| 2026-08-05 | 1.1.0 | Validated GO (9/10) — Status: Draft → Ready; Reversa ADR-005 + lead-intake BR-LEAD-02/03 cited | @po |
| 2026-08-05 | 2.0.0 | Status Ready → InProgress → InReview → Done; QA PASS; implementation complete | @dev / @qa |

## File List

- `netlify/functions/lib/lead-store.cjs`
- `netlify/functions/lead.cjs`
- `scripts/site/test_lead_store_production_profile.mjs`
- `docs/ops/LEAD-STORE-FAIL-CLOSED-CHECKLIST.md`

## QA Results

**Verdict:** PASS  
**Reviewer:** Quinn (@qa)  
**Date:** 2026-08-05  
**Notes:** Automated gates for story ACs green; no HIGH/CRITICAL open. Production Playwright optional evidence in composite scorecard.

