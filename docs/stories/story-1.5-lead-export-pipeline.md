# Story 1.5 — Lead export pipeline + schema tests

**Epic:** EPIC-TD-001  
**Status:** Done  
**Priority:** P1  
**Phase:** B  
**Estimate:** 24–40h  
**IDs:** DATA-01 (enables DATA-02 later)  
**Executor:** @dev  
**Quality gate:** @qa  

## User story

As a RevOps operator, I need a reliable export of leads from Blobs to a structured artifact so I do not depend on live O(n) ops scans for reporting.

## Business value

Enables offline reporting and is the foundation for future dual-write/CRM without coupling production request path to full warehouse scans.

## Acceptance criteria

1. **Given** a durable store with fixtures, **when** export CLI/script runs, **then** it produces JSONL/JSON with documented schema + `schema_version`.  
2. Filters: `record_kind` commercial (`real`) vs all; date range.  
3. Works against FileStore fixtures in CI without Netlify.  
4. Does not print full PII to stdout by default (path-to-file only).  
5. Runbook: how to run in production context safely (auth/env, no public artifact publish).

## Scope

### IN

- Export schema definition with `schema_version`  
- Exporter using existing store abstractions  
- Fixture tests with N synthetic leads  
- Docs under `docs/ops/` or `docs/revops/`  

### OUT

- Full Supabase dual-write (DATA-02 future)  
- BI dashboard UI  
- Changing live ops list behavior beyond optional read of export artifact  
- Individual GSC query ↔ lead joins (forbidden)  

## Dependencies

- Store abstractions from lead-store (benefits from 1.1 fail-closed but can use FileStore fixtures independently)  
- Ops auth secrets only for production export runs (1.2)  

## Risks

| Risk | Mitigation |
|------|------------|
| PII leakage via logs | Default path-only stdout; redaction rules |
| Schema drift | schema_version + fixture contract tests |
| Over-scope warehouse | Export first only (epic risk mitigation) |

## Definition of Done

- [x] Export script + schema docs  
- [x] CI fixture path green  
- [x] Runbook committed  
- [x] No PII on default stdout  

## Tasks

- [x] Define export schema  
- [x] Implement exporter using existing store abstractions  
- [x] Fixture tests with N synthetic leads  
- [x] Docs under `docs/ops/` or `docs/revops/`  

## Tests

- New export unit tests  
- `test:lead-function` regression  
- Optional: ops health still independent  

## Reversa alignment

| Artifact | Constraint applied |
|----------|-------------------|
| `_reversa_sdd/adrs/004-record-kind-commercial-truth.md` | Filter commercial = real-only; non-real excluded from commercial exports when filtered |
| `_reversa_sdd/data-dictionary.md` | Lead fields + schema_version patterns |
| `_reversa_sdd/domain.md` | BR-LEAD-08/09 real-only; BR-PRIV-05 logs without PII |
| `_reversa_sdd/lead-intake/requirements.md` | LeadRecord shape; retention delete_after |
| `_reversa_sdd/permissions.md` | Export is ops-side; not public artifact |

**No invention:** Export-only; dual-write CRM explicitly deferred (epic OUT).

## Dev Notes

- Prefer JSONL for large sets; include schema_version header/meta.  
- Synthetic/qa kinds must be filterable (ADR-004).  
- Do not write export into `_site` public artifact.  
- Source TD: DATA-01.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 1.0.0 | Draft from brownfield epic EPIC-TD-001 | @sm |
| 2026-08-05 | 1.1.0 | Validated GO (9/10) — Status: Draft → Ready; ADR-004 record_kind + data-dictionary + privacy cited | @po |
| 2026-08-05 | 2.0.0 | Status Ready → InProgress → InReview → Done; QA PASS; implementation complete | @dev / @qa |

## File List

- `scripts/revops/export_leads.mjs`
- `docs/ops/LEAD-EXPORT-RUNBOOK.md`
- `scripts/site/test_epic_td_suite.mjs`

## QA Results

**Verdict:** PASS  
**Reviewer:** Quinn (@qa)  
**Date:** 2026-08-05  
**Notes:** Automated gates for story ACs green; no HIGH/CRITICAL open. Production Playwright optional evidence in composite scorecard.

