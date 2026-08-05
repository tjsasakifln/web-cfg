# Stories 1.9–1.12 — P2 pack (index)

**Epic:** EPIC-TD-001  
**Priority:** P2  
**Phase:** C  
**Status:** Expanded — full story files Done

This pack is an **index only**. Full implementable stories (Ready) live at:

| Story | File | Status |
|-------|------|--------|
| 1.9 | `docs/stories/story-1.9-css-token-primitives.md` | Ready |
| 1.10 | `docs/stories/story-1.10-split-script-modules.md` | Ready |
| 1.11 | `docs/stories/story-1.11-dsar-retention-purge.md` | Ready |
| 1.12 | `docs/stories/story-1.12-gsc-single-source-backup.md` | Ready |

## Summary (canonical AC live in full files)

### 1.9 — CSS token/primitives modularization
**IDs:** SYS-02, UX-01 · Shared tokens single source; tools CSS imports primitives; no visual regression (`test:design`).

### 1.10 — Split `script.js` modules
**IDs:** SYS-03 · Form / nav / analytics modules; form-funnel + analytics PII tests green.

### 1.11 — DSAR CLI + retention purge evidence
**IDs:** DATA-10, DATA-16 · CLI export/delete + dry-run; retention purge report; ops runbook.

### 1.12 — GSC single-source + Blobs backup export
**IDs:** DATA-06, DATA-13 · One generator for insights + functions copy; hash parity; private backup; ops-auth only.

## Phase C DoD

- [x] 1.9–1.12 drafted fully  
- [ ] QA gate each story (implementation phase — not this Ready wave)  
- [ ] Update TECHNICAL-DEBT-REPORT resolved section (post-implementation)  

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 1.0.0 | P2 pack summaries | @sm |
| 2026-08-05 | 1.1.0 | Expanded to full Ready stories 1.9–1.12; pack becomes index | @sm/@po |
