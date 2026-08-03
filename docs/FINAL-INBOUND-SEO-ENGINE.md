# FINAL — Inbound SEO Engine (CONFENGE)

**Terminal status:** `READY_FOR_TIAGO_APPROVAL`  
**Generated:** 2026-08-02  

## Verdict

The national inbound SEO **machine** is installed end-to-end (producer → discovery → consumer gates → approval UI → recurrence → measurement hooks).  

It is **not** `COMPLETE_INBOUND_SEO_ENGINE` because:

1. **Zero** pages are `HUMAN_APPROVED` / `INDEXABLE` (by design — automation never stamps approval).
2. Sitemaps for editorial/intelligence correctly contain **no** indexable URLs until approval.
3. Google Search Console is **not** authenticated here → `search_demand_unverified` + owner action doc.

This is the honest terminal state after pushing as far as data quality + permissions allow.

---

## 1. Full datalake utilization

| Metric | Value |
|--------|------:|
| National contracts available (VPS `pncp_datalake`) | **4,479,442** |
| Contracts **stream-read** (exact) | **4,479,442** (matches available) |
| Considered (valor > 0) | **4,402,632** |
| AEC keyword prefilter | 214,630 |
| AEC confirmed in national export | **54,055** |
| Markets / agencies / prices / competition | 159 / 1,218 / 503 / 154 |
| UFs in stream | **27** |
| Period (data_publicacao) | 2023-07-20 → 2026-07-31 |
| Stream runtime / peak RSS | 740.6 s / **73.7 MiB** |
| dataset_hash (export) | `1fa346d1a68506bf…` |
| dataset_hash (stream of contrato_id) | `50f92b7c7f23678a…` |
| Isolation | REPEATABLE READ |
| fetchall on large tables | **No** |
| Fixture as production evidence | **No** |
| Proof status | `FULL_DATALAKE_UTILIZED` |

Proof artifact: `docs/pseo/FULL-DATALAKE-UTILIZATION-PROOF.json` (+ `.md`) — produced by  
`python -m scripts.pseo.full_datalake_utilization_proof` against the live national DB via SSH tunnel (`vps-national-tunnel`).

Local Docker (~12k rows) is a **subset** of the same table name — never labeled national without counting.

---

## 2. Candidate universe (replaces fixed-23 logic)

| Metric | Value |
|--------|------:|
| Path | `data/pseo/CANDIDATE-UNIVERSE.json` |
| Candidates | **2,399** |
| Families A–H | A203 B1218 C503 D154 E10 F8 G220 H83 |
| Wave 1 proposal | 40 (diversity quotas; **not** autopublished) |
| Score | Public `seo_opportunity_score` (explainable; no invented volume) |

Discovery entrypoint (extra-cli):

```bash
python -m scripts.pseo.discover_content_universe --export-dir artifacts/pseo/national-export-v2
```

Statuses used: `READY_AFTER_HUMAN_REVIEW`, `REJECTED_THIN`, `REJECTED_REDUNDANT`, `NEEDS_*` — never silent publish.

---

## 3. Editorial graph & backlog

| Asset | Count / path |
|-------|----------------|
| Topic domains (OBJECTIVE §8) | **60** → `docs/editorial/SEO-TOPIC-GRAPH.*` |
| Unique intentions | **338** → `data/editorial/INTENTIONS.json` |
| Complete briefs | **100** → `data/editorial/BRIEFS/` |
| EDITORIAL_REVIEWED (Wave 1 packet) | **11** |
| INDEXABLE editorial | **0** |
| Backlog | `docs/editorial/EDITORIAL-BACKLOG.md` |

Lifecycle enforced: DRAFT → … → HUMAN_APPROVED → INDEXABLE → MONITORED.  
Automation **cannot** set `HUMAN_APPROVED`.

---

## 4. Wave 1 package & approval

- Approval Center: `docs/review/TIAGO-SEO-APPROVAL-CENTER.html` (APROVAR / RESSALVAS / REJEITAR / DEVOLVER — browser ledger only).
- Prior packet: `docs/editorial/FINAL-HUMAN-REVIEW-PACKET.md` (11 ready, 1 jurisprudence rejected).
- Named script (not executed by automation): `bash scripts/editorial/approve_wave1_tiago.sh`.
- pSEO registry still **0 publish** — fail-closed gates intact (`npm run pseo:validate` → ok, publish_count=0).

Gates were **not** lowered to force pages live.

---

## 5. Contract, recurrence, measurement

| Item | Location |
|------|----------|
| Producer→consumer | extra-cli export → checksums → conscious copy → web-cfg `data/pseo/` |
| Recurrence (web-cfg) | `docs/ops/RECURRENCE-INBOUND-SEO.md` |
| Recurrence (extra-cli) | `docs/ops/PSEO-RECURRENCE.md` |
| GSC owner actions | `docs/seo/GSC-OWNER-ACTIONS.md` |
| GSC report placeholder | `docs/seo/GSC-OPPORTUNITY-REPORT.html` |
| Conversion / CTA map | `docs/editorial/CONTENT-CONVERSION-MAP-ENGINE.json` |
| Internal link graph | `docs/seo/INTERNAL-LINK-GRAPH.json` |

Auto-publish: **disabled**. Netlify never queries Postgres.

---

## 6. Tests executed (this goal)

- Full-datalake stream proof: **FULL_DATALAKE_UTILIZED** (4,479,442 rows)
- `discover_content_universe` + extra-cli discover tests — **passed**
- `npm run pseo:validate` — **ok** (publish_count=0)
- `scripts/pseo/tests` (full) — see `implementer/gates/pseo-test-green.log` (target: green after registry hash rebind)
- `npm run editorial:test` — **26 passed**
- `npm run test:analytics` / `test:pseo-attribution` / `test:brand` — **OK**
- Registry/wave0/inbound engine regression — **26 passed** (registry-wave0-fix.log)
- Wave1 package: **40/40 HTML exists**, **0 phantom URLs**, **0 wave1 orphans**
- `problem_service.evidence_kind` set to `normative_editorial` for all 5 rows

Production deploy probes deferred until human approval + Netlify deploy (no forged COMPLETE).

---

## 7. Exact remaining human / external actions

1. **Tiago Sasaki** opens `docs/review/TIAGO-SEO-APPROVAL-CENTER.html` + `docs/editorial/FINAL-HUMAN-REVIEW-PACKET.md`.
2. For each page: APROVAR / APROVAR COM RESSALVAS / REJEITAR / DEVOLVER.
3. Only then run `bash scripts/editorial/approve_wave1_tiago.sh` (or per-page `approve_cli.py`).
4. `npm run editorial:build && npm run pseo:build && npm run build:site` + full test battery.
5. Deploy to Netlify.
6. Complete GSC steps in `docs/seo/GSC-OWNER-ACTIONS.md`.
7. Then status can advance to `READY_FOR_GSC_OWNER_ACTION` → `COMPLETE_INBOUND_SEO_ENGINE` when coverage is evidenced.

---

## 8. Status decision tree (honored)

| Status | When |
|--------|------|
| `COMPLETE_INBOUND_SEO_ENGINE` | Approved + published + sitemaps non-empty + GSC submitted + recurrence live |
| **`READY_FOR_TIAGO_APPROVAL`** | **← current** — full package ready, only nominal human approval missing |
| `READY_FOR_GSC_OWNER_ACTION` | After publish, GSC auth pending |
| `BLOCKED_BY_DATA_REALITY` | If national DB unreadable / far below 4.4M without fix |
| `BLOCKED_WITH_EXACT_EXTERNAL_ACTIONS` | Only for true external blockers with executable instructions |

---

## Principles preserved

- No thin / doorway / one-URL-per-contract pages  
- No invented statistics or search volumes  
- No Top-20 commercial leakage  
- No forged `HUMAN_APPROVED`  
- Fail-closed gates  
- Full national datalake as discovery engine, not a SC-only sample labeled national  
