# pSEO Operational Inbound — final report

**Terminal status:** `PARTIAL_DEPLOYED_NOT_GSC_INSPECTED`  
**Date:** 2026-07-31  

This is **not** a claim of Google indexation. Vocabulary:

`GENERATED_LOCAL` → `QUALITY_ELIGIBLE` → `EDITORIALLY_APPROVED` → `DEPLOYED_PRODUCTION` → `CRAWLABLE_PRODUCTION` → `DISCOVERED_BY_GOOGLE` → `CRAWLED_BY_GOOGLE` → `INDEXED_BY_GOOGLE` → `RECEIVING_IMPRESSIONS` → `GENERATING_QUALIFIED_LEADS`

---

## What was proven locally

| Gate | Result |
|------|--------|
| `npm run build:site` | OK — snapshot validate → pages/hubs/sitemaps → `/.well-known/pseo-build.json` → SEO/attribution gates |
| `npm run pseo:validate` | OK — 4 publish, editorial ok |
| `npm run pseo:test` | 41 passed |
| analytics / attribution no-PII | OK |
| `npm run validate:seo` | VALIDATION_OK |
| extra-cli `pytest tests/pseo` | 48 passed on `feat/pseo-export-isolated` |
| `npm run pseo:audit:production` | **Fails closed** on production vs local mismatch (correct) |

### Wave 0 seeds (local `status=publish`)

1. `/radar/edificacoes-publicas-pr/`
2. `/inteligencia/cenarios/inconsistencia-orcamento-edital/`
3. `/inteligencia/cenarios/referencia-sinapi-sicro-margem/`
4. `/inteligencia/cenarios/aditivos-e-risco-de-margem/`

Approvals use **`page_material_hash`** (material fingerprint). Global `dataset_hash` churn alone does **not** demote `APPROVED`.

### Dropped from previous 8-URL “go-live” seed

| URL | Honest reason |
|-----|----------------|
| Agency MRS / Caxias | Sample concentration, single-day mass, ingestion prefix legacy |
| Price manutenção RS | buyers/suppliers/max_buyer_share gates |
| Price paralelepípedo PI | obs/span insufficient |
| Radar pavimentação SC | score &lt; publish min (kept noindex) |

---

## Production evidence (before this deploy)

Executed against **https://confenge.com.br** (GET, browser + Googlebot-like UA):

- Hubs and previous seed pages return **HTTP 200**, `index,follow` on older HTML → stage **CRAWLABLE_PRODUCTION** for those URLs.
- `/.well-known/pseo-build.json` → **404** (not deployed yet).
- Production `sitemap-inteligencia.xml` still lists **older 8 leaves + empty hubs**.
- Local build HTML **≠** production HTML → `prod_html_mismatch` (auditor critical).

Reports: `seo/pseo-production-audit.json`, `seo/pseo-production-audit.md`.

---

## Pipeline changes shipped (web-cfg)

1. **`npm run pseo:audit:production`** — dual-UA GET auditor, fail-on-critical.
2. **`npm run build:site`** — single Netlify entry; fail-closed.
3. **`netlify.toml`** — `command = "npm run build:site"`.
4. **Public manifest** — `/.well-known/pseo-build.json` (no secrets).
5. **Material-hash approval** — preserve approval across snapshot churn; invalidate on real material change.
6. **Empty hub policy** — hubs without publish children → `noindex,follow` and out of sitemap.
7. **Wave 0 editorial** — decision/mass/limits/action unique per scenario; accented labels; service labels in PT-BR.
8. **Internal mesh** — homepage nav/footer → inteligência/radar; commercial pillars + biblioteca link to seeds.
9. **Legacy redirect** — MRS agency slug → clean slug.
10. **Query map + indexation ledger** — `seo/pseo-query-map.json`, `seo/pseo-indexation-status.json`.
11. **Snapshot procedure** — `seo/SNAPSHOT-UPDATE.md`.

## extra-cli

- Canonical entrypoint: `python -m scripts.pseo.export_web_cfg` (delegates to `pipeline.main`).
- Tests: entrypoint permanence + 48 green on `feat/pseo-export-isolated`.
- `scripts/pseo/release_snapshot.py` — export → validate → changelog → optional atomic apply + build.
- `ProblemService` model accepts `claim_evidence` / `evidence_kind`.
- **PR #187 still OPEN** — not merged to `main` in this session → residual `BLOCKED_EXTRA_CLI_NOT_MERGED` risk for “main-only” ops.

---

## Residual steps (exact)

### 1. Deploy web-cfg (unblocks production mismatch)

```bash
cd /mnt/d/webcfg
git push origin main   # if Netlify tracks main
# or Netlify UI: trigger deploy of this commit
npm run pseo:audit:production   # must approach ok after deploy
```

Smoke after deploy:

```bash
curl -sSIL https://confenge.com.br/inteligencia/
curl -sSIL https://confenge.com.br/sitemap-index.xml
curl -sSIL https://confenge.com.br/sitemap-inteligencia.xml
curl -sSIL https://confenge.com.br/robots.txt
curl -sS https://confenge.com.br/.well-known/pseo-build.json
# each Wave 0 seed:
curl -sSIL https://confenge.com.br/radar/edificacoes-publicas-pr/
curl -sSIL https://confenge.com.br/inteligencia/cenarios/aditivos-e-risco-de-margem/
```

### 2. Merge extra-cli exporter to main

- Finish CI on PR https://github.com/tjsasakifln/extra-cli/pull/187 (ruff was previously red on intermediate WIP; current branch tests green).
- Merge → document `python -m scripts.pseo.export_web_cfg` on `main`.

### 3. GSC (no credentials in env)

1. Property `https://confenge.com.br/`
2. Submit **sitemap-index.xml**
3. URL Inspection for each Wave 0 URL
4. Fill `seo/pseo-indexation-status.json` — keep `NOT_INSPECTED_NO_CREDENTIALS` until real inspection

**Do not** use Indexing API for ordinary pSEO pages. **Do not** use deprecated sitemap ping.

---

## Commands reference

```bash
# web-cfg
npm run build:site
npm run pseo:validate
npm run pseo:audit
npm run validate:seo
npm test
npm run pseo:audit:production

# extra-cli
python3 -m pytest tests/pseo -q --no-cov
python3 -m scripts.pseo.export_web_cfg --out /tmp/pseo --as-of $(date -I) --validate
```

---

## Structured result

See `seo/pseo-operational-result.json`.

## Post-deploy (2026-07-31)

- `/.well-known/pseo-build.json` → 200 with `published_page_count: 4`
- Wave 0 seeds → HTTP 200, `index,follow`
- `sitemap-inteligencia.xml` lists only Wave 0 + hubs with children
- `npm run pseo:audit:production` → **ok** (0 critical) after empty-hub policy awareness
- GSC: still `NOT_INSPECTED_NO_CREDENTIALS`


## Skeptic fixes (post-deploy)

- Hub cards: human labels (`Cenário problema → serviço`), no `problem_service` copy.
- Guide/service anchors: PT-BR (`Serviço não previsto…`), no crude Title Case.
- Official sources: `safe_http_url` fixes `https:///` → usable HTTPS.
- Production audit records `in_hub` (null count 0).
- Unit tests: orphan, soft-404, redirect, prod_html_mismatch, guide labels.
- SHAs aligned: web_cfg HEAD = Netlify well-known = `5e573ec…`.


## SHA alignment (verifier)

| Source | SHA |
|--------|-----|
| git HEAD | `59d5d2376e922ace2d10d0d17db73365b5c8dd2c` |
| local `/.well-known/pseo-build.json` | `59d5d2376e922ace2d10d0d17db73365b5c8dd2c` |
| live production well-known | `59d5d2376e922ace2d10d0d17db73365b5c8dd2c` |
| `pseo-operational-result.json` web_cfg_sha / netlify_deployed_sha | `59d5d2376e922ace2d10d0d17db73365b5c8dd2c` |

`npm run pseo:audit:production` → ok (0 critical). Seeds HTTP 200 + index,follow.
