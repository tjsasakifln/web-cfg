# Node 22 + Lighthouse 13 migration — executed

**Status:** **done.** Executed on 2026-08-23 as one coordinated PR, closing issue #149.
This file is now the record of what actually happened, not a plan. Anything below
labelled "planned" is kept only so the executed result can be read against it.

## Context

`lighthouse@13.4.1` requires `node >=22.19`. Nested `@puppeteer/browsers` / `puppeteer-core` under Lighthouse 13 require `node >=22.12`.
The 2026 emergency restore had pinned Lighthouse back to `^12.8.2` and CI/Netlify to Node 20 so `npm ci` and pSEO gates worked without a runtime leap. That pin is lifted.

## Surfaces flipped (all in one PR)

| Surface | Before | After |
|---------|--------|-------|
| `package.json` `engines.node` | `">=20 <21"` | `">=22.19 <23"` |
| `.nvmrc` | `20` | `22` |
| `.github/workflows/site-ci.yml` | `node-version: "20"` | `"22"` |
| `.github/workflows/pseo.yml` | `node-version: "20"` | `"22"` |
| `.github/workflows/revops-scheduled.yml` | `node-version: "20"` (**4** occurrences) | `"22"` |
| `netlify.toml` `[build.environment] NODE_VERSION` | `"20"` | `"22"` |
| `package.json` `devDependencies.lighthouse` | `^12.8.2` | `^13.4.1` |
| `.github/dependabot.yml` Node-floor ignores | 3 ignores | removed |
| `scripts/site/test_workflow_gates.py` | asserted `node-version: "20"` | asserts `"22"` |

`engines.node` is `">=22.19 <23"`, not a bare `>=22.19`: the `22.19` floor is what
`lighthouse@13` demands, and the `<23` ceiling is what
`test_node_pin_is_single_source` needs so a Node 23/24-only dependency still
hard-fails `npm ci --engine-strict` instead of installing green. The gate was
widened to accept a minor-level floor; it still refuses any drift between
`netlify.toml`, `.nvmrc`, `engines` and every workflow pin.

`revops-scheduled.yml` carried **four** `node-version: "20"` pins, one more than
issue #149 recorded. All four were flipped.

## Dependabot ignores removed

The three Node-floor ignores (`lighthouse`, `puppeteer-core`, `@netlify/blobs`
majors) existed only because the runtime was Node 20, and the config itself said
to remove them together as part of this migration. They are gone.
`npm ci --engine-strict` in `site-ci.yml`, `pseo.yml` and the dependency-bearing
RevOps scheduled job is what now enforces the floor, so the guarantee those
ignores provided did not go away with them. The scheduler no longer falls back
from a broken lockfile to `npm install`.

Consequence to expect: Dependabot will now open `puppeteer-core@25` and
`@netlify/blobs@11` PRs. Prove each on its own PR — `@netlify/blobs` in
particular is a Netlify Functions runtime dependency listed in
`external_node_modules`, so it is never exercised by CI and a green pipeline does
**not** prove it works.

## Verification performed

Local runtime: Node **v22.23.2** (nvm), npm 11.x, Chrome for Testing 152.

- `npm install lighthouse@^13 --save-dev` — no `--force`, no `--legacy-peer-deps`. Resolved `lighthouse@13.4.1`.
- `rm -rf node_modules && npm ci --engine-strict` — **twice**, both clean, **zero `EBADENGINE`**. The `proxy-agent@8.0.2` lockfile desync that sank the earlier attempt (PR #92) did not recur; the lock was regenerated from a clean tree rather than patched.
- `package-lock.json` repeats the exact root engine range from `package.json`;
  the workflow gate rejects drift and also rejects a repository floor below
  Lighthouse's own declared minimum.
- `npm test` — full suite green on Node 22.
- `npm run build:site` — green; `_site` assembled, public artifact audit clean.
- `npm run audit:axe` — 14 routes, **zero critical / serious / moderate / minor**.
- `npm run test:lighthouse` + `LH_REQUIRE_RAW_EVIDENCE=1 npm run test:lighthouse-gates` — green under the exact `site-ci` env (`LH_HOME_RUNS=3` and the CI `LH_PAGES` set).
- Netlify functions smoke on Node 22: all 14 `netlify/functions/*.cjs` require cleanly and export a handler; `lead` (preflight, invalid-payload rejection, method guard), `collect` (batch admission, preflight) and `ops` (unauthenticated denial, health probe) behave as on Node 20.

## Lighthouse thresholds — re-baselined, not lowered

Thresholds in `scripts/site/lighthouse_thresholds.mjs` are **unchanged**:
home performance ≥ 95, other pages performance ≥ 90, accessibility /
best-practices / SEO ≥ 95, home p75 TBT < 200 ms, home max own long task ≤ 200 ms.

They were re-baselined by measurement, not by assumption: the same `_site` build
was audited twice on the same machine, once with `lighthouse@12.8.2` and once
with `lighthouse@13.4.1`.

| Page | LH 12.8.2 (perf / a11y / BP / SEO) | LH 13.4.1 (perf / a11y / BP / SEO) |
|------|-----------------------------------|-----------------------------------|
| `/` run 1 | 98 / 100 / 100 / 100 | 98 / 100 / 100 / 100 |
| `/` run 2 | 97 / 100 / 100 / 100 | 97 / 100 / 100 / 100 |
| `/` run 3 | 97 / 100 / 100 / 100 | 97 / 100 / 100 / 100 |
| `/diretoria-b2g/` | 98 / 100 / 100 / 100 | 97 / 100 / 100 / 100 |
| `/conteudos/` | 98 / 100 / 100 / 100 | 98 / 100 / 100 / 100 |
| `/conteudos/documentos-reequilibrio-obra-publica/` | 98 / 100 / 100 / 69* | 98 / 100 / 100 / 69* |
| `/acompanhamento-contratos-obras/` | 98 / 100 / 100 / 100 | 97 / 100 / 100 / 100 |

\* intentional `noindex,follow`; the page is in `LH_SEO_EXEMPT_PAGES`, so the SEO
gate does not apply to it. The 69 is identical on both versions.

Home gate, same three runs: min performance **97 → 97**, p75 TBT **4 ms → 7 ms**,
max own long task **259 ms → 111 ms**.

**No scoring-model shift was observed.** Accessibility, best-practices and SEO are
bit-identical across the two versions. Performance moves by at most one point on
two pages, which is inside this machine's run-to-run noise — the `/` page alone
spans 97–98 across three consecutive runs *within* each version. No threshold was
lowered and none needed to be.

The one visible difference is that the LH 12 baseline run tripped
`maximum own long task 259ms > 200ms` on home run 3 while LH 13 peaked at 111 ms.
That is local-machine scheduling noise on a shared box, not a Lighthouse
behaviour change, and it argues in the safe direction for the flip.

## Known cosmetic quirk (WSL only)

Under WSL with `LOCALAPPDATA` exported, Lighthouse's `configstore` dependency
resolves a Windows-style path and drops literal `C:\Users\...\lighthouse.NNNN`
directories into the working tree. This happens on **both** LH 12 and LH 13, is
not a regression, and does not occur on the Linux CI runners (no `LOCALAPPDATA`).
Delete them if they appear locally; do not commit them.

## Rollback

1. Revert the migration PR (or re-pin `lighthouse@12.8.2` + Node 20 everywhere).
2. Confirm `npm ci` on Node 20 and Netlify 20.
3. Restore the three Dependabot Node-floor ignores, or Dependabot will immediately reopen majors the reverted runtime cannot satisfy.
4. Do not leave Netlify on 22 with GHA on 20 (or the reverse).

## Post-merge watch (48h)

- prod `/.well-known/pseo-build.json` advances on the next content deploy
- `npm run probe:lead:prod` stays green (functions now run on the Node 22 lambda runtime)
- `npm run test:redirects:prod` and `npm run test:ops-health` stay green
- first `revops-scheduled` run after merge completes on Node 22
