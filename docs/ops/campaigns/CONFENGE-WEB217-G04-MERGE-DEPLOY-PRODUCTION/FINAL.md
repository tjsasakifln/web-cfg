# FINAL — CONFENGE-WEB217-G04-MERGE-DEPLOY-PRODUCTION

`FINAL_VERDICT=READY`

PR #217 is merged. `origin/main` and live Netlify production `/.well-known/build-info.json` `commit` both equal `MERGE_SHA` `85c7193a`. Required main checks succeeded. Immediate HTTP smoke and fail-closed checkout hold. #193 / Asaas / commercial-event producer / Node 22 were not activated.

## FACT

- `PREVIOUS_MAIN_SHA` = `8ced783468a70ea8208398ec4202dc4b89b4d4fe`
- Prior healthy production: `commit=8ced7834` `deploy_id=6a86f72ad7e3c60008095566` `environment=production`
- G03 `FINAL_VERDICT=READY` `RELEASE_CANDIDATE_SHA=fd8717b21290d1b14b76d5b066a553df67807e19`
- PR #217 merged at 2026-08-20T22:56:37Z with method `merge` (two parents: previous main + candidate)
- `MERGE_SHA` = `85c7193ad9a9df8fc22840d6dbdd0b30e91486f8` = `origin/main`
- Live production: `commit=85c7193a` `deploy_id=6a8786281956a400087ec6f8` `environment=production` `https://confenge.com.br`
- Internal deploy URL: `https://app.netlify.com/projects/confenge/deploys/6a8786281956a400087ec6f8`
- Netlify CLI/API not present in this runner; identity is live `build-info.json` (two reads agreed) plus shipped `npm run test:prod-build-info`
- main `site-ci` success https://github.com/tjsasakifln/web-cfg/actions/runs/32426514730 (late steps executed)
- main `pSEO quality gates` success https://github.com/tjsasakifln/web-cfg/actions/runs/32426514741
- main CodeQL Analyze success https://github.com/tjsasakifln/web-cfg/actions/runs/32426514752
- PR #193 remains open
- Flags on published tree: `ASAAS_MODE=disabled`, checkout/catalog/webhook/real-money false
- Live checkout POST `/.netlify/functions/offer-checkout` → HTTP 404 `{"ok":false,"error":"feature_disabled"}`

## INFERENCE

Production is the merge commit of #217, not a preview and not the pre-merge PR head.

## UNKNOWN

- Netlify admin UI “published/ready” label was not read via API (CLI absent). Live `environment=production` + matching `commit` is the identity used.

## BLOCKED

- none for this lane

## Rollback

`ROLLBACK_REF=main=8ced783468a70ea8208398ec4202dc4b89b4d4fe deploy_id=6a86f72ad7e3c60008095566 commit=8ced783468a70ea8208398ec4202dc4b89b4d4fe`

Revert merge commit `85c7193a` or republish deploy `6a86f72ad7e3c60008095566`. Do not hot-fix production.
