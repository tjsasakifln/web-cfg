# Future note — Node 22 + Lighthouse 13 migration

**Status:** planning only. **Not** part of the emergency green restore.  
Do not mix this into restore PRs. Execute as its own initiative after `main` is fully green on Node 20 + Lighthouse 12.8.x.

## Context

`lighthouse@13.4.1` requires `node >=22.19`. Nested `@puppeteer/browsers` / `puppeteer-core` under Lighthouse 13 require `node >=22.12`.  
Emergency restore pinned Lighthouse back to `^12.8.2` and CI/Netlify to Node 20 so `npm ci` and pSEO gates work without a runtime leap.

## Compatibility matrix (evaluate before flipping)

| Surface | Today (restore) | Target (this migration) | Notes |
|---------|-----------------|-------------------------|--------|
| Local dev | Node 20.x | Node 22.19+ | Publish `.nvmrc` / `engines` together |
| GitHub Actions `site-ci` / `pSEO` | `node-version: "20"` | `"22"` (pin exact minor) | Both workflows + any matrix |
| `revops-scheduled` | Node 20 | Node 22 | Keep in lockstep |
| Netlify build | `NODE_VERSION=20` | `22` | **Must** change with GHA or split-brain returns |
| Netlify Functions | Node bundler esbuild | Verify Blobs / runtime | Test lead, ops, probe paths |
| Editorial scripts | Python-primary + Node tests | Re-run full `npm test` | SHA pin / truth unchanged |
| Puppeteer / Chrome | LH 12 stack | LH 13 nested puppeteer | Align `browser-actions/setup-chrome` |
| Lighthouse | `^12.8.2` | `^13.x` after Node 22 | Re-baseline scores; thresholds may drift |
| CommonJS packages | mixed | audit `createRequire` / CJS deps | LH 13 may tighten ESM edges |
| Build time | baseline on Node 20 | measure cold `npm ci` + `build:site` + LH | Expect longer LH if more audits |
| Production risk | medium if partial flip | **high** if Netlify ≠ GHA | Lead functions + static publish |

## Suggested plan

1. Branch from green `main` (Node 20 + LH 12 green).
2. Raise `engines.node` to `>=22.19`, `.nvmrc` → `22`, Netlify `NODE_VERSION=22`, all GHA `node-version: "22"`.
3. `npm install lighthouse@^13 --save-dev` and regenerate lock **without** `--force` / `--legacy-peer-deps`.
4. `rm -rf node_modules && npm ci` twice; zero `EBADENGINE`.
5. Full suite: `npm test`, `build:site`, `pseo:*`, `test:lighthouse`, lead/revops.
6. Deploy preview only; compare LH scores vs baseline on same URLs.
7. Merge only with **both** `site-ci` and `pSEO quality gates` required and green.
8. Watch prod `build-info`, lead probe, redirects for 48h.

## Rollback

1. Revert the migration PR (or re-pin `lighthouse@12.8.2` + Node 20 everywhere).
2. Confirm `npm ci` on Node 20 and Netlify 20.
3. Do not leave Netlify on 22 with GHA on 20 (or the reverse).

## Exit criteria for starting this work

- Restore PRs merged; `main` green on clean `npm ci`
- Branch protection requires `site-ci` + `pSEO quality gates` (human)
- No open emergency on editorial fail-closed / lead idempotency
