# Story 1.2 — Ops auth hardening + negative tests

**Epic:** EPIC-TD-001  
**Status:** Draft  
**Priority:** P0  
**Estimate:** 8–16h  
**IDs:** DATA-12  

## User story

As a security-conscious operator, I need the ops API that can list leads to reject unauthenticated/unauthorized callers reliably, with a rotation runbook.

## Acceptance criteria

1. Unauthenticated requests to lead-listing ops actions return 401/403.  
2. Invalid token rejected; no partial lead payload.  
3. Runbook: rotate ops secrets, dual-key window optional, post-rotation smoke.  
4. Automated negative tests for unauthorized access.  
5. `safeLog` does not print secrets or full contact PII on auth failures.

## Tasks

- [ ] Review `ops.cjs` auth paths for all sensitive actions  
- [ ] Harden comparisons (timing-safe if applicable)  
- [ ] Add negative tests  
- [ ] Write `docs/ops/` rotation runbook section  
- [ ] Verify health endpoint does not leak lead PII  

## Tests

- New unauthorized matrix tests for ops  
- Existing revops/ops honesty tests  

## Out of scope

- Full SIEM integration  
