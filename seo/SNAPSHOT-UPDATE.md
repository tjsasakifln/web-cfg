# pSEO snapshot update procedure (web-cfg ← extra-cli)

## Principles

1. Netlify **never** connects to the private datalake. Only the versioned tree under `data/pseo/` is consumed.
2. Global `dataset_hash` churn must **not** wipe human approvals. Approvals key off `page_material_hash`.
3. “Published” means `status=publish` after quality gates **and** `human_review ∈ {APPROVED, APPROVED_WITH_NOTES}`.
4. Stages: `GENERATED_LOCAL` → `QUALITY_ELIGIBLE` → `EDITORIALLY_APPROVED` → `DEPLOYED_PRODUCTION` → `CRAWLABLE_PRODUCTION` → … → `INDEXED_BY_GOOGLE` (GSC only).

## Canonical export (extra-cli)

Branch with the durable exporter (PR #187 / `feat/pseo-export-isolated` until merged to `main`):

```bash
cd "/path/to/extra-cli"
# once on main: git checkout main && git pull
git checkout feat/pseo-export-isolated   # until merged
set -a && source .env && set +a          # DATABASE_URL / LOCAL_DATALAKE_DSN — never commit
python3 -m scripts.pseo.export_web_cfg \
  --out /tmp/pseo-export \
  --as-of $(date -I) \
  --validate
```

Or the release helper:

```bash
python3 -m scripts.pseo.release_snapshot \
  --web-cfg /path/to/webcfg \
  --as-of $(date -I) \
  --apply \
  --build
```

`--apply` copies atomically into `web-cfg/data/pseo`. `--build` runs `npm run build:site`.

## After snapshot lands in web-cfg

```bash
cd /path/to/webcfg
npm run pseo:validate
# Review pages whose material hash changed:
python3 scripts/pseo/review.py list --status noindex
python3 scripts/pseo/review.py audit PAGE_ID
python3 scripts/pseo/review.py set PAGE_ID APPROVED \
  --reviewer YOU \
  --notes "…" \
  --rationale "…" \
  --checklist sample_independence_verified,no_internal_slugs,sources_checked,claims_have_direct_evidence,no_duplicates_in_tables,meta_description_complete,cannibalization_checked,cta_contextual
npm run build:site
npm run pseo:audit
npm test
```

## Deploy

- Netlify build command: `npm run build:site` (see `netlify.toml`).
- Public marker: `/.well-known/pseo-build.json` (SHA, abbreviated snapshot hash, counts — no secrets).
- After deploy: `npm run pseo:audit:production` against `https://confenge.com.br`.

## Schema

- Consumer accepts `schema_version` ∈ `1.0.0`, `1.1.0` (`scripts/pseo/schema.py`).
- Export manifests must include `dataset_hash`, `checksums`, `source_run_id`, `data_as_of`.
