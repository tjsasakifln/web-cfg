# Rollback drill evidence

**Date (UTC):** 2026-08-02  
**Procedure doc:** `docs/ops/ROLLBACK.md`

## Identification of current deploy

```bash
curl -sS https://confenge.com.br/.well-known/build-info.json
```

Observed at drill start (example from session):

| Field | Value |
| --- | --- |
| commit | `6a386477ea3f10244d52f73e2ffc1beec581b6a6` |
| build_time | `2026-08-02T15:34:03Z` |
| environment | `production` |

## Prior deploy identification

Git history on `main` (previous functional lead fix):

| Commit | Role |
| --- | --- |
| `96f0c030` | Blobs put/get fix (first 201 persist in prod) |
| `02625afc` | connectLambda |
| `4207a14e` | external_node_modules Blobs |
| `75f380a4` | secure pipeline (initial 503 until Blobs wired) |
| `8c11a9c8` | pre-inbound (insecure ntfy), **do not rollback to this** |

Netlify UI path: Site → Deploys → select green deploy with known good `build-info` commit → **Publish deploy**.

## Validation checklist after rollback

1. `build-info.json` commit matches intended prior SHA  
2. `GET /` → 200  
3. `node scripts/site/synthetic_lead_probe.mjs https://confenge.com.br` → ok true / 201  
4. Response body has no `topic` / `ntfy`  
5. `GET /.netlify/functions/collect` → 200  

## Restore forward

Re-publish the tip deploy (or push empty commit / clear cache) so production matches `git rev-parse origin/main`.

## Note on Blobs

Rollback of static assets does **not** delete leads already written to Netlify Blobs. Incident lead data remains until retention/delete policy.

## Drill status

| Step | Status |
| --- | --- |
| Procedure documented | yes (`docs/ops/ROLLBACK.md`) |
| Current + prior SHAs identified | yes (this file) |
| Live Netlify “Publish deploy” click | **owner** (no Netlify CLI auth in this environment) |
| Synthetic probe script | `scripts/site/synthetic_lead_probe.mjs` |

Full live rollback→restore cycle requires Netlify UI/CLI owner session; cannot be completed without `netlify login`.
