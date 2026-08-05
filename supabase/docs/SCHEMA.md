# Data Plane Schema — CONFENGE

**Workflow:** brownfield-discovery · Phase 2  
**Agent:** @data-engineer (Dara) via Orion YOLO orchestration  
**Date:** 2026-08-05  

> **Important:** This project has **no Supabase/Postgres RDBMS** in production.  
> Path `supabase/docs/` is the workflow-mandated location; content documents the **real** data plane: Netlify Blobs + file-backed JSON stores + packaged ops artifacts.

---

## 1. Storage topology

```text
┌─────────────────────────────────────────────────────────────┐
│                    RUNTIME (Netlify)                        │
│  Blobs store: leads / nurture state                         │
│  Blobs store: confenge-analytics                            │
│  Optional: FileStore (LEAD_STORE_DIR local)                 │
│  Optional: HTTP store mirror                                │
│  Optional: MemoryStore (tests only)                         │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                 BUILD-TIME / REPO (git)                     │
│  data/editorial/*   — content registry & page sources       │
│  data/site/*        — brand, design-system, proof           │
│  data/pseo/*        — pSEO schema, snapshots, metrics       │
│  data/ops/*         — GSC insights package for ops fn       │
│  data/revops/*      — GSC imports / cohort files            │
│  data/nurture/*     — nurture configuration                 │
└─────────────────────────────────────────────────────────────┘
```

| Store | Type | Used by | Durability |
|-------|------|---------|------------|
| Netlify Blobs (leads) | KV object store | `lead`, `ops`, `nurture` | Durable (platform) |
| Netlify Blobs `confenge-analytics` | KV | `collect`, `ops` | Durable |
| FileStore | JSON files on disk | Local/dev via `LEAD_STORE_DIR` | Local only |
| MemoryStore | In-process Map | Tests (`LEAD_STORE=memory`) | Ephemeral |
| HTTP store | External API | Optional mirror/CRM | External |
| Git JSON | Files in repo | Build pipelines | Versioned |

---

## 2. Lead record schema (runtime)

Source: `netlify/functions/lib/lead-store.cjs` + `lead-core.cjs` + `record-kind.cjs` + `lead-stages.cjs`.

### 2.1 Logical entity: `Lead`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `lead_id` | string | yes | Generated server-side |
| `idempotency_key` | string | yes | Dedup key |
| `created_at` | ISO datetime | yes | |
| `updated_at` | ISO datetime | yes | On patch |
| `name` | string | yes | Sanitized |
| `contact` | string | yes | WhatsApp and/or email (normalized) |
| `journey` / journey code | string | yes | `contrato` \| `edital` \| `operacao` (and variants) |
| `record_kind` | string | yes | commercial vs synthetic/qa classification |
| `stage` | string | yes | Lifecycle stage (see stages) |
| `source` / UTM fields | object/strings | optional | Attribution |
| `ip_hash` | string | optional | Salted hash, not raw IP |
| `fingerprint` | string | optional | Technical fingerprint |
| `turnstile_ok` | boolean | optional | Bot check result |
| delivery metadata | object | optional | ntfy/resend status (internal) |

Exact field set is enforced in `validateAndNormalize` — public API never returns free-text PII beyond success receipt.

### 2.2 Keying model (Blobs)

| Key pattern | Purpose |
|-------------|---------|
| `leads/{lead_id}` | Primary record |
| idempotency index key | Map idempotency → lead_id |

**No foreign keys.** Relationships are denormalized into the record or computed at read time.

### 2.3 Lead stages (logical)

Managed by `lead-stages.cjs` — commercial funnel stages (new → contacted → qualified → …) with scheduled nurture transitions. Treat as **application-enforced state machine**, not DB enum constraint.

### 2.4 Record kinds

`record_kind.cjs` separates:

- **Real commercial leads** (RevOps counts)  
- **Synthetic / probe / QA** (excluded from health commercial metrics)

---

## 3. Analytics events schema (runtime)

Store name: **`confenge-analytics`**  
Writer: `collect.cjs`  
Reader/agg: `lib/analytics-agg.cjs`, `ops.cjs`

| Concept | Description |
|---------|-------------|
| Event key | Timestamped / id keys under analytics store |
| Event body | First-party site events (page, CTA, tool, funnel steps) |
| Aggregation | Server-side rollups for ops health & attribution |

**No PII** policy enforced by tests (`test:analytics`).

---

## 4. Nurture state schema (runtime)

Writer/reader: `nurture.cjs` + `nurture-core.cjs`  
Config source: `data/nurture/*` (repo)

| Concept | Description |
|---------|-------------|
| Sequence definition | Steps, delays, channels (repo JSON) |
| Per-lead nurture state | Blobs keys tied to lead_id |
| Schedules | `revops:scheduled-nurture` etc. |

---

## 5. Build-time / git JSON schemas

### 5.1 Editorial registry

Path: `data/editorial/EDITORIAL-REGISTRY.json` (+ `pages/*.json`)

| Entity | Description |
|--------|-------------|
| Page / article | Slug, status, material hash, sources, indexability |
| Wave / approval | Human review packets & release pins |
| Source manifest | Legal/source governance |

### 5.2 Site brand & design

| File | Role |
|------|------|
| `data/site/brand.json` | Navigation, CTAs, brand strings |
| `data/site/design-system.json` | Tokens, forbidden patterns, section archetypes |
| `data/site/proof.json` | Verifiable credentials |
| `data/site/whatsapp-messages.json` | Prefill templates |

### 5.3 pSEO data

| Path | Role |
|------|------|
| `data/pseo/schema.json` | JSON Schema for agencies/objects/metrics |
| `data/pseo/snapshots/*` | Frozen national/inventory snapshots |
| `data/pseo/metrics/*` | Analytics/CRM/GSC metric folders |

### 5.4 Ops / RevOps packages

| Path | Role |
|------|------|
| `data/ops/gsc-insights.json` | Packaged for authenticated `ops?action=gsc_insights` |
| `data/revops/gsc/*` | Daily imports, fixtures, analysis outputs |
| `netlify/functions/data/gsc-insights.json` | Function-included copy |

---

## 6. Entity-relationship diagram (logical)

```text
┌──────────────┐       1:N        ┌─────────────────┐
│ Lead         │◄────────────────►│ NurtureState    │
│ (Blobs)      │                  │ (Blobs)         │
└──────┬───────┘                  └─────────────────┘
       │ optional attribution join (ops-time)
       ▼
┌──────────────┐
│ AnalyticsEvent│
│ (Blobs)       │
└──────────────┘

┌──────────────┐     builds      ┌─────────────────┐
│ EditorialPage│ ───────────────►│ Static HTML     │
│ (git JSON)   │                 │ (_site)         │
└──────────────┘                 └─────────────────┘

┌──────────────┐     packages    ┌─────────────────┐
│ GSC Import   │ ───────────────►│ gsc-insights    │
│ (revops)     │                 │ (ops JSON)      │
└──────────────┘                 └─────────────────┘
```

**No database-enforced FK/CASCADE.** Integrity is application + CI gates.

---

## 7. Indexes & query patterns

| Need | How it works today | Limitation |
|------|--------------------|------------|
| Get lead by id | Direct key read | OK |
| Get by idempotency | Secondary key/file | OK |
| List all leads | `store.list({ prefix: "leads/" })` + fetch each | **O(n)** scan |
| Filter by stage/kind/date | In-memory filter after list | Does not scale |
| Analytics rollups | Agg lib over event keys | Scan-heavy |
| Editorial search | Build-time / hub client search | Not DB FTS |
| GSC query performance | Precomputed JSON package | Stale if not re-synced |

---

## 8. Constraints & policies

| Policy | Mechanism |
|--------|-----------|
| Idempotent create | `onlyIfNew` + idempotency key |
| Retention | `LEAD_RETAIN_DAYS` (default 730) |
| Rate limit | IP + fingerprint windows |
| Origin allowlist | CORS / origin checks |
| PII minimization | Public responses + hashed IP |
| Record kind hygiene | Filters synthetic out of commercial metrics |
| Content integrity | Material hashes + editorial truth gates |

---

## 9. What is NOT present

| Classic DB feature | Status |
|--------------------|--------|
| Postgres / Supabase tables | Not used in product |
| RLS policies | N/A (no SQL) |
| SQL migrations | N/A |
| Views / stored procedures | N/A |
| ACID multi-entity transactions | Not available across Blobs keys |
| Full-text search index | Not available server-side |
| ORM | None |

`.env.example` lists `SUPABASE_*` from **AIOX template** — **not wired** to confenge production lead path (see `docs/ops/ENV-VARS.md` for real names).

---

## 10. Schema change process (as-is)

1. Change JS validators / builders in `netlify/functions/lib/*`  
2. Update tests (`test:lead-function`, revops tests)  
3. Deploy functions via Netlify  
4. For git JSON: update schema + run editorial/pseo/revops validators  
5. No migration runner — **backward compatibility is manual**

---

## Related

- `supabase/docs/DB-AUDIT.md` — debt & risks on this data plane  
- `docs/ops/ENV-VARS.md` — runtime env contract  
- `docs/architecture/system-architecture.md` — system context  
