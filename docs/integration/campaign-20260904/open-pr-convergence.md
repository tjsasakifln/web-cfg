# Campaign 01 — open-PR convergence (2026-09-04)

CAMPAIGN_ID=01
REPOSITORY=tjsasakifln/web-cfg
REMOTE_IDENTITY=tjsasakifln/web-cfg
EXECUTION_MODE=ESCRITA ISOLADA
ACTUAL_BRANCH=fix/campaign-20260904-open-pr-convergence-v3
WORKTREE=.worktrees/web-cfg/c20260904-01-pr-convergence
BASE_SHA=89b081a8676d8a0b30747dfcb1477f21d9ac4dfb
INITIAL_MAIN_SHA=89b081a8676d8a0b30747dfcb1477f21d9ac4dfb
AUDITED_MAIN_SHA=89b081a8676d8a0b30747dfcb1477f21d9ac4dfb
PRODUCTION_COMMIT=89b081a8676d8a0b30747dfcb1477f21d9ac4dfb
NO_MERGE=CONFIRMED
NO_DEPLOY=CONFIRMED
NO_SMTP=CONFIRMED
DECISION_STATE=EXECUTE_NOW
EXECUTIVE_FRONT=GOVERNANCE + TRUST
TIME_TO_EVIDENCE=this report + GitHub comments/closes + honesty gate
LEVERAGE=automation, trust

Visitor job: keep the public surface from inheriting a fossil PR DAG, stale
Dependabot pins, or B2G-exclusive HTML before the multi-vertical wave.
Issues `#577`–`#585` are not implemented here.

Historical anchors (not authority): open set `#522 #523 #524 #535 #536 #544 #548 #549`;
main `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`. Live GitHub on 2026-09-04 matched
both. `#584` and `#586` are merged. Production `/.well-known/build-info.json`
commit equals `AUDITED_MAIN_SHA`. Production `GET /ops/` returns
`cache-control: no-store, no-transform`.

## WRITE_SET

- `docs/integration/campaign-20260904/open-pr-convergence.md`
- `docs/integration/campaign-20260904/01/pr-536-runtime-privacy-residual.md`
- `docs/integration/campaign-20260904/01/pr-524-github-actions-pins.md`
- `docs/integration/campaign-20260904/01/pr-548-value-first-evidence.md`
- `scripts/site/test_ops_docs_honesty.py`
- `package.json`
- `package-lock.json`

## DO_NOT_TOUCH_SET

- new taxonomy
- offer registry
- credential registry
- home / nav / footer
- multi-vertical form
- new intelligence route
- local hub
- source-PR branches (no rebase, no force-push, no reuse)
- issues `#577`–`#585` implementation
- production, SMTP, DNS, kill switch, provider mutation

The committed diff must be a subset of WRITE_SET.

## Fossil DAG retired

Observed 2026-09-02 comments (do not follow):

- `#535` wait for `#549`
- `#536` wait for `#544` then LCP
- `#548` wait for `#544` then `#536`
- `#549` wait for `#548`
- Dependabot: rebase then merge in place

Replacement owners (none of these are closed/superseded PRs):

- crawler blocks: already on main (`10df6a2db`, `f9861ca11`); issue `#518` closed
- full-page capture: already on main (`f9861ca11`); issue `#540` closed
- runtime privacy residual: issues `#442` `#443` `#410` + goal 97; LCP HOLD remains
- money-page value-first: issue `#528` after `#577`/`#582` copy architecture
- CTA/form next-state: issue `#532` after `#580`/`#582`
- GitHub Actions pins: goal 97 (`docs/integration/campaign-20260904/01/pr-524-github-actions-pins.md`)
- npm current pins: this campaign branch (`puppeteer-core@25.10.0`, `terser@5.51.2`)

## Classification table

| PR | base/head | arquivos | comportamento já em main | residual real | conflito estratégico | testes | decisão | ação | rollback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 522 | main@ee4882f350e6 / dependabot/npm_and_yarn/dev-tooling-05bddb2c60@39b40676db1e | package.json, package-lock.json | puppeteer-core ^25.8.0 resolved 25.8.0 | 25.9.0 is stale; registry current is 25.10.0 | none vs multi-vertical | site-ci SUCCESS; pSEO SUCCESS; BEHIND | DEPENDABOT_REFRESH_OR_CLOSE | close source PR; land 25.10.0 on this branch | revert package.json and lockfile on this branch |
| 523 | main@ee4882f350e6 / dependabot/npm_and_yarn/terser-5.51.2@50099f381ae4 | package.json, package-lock.json | terser ^5.50.0 resolved 5.50.0 | 5.51.2 is current | none | site-ci SUCCESS; pSEO SUCCESS; BEHIND | DEPENDABOT_REFRESH_OR_CLOSE | close source PR; land 5.51.2 on this branch | revert package.json and lockfile on this branch |
| 524 | main@d5862320e1ee / dependabot/github_actions/github-actions-f5d76be6fc@909ca8a1ee40 | .github/workflows/codeql.yml, .github/workflows/netcup-release.yml | codeql-action@db488ddef3; download-artifact@37930b1c2a v7 | v4 codeql pin + download-artifact v8.0.1 unproven on current main | v8 major; site-ci.yml untouched so red checks are the stale tree | site-ci FAIL Lighthouse local; pSEO FAIL Full test suite; BEHIND | DEPENDABOT_REFRESH_OR_CLOSE | close; do not port onto this branch; handoff to goal 97 | n/a not applied |
| 535 | main@81c600b7c26d / feat/issue-518-contract-analysis-blocks@fe878d1a742a | 4 contract-analysis crawler files | delimiters and tests landed in 10df6a2db and f9861ca11; fixtures byte-identical | none; main is a strict superset (_header_stanza, extra tests) | none | historical green; DIRTY vs current main | SUPERSEDED_CLOSE | close; issue 518 already closed | n/a already on main |
| 536 | main@81c600b7c26d / feat/issues-442-443-runtime-privacy@b2bc6b971016 | 29 runtime/privacy files | #586 absorbed trio (see map); production /ops no-transform | request-id, lead redaction, retention apply-authority, inbound-security tests | LCP HOLD; do not merge whole PR; CSP hashes in _headers drifted | site-ci FAIL Lighthouse local (_site) | PORT_RESIDUAL_VIA_HANDOFF | close vehicle after handoff; residual to goal 97 with LCP HOLD | n/a not applied here |
| 544 | main@81c600b7c26d / fix/issue-540-fullpage-capture-pr@4eb3cce363ab | 8 capture harness files | 7/8 blobs identical to main via f9861ca11 | none; remaining capture_screenshots.mjs is main-ahead dirty-tree guard | none | historical green; BEHIND | SUPERSEDED_CLOSE | close; issue 540 already closed | n/a already on main |
| 548 | main@81c600b7c26d / feat/issue-528-money-pages-value-first-v2@4c827c5fbf73 | 192 files, mostly QA screenshots | brand.json, value-first contract, render_nav_hubs.py byte-identical; H1s already match | QA evidence tree only; HTML/renderer would strip next-state form | B2G-only HTML before 577/582; B2G remains a protected vertical | historical green; DIRTY | SUPERSEDED_CLOSE | close; owner issue 528 after 577/582; handoff QA tree | n/a not applied |
| 549 | main@81c600b7c26d / feat/issue-532-cta-form-next-state@c4af85f58d42 | 66 form/CTA files | cta-form-next-state contract and renderer already on main (23 capture routes, live-intelligence families) | none unique; PR would drop routes 23 to 21 and remove live-intelligence families | form/HTML before 577/582/580 | historical green; DIRTY | SUPERSEDED_CLOSE | close; owner issue 532 after 580/582 | n/a not applied |

## #536 equivalence map

ABSORBED_OPS_NO_TRANSFORM=YES
ABSORBED_RETENTION_TIMER=YES
ABSORBED_MINIMIZED_LOGS=YES
LCP_HOLD=YES
LCP_HOLD_EVIDENCE=site-ci job 99623938137 step "Lighthouse local (_site)" conclusion failure on head b2bc6b971016; #586 commit message "Does not merge #536 (LCP HOLD)"; docs/demand-radar/README.md HOLD row
LCP_HOLD_TRIGGER=replay residual against current main and pass required site-ci Lighthouse local (_site); do not waive
RESIDUAL_HANDOFF=docs/integration/campaign-20260904/01/pr-536-runtime-privacy-residual.md
EQUIVALENCE_FILE_COUNT_IS_NOT_PROOF=YES

Byte-level vs `origin/main` (already containing `#586`) for the overlapping trio paths:

Identical blobs (main == #536 head):

- `deploy/netcup/nginx/confenge-web-http.conf` (`bf929706c6aa`) — `log_format confenge_minimized`
- `deploy/netcup/nginx/confenge-web-logrotate` (`911bab23d87c`)
- `deploy/netcup/nginx/confenge-web-origin.conf` (`a132dd5f73c7`)
- `deploy/netcup/nginx/confenge-web-public.conf` (`3e5f291f625a`)
- `deploy/netcup/schedules/confenge-web-retention.timer` (`613b2517f86c`)
- `deploy/netcup/schedules/confenge-web-retention.service` (`9fa647dc7613`)
- `deploy/netcup/schedules/confenge-web-retention-alert@.service` (`31477422aa7e`)
- `deploy/netcup/schedules/confenge-web-schedule@.service` (`aa895e3a9c54`)
- `deploy/netcup/schedules/schedule-contract.json` (`6ebfab3e8b16`) schema 2.1.0 storage-retention, `netcup_enabled=false`
- `deploy/netcup/tests/test_workflow_contract.py`
- `scripts/migration/netcup/validate-nginx.mjs`
- `scripts/migration/netcup/tests/test-contract.mjs`
- `scripts/site/cache_contract.py`
- `scripts/site/test_cache_contract.py`

Semantic equivalent, blob different:

- `_headers` `/ops/*` is `Cache-Control: no-store, no-transform` on both tips and in production. The two-line blob diff is CSP hash drift, not the ops contract. `#586` left CSP unchanged.

Not absorbed (residual, do not implement on this branch):

- `runtime/lib/adapter.mjs` + `runtime/test/adapter.test.mjs` — hexadecimal/UUID request-id admit list
- `netlify/functions/lib/lead-core.cjs` + `lead-store.cjs` — finite app-log classes / IP redaction
- `scripts/storage/retention.mjs` + `scripts/storage/test_host_owned_storage.mjs` — apply-authority / dry-run
- `scripts/site/test_inbound_security.mjs`
- `deploy/netcup/lib/release_control.py` — main is ahead; do not replay the PR blob
- `deploy/netcup/lib/schedule_gate.py` — **port** (not in the #586 trio): `run_retention` still has unique `--authority-fd/--lock-fd/--deploy-lock-fd` + `pass_fds` vs main `89b081a`; depends on residual `retention.mjs`
- `deploy/netcup/package_release.py` — **do-not-replay** the PR blob (would drop live_intelligence/organic packaging from #584); capability keys are a later surgical port, not a file replay
- `deploy/netcup/tests/test_release_control.py` — **do-not-replay** the PR blob (would drop live-intel overlay tests); unique privacy-capability tests stay in the handoff
- `deploy/netcup/README.md` — **editorial**: unique #442/#443/#410 sections; keep the #586 timer-disabled heading
- one-line notes in `docs/architecture/RUNTIME-AUTHORITY.md` and `runtime/README.md`

## Disposition by commit

Format: `PR | commit | ADOPTED|SUPERSEDED|RESIDUAL|REJECTED | destination`

- 522 | 39b40676db1ebbe792115811e2d18a94bc576a7d | SUPERSEDED | this branch puppeteer-core@25.10.0
- 523 | 50099f381ae4b144e80231a4336eefb3b3a8d160 | SUPERSEDED | this branch terser@5.51.2
- 524 | 909ca8a1ee40d76b89bea4c6034b1e6e91d5c07e | REJECTED | not applied; residual pins in `01/pr-524-github-actions-pins.md` for goal 97
- 535 | fe878d1a742ad718b45ef6273c410f7d0cc6e6cb | SUPERSEDED | adopted by 10df6a2db610a175af18b17b37154f8a54b79c1a and f9861ca11f4544806f5f9afbaa2651166cb6022b
- 535 | 10df6a2db610a175af18b17b37154f8a54b79c1a | ADOPTED | origin/main
- 535 | f9861ca11f4544806f5f9afbaa2651166cb6022b | ADOPTED | origin/main
- 536 | 89b081a8676d8a0b30747dfcb1477f21d9ac4dfb | ADOPTED | origin/main #586 trio
- 536 | b2bc6b971016466675304fe41f5101a5fed659be | RESIDUAL | `01/pr-536-runtime-privacy-residual.md` goal 97; LCP HOLD
- 544 | 4eb3cce363abde6aa5de6b8a9da9bd76b29dd1bd | SUPERSEDED | adopted by f9861ca11f4544806f5f9afbaa2651166cb6022b
- 548 | 4c827c5fbf737c25d475ebca2b56a8e0a5cad7c3 | SUPERSEDED | contracts already on main; HTML REJECTED as regression; QA tree in `01/pr-548-value-first-evidence.md`
- 549 | c4af85f58d426f6d617ed0ab63d9b8d397543ced | REJECTED | applying drops live-intelligence capture families already on main

## Required checks

Live branch protection (`docs/ops/REQUIRED-BRANCH-CHECKS.md`): `site-ci` and `pSEO quality gates`, strict.
This campaign does not merge. A deps consolidation PR on this branch, if opened, is gated by those two GitHub conclusions — local green is evidence only.

## Tests recorded at classification time

- Live inventory: `gh pr list --state open` → eight PRs, same historical set.
- Blob equivalence vs `origin/main` for each three-dot path (not file-count).
- Production build-info commit `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`.
- Production `/ops/` `cache-control: no-store, no-transform`.
- `npm view puppeteer-core version` → 25.10.0; `npm view terser version` → 5.51.2.
- Honesty gate: `npm run test:ops-docs` (this report is a shipped artifact).

## Risks for the multi-vertical wave

- Reopening `#548`/`#549` HTML onto current main would regress next-state forms and shrink capture coverage.
- Replaying `#536` wholesale would fight `#586` and the live CSP hashes, and the home LCP gate is still red on that head.
- Leaving Dependabot `#522`/`#523`/`#524` open would keep a second owner for lockfiles and workflows during the wave.
- B2G money pages stay a protected vertical; value-first copy belongs to issue `#528` after `#577`/`#582`, not to this branch.
