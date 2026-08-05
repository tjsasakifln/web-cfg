# Data Plane Audit — CONFENGE

**Workflow:** brownfield-discovery · Phase 2  
**Agent:** @data-engineer (Dara) via Orion YOLO orchestration  
**Date:** 2026-08-05  
**Scope:** Netlify Blobs + File/HTTP/Memory stores + git JSON data plane  

---

## 1. Audit summary

| Dimension | Grade | Comment |
|-----------|-------|---------|
| Durability of leads | **B+** | Persist-before-success; Blobs primary |
| Queryability / reporting | **D** | List-scan model; no relational query layer |
| Security of data at rest | **B** | Platform Blobs + API auth for ops; no public dump |
| Schema governance | **C+** | Implicit in JS; no formal migration/version table |
| PII / LGPD posture | **B** | Hashing, minimization, retention knobs; needs ops discipline |
| Analytics integrity | **B** | Kind filters; PII tests; synthetic exclusion |
| Build-time data quality | **A-** | Strong editorial/pSEO gates |
| Disaster recovery | **C** | Depends on Netlify Blobs backup posture; local FileStore not prod |

**Overall data-plane health:** usable for current lead volume; **not ready** for high-volume CRM analytics without a query tier.

---

## 2. Strengths

1. **Correct write path for leads:** validate → rate limit → Turnstile → durable put → notify (best-effort).  
2. **Idempotency** prevents double-submit storms.  
3. **Record kind** separates QA/synthetic from commercial metrics (ops honesty).  
4. **Testability:** MemoryStore injection + extensive unit/smoke tests.  
5. **Build data** (editorial registry, design-system JSON) is versioned and gated.  
6. **Ops packaging:** GSC insights shipped as function-included JSON (no live private DB call at request time for that path).  

---

## 3. Findings (débitos de dados)

| ID | Finding | Severity | Evidence | Recommendation |
|----|---------|----------|----------|----------------|
| DATA-01 | Lead listing is full prefix scan (`list` + get each) | **Critical** (at scale) | `ops.cjs` listLeads | Introduce index/export pipeline or external warehouse |
| DATA-02 | No relational schema / query language for leads | **High** | Architecture | Optional Postgres/Supabase **for ops CRM only**, keep public static |
| DATA-03 | No formal schema version field on all Blobs records | Medium | lead-store | Add `schema_version` + migration notes |
| DATA-04 | Multi-backend store (Memory/File/Blobs/HTTP) misconfig risk | **High** | `LEAD_ALLOW_MEMORY_FALLBACK` | Fail-closed in production if Blobs unavailable |
| DATA-05 | Cross-entity transactions impossible (lead + nurture + event) | Medium | Blobs KV | Accept eventual consistency; document; compensate with jobs |
| DATA-06 | GSC insights dual-path (`data/ops` + `netlify/functions/data`) drift risk | Medium | duplicate files in git status | Single source + copy step in build |
| DATA-07 | Editorial/registry JSONs large & frequently dirty | Medium | git status | Clear generated vs source ownership |
| DATA-08 | `.env.example` advertises Supabase unused by product | Medium | `.env.example` | Replace with product env template (`docs/ops/ENV-VARS.md`) |
| DATA-09 | Email delivery path incomplete (FormSubmit 403; Resend env-dependent) | Medium | FINAL-REPORT | Close email channel SLAs |
| DATA-10 | Retention policy exists but purge job visibility unclear | Medium | LEAD_RETAIN_DAYS | Document/schedule purge evidence |
| DATA-11 | Analytics store separate from leads — join only in ops memory | Medium | ops attribution | Precompute daily cohorts to JSON/warehouse |
| DATA-12 | No RLS equivalent — security is function-auth only | **High** (if ops token weak) | ops.cjs | Strong secrets rotation, audit access |
| DATA-13 | No secondary offline backup of Blobs to owner-controlled storage | Medium | architecture | Periodic export job to private bucket |
| DATA-14 | pSEO schema complex; national engine data heavy | Low–Medium | data/pseo | Continue snapshot freezes; avoid live private DB in build |
| DATA-15 | Tool results stored client-side only (localStorage) | Low | tool-persist | Intentional; document privacy |

---

## 4. Security audit (data-focused)

### 4.1 Access control

| Surface | Control | Gap |
|---------|---------|-----|
| Public lead POST | Origin, rate limit, Turnstile | OK if envs set |
| Ops GET leads | Auth required | Token hygiene critical (DATA-12) |
| Static site | No lead dump | OK |
| Blobs console | Netlify account IAM | Org access review needed |

### 4.2 Sensitive fields

- Contact (phone/email) at rest in Blobs — encryption is **platform-default**, not app-level envelope encryption.  
- Logs use `safeLog` — verify production log sinks never echo body PII.  
- IP stored as hash when salt configured — ensure `IP_HASH_SALT` always set in prod.

### 4.3 Injection / abuse

- JSON body parse + validateAndNormalize — good.  
- Rate limits reduce spam cost; still need abuse monitoring on ops health.

---

## 5. Performance

| Operation | Current | Risk threshold |
|-----------|---------|----------------|
| Lead write | O(1) put | Fine |
| Ops list all leads | O(n) | Painful > few thousand leads |
| Attribution join events×leads | O(n×m) memory | Painful with event growth |
| Editorial build | Batch offline | Managed by CI time |

---

## 6. Normalization & modeling

| Topic | Assessment |
|-------|------------|
| Lead denormalization | Appropriate for KV |
| Stage history | Likely overwrite/patch — **audit trail may be thin** |
| Multi-journey identity (same person twice) | Idempotency is request-level, not person-level CRM merge |
| Content entities | Well modeled as files + registry |

---

## 7. Orphan / dead data risks

| Risk | Notes |
|------|-------|
| Orphan nurture state | If lead deleted without cascade |
| Stale GSC packages | Insights not re-synced |
| Dual registry copies | `docs/editorial` vs `data/editorial` |
| Synthetic leads accumulation | Mitigated by kind filters if classification correct |

---

## 8. Compliance notes (LGPD-oriented)

| Control | Status |
|---------|--------|
| Purpose limitation (lead intake) | Clear product purpose |
| Minimization in public API | Strong |
| Retention | Configurable; enforce purge |
| Data subject access/delete | **Not clearly productized** as self-serve — ops manual |
| DPA with Netlify/ntfy/Resend | Operator responsibility |

**Debt:** DATA-16 (process) — document DSAR procedure for leads in Blobs.

---

## 9. Priority matrix (data)

| Priority | IDs | Theme |
|----------|-----|-------|
| P0 | DATA-04, DATA-12 | Production fail-closed + ops auth |
| P1 | DATA-01, DATA-02, DATA-11 | Query/reporting path |
| P2 | DATA-03, DATA-06, DATA-07, DATA-10 | Hygiene & versioning |
| P3 | DATA-05, DATA-08, DATA-09, DATA-13–16 | Hardening & process |

---

## 10. Recommended target evolution (non-binding)

**Keep:** public static site; lead write API; Blobs as hot write path **or** write-through to DB.

**Add (when volume justifies):**

1. Nightly export Blobs → Postgres/BigQuery/Sheet  
2. Or dual-write lead put → Supabase table with RLS service role only  
3. Ops UI/CLI reading from warehouse, not live full scan  
4. Formal `schema_version` + changelog  

**Do not:** force public build to call private SQL (violates current Netlify build principle).

---

## 11. Condition evaluation for workflow

| Workflow condition | Result |
|--------------------|--------|
| `project_has_database` (RDBMS) | **False** |
| `project_has_data_plane` | **True** — Phase 2 **executed** with adapted scope |

Outputs written:

- `supabase/docs/SCHEMA.md`  
- `supabase/docs/DB-AUDIT.md`  
