# Story 1.5 — Lead export pipeline + schema tests

**Epic:** EPIC-TD-001  
**Status:** Draft  
**Priority:** P1  
**Estimate:** 24–40h  
**IDs:** DATA-01, (enables DATA-02 later)  

## User story

As a RevOps operator, I need a reliable export of leads from Blobs to a structured artifact so I do not depend on live O(n) ops scans for reporting.

## Acceptance criteria

1. CLI/script exports leads to JSONL/JSON with documented schema + `schema_version`.  
2. Filters: record_kind commercial vs all; date range.  
3. Works against FileStore fixtures in CI without Netlify.  
4. Does not print full PII to stdout by default (path-to-file only).  
5. Runbook: how to run in production context safely.

## Tasks

- [ ] Define export schema  
- [ ] Implement exporter using existing store abstractions  
- [ ] Fixture tests with N synthetic leads  
- [ ] Docs under `docs/ops/` or `docs/revops/`  

## Tests

- New export unit tests  
- `test:lead-function` regression  
- Optional: ops health still independent  

## Out of scope

- Full Supabase dual-write  
- BI dashboard UI  
