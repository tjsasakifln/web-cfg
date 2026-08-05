# Story 1.6 — Attribution cohorts precompute

**Epic:** EPIC-TD-001  
**Status:** Done  
**Priority:** P1  
**Phase:** B  
**Estimate:** 16–24h  
**IDs:** DATA-11  
**Depends on:** 1.5 (export or shared list abstraction)  
**Executor:** @dev  
**Quality gate:** @qa  

## User story

As an operator, I need daily precomputed attribution cohorts (leads × analytics events) so ops health does not join everything in request memory.

## Business value

Reduces ops request latency/memory and keeps attribution honest at cohort/path level without illegal query↔person joins.

## Acceptance criteria

1. **Given** fixtures of leads + analytics events, **when** cohort job runs, **then** it produces a JSON cohort artifact consumable by ops or offline analysis.  
2. Synthetic/QA leads excluded from commercial cohorts (real-only default).  
3. CI fixture path with deterministic output.  
4. Document freshness expectations (e.g., daily) and how ops optionally reads package vs live join flag.

## Scope

### IN

- Pure attribution functions extraction if needed  
- Batch job script producing cohort package  
- Optional ops read of precomputed package  
- Fixture tests  

### OUT

- Join individual GSC query to individual lead (forbidden by ADR-007)  
- Full warehouse BI UI  
- Changing lead intake form  

## Dependencies

- **Hard:** Story 1.5 export or shared list abstraction for durable lead enumeration  
- Analytics event fixtures / collect pipeline existing aggregates  

## Risks

| Risk | Mitigation |
|------|------------|
| False precision / privacy leak | Cohort/path only; ADR-007 non-negotiable |
| Non-deterministic timestamps | Freeze clock in CI fixtures |

## Definition of Done

- [x] Cohort artifact + docs freshness  
- [x] Commercial cohorts exclude non-real  
- [x] CI deterministic test green  

## Tasks

- [x] Extract attribution pure functions if needed  
- [x] Batch job script  
- [x] Wire optional ops read of package vs live join flag  
- [x] Tests with fixtures  

## Tests

- New cohort tests  
- Existing analytics PII tests  

## Reversa alignment

| Artifact | Constraint applied |
|----------|-------------------|
| `_reversa_sdd/adrs/007-gsc-cohort-never-query-lead.md` | Attribution is cohort/path/probability; never query↔person identity |
| `_reversa_sdd/adrs/004-record-kind-commercial-truth.md` | Exclude synthetic/qa from commercial cohorts |
| `_reversa_sdd/domain.md` | Cohort attribution glossário; BR-PRIV-01/03 |
| `_reversa_sdd/architecture.md` | GSC/analytics private insights path |

**No invention:** Precompute only; no individual re-identification.

## Dev Notes

- Depends on 1.5 — if export schema lands first, reuse list abstraction.  
- GSC insights remain ops-auth only; cohort package is private ops data.  
- Source TD: DATA-11.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 1.0.0 | Draft from brownfield epic EPIC-TD-001 | @sm |
| 2026-08-05 | 1.1.0 | Validated GO (9/10) — Status: Draft → Ready; ADR-007 + ADR-004 + depends-on 1.5 confirmed | @po |
| 2026-08-05 | 2.0.0 | Status Ready → InProgress → InReview → Done; QA PASS; implementation complete | @dev / @qa |

## File List

- `scripts/revops/attribution_cohorts.mjs`
- `docs/ops/ATTRIBUTION-COHORTS.md`

## QA Results

**Verdict:** PASS  
**Reviewer:** Quinn (@qa)  
**Date:** 2026-08-05  
**Notes:** Automated gates for story ACs green; no HIGH/CRITICAL open. Production Playwright optional evidence in composite scorecard.

