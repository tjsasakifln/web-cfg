# Story 1.2 — Ops auth hardening + negative tests

**Epic:** EPIC-TD-001  
**Status:** Done  
**Priority:** P0  
**Phase:** A  
**Estimate:** 8–16h  
**IDs:** DATA-12  
**Executor:** @dev  
**Quality gate:** @qa  

## User story

As a security-conscious operator, I need the ops API that can list leads to reject unauthenticated/unauthorized callers reliably, with a rotation runbook.

## Business value

Ops can expose PII and commercial funnel data; unauthenticated access is a critical TD item. Hardening restores fail-closed ops auth per Reversa permissions matrix.

## Acceptance criteria

1. **Given** no auth token, **when** a request hits lead-listing ops actions, **then** response is 401/403 and body has no lead PII.  
2. **Given** an invalid token, **when** caller requests sensitive ops action, **then** request is rejected with no partial lead payload.  
3. Runbook exists: rotate ops secrets, optional dual-key window, post-rotation smoke.  
4. Automated negative tests cover unauthorized matrix for sensitive actions.  
5. `safeLog` (or equivalent) does not print secrets or full contact PII on auth failures.

## Scope

### IN

- Review/harden `ops.cjs` auth for all sensitive actions (leads list, stage, GSC insights, etc.)  
- Timing-safe comparison where applicable  
- Negative automated tests  
- Rotation runbook section under `docs/ops/`  
- Confirm health endpoint does not leak lead PII  

### OUT

- Full SIEM integration  
- Multi-user RBAC / OAuth identity provider  
- Changing public lead form auth (Turnstile is separate)  

## Dependencies

- Optional: 1.1 store hardening may land in parallel; auth is independent of store durability  

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking scheduled jobs that call ops | Document token header contract; dual-key window |
| Over-locking health endpoints | Health may report `auth_configured` only, no secrets |

## Definition of Done

- [x] All AC met  
- [x] Negative test matrix green  
- [x] Rotation runbook in docs  
- [x] No secrets in logs or repo  

## Tasks

- [x] Review `ops.cjs` auth paths for all sensitive actions  
- [x] Harden comparisons (timing-safe if applicable)  
- [x] Add negative tests  
- [x] Write `docs/ops/` rotation runbook section  
- [x] Verify health endpoint does not leak lead PII  

## Tests

- New unauthorized matrix tests for ops  
- Existing revops/ops honesty tests  

## Reversa alignment

| Artifact | Constraint applied |
|----------|-------------------|
| `_reversa_sdd/permissions.md` | Ops/RevOps via `OPS_TOKEN`/`REVOPS_TOKEN`; PII only for ops auth; fail-closed if token absent in prod |
| `_reversa_sdd/domain.md` | OPS_TOKEN; BR-PRIV-02 GSC only authenticated |
| `_reversa_sdd/architecture.md` | Fail-closed governance |
| `_reversa_sdd/adrs/007-gsc-cohort-never-query-lead.md` | GSC insights only via authenticated ops |

**No invention:** Does not introduce multi-tenant RBAC beyond existing token model.

## Dev Notes

- Auth surfaces: Bearer / X-Ops-Token per permissions matrix.  
- Sensitive actions include: leads, lead, stage, funnel, gsc_insights, backfill_record_kind, etc.  
- Source TD: DATA-12 in assessment/report.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 1.0.0 | Draft from brownfield epic EPIC-TD-001 | @sm |
| 2026-08-05 | 1.1.0 | Validated GO (9/10) — Status: Draft → Ready; Reversa permissions + ops fail-closed cited | @po |
| 2026-08-05 | 2.0.0 | Status Ready → InProgress → InReview → Done; QA PASS; implementation complete | @dev / @qa |

## File List

- `netlify/functions/ops.cjs`
- `scripts/site/test_ops_auth_matrix.mjs`
- `docs/ops/OPS-TOKEN-ROTATION.md`

## QA Results

**Verdict:** PASS  
**Reviewer:** Quinn (@qa)  
**Date:** 2026-08-05  
**Notes:** Automated gates for story ACs green; no HIGH/CRITICAL open. Production Playwright optional evidence in composite scorecard.

