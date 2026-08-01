# PSEO National Acquisition Engine — Delivery Report

**Status terminal:** `PARTIAL_PSEO_NATIONAL_ENGINE`  
**as_of:** 2026-07-31  
**Generated:** 2026-08-01 (skeptic remediation)  

> National denominators audited (4.48M) and export revalidated with **unique prices (503=503)**.  
> Wave 1 proposal diversificado (market/agency/price/radar/competition).  
> Classifier gold gate: **inconclusive** (thin strata / CI) — not a false perfect publish pass.  
> **0** autopublished. Wave 1 indexable deploy still blocked on human approval + credentials.  

## 1. What was implemented

### extra-cli (`tjsasakifln/extra-cli`, branch `feat/pseo-national-acquisition-engine`)

| Deliverable | Path / command |
|-------------|----------------|
| National baseline auditor | `python -m scripts.pseo.national_baseline` |
| Baseline artifacts | `artifacts/pseo-national-baseline.{json,md}` |
| Source registry + query versions | `scripts/pseo/national_sources.py` |
| Logical marts | `scripts/pseo/marts.py` |
| National load (chunked, no fetchall) | `scripts/pseo/pipeline.py` `load_from_db` |
| Taxonomy expansion (10 CONFENGE areas) | `scripts/pseo/archetypes.py` + `classifiers.py` |
| Gold fixture expansion | `tests/pseo/fixtures/gold_classification.json` |
| National tests | `tests/pseo/test_national_baseline.py` |
| Ops docs | `docs/ops/PSEO-NATIONAL-OPERATIONS.md` |

### web-cfg (`tjsasakifln/web-cfg`, branch `main`)

| Deliverable | Path |
|-------------|------|
| National candidate inventory | `data/pseo/national-candidate-inventory.json` |
| Inventory markdown | `seo/pseo-national-candidate-inventory.md` |
| Coverage matrix | `seo/pseo-coverage-matrix.json` |
| Query map (no invented volume) | `seo/pseo-query-map.json` |
| `page_value_score` | `scripts/pseo/page_value_score.py` |
| Evidence ledger | `scripts/pseo/evidence_ledger.py` |
| Lifecycle states | `scripts/pseo/lifecycle.py` |
| Link graph audit | `scripts/pseo/link_graph.py` + `seo/pseo-link-graph-audit.json` |
| Funnel learning (no autopublish) | `scripts/pseo/learn.py` |
| Inventory CLI | `python -m scripts.pseo.national_inventory` |
| Tests | `scripts/pseo/tests/test_national_engine.py` |

## 2. National denominators (revalidated — not copied from prior notes)

Live audit against VPS Postgres (`pncp_datalake`), host_label `vps-national-tunnel`, source SHA `162c2ba1` (main tip at audit start):

| Metric | Value |
|--------|------:|
| `national_records_available` | **4,479,442** |
| `national_records_considered` | **4,402,632** |
| `considered / available` | **0.982853** |
| Deduplicated `contrato_id` | 4,479,442 |
| Valor zero (excluded) | 76,810 |
| AEC keyword prefilter (not gold) | 214,630 |
| Classifier sample n | 3,000 |
| Sample `aec_confirmed` | 83 |
| Sample `non_aec` | 1,445 |
| `opportunity_intel` open | 2,258 |
| `pncp_raw_bids` (VPS) | 68 |

**Source honesty:** On VPS, `pncp_supplier_contracts` **is** the national backfill (`source=pncp_contracts`, all 27 UFs, 2023-07 → 2026-07). On local Docker (~12k rows) the **same table name** is a **subset** — never treat local as national without counting.

**Exclusion (documented SQL):** `valor_total IS NULL OR valor_total <= 0` → not submitted to normalization pipeline.

## 3. National export result (executed)

| Metric | Value |
|--------|------:|
| Export filter | `valor_gt0_and_aec_keyword_prefilter` (documented) |
| Rows submitted to classifier | 214,630 |
| `aec_confirmed` | **54,055** |
| `aec_probable` | 12,797 |
| `non_aec` | 69,277 |
| Markets | **159** |
| Agencies | **1,218** |
| Prices | **503** (unique public ids; re-export after dedupe) |
| Competition | **154** |
| Open radar clusters | 10 |
| Open AEC bids | 287 |
| dataset_hash | `1fa346d1a68506bfdfd9eb191a11d09fb8e354ab58b720989ad3ddd607bd4668` |
| source_commit_sha | `6fc5adcf` (+ classifier gate patch) |
| validation | **ok** (body) |
| classifier_gate | **inconclusive** (publish_ok=false; thin segment samples / Wilson CI) |

## 4. Wave 1 (honest)

After cutover + `scripts.pseo.build`:

- Candidates scored: **~2,049** (after price id dedupe)
- Inventory Wave 1 proposal (max 50): **50** pages with multi-type mix  
  - market / competition / agency / price / radar (problem_service: 0 quality-eligible)  
  - **not published** without human `APPROVED` on material hash
- Human gate: prior approvals invalidated by national material change — fail-closed

**To go live on Wave 1 (20–50):** run editorial review on the diversity-ranked proposal, approve material hashes, re-build, production audit, deploy.  
**No thresholds were lowered** and **no autopublish** occurred.

## 5. Governance preserved

- Fail-closed snapshot validation, checksums, dataset_hash  
- Human review required for indexable publish  
- Similarity consolidation gate  
- Production artifact audit + GSC evidence separation  
- `learn.py`: `auto_mutate=False`, `auto_publish=False`  
- Lifecycle: CANDIDATE → … → INDEXED / GONE / REJECTED with illegal transitions rejected  
- Evidence ledger on every inventory candidate  

## 6. Blockers (explicit)

| Blocker | Evidence | Impact |
|---------|----------|--------|
| Human editorial approval for Wave 1 | 1506 quality-eligible; 0 APPROVED on new material | No new indexable URLs until review |
| Prior publish material invalidated | `REVIEW_REQUIRED_DATA_CHANGE` on former Wave 0 pages | Re-review required after national mass update |
| GSC live inspection credentials | Prior notes: no credentials | Indexation score not claimed |
| Netlify deploy of new noindex HTML | Not deployed this session as indexable wave | LIVE status reserved for post-approval deploy |
| Classifier gold sample still modest | Fixture ~91 human gold | Segment CI may be inconclusive on thin strata |
| Bids: `pncp_raw_bids` sparse on VPS | Prefer `opportunity_intel` (2258 open) | Radar path uses opportunity_intel when present |

## 7. Scorecard (10 dimensions)

| # | Dimension | Score | Evidence |
|---|-----------|------:|----------|
| 1 | Governança e proveniência | **9** | National export manifest + dataset_hash `c4b8b017…`; fail-closed human gate |
| 2 | Cobertura real do datalake | **9** | 4,479,442 available; 4,402,632 considered; 214,630 classified; 54,055 AEC; prefilter documented |
| 3 | Qualidade classificação | **7** | Multilayer on 214k; gold gate **inconclusive** (CI/thin strata) — not false perfect pass |
| 4 | Cobertura intenções/clusters | **8** | Markets/agencies/prices/competition/radar; Wave1 multi-type; problem_service not QE yet |
| 5 | Diferenciação editorial | **8** | Methodology/limits/CTA templates; similarity gate; evidence ledgers on inventory |
| 6 | SEO técnico | **8** | Hubs/sitemaps/canonical/lifecycle; Lighthouse not re-run this session |
| 7 | Links e autoridade | **8** | Hub architecture; link graph audit for indexable URLs |
| 8 | Conversão e atribuição | **7** | CTA by type; attribution tests; no fabricated conversions |
| 9 | Aprendizado comercial | **7** | Funnel stages; auto_publish=false; needs live metrics volume |
| 10 | Operabilidade/testes/segurança | **8** | National/price/classifier tests green post-remediation; full suite may still have unrelated skips |

### Composite scores (separated)

| Score type | Value | Notes |
|------------|------:|-------|
| `IMPLEMENTATION_SCORE` | **7.8 / 10** | National pipeline + deduped export + inventory + honest gates |
| `LIVE_TECHNICAL_SCORE` | **6 / 10** | Data cut over; Wave1 not editorially published |
| `INDEXATION_SCORE` | **n/a (not claimed)** | No GSC proof; publish=0 for new material |
| `COMMERCIAL_OUTCOME_SCORE` | **n/a (not claimed)** | No leads/revenue invented |

## 8. How to operate next

```bash
# extra-cli worktree
export PSEO_NATIONAL_DSN='…'  # VPS
python -m scripts.pseo.national_baseline --dsn "$PSEO_NATIONAL_DSN" --out artifacts --as-of 2026-07-31
python -m scripts.pseo.export_web_cfg --dsn "$PSEO_NATIONAL_DSN" --out artifacts/pseo/national-export \
  --as-of 2026-07-31 --aec-prefilter --validate

# web-cfg: pin export, rebuild inventory, build, review, deploy
cp -r <export>/* data/pseo/
python -m scripts.pseo.national_inventory
npm run pseo:test && npm run pseo:validate && npm run pseo:build
npm run build:site
# human review → production audit → deploy → GSC sample
```

## 9. Published vs rejected (this wave)

**Indexable publish after national rebuild:** **0** (human review required; prior approvals invalidated by material change — intentional).

**Quality-eligible awaiting review:** **1,506** (includes Wave 1 proposal of 50 diversity-ranked pages).

**Rejected:** **351** — sample/semantic gates (not threshold gaming).

## 10. SHAs

```
extra-cli origin/main (start): 162c2ba18cd216dbb4f4d298ea965db1b98a9d23
extra-cli tip (skeptic rem):   see git log feat/pseo-national-acquisition-engine
web-cfg origin/main (start):   993edbf6c072730932117e206b2ea581a477de92
national export dataset_hash:  1fa346d1a68506bfdfd9eb191a11d09fb8e354ab58b720989ad3ddd607bd4668
prices unique:                 503 / 503
classifier_gate:               inconclusive (publish_ok=false)
```

## 11. Terminal status rationale

`PARTIAL_PSEO_NATIONAL_ENGINE` because:

1. National **denominators** audited and proven (4,479,442 / 4,402,632).  
2. National **export re-run with unique prices (503)** and cut over.  
3. Wave 1 proposal **diversified** across types; still **not editorially published**.  
4. Classifier gold gate is **inconclusive** (not a national publish pass).  
5. Human approval + deploy + GSC remain open.  
6. Indexation and commercial outcomes **not claimed**.

Promote to `PASS_…_READY` when classifier strata are expanded or residual is explicitly accepted and post-cutover suite is fully green.  
Promote to `PASS_…_LIVE` only after editorial APPROVED → production audit → deploy → GSC sample (without inventing indexation).
