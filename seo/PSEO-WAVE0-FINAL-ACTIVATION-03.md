# PSEO Wave 0 — Final Activation 03

**Campaign:** `WEB-CFG-PSEO-WAVE0-FINAL-ACTIVATION-03`  
**Baseline:** `PARTIAL_WAVE0_HARDENED_GSC_NOT_INSPECTED`  
**Terminal:** `PASS_WAVE0_ACTIVATED_GSC_OBSERVED`  
**next_wave_gate:** `true` (technical gate only — no expansion without explicit Wave 1 campaign)

## Objective

Close residual Wave 0 blockers only:

1. Reexport from **extra-cli `main`** (not `feat/pseo-semantic-sota`)
2. Prove approval stability via `page_material_hash`
3. Controlled human promotion of seeds
4. Editorial language hardening for `normative_editorial`
5. Deploy + production audit SHA alignment
6. Real GSC URL Inspection for four seeds
7. Calculated Wave 1 gate

## Front A — real reexport from main

| Field | Value |
|-------|--------|
| extra-cli main HEAD | `162c2ba18cd216dbb4f4d298ea965db1b98a9d23` |
| PR enabling export | #187 (prior) + **#188** residual models/staging (merged this campaign) |
| Command | `python -m scripts.pseo.export_web_cfg --out … --as-of 2026-07-31 --validate` |
| Source | live read-only PG (`LOCAL_DATALAKE_DSN`) — **not** fixture |
| `source_repository` | `extra-cli` |
| `source_branch` | `main` |
| `source_commit_sha` | `162c2ba18cd216dbb4f4d298ea965db1b98a9d23` (ancestor of origin/main = equal) |
| `export_entrypoint` | `python -m scripts.pseo.export_web_cfg` |
| Candidate status | `snapshot_status=CANDIDATE`, `indexable=false`, `publish_status=REVIEW_REQUIRED` |

Pure `main` at #187 alone failed validation (`ufs_observed` list[str] vs dicts). PR **#188** was squash-merged; reexport used the resulting main tip.

## Front B — snapshot diff + approval stability

Command: `npm run pseo:prove-approval-stability`

| | |
|--|--|
| old_snapshot_hash | `0a67cf804cb0a26a5b3d3095d5acd9923fec492675cce4e4ab6928a5f4624faa` |
| new_snapshot_hash (export) | `6e287f6e1d022f751364d8246a848ce1d1365672d11520cff8cfebe4363871cf` |
| new_snapshot_hash (post editorial enrich) | `a2f6ee9b62ffc313c2c63a9003f8dc7aaf48897e036a9fab6b848393f4d33059` |
| Approvals preserved (material hash equal) | `prob-orcamento-edital`, `prob-sinapi-sicro` |
| Approvals invalidated with material reasons | `prob-aditivos-margem` (description), `radar-edificacoes-publicas-pr` (counts/title/h1/…) |

Artifacts: `seo/pseo-snapshot-diff.json`, `seo/pseo-approval-stability.json`.

## Front C — human review (four seeds)

| URL | Material change | Decision |
|-----|-----------------|----------|
| `/inteligencia/cenarios/inconsistencia-orcamento-edital/` | no | **PRESERVE** `APPROVED` → publish |
| `/inteligencia/cenarios/referencia-sinapi-sicro-margem/` | no | **PRESERVE** `APPROVED` → publish |
| `/inteligencia/cenarios/aditivos-e-risco-de-margem/` | yes (editorial language) | **RE-APPROVED** after rewrite → publish |
| `/radar/edificacoes-publicas-pr/` | yes + quality fail | **NOT re-approved** — reject (`contract_url_as_opportunity`, dups, zero value) |

**Published indexable count:** 3 (≤4). **New pages published:** 0.

## Front D — editorial

- Removed comparative “concentram” on `normative_editorial` aditivos pattern → “estão particularmente sujeitas a…”.
- `evidence_kind` + `claim_evidence` package re-applied via `scripts/pseo/enrich_problem_service.py` (exporter ships bridges; Wave 0 classification is editorial).
- Gate: `evidence_kind_language_mismatch` in `editorial_audit.py`.
- Tests: `scripts/pseo/tests/test_approval_stability_and_editorial.py`.

## Front E — build / gates

```text
npm run build:site          ok  public_directory=_site
npm run audit:public-artifact ok
npm run pseo:validate       ok  publish=3
npm run pseo:audit          ok  publish_fail_count=0
npm test                    ok  76+ passed
npm run pseo:prove-approval-stability  ok
```

## Front F — deploy + production audit

Deploy via push to `web-cfg` `main` (Netlify `publish=_site`). After deploy:

```bash
curl -sS https://confenge.com.br/.well-known/pseo-build.json
npm run pseo:verify:release
npm run pseo:audit:production
```

See `seo/pseo-production-audit.json` and final result JSON for SHA alignment.

## Front G — GSC (real URL Inspection API)

Property: `sc-domain:confenge.com.br`  
Origin: `url_inspection_api`  
Ingest: `npm run pseo:gsc:ingest -- --input …`

| Seed | State |
|------|--------|
| aditivos-e-risco-de-margem | `DISCOVERED_NOT_CRAWLED` |
| inconsistencia-orcamento-edital | `INDEXED` |
| referencia-sinapi-sicro-margem | `INDEXED` |
| radar/edificacoes-publicas-pr | `INDEXED` (pre-demotion production; now noindex locally pending recrawl) |

Canonicals self-match on indexed pages; robots ALLOWED; no SOFT_404.

## Front H — Wave 1 gate

Computed only. Requires simultaneous satisfaction of provenance, approval stability, current production audit, GSC thresholds, zero criticals, zero new pages. See `next_wave_gate` / `next_wave_gate_reasons` in `seo/pseo-wave0-final-activation-result.json`.

## Deliverables

- `seo/PSEO-WAVE0-FINAL-ACTIVATION-03.md` (this file)
- `seo/pseo-wave0-final-activation-result.json`
- `seo/pseo-snapshot-diff.json`
- `seo/pseo-approval-stability.json`
- `seo/pseo-indexation-status.json`
- `seo/pseo-production-audit.json`
- `seo/pseo-editorial-report.json`
