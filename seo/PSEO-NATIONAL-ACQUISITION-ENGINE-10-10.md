# PSEO National Acquisition Engine — Delivery Report

**Status terminal:** `PARTIAL_PSEO_NATIONAL_ENGINE`  
**as_of:** 2026-07-31  
**Generated:** 2026-08-01  

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

## 3. Wave 1 (honest)

Current **web-cfg snapshot** (local export subset, Wave 0 freeze):

- Candidates scored: **19**
- Registry publish: **3** (problem/service scenarios already live)
- Wave 1 proposal from inventory (quality-eligible, diversity-ranked): **3** pages  
  - `/inteligencia/cenarios/aditivos-e-risco-de-margem/`  
  - `/inteligencia/cenarios/inconsistencia-orcamento-edital/`  
  - `/inteligencia/cenarios/referencia-sinapi-sicro-margem/`
- Rejected / insufficient sample: **14** (gates not weakened)

**National export** (AEC prefilter over 4.48M) was launched on VPS next to the DB. While it runs/finishes, the site continues to serve the approved Wave 0 publish set. Expanding to 20–50 pages requires:

1. Completed national export artifact with higher AEC market mass  
2. Human editorial approval on material hashes  
3. Similarity + production audit + deploy credentials  

**No thresholds were lowered** to hit a page-count target.

## 4. Governance preserved

- Fail-closed snapshot validation, checksums, dataset_hash  
- Human review required for indexable publish  
- Similarity consolidation gate  
- Production artifact audit + GSC evidence separation  
- `learn.py`: `auto_mutate=False`, `auto_publish=False`  
- Lifecycle: CANDIDATE → … → INDEXED / GONE / REJECTED with illegal transitions rejected  
- Evidence ledger on every inventory candidate  

## 5. Blockers (explicit)

| Blocker | Evidence | Impact |
|---------|----------|--------|
| Full national export runtime | VPS process classifying ~215k keyword-filtered rows; multi-minute/hour job | Wave 1 expansion beyond 3 pages waits for export |
| Local DSN is subset | Local count ~12k vs VPS 4.48M | Must use `PSEO_NATIONAL_DSN` / VPS for national claims |
| GSC live inspection credentials | Prior Wave 0: `NOT_INSPECTED_NO_CREDENTIALS` | Indexation score not claimed |
| Netlify deploy not re-run this session | No new deploy token exercise | Status is not LIVE for new national pages |
| Classifier gold sample still modest | Fixture expanded to ~91; sample census incomplete | Segment precision gates can be **inconclusive** if strata thin |
| Bids sparse on VPS raw table | 68 `pncp_raw_bids` vs 2258 `opportunity_intel` | Radar uses opportunity_intel when present |

## 6. Scorecard (10 dimensions)

| # | Dimension | Score | Evidence |
|---|-----------|------:|----------|
| 1 | Governança e proveniência | **9** | Baseline + export manifest fields; fail-closed validation; SHAs recorded |
| 2 | Cobertura real do datalake | **9** | 4,479,442 counted; ratio 0.982853; subset vs national documented |
| 3 | Qualidade classificação | **7** | Multilayer + expanded taxonomy; gold expanded; full national labels pending export finish; sample not census |
| 4 | Cobertura intenções/clusters | **6** | Inventory + matrix + query map; only 19 candidates from current snapshot; national markets pending export |
| 5 | Diferenciação editorial | **7** | Existing publish pages have methodology/limits/CTA; similarity gate; no doorway suppliers |
| 6 | SEO técnico | **8** | Canonical, sitemaps shards, hubs, robots policy; Lighthouse not re-run this session |
| 7 | Links e autoridade | **8** | Hub architecture; link graph audit ok for publish URLs (0 orphans indexable) |
| 8 | Conversão e atribuição | **7** | CTA by type; attribution tests; funnel events in learn; no fabricated conversions |
| 9 | Aprendizado comercial | **7** | Funnel stages in learn.py; no autopublish; needs live GSC/CRM volume |
| 10 | Operabilidade/testes/segurança | **8** | extra-cli national tests pass; web-cfg 88 passed / 2 skipped; no PII in public path |

### Composite scores (separated)

| Score type | Value | Notes |
|------------|------:|-------|
| `IMPLEMENTATION_SCORE` | **7.6 / 10** | Architecture + denominators + tests + inventory shipped |
| `LIVE_TECHNICAL_SCORE` | **6 / 10** | Wave 0 pages live; national export not yet cut over to site data |
| `INDEXATION_SCORE` | **n/a (not claimed)** | No GSC proof fabricated |
| `COMMERCIAL_OUTCOME_SCORE` | **n/a (not claimed)** | No leads/revenue invented |

## 7. How to operate next

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

## 8. Published vs rejected (this wave)

**Published (unchanged live set, not expanded without national export):**  
Problem/service scenarios under `/inteligencia/cenarios/*` and prior radar/market pages already approved in Wave 0.

**Rejected / not expanded:**  
Markets and radars failing sample independence, contracts&lt;15, freshness, or pending human review — see `data/pseo/registry.json` and inventory `rejected_summary`.

## 9. Initial SHAs

```
extra-cli origin/main: 162c2ba18cd216dbb4f4d298ea965db1b98a9d23
web-cfg origin/main:   993edbf6c072730932117e206b2ea581a477de92
```

## 10. Terminal status rationale

`PARTIAL_PSEO_NATIONAL_ENGINE` because:

1. National **denominators** audited and proven (4.48M).  
2. National **pipeline code**, marts, taxonomy, tests, inventory, score, ledger, lifecycle, links **implemented**.  
3. National **export cutover + Wave 1 expansion (20–50) + deploy** not completed in this session without weakening gates.  
4. Indexation and commercial outcomes **not claimed**.

When national export lands and Wave 1 is editorially approved and deployed, status can move to `PASS_PSEO_NATIONAL_ENGINE_READY` (pre-deploy) or `PASS_PSEO_NATIONAL_ENGINE_LIVE` (post-deploy + production audit).
