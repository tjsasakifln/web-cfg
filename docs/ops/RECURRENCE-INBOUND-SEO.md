# Recurrence — National Inbound SEO Engine

## Cadence

| Stream | Cadence | Owner | Auto-publish? |
|--------|---------|-------|---------------|
| National datalake snapshot (extra-cli export) | Weekly or biweekly | Ops / extra-cli | **No** |
| Snapshot delta report (new/degraded/stale/signature) | With each snapshot | Automation | **No** |
| Conscious ingest into web-cfg `data/pseo/` | After validated export | Automation + PR | **No** |
| Human re-review on material signature change | As needed | Tiago Sasaki | Manual only |
| GSC ingest | Weekly when authenticated | SEO ops | N/A |
| Editorial refresh | Monthly + on legal change | Editorial | No |
| Wave expansion (2+) | After Wave 1 live | Strategy | No |

## extra-cli

```bash
# 1. Prove / refresh national baseline (read-only VPS or tunnel)
export DATABASE_URL=...  # national DSN
python -m scripts.pseo.national_baseline --dsn "$DATABASE_URL" --host-label vps
python -m scripts.pseo.full_datalake_utilization_proof --dsn "$DATABASE_URL" --host-label vps

# 2. National public export (chunked, staging SQLite, no fetchall)
python -m scripts.pseo.export_web_cfg --out /path/to/out --as-of YYYY-MM-DD --validate

# 3. Discover candidate universe from aggregates
python -m scripts.pseo.discover_content_universe --export-dir /path/to/out

# 4. Delta vs previous manifest (dataset_hash, material signatures)
# Compare checksums + source_commit_sha + freshness — never auto-promote
```

Rules:

- Snapshot must include `source_commit_sha`, `dataset_hash`, freshness, limitations, allowlist.
- No silent web-cfg mutation from extra-cli.
- Netlify never queries Postgres.

## web-cfg

```bash
# Conscious copy of validated artifact (checksum-verified)
# Then:
npm run pseo:validate
npm run pseo:build
npm run pseo:audit
npm run pseo:test
npm run editorial:build
npm run editorial:test
npm run build:site
```

On material change: prior HUMAN_APPROVED invalidated → Approval Center → named human only.

## GSC

- When credentials exist: `npm run pseo:gsc:ingest` → `data/seo/gsc/` + `docs/seo/GSC-OPPORTUNITY-REPORT.html`
- When not: follow `docs/seo/GSC-OWNER-ACTIONS.md` → status `READY_FOR_GSC_OWNER_ACTION`

## Alerts

- Empty indexable sitemaps after approval (bug)
- Orphan pages in link graph
- Data age beyond type policy
- Classifier gold gate fail
- Tampered checksums (fail-closed validate)
