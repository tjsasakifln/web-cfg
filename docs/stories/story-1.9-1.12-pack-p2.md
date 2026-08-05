# Stories 1.9–1.12 — P2 pack (summaries)

**Epic:** EPIC-TD-001  
**Priority:** P2  
**Phase:** C (after P0/P1)  

Expand to full story files when Phase C starts (`@sm *create-story`).

---

## Story 1.9 — CSS token/primitives modularization (incremental)

**IDs:** SYS-02, UX-01 · **Est.:** 16–24h  

**AC:** Shared tokens single source; tools CSS imports primitives; no visual regression on home+checklist (`test:design`, screenshots).  
**Out:** Full design-system rewrite.

---

## Story 1.10 — Split `script.js` modules

**IDs:** SYS-03 · **Est.:** 12–20h  

**AC:** Form / nav / analytics modules with same public behavior; form-funnel + analytics PII tests green.  
**Out:** TypeScript migration (P3).

---

## Story 1.11 — DSAR CLI + retention purge evidence

**IDs:** DATA-10, DATA-16 · **Est.:** 8–16h  

**AC:** CLI export/delete lead by id or contact hash; dry-run mode; retention purge report file; runbook in ops docs.  
**Tests:** Fixture store integration.

---

## Story 1.12 — GSC single-source + Blobs backup export

**IDs:** DATA-06, DATA-13 · **Est.:** 12–24h  

**AC:** One generator writes `data/ops/gsc-insights.json` and copies to functions data; weekly/optional Blobs backup export to configured destination; hash parity test.  

---

## Combined Phase C DoD

- [ ] 1.9–1.12 drafted fully if not already  
- [ ] QA gate each story  
- [ ] Update TECHNICAL-DEBT-REPORT resolved section  
