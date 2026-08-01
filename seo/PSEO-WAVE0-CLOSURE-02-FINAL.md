# PSEO Wave 0 Closure 02 — Final Report

**Campaign:** WEB-CFG-PSEO-WAVE0-CLOSURE-02  
**Generated:** 2026-08-01T00:18:16Z  
**Terminal status:** `PARTIAL_WAVE0_HARDENED_GSC_NOT_INSPECTED`

## HEADs (discovered at start / end)

| Repo | Value |
|------|-------|
| web-cfg start HEAD | `387db28b76fa062d34fed9086a3fc3e493fcffe1` |
| web-cfg this report | `387db28b76fa062d34fed9086a3fc3e493fcffe1` |
| extra-cli PR #187 tip (pre-merge) | `f25be1035be54eb18024852b929dc9dce7a14e25` |
| extra-cli main (post-merge) | `6f35c69f25276b55871767fd668cd019dd1bfb56` |
| live well-known (pre-deploy) | `51213f32b11db8423f1b49802a9d1e3750ab143e` |

## What was fixed

### A — Isolated public artifact
- Netlify `publish = "_site"`; build command remains `npm run build:site`
- `scripts/pseo/public_artifact.py` assembles allowlisted public routes only
- `npm run audit:public-artifact` fails closed on internal dirs/extensions/secrets
- Inventory: `seo/PUBLIC-ARTIFACT-MANIFEST.json`

### B — Editorial hardening
- Removed governance language from public HTML (no datalake / pncp_supplier_contracts / “só deve alegar…”)
- Canonical `evidence_kind`: `direct_problem_evidence` | `contextual_market_evidence` | `normative_editorial`
- Wave 0 scenario pages: `normative_editorial` + `PUBLISH_EDITORIAL_VALUE` (no decorative “48 contratos” as proof)
- Adversarial checks in `editorial_audit.py` + `test_wave0_closure.py`

### C — Honest GSC gate
- Typed per-URL states in `gsc_gate.py`
- `next_wave_gate` **calculated only** — false under `NOT_INSPECTED_NO_CREDENTIALS`
- `npm run pseo:gsc:ingest` rejects bare `indexed=true`

### D — Deploy-bound audit
- Identity fields on production audit; `STALE_AUDIT_DEPLOY_MISMATCH` when SHA diverges
- `npm run pseo:verify:release`

### E — CI parity
- Workflow runs exact `npm run build:site` → `audit:public-artifact` → validate → audit → test + HTTP smoke on `_site`

### F — extra-cli integration
- PR **#187 squash-merged** to `main` at `6f35c69f25276b55871767fd668cd019dd1bfb56`
- Entrypoint on main: `python -m scripts.pseo.export_web_cfg`
- Cross-repo consumer tests in `test_cross_repo_integration.py`

### G — Editorial adversarial report
- Per-page fields in `seo/pseo-editorial-report.json` (intent, evidence_kind, decision, indexability, …)

## Indexable seeds (unchanged count ≤ 4)

- `/inteligencia/cenarios/aditivos-e-risco-de-margem/`
- `/inteligencia/cenarios/inconsistencia-orcamento-edital/`
- `/inteligencia/cenarios/referencia-sinapi-sicro-margem/`
- `/radar/edificacoes-publicas-pr/`

## next_wave_gate

```json
{
  "allowed": false,
  "reasons": [
    "gsc_access_NOT_INSPECTED_NO_CREDENTIALS",
    "uninspected_seeds=4",
    "discovered_or_crawled=0<3",
    "production_audit_not_ok",
    "production_audit_stale_or_mismatch",
    "reexport_without_undue_invalidation_not_proven"
  ]
}
```

**Wave 1 is NOT authorized.**

## Remaining blockers for PASS_WAVE0_HARDENED_GSC_OBSERVED

1. Deploy this commit so live `/.well-known/pseo-build.json` matches git HEAD and publish is `_site`
2. Confirm live internal URLs return 404/410
3. Ingest real GSC URL Inspection evidence for 100% of seeds
4. Prove at least one re-export without undue approval invalidation
5. Re-run `npm run pseo:verify:release` with matching identities

## Non-claims

- No Google indexation claimed
- No inbound operational claim (impressions/clicks)
- No Wave 1 authorization


## Post-deploy verification

| Check | Result |
|-------|--------|
| live `web_cfg_sha` | `bcdff0d514d7b1c946d1373dc5e86180978b7037` |
| `public_directory` | `_site` |
| production_audit.ok | **true** (technical + identity current) |
| forbidden internal URLs | all **404** |
| dual-UA seed content | identical |
| next_wave_gate | **false** (calculated) |
| terminal_status | `PARTIAL_WAVE0_HARDENED_GSC_NOT_INSPECTED` |

Wave 1 remains unauthorized until real GSC inspection evidence is ingested and re-export proof lands.
