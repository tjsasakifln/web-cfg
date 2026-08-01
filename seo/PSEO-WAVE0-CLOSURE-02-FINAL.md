# PSEO Wave 0 Closure 02 — Final Report

**Campaign:** WEB-CFG-PSEO-WAVE0-CLOSURE-02  
**Generated:** 2026-08-01T00:52:49Z  
**Terminal status:** `PARTIAL_WAVE0_HARDENED_GSC_NOT_INSPECTED`

## HEADs

| Item | Value |
|------|-------|
| web-cfg git HEAD (report write) | `b7e9b59e07068171e793824aaace652985abbd55` |
| netlify_deployed_sha (live) | `f35c00dcf1f5084a052df8437664fe5f14e7ac58` |
| production_audit_sha (audit target) | `f35c00dcf1f5084a052df8437664fe5f14e7ac58` |
| production_audit_is_current | **True** |
| extra-cli main (PR #187 merge) | `6f35c69f25276b55871767fd668cd019dd1bfb56` |
| snapshot source_commit_sha | `01123735ed0e240b0adf2233269ac947fa6d56c2` (`feat/pseo-semantic-sota`) |
| snapshot on extra-cli main? | **False** |

## What was implemented

### A — Isolated public artifact
- Netlify `publish = "_site"`, command `npm run build:site`
- `scripts/pseo/public_artifact.py` + `npm run audit:public-artifact`
- Live internal paths return **404** (`/data/pseo/*`, `/package.json`, `/seo/*`, `/.git/*`, …)

### B — Editorial hardening
- Governance language removed from public HTML (including singular **contagem genérica**)
- Typed `evidence_kind` ∈ {direct_problem_evidence, contextual_market_evidence, normative_editorial}
- Wave 0 scenario pages: `normative_editorial` + `PUBLISH_EDITORIAL_VALUE`
- Radar limitations scrubbed of snake_case pipeline fields
- FORBIDDEN regex uses `contage(?:m|ns)` (fixes contagens?-only bug)

### C — Honest GSC gate
- Typed per-URL states; `next_wave_gate` **calculated only**
- `next_wave_gate = false` under `NOT_INSPECTED_NO_CREDENTIALS`
- `npm run pseo:gsc:ingest` rejects bare `indexed=true`

### D — Deploy-bound audit
- Identity fields on production audit; `STALE_AUDIT_DEPLOY_MISMATCH` on true mismatch
- `audit_target_sha` binds to **live deploy tip** (not evidence-only git HEAD)
- `npm run pseo:verify:release`

### E — CI parity
- Workflow runs exact `build:site` → artifact audit → validate → audit → test + HTTP smoke

### F — extra-cli
- PR **#187 squash-merged** to main; entrypoint `python -m scripts.pseo.export_web_cfg` on main
- Cross-repo fixture export test green
- **Honest residual:** published snapshot `source_commit_sha` is still from pre-merge branch — **not** claimed as main history

### G / H
- Adversarial editorial report fields; dual-UA live checks; no Wave 1 auth

## Indexable seeds (≤ 4)

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
    "snapshot_source_commit_not_on_extra_cli_main",
    "reexport_without_undue_invalidation_not_proven"
  ]
}
```

**Wave 1 is NOT authorized.**

## Required for PASS_WAVE0_HARDENED_GSC_OBSERVED

1. Ingest real GSC URL Inspection evidence for 100% of seeds
2. Re-export snapshot from extra-cli **main** and promote with valid approval
3. Prove re-export without undue approval invalidation
4. Keep production audit current with live tip

## Non-claims

- No Google indexation
- No inbound operational claim
- No invented GSC or merge success
- Snapshot provenance gap recorded, not papered over
