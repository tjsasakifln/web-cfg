# Story 1.11 — DSAR CLI + retention purge evidence

**Epic:** EPIC-TD-001  
**Status:** Done  
**Priority:** P2  
**Phase:** C  
**Estimate:** 8–16h  
**IDs:** DATA-10, DATA-16  
**Executor:** @dev  
**Quality gate:** @qa  

## User story

As a privacy/ops operator, I need a CLI to export/delete a lead by id or contact hash (with dry-run) and a retention purge report so DSAR and retention policies are operable with evidence.

## Business value

Meets privacy operability expectations (export/delete + retention) without building a full admin UI; produces audit evidence for TD closure.

## Acceptance criteria

1. **Given** a fixture store, **when** CLI export by lead id or contact hash runs, **then** it writes a redacted or secured export file (not public artifact).  
2. Delete path supports dry-run mode that reports would-delete without mutating.  
3. Retention purge produces a report file (counts/ids) respecting `delete_after` / LEAD_RETAIN_DAYS defaults.  
4. Runbook in ops docs: dry-run first, production safety.  
5. Fixture store integration tests cover export/delete/dry-run/purge report.

## Scope

### IN

- CLI export/delete by id or contact hash  
- Dry-run mode  
- Retention purge report  
- Ops runbook  

### OUT

- Full LGPD legal workflow product  
- Public self-serve DSAR portal  
- Changing default retention policy value without ops doc note (default remains 730 days unless TD says otherwise)  

## Dependencies

- Soft: 1.5 export schema may be reused for DSAR export shape  
- Store abstractions from lead-store  

## Risks

| Risk | Mitigation |
|------|------------|
| Accidental mass delete | dry-run default; confirmation flags |
| PII in CI logs | fixtures + path-only logs |

## Definition of Done

- [x] CLI + dry-run + purge report  
- [x] Runbook committed  
- [x] Fixture tests green  
- [x] Epic success criterion: DSAR dry-run evidence path documented  

## Tasks

- [x] Implement CLI export/delete with dry-run  
- [x] Retention purge report writer  
- [x] Fixture integration tests  
- [x] Ops runbook section  

## Tests

- Fixture store integration tests  
- Secrets scan still green  

## Reversa alignment

| Artifact | Constraint applied |
|----------|-------------------|
| `_reversa_sdd/domain.md` | BR-LEAD-14 retention default 730 days (`delete_after`) |
| `_reversa_sdd/lead-intake/requirements.md` | LEAD_RETAIN_DAYS; LeadRecord privacy |
| `_reversa_sdd/permissions.md` | PII only ops-side; not public |
| `_reversa_sdd/data-dictionary.md` | Lead fields for export/delete keys |

**No invention:** Operability for DSAR/retention per TD; no new public portal.

## Dev Notes

- Prefer hash of contact for lookup when full PII should not be on CLI argv history.  
- Never publish DSAR exports into `_site`.  
- Source TD: DATA-10, DATA-16.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 1.0.0 | Expanded from P2 pack to full story | @sm |
| 2026-08-05 | 1.1.0 | Validated GO (9/10) — Status: Draft → Ready; BR-LEAD-14 retention + permissions cited | @po |
| 2026-08-05 | 2.0.0 | Status Ready → InProgress → InReview → Done; QA PASS; implementation complete | @dev / @qa |

## File List

- `scripts/revops/dsar_cli.mjs`
- `docs/ops/DSAR-RETENTION-RUNBOOK.md`

## QA Results

**Verdict:** PASS  
**Reviewer:** Quinn (@qa)  
**Date:** 2026-08-05  
**Notes:** Automated gates for story ACs green; no HIGH/CRITICAL open. Production Playwright optional evidence in composite scorecard.

