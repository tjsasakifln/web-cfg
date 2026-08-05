# Story 1.12 — GSC single-source + Blobs backup export

**Epic:** EPIC-TD-001  
**Status:** Done  
**Priority:** P2  
**Phase:** C  
**Estimate:** 12–24h  
**IDs:** DATA-06, DATA-13  
**Executor:** @dev  
**Quality gate:** @qa  

## User story

As an operator, I need one generator for GSC insights JSON (copied to functions data) and a weekly/optional Blobs backup export so insights stay consistent and recoverable.

## Business value

Removes multi-path GSC insight drift and adds backup durability for private ops data — without publishing GSC strategy publicly.

## Acceptance criteria

1. **Given** GSC import/observatory inputs, **when** the generator runs, **then** it writes `data/ops/gsc-insights.json` and copies/syncs to functions data path used by ops.  
2. Hash parity test: primary artifact and functions copy match (or documented single-write dual-path).  
3. Weekly/optional Blobs backup export to configured destination (not public `_site`).  
4. Insights remain ops-auth only (no static public GSC JSON on site).  

## Scope

### IN

- Single generator pipeline for GSC insights  
- Parity/hash test  
- Blobs backup export job/script  
- Docs for schedule/destination env  

### OUT

- Individual query↔lead attribution (forbidden)  
- Publishing GSC JSON on public site  
- Replacing GSC with third-party SEO SaaS  

## Dependencies

- Soft: 1.2 ops auth for consuming insights  
- Observatory/scripts already in repo  

## Risks

| Risk | Mitigation |
|------|------------|
| Public leak of GSC strategy | Never write to public artifact allowlist |
| Dual-write drift | Single generator + hash parity |

## Definition of Done

- [x] Single-source generator + copy path  
- [x] Hash parity test green  
- [x] Backup export documented and scripted  
- [x] Ops-auth consumption preserved  

## Tasks

- [x] Identify current multi-writers of gsc-insights  
- [x] Unify generator + copy  
- [x] Hash parity test  
- [x] Blobs backup export + env docs  

## Tests

- Hash parity unit/integration test  
- Existing ops GSC honesty tests if present  

## Reversa alignment

| Artifact | Constraint applied |
|----------|-------------------|
| `_reversa_sdd/adrs/007-gsc-cohort-never-query-lead.md` | Aggregates only; insights via authenticated ops; never public JSON |
| `_reversa_sdd/domain.md` | BR-PRIV-02 GSC insights só autenticado; nunca estático público |
| `_reversa_sdd/permissions.md` | GSC insights ops-only |
| `_reversa_sdd/architecture.md` | GSC private insights path |
| `_reversa_sdd/adrs/001-public-artifact-isolation.md` | Do not place insights in public `_site` |

**No invention:** Single-source + backup only; no identity join.

## Dev Notes

- Destination paths currently include `data/ops/gsc-insights.json` and `netlify/functions/data/gsc-insights.json` (unify generation).  
- Backup must use configured private destination.  
- Source TD: DATA-06, DATA-13.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 1.0.0 | Expanded from P2 pack to full story | @sm |
| 2026-08-05 | 1.1.0 | Validated GO (9/10) — Status: Draft → Ready; ADR-007 + BR-PRIV-02 + public-artifact isolation cited | @po |
| 2026-08-05 | 2.0.0 | Status Ready → InProgress → InReview → Done; QA PASS; implementation complete | @dev / @qa |

## File List

- `scripts/revops/gsc_insights_sync.mjs`
- `docs/ops/GSC-INSIGHTS-SINGLE-SOURCE.md`

## QA Results

**Verdict:** PASS  
**Reviewer:** Quinn (@qa)  
**Date:** 2026-08-05  
**Notes:** Automated gates for story ACs green; no HIGH/CRITICAL open. Production Playwright optional evidence in composite scorecard.

