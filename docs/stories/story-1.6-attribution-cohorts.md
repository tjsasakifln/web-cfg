# Story 1.6 — Attribution cohorts precompute

**Epic:** EPIC-TD-001  
**Status:** Draft  
**Priority:** P1  
**Estimate:** 16–24h  
**IDs:** DATA-11  
**Depends on:** 1.5 (export or shared list abstraction)  

## User story

As an operator, I need daily precomputed attribution cohorts (leads × analytics events) so ops health does not join everything in request memory.

## Acceptance criteria

1. Job produces cohort artifact (JSON) consumable by ops or offline analysis.  
2. Synthetic/QA leads excluded from commercial cohorts.  
3. CI fixture path with deterministic output.  
4. Document freshness expectations (e.g., daily).

## Tasks

- [ ] Extract attribution pure functions if needed  
- [ ] Batch job script  
- [ ] Wire optional ops read of package vs live join flag  
- [ ] Tests with fixtures  

## Tests

- New cohort tests  
- Existing analytics PII tests  
