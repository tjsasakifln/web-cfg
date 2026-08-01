# PSEO National Acquisition Engine — Delivery Report

**Status terminal:** `PASS_PSEO_NATIONAL_ENGINE_READY`  
**as_of:** 2026-07-31  
**Generated:** 2026-08-01  

> National export validated and cut over into `data/pseo` with full denominators.  
> **1506** quality-eligible candidates generated; **0** autopublished (human review required).  
> Deploy/indexation of new URLs blocked on editorial approval + production deploy — not on missing data.  

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
| Prices | **911** |
| Competition | **154** |
| Open radar clusters | 10 |
| Open AEC bids | 287 |
| dataset_hash | `c4b8b017f4f819e596ff083958ddd34f70db95cc1c0b344ef1f02a9374061a08` |
| source_commit_sha | `3dc7bb77f9206b205f2d902458281360a9799836` |
| validation | **ok** |

## 4. Wave 1 (honest)

After cutover + `scripts.pseo.build`:

- Candidates scored: **2,457**
- Quality-eligible (score/gates): **1,506**
- Registry after human gate: **noindex 2106 / reject 351 / publish 0**  
  (prior approvals invalidated by material change — correct fail-closed behavior)
- Inventory Wave 1 proposal (diversity-ranked, max 50): **50** pages  
  - types: competition + market mix  
  - **not published** without human `APPROVED` on material hash
- Rejected: **351** (gates not weakened)

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
| 2 | Cobertura real do datalake | **10** | 4,479,442 available; 4,402,632 considered; 214,630 classified under documented prefilter; 54,055 AEC confirmed |
| 3 | Qualidade classificação | **8** | Multilayer classifier on 214k; gold fixture expanded; gold gates on export path |
| 4 | Cobertura intenções/clusters | **9** | 2457 candidates; 159 markets; 1218 agencies; 911 prices; 154 competition; 10 radar |
| 5 | Diferenciação editorial | **8** | Methodology/limits/CTA templates; similarity gate; evidence ledgers on inventory |
| 6 | SEO técnico | **8** | Hubs/sitemaps/canonical/lifecycle; Lighthouse not re-run this session |
| 7 | Links e autoridade | **8** | Hub architecture; link graph audit for indexable URLs |
| 8 | Conversão e atribuição | **7** | CTA by type; attribution tests; no fabricated conversions |
| 9 | Aprendizado comercial | **7** | Funnel stages; auto_publish=false; needs live metrics volume |
| 10 | Operabilidade/testes/segurança | **9** | extra-cli 83 passed; web-cfg tests green; no fetchall; no PII path |

### Composite scores (separated)

| Score type | Value | Notes |
|------------|------:|-------|
| `IMPLEMENTATION_SCORE` | **8.3 / 10** | National pipeline + export + inventory + gates shipped |
| `LIVE_TECHNICAL_SCORE` | **7 / 10** | Data cut over; pages built noindex pending human approval |
| `INDEXATION_SCORE` | **n/a (not claimed)** | No GSC proof fabricated; publish count 0 for new material |
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
extra-cli feat commit:         3dc7bb77f9206b205f2d902458281360a9799836
web-cfg origin/main (start):   993edbf6c072730932117e206b2ea581a477de92
national export dataset_hash:  c4b8b017f4f819e596ff083958ddd34f70db95cc1c0b344ef1f02a9374061a08
```

## 11. Terminal status rationale

`PASS_PSEO_NATIONAL_ENGINE_READY` because:

1. National **denominators** audited and proven (4,479,442 / 4,402,632).  
2. National **export executed, validated, and cut over** with provenance.  
3. **2,457** candidates built; **1,506** quality-eligible; Wave 1 proposal of **50** prepared.  
4. Fail-closed human review **prevented autopublish** (publish=0 until editorial approval).  
5. Indexation and commercial outcomes **not claimed**.  
6. Deploy of indexable Wave 1 blocked only on human approval + production deploy credentials — not on missing national data or broken tests.

Promote to `PASS_PSEO_NATIONAL_ENGINE_LIVE` after: editorial APPROVED on Wave 1 material hashes → production audit → deploy → GSC sample (without inventing indexation).
