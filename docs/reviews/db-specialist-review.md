# Database Specialist Review

**Workflow:** brownfield-discovery · Phase 5  
**Agent:** @data-engineer (Dara)  
**Date:** 2026-08-05  
**Input:** `docs/prd/technical-debt-DRAFT.md` + SCHEMA + DB-AUDIT  

---

## 1. Verdict on data-plane framing

**Approve adapted Phase 2 scope.** Treating Netlify Blobs + JSON as the data plane is correct. Inventing a Supabase schema that does not exist would violate No Invention.

---

## 2. Débitos validados

| ID | Veredito | Severidade final | Horas | Prioridade | Notas |
|----|----------|------------------|-------|------------|-------|
| DATA-01 | **Confirmado** | High (Critical only if n≫thousands) | 24–40 | P1 | Preemptive export still ROI-positive |
| DATA-02 | **Confirmado** (optional target) | High | 40–80 | P1 | Prefer export-first over big-bang dual-write |
| DATA-03 | Confirmado | Medium | 4–8 | P2 | Cheap; do with next lead field change |
| DATA-04 | **Confirmado — elevate** | **Critical** | 4–8 | **P0** | Fail-closed if Blobs missing in production |
| DATA-05 | Confirmado (accept) | Medium | 4–8 doc | P3 | Document compensations; don’t fake ACID |
| DATA-06 | Confirmado | Medium | 4–8 | P2 | One generator → copy into functions data |
| DATA-07 | Confirmado | Medium | 4–12 | P2 | Separate source vs generated in git policy |
| DATA-08 | Confirmado | Medium | 2–4 | P1 | Product `.env.example` from ENV-VARS.md |
| DATA-09 | Confirmado | Medium | 2–8 | P2 | Ops ownership; engineering only if Resend wiring |
| DATA-10 | Confirmado | Medium | 4–8 | P2 | Script + schedule + evidence log |
| DATA-11 | Confirmado | Medium | 16–24 | P1 | Daily JSON cohort &gt; live join |
| DATA-12 | **Confirmado — elevate** | **High** | 8–16 | **P0** | Secret rotation, least privilege, audit log access |
| DATA-13 | Confirmado | Medium | 8–16 | P2 | Weekly encrypted export |
| DATA-14 | Downgrade | Low | ongoing | P3 | Already snapshot-disciplined |
| DATA-15 | Accept | Low | 0 | P3 | Not a defect |
| DATA-16 | Confirmado | Medium | 8–16 | P2 | CLI `revops:lead delete/export` + runbook |
| SYS-09 | Confirmado (alias DATA-01/02) | High | — | P1 | Merge tracking under DATA-* |
| SYS-13 | Confirmado (alias DATA-04) | Critical | — | P0 | Same fix package |

---

## 3. Débitos adicionados

| ID | Débito | Severidade | Horas | Prioridade | Notas |
|----|--------|------------|-------|------------|-------|
| DATA-17 | Stage history not append-only — hard to audit “who changed stage when” | Medium | 8–12 | P2 | Optional stage_events log in Blobs |
| DATA-18 | No person-level identity merge (same phone, two journeys) | Medium | 12–20 | P3 | CRM concern; don’t block MVP |
| DATA-19 | Ops list may load full records for summary — over-fetch | Medium | 4–8 | P2 | Store summary projection keys |
| DATA-20 | Test/prod store selection lacks single “production profile” assert in CI against env matrix | High | 4–8 | P0 | Gate: production env forbids memory/file |

---

## 4. Respostas ao Architect

1. **Volume:** Unknown exact prod count from repo alone; architecture implies early/low thousands max. Still implement export **before** pain.  
2. **Preference:** **Nightly export → owner store** first (lowest risk). Dual-write Supabase only if interactive CRM UI is committed.  
3. **Memory fallback:** Must be verified in Netlify UI; treat as **P0 checklist item**, not assumed safe.  
4. **DSAR:** Not productized — **DATA-16** required for LGPD maturity.  
5. **GSC dual files:** Observed parallel paths; enforce single pipeline command in `scripts/revops` + build include.  

---

## 5. Cost estimates (resolution order recommended)

### P0 package (~12–24h)

1. DATA-04 + DATA-20 + SYS-13 — production store assert, remove/disable memory fallback  
2. DATA-12 — ops auth hardening runbook + secret rotation  

### P1 package (~60–100h)

1. DATA-01 + DATA-11 — export job + precomputed cohorts  
2. DATA-02 (phase A) — schema design only + optional warehouse table  
3. DATA-08 + SYS-05 — env template  

### P2 package (~40–60h)

DATA-03, 06, 07, 10, 13, 16, 17, 19  

### P3

DATA-05 (docs), 14, 15, 18  

**Total data-ish effort (engineering):** ~110–180 hours depending on warehouse choice.

---

## 6. Priorização (perspectiva dados)

1. **Correctness & safety** of write path (P0)  
2. **Operator trust** (auth, DSAR, backups)  
3. **Query/reporting** before growth  
4. **Model niceties** (person merge, stage event log)  

---

## 7. Recomendações

- Do **not** migrate public content into SQL.  
- Do **not** call private DB from Netlify static build.  
- Do implement **fail-closed** lead store selection this sprint.  
- Prefer **batch analytics** artifacts committed or stored privately over live O(n) ops scans.  

**Specialist sign-off on DRAFT data section:** APPROVED with severities adjusted as above.
