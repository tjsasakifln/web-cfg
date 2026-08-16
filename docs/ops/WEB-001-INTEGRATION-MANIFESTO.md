# WEB-001 integration manifesto

Date: 2026-08-16
Decision: **READY_BEHIND_HUMAN_GATE**

This is a rehearsal landing of five open heads onto current `origin/main`.
It is not campaign-complete. Fixture-green, local `_site`, and dry-run
IndexNow are not live INDEX, DNS, or Warmbly outcomes.

## SHAs

| Ref | SHA | On `main` at rehearsal? |
|---|---|---|
| `origin/main` | `3ae70c6b0e5b878ccbfc646cffc421a8722ebb98` | — |
| #85 `origin/feat/contract-analysis-canary-83` | `bccd75ba32a7e0351794a7818aebe8e9a59099b0` | no |
| #94 `origin/feat/market-answer-canary-84` | `9326cb2c8d1a42b9d21cdb856b21dedb9454ffc2` | no |
| #95 `origin/feat/discovery-data-desk-86-89` | `9b50bdc93f8c46fb60f954ce0fe00f5fa2c28694` | no |
| #96 `origin/feat/intent-conversion-88` | `45f15199d91ce4fc43b0c88386075cc2d213c1f6` | no |
| #97 `origin/feat/smartlic-equity-migration-62` | `78b7ebb9f8c26b754e5571248d014be305fbcf40` | no |
| Integration branch `feat/web-001-stack-integration` | `317182639f7eac0f57e5afa560e2363376ff66dd` | no |

None of the five heads was an ancestor of `main`. Residual = all five.

## Landing order and why

1. **#85 editorial engine first.** Owns `/analises-contratos-publicos/`, robots `Disallow`, `_headers` `X-Robots-Tag: noindex`, empty INDEX approvals, and the additive #85 lead-lib fields. Later engines must not weaken those guards.
2. **#94 Market Answer second.** Answer-first canary at `/inteligencia/valor-tipico-contratos-pavimentacao/`. Needs the editorial adjacency and adds allowlisted events to `collect.cjs`. Second `build.py` preserve prefix.
3. **#95 discovery / Data Desk third.** Observes pages that now exist. Fixture/noindex stay out of publicable and IndexNow. `--send` remains `send_forbidden_without_human_gate`.
4. **#96 conversion fourth.** Isolated `market-answer-intake` + adapter. Does not edit #85 lead libs. Flag `conversion_market_answer_xray` stays `enabled: false`. Canary stays under `/piloto/`.
5. **#97 migration pin last.** Inventory pin only. 11 `REDIRECT_301` / 54 `HOLD_TARGET_NOT_READY` (410, `target_url` null) / 1190 `RETIRE_410`. No CONFENGE `_redirects` 301 from HOLD rows.

Engines stay distinct trees. No generic “intelligence framework”.

## Per-PR map (files / URLs / robots / events / fixtures / lead libs)

### #85 — contract analysis (#83)

- Trees: `scripts/contract_analysis/**`, `analises-contratos-publicos/**`, `data/editorial/contract-analysis/approvals.json` (empty).
- Shared: `_headers`, `robots.txt` (`Disallow: /analises-contratos-publicos/`), `script.js`, `js/modules/nav.js`, `data/site/authority-matrix.json` (surface `analise_tecnica_contrato`), `netlify/functions/lib/{inbound-handoff,lead-core,lead-store}.cjs` (additive attribution; PII still dropped).
- URLs: `/analises-contratos-publicos/` + five fixture analyses. All `noindex,nofollow,noarchive`.
- INDEX: `index_count=0`. Approvals file empty. Fixtures cannot be approved for INDEX.
- Schema/event: `public-read-contract-analysis/1.0` consume-only. Source `CONFENGE_WEB`.

### #94 — Market Answer (#84)

- Trees: `scripts/market_answers/**`, `tests/market_answers/**`, `inteligencia/valor-tipico-contratos-pavimentacao/`, `data/editorial/market-answers/**`.
- Shared: `package.json`, `scripts/pseo/build.py` (prefix `inteligencia/valor-tipico-contratos-pavimentacao/`), `netlify/functions/collect.cjs` allowlist: `answer_view`, `method_open`, `evidence_drilldown`, `analysis_click`, `xray_start`, `lead_receipt_correlated`, `correction_open`.
- Robots: page `noindex,nofollow`. No new `robots.txt` Disallow (sitemap/INDEX exclusion is the invariant).
- State: `PUBLISHABLE_NOINDEX` / `GO_NOINDEX`. `official_live` absent. Demand `UNKNOWN`.
- Lead libs: not edited.

### #95 — discovery + Data Desk (#86, #89)

- Trees: `scripts/discovery/**`, `scripts/data_desk/**`, `tests/discovery/**`, `tests/data_desk/**`, `data/discovery/**`, `data/data-desk/**`.
- No public HTML / robots / sitemap / schema file changes in the original PR.
- IndexNow: dry-run + idempotency; `--send` refused (`send_forbidden_without_human_gate`).
- Fixture package `FIXTURE_ONLY` at `/internal/data-desk/fixture-only/` — not a public page, not in sitemaps.

### #96 — conversion (#88)

- Trees: `scripts/conversion/**`, `tests/conversion/**`, `data/conversion/**`, `docs/contracts/intent-action/**`, `netlify/functions/market-answer-intake.cjs`.
- Shared: `package.json`, `netlify.toml` `included_files` for `data/conversion/**` and `docs/contracts/intent-action/**`.
- Public canary after integration: `/piloto/conversao-xray/` (see collisions). `noindex`. `/piloto/` already Disallow.
- Flag: `conversion_market_answer_xray` `enabled: false`. `auto_send=false`.
- Contracts: isolated intake. Frozen #85 mapper not rewritten. Warmbly Goal 09 compatibility via `payload.conversion` extension (not a versioned shared-mapper change).
- Replay: same receipt, no store duplication.

### #97 — SmartLic inventory pin (#62)

- Trees: `data/migrations/smartlic-url-map/*`, `data/migration/smartlic-confenge/manifesto.v1.json`, `scripts/legacy_equity/**`.
- Pin SHA-256: `3c5a5b7aeb173a16cfb65c0314827d9022ba1b387901d1718e4fdfcbd0363023`.
- Counts: REDIRECT_301=11, HOLD_TARGET_NOT_READY=54 (expected HTTP 410, `target_url` null), RETIRE_410=1190, MIGRATE/IGNORE/LEGAL=0.
- No editorial pages, no pSEO, no new CONFENGE 301s from HOLD.

## Schema / event deltas

- Additive consume contracts only: `public-read-contract-analysis/1.0`, `public-read-market-answer/1.0`.
- `collect.cjs` allowlist adds the #94 names above. No PII keys.
- Conversion keep-list includes `asset_family`, `market_answer_id`, intent/question class, versions, CTA, source/referrer, drill-down origin, correlation/idempotency, consent, handoff status. CNPJ not in URL or aggregate events.
- Source remains `CONFENGE_WEB`.
- No breaking extra-cli / web-cfg / Warmbly contract. Kill-gate `ADJUST` was not tripped. The Warmbly `payload.conversion` extension stays in the isolated adapter until a versioned contract exists.

## Collisions resolved (guards not weakened)

See also the rehearsal notes in the integration commits.

| Collision | Resolution |
|---|---|
| `package.json` `test` chain | Union. New suites inserted before `test:migration-manifesto`. #97 expanded that script to include `scripts/legacy_equity/tests` (same as named `test:legacy-equity`; not double-run). |
| `scripts/pseo/build.py` prefixes | Both `analises-contratos-publicos/` and `inteligencia/valor-tipico-contratos-pavimentacao/`. |
| #85 hub CollectionPage vs meta | Shared `HUB_DESCRIPTION`. Disclaimer stays visible. noindex unchanged. |
| `test:copy` `extra-cli` | Visitor copy says “fonte factual”. Banlist kept. |
| `pilot_no_internal_lang` `\bmarket-[\w-]+\b` | Canary moved to `/piloto/conversao-xray/`; HTML posts to `conversion-intake` alias. Implementation remains `market-answer-intake.cjs`. Still `/piloto/` Disallow. |
| `PUBLIC_TOP_DIRS` | Added `analises-contratos-publicos` so `_site` ships the noindex family. Sitemap still excludes it. |
| `validate:seo` / `data/` | #95 `data/data-desk/packages/fixture-only/embed.html` is a fragment, not a page. `SKIP_DIRS` now includes `data/` (and other internal trees). `npm run validate:seo` → `VALIDATION_OK`. Test: `test_fixture_embed_html_is_not_a_public_seo_page`. |

## Evidence executed (2026-08-16)

Commands (shipped scripts; `CHROME_PATH` + local nss/nspr/asound libs only for `test:ui` on this host):

| Command | Result |
|---|---|
| `npm run test:contract-analysis` | 71 then 73 passed after integration tests |
| `npm run test:market-answers` | 28 then 29 passed |
| `npm run discovery:test` | 30 passed |
| `python3 -m scripts.discovery indexnow --send --url …` | `IndexNowPrepareError: send_forbidden_without_human_gate` |
| `npm run test:conversion` | 29 passed (replay 200, `auto_send` false, frozen libs unedited) |
| `npm run test:legacy-equity` | 28 passed |
| `npm test` ×2 | both exit 0 |
| `npm run build:site` ×2 | both exit 0; `_site` hashes identical |
| `npm run test:lead-function` / `test:inbound-handoff` / `test:attribution-allowlist` / `test:conversion` | all pass |

`_site` hashes (identical on both builds): see rehearsal `site-hash-1.txt` / `site-hash-2.txt`. Fixture pages noindex; forbidden fragments absent from every `sitemap*`. Inventory pin unchanged.

Python/node: Python 3.12.3, pytest 9.1.1, Node from repo `package.json` (npm ci env).

## Rollback

Revert the integration branch / its merge commit on `main`. No flag was flipped, no INDEX published, no IndexNow `--send`, no DNS.

## Residual live work (issues stay OPEN)

| Issue | Why still open |
|---|---|
| #83 | Needs extra-cli `official_live` pack + written analysis + individual hash-bound INDEX approval. Engine only. |
| #84 | Needs official_live + coverage + human hash; organic discovery → engagement → handoff → real outcome still unobserved. |
| #86 | Observatory is prepare-only. GSC/Bing/Generative AI/citation overlays remain UNKNOWN. `--send` refused. |
| #88 | Needs a real asset → CTA → lead → Warmbly action/outcome. Flag off. extra-cli Goal 03 X-Ray live payload absent. |
| #89 | Needs an approved public asset and observed third-party reuse. Fixture kit is FIXTURE_ONLY. |
| #62 | Pin only. DNS/TLS/cutover BLOCKED. 28-day observation has not started. Do not close. |

## Out of scope (not done)

Merge to `main`, Netlify deploy, DNS/TLS, flag activation, INDEX publication, IndexNow `--send`, mass approval, issue close, SmartLic brand/runtime restore, crawler / second DataLake / unified engine.

## Decision

**READY_BEHIND_HUMAN_GATE**

Human merge of this rehearsal (or of the five PRs in this order), live extra-cli `official_live`, and #62 observation remain outside this goal. Fixture-green is not campaign-complete.
