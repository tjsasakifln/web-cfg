# CONFENGE-ORGANIC-BREAKOUT-01 — closeout

Generated: `2026-08-18`
Decision state: **EXECUTE_NOW** (organic qualified traffic, max 3 assets).
Executive front: search demand honesty + three existing-URL extraordinary improvements.
Time to evidence: this PR / Deploy Preview.
Leverage: distribution + trust + data.

## 1. STATUS

`READY_FOR_REVIEW` (rebased onto #122 live GSC observation)

Three existing INDEX URLs were substantially improved, individually gated, and left INDEX. Live GSC observation landed first via #122; this PR keeps `missing_is_not_zero`, historical ≠ live, and organic classification. The extra-cli Traffic Opportunity Frontier export was absent (non-blocking). Contract-analysis surfaces were not touched.

## 2. PR

https://github.com/tjsasakifln/web-cfg/pull/123

Head: `goal/organic-breakout-01` → `main`.

## 3. DEPLOY_PREVIEW

https://deploy-preview-123--confenge.netlify.app

Verified HTTP 200 on the three INDEX URLs with visible job, method, limitations, CTA attribution and self-canonical.

## 4. ASSETS_SELECTED

| # | asset_id | preference | intent | why not generic |
| --- | --- | --- | --- | --- |
| 1 | `sinapi-desonerado-nao-desonerado` | GSC-observed (historical, labeled) poorly served | `sinapi_desonerado_vs_nao` | Interactive regime-alignment tool + method/grain/limitations. Historical GSC striking distance is labeled historical ≠ live. |
| 2 | `bdi-diferenciado-obra-publica` | GSC-observed (historical, labeled) poorly served | `bdi_diferenciado_materiais_equipamentos` | Incidence map with explicit not-a-rate disclaimer. Distinct from SINAPI. |
| 3 | `limite-aditivo-25-50-obra-publica` | Existing-URL improvement | `limite_aditivo_25_50` | Worked art. 125 saldo with isolated increment/suppression sets + existing calculator. Distinct from the Lei 14.133 walkthrough and from contract analysis. |

Rejected: Market Answer fixture (not promoted); contract-analysis family (exclusive owner); frontier READY (export absent).

## 5. EXISTING_VS_NEW_URLS

All three are **existing URLs**. Zero new public URLs. Not a page factory.

- `/conteudos/sinapi-desonerado-nao-desonerado/`
- `/conteudos/bdi-diferenciado-obra-publica/`
- `/conteudos/limite-aditivo-25-50-obra-publica/`

## 6. GSC_STATE

Live snapshot on main after #122 (`source=search_analytics_api`, `max_date=2026-08-13`, 20 returned rows). Historical exports stay labeled historical ≠ live.

| URL | appearance | impressions | clicks |
| --- | --- | --- | --- |
| `/conteudos/limite-aditivo-25-50-obra-publica/` | TRUE | 4 | 0 |
| `/aditivos-obras-publicas/` | TRUE | 10 | 0 |
| `/reequilibrio-obras-publicas/` | UNKNOWN | absent from top rows | absent |
| `/inteligencia/valor-tipico-contratos-pavimentacao/` | UNKNOWN | absent from top rows | absent |

- Zero not inferred from absence (`missing_is_not_zero`).
- Inspection ≠ indexation ≠ impression ≠ click.
- Live git-safe snapshots redact raw queries.
- Fixture / `sync --fixture` cannot become product-ready.

## 7. TECHNICAL_PROOF

- Rebased onto `origin/main` after #122 (`0e707126`). Shared files keep live observation + organic `detect_*` / `label_historical_export`.
- Forbidden paths absent from the campaign diff.
- Production HTTP 200 on the three existing URLs (pre-improvement surface).
- After this PR: self-canonical, `index,follow`, present in exactly one sitemap (`sitemap.xml`), HowTo JSON-LD matches visible method/limitations, CTA attribution `CONFENGE_WEB`, correction `/correcoes/`, refresh owner visible, content hash visible.
- Sitemap auditor now reads real `<meta name="robots">` only (JS fail-closed `noindex` strings are not robots).
- Two breakout builds produced identical content hashes.

## 8. INDEX_DECISIONS

| URL | decision | robots | sitemap |
| --- | --- | --- | --- |
| `/conteudos/sinapi-desonerado-nao-desonerado/` | INDEX | index,follow | yes (existing) |
| `/conteudos/bdi-diferenciado-obra-publica/` | INDEX | index,follow | yes (existing) |
| `/conteudos/limite-aditivo-25-50-obra-publica/` | INDEX | index,follow | yes (existing) |
| Market Answer fixture / HOLD_FOR_DATA | NOINDEX (unchanged) | noindex | no |
| Query/filter combinations | NOINDEX | noindex | no |

## 9. CONTENT_HASHES

- `sinapi-desonerado-nao-desonerado`: `203e2ad70cfda3eceb1279ea22a0894a644e7cbc9176fccf63c1959effca6927`
- `bdi-diferenciado-obra-publica`: `689d131af76888293146d2a4d0650cdc92936170c73da4aec7d9d447323e456a`
- `limite-aditivo-25-50-obra-publica`: `21b65734c35be624c15d7751ff639159f7698cd3d419b760a2232103091ddbdf`

Hashes are of the visible chassis payload (question, answer, method, limitations, visual, job), not of chrome.

## 10. TESTS

Two focused runs, both `277 passed`:

```
python3 -m pytest tests/market_answers tests/discovery scripts/organic/tests scripts/distribution/tests -q
python3 scripts/revops/test_search_demand.py
npm run test:brand
```

Plus `python3 -m scripts.market_answers validate` (`ok: true`). Dedicated module: `scripts/organic/tests/test_organic_breakout_01.py` drives shipped functions.

## 11. DISTRIBUTION_PACKS

Prepare-only, `auto_send=false`, not sent:

- `docs/ops/campaigns/CONFENGE-ORGANIC-BREAKOUT-01/packs/sinapi-desonerado-nao-desonerado.json`
- `docs/ops/campaigns/CONFENGE-ORGANIC-BREAKOUT-01/packs/bdi-diferenciado-obra-publica.json`
- `docs/ops/campaigns/CONFENGE-ORGANIC-BREAKOUT-01/packs/limite-aditivo-25-50-obra-publica.json`

Each pack has outreach title, factual summary, citable datum/visual, method, five targets, personalized review/citation request.

## 12. METRICS_TRUE

- `TECHNICAL_LIVE` — the three existing URLs respond HTTP 200 on production and remain indexable with self-canonical + sitemap membership. The chassis improvements ship with this PR.

## 13. METRICS_UNKNOWN

`DISCOVERED`, `INDEXED`, `IMPRESSION`, `CLICK`, `ENGAGEMENT`, `CTA`, `LEAD`, `PIPELINE`, `REVENUE`.

Impression, click, lead and revenue stay `UNKNOWN` unless a later live pull or lead store observes them. Absence from top rows is not zero.

## 14. ROLLBACK

Revert this PR / `git revert` the merge commit. The three URLs return to the previous HTML. No sitemap membership was added or removed. No redirects were added. No catalog, prices, terms, Asaas, SmartLic, Warmbly, Governance or contract-analysis files change.

## 15. NEXT_MEASUREMENT_EXPERIMENT

After the integrated production SHA, observe **one complete Search Analytics window** on the three existing URLs and record **CTA click → lead persist**. Do not rewrite the chassis. Do not auto-submit IndexNow. Do not close #84, #86, #66, #63 or #61.

Supporting (not the experiment): review the three prepare-only packs; send nothing automatically.

## Isolation

Owner of first official contract analysis (do not touch):

- branch: `goal/first-official-contract-analysis-20260818`
- worktree: `/home/tjsasakifln/code/confenge/web-cfg-first-official-contract-analysis`
- also active: `goal/contract-analysis-masterpiece-canary`

Open PRs at preflight: #92, #93 (dependabot only).

Open relevant issues (not auto-closed): #84, #86, #66, #63, #61.

## Contract

- Visitor job: construtora/orçamentista/diretoria deciding SINAPI base, BDI family, or art. 125 saldo.
- Acquisition hypothesis: historical striking-distance / poorly served questions get a more verifiable, citable answer than conventional blogs.
- Data owner: extra-cli remains identity/facts owner; this campaign consumes labeled historical GSC and public legal/method sources only.
- Quality gate: per-asset INDEX via `scripts/organic/breakout.py` + existing organic indexability gate.
- Analytics: existing `CONFENGE_WEB` attribution; no PII.
- Affected ADR: none (no public-surface boundary change).
