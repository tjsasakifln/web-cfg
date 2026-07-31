# pSEO Semantic SOTA — Final delivery report

Date: 2026-07-31

## Verdict

Containment, producer identity, consumer semantic gates, editorial audit, and metrics loop are in place.

- **publish=0 is intentional** until individual human APPROVED reviews.
- **No deploy** (nothing indexable).
- Skeptic residual (Mariópolis missing-vs-known valor) is **fixed and re-verified**.

## SHAs

| Repo | Branch | SHA | Role |
|---|---|---|---|
| web-cfg | main | `8248d520815aacc4b46bf0ddea828ccaf8eebb67` | tip at report write |
| web-cfg | main | `57b5d3a19623356267b9549ad7bc98f3dcc97b23` | substantive Mariópolis fix + reexport |
| extra-cli | feat/pseo-semantic-sota | `01123735ed0e240b0adf2233269ac947fa6d56c2` | near-dup missing↔known clusterer |

## Snapshot

- dataset_hash: `faf85d953e46b6c39c20a649cba4adb7d23a754df0048151bb68dc14a4c1c333`
- source_commit: `01123735ed0e240b0adf2233269ac947fa6d56c2`
- data_as_of: 2026-07-31
- registry counts: {'reject': 13, 'noindex': 6}

## Mariópolis evidence (skeptic residual)

| Check | Result |
|---|---|
| Rows Reforma Centro / Mariópolis | **1** |
| Kept row | `76995323000124-1-000119/2026` valor=1230482.04 status=known |
| open_count edificações-PR | **10** (was 11) |
| HTML mariop count | 1 (verified earlier) |
| money_or_ni on radar table | wired in scripts/pseo/render.py |
| semantic_radar_fails | empty on live page |

Producer: `_cluster_near_duplicates` merges missing/not_informed into sole known-value bucket under same org|objeto|closing; keep prefers known.

Consumer: `semantic_radar_fails` base key omits valor so missing+known fails gate if still present.

## Acceptance suite (exit 0)

| Command | Result |
|---|---|
| npm run pseo:build | 0; pages_written=19 |
| npm run pseo:validate | 0; publish=0; editorial publish_fail=0 |
| npm run pseo:audit | 0; publish_fail_count=0; p0 on non-publish only |
| npm run pseo:test | 0; **28 passed** |
| npm run test:analytics | 0 |
| npm run validate:seo | 0; VALIDATION_OK |
| extra-cli pytest tests/pseo | **52 passed** |
| Playwright 390×844 + 1440×900 | **16/16 OK** on 6 radars + hubs (local static :9876) |

Scratch evidence: `/tmp/grok-goal-c61c87a5a926/implementer/` (suite logs, playwright-results.json, mariopolis-check.txt).

## Artifacts (§8–9)

| Path | Status |
|---|---|
| seo/pseo-query-map.csv | present |
| seo/pseo-cannibalization-report.md | present |
| scripts/pseo/learn.py | present; period 2026-07; recommendations=19; auto_mutate=false |
| data/pseo/metrics/gsc/2026-07.json | present |
| data/pseo/metrics/analytics/2026-07.json | present |
| data/pseo/metrics/crm/2026-07.json | present |
| scripts/pseo/editorial_audit.py | present; wired to validate+audit |
| .github/workflows/pseo.yml | present |

## Fixtures §11

Covered across producer/consumer tests: reajuste vs primary, independence/concentration, accent/case near-dup, portal+PNCP, contract URL, missing/zero valor, muro/pavement, soft_meta truncation, ingestion prefix/slug, generic evidence_count, Dataset JSON-LD, approval invalidation, timezone open/closed, missing↔known valor near-dup.

## Decisions — eight original pages

| page_id | status | human_review | notes |
|---|---|---|---|
| agency-88830609 | reject | NEEDS_DATA_FIX | suppliers/temporal/day concentration |
| price-manutencao-predial-engenharia-rs-manutencao-predial | reject | NEEDS_DATA_FIX | buyers/suppliers/span/share |
| price-pavimentacao-infraestrutura-viaria-pi-paralelepipedo | reject | NEEDS_DATA_FIX | obs/primary_contracts/span |
| radar-edificacoes-publicas-pr | noindex | NEEDS_DATA_FIX | gates_ok, quality_eligible=True — await **individual** human APPROVED |
| radar-pavimentacao-infraestrutura-viaria-sc | noindex | NEEDS_DATA_FIX | gates_ok, quality_eligible=False |
| prob-orcamento-edital | reject | NEEDS_CONTENT_FIX | no claim-specific evidence |
| prob-sinapi-sicro | reject | NEEDS_CONTENT_FIX | no claim-specific evidence |
| prob-aditivos-margem | reject | NEEDS_CONTENT_FIX | no claim-specific evidence |

Old bulk approvals are not restored. Zero indexable pages is correct under §13.

## What shipped (summary)

### extra-cli
- Contract identity typology; primary vs reajuste/aditivo metrics
- Opportunity identity + dedupe (official IDs + near-dup second pass with missing↔known valor)
- Classifiers hardened; humanized agency names; export §3.2 fields

### web-cfg
- Semantic gates not overridable by score
- editorial_audit; review invalidation (dataset/material/render)
- money_or_ni, BR dates, soft_meta, Dataset JSON-LD honesty
- Intent/cannibalization maps; metrics + learn.py; CI; tests

## Pendências reais

1. Individual human audit-approve for quality-eligible radars only (no bulk). Start: radar-edificacoes-publicas-pr.
2. Scenario pages stay reject until claim-specific evidence exists (or consolidate with guides).
3. Agency/price rejects need more independent primary contracts in source data — do not lower gates.
4. Playwright is not a project dependency; candidate smoke used scratch install + local static. Optional: add @playwright/test to CI.
5. No deploy while publish=0. After APPROVED: rebuild, validate, push, host deploy, production smoke (seo/scripts/playwright_prod_checklist.mjs).
6. extra-cli work lives on feat/pseo-semantic-sota (worktree); merge when ready.

## Manual deploy step (only when publish>0 and green)

```text
git push origin main
# host deploy pipeline
node seo/scripts/playwright_prod_checklist.mjs
```

No production credentials in this session → **no deploy performed**.
