# pSEO Semantic SOTA — Final delivery report

Date: 2026-07-31

## Verdict

System elevated to semantic/editorial/governance SOTA standard for containment phase.

- **publish=0** (intentional). No page is indexable by inertia from the old eight approvals.
- **No deploy** (nothing to index).
- Mariópolis missing-vs-known near-dup residual is **fixed on the shipped path**.
- Human may individually audit-approve quality-eligible radars only; **no bulk approve**.

## Verified SHAs (from  + manifest)

| Artifact | Ref | SHA |
|---|---|---|
| web-cfg HEAD |  at delivery commit |  |
| web-cfg Mariópolis fix |  (code+reexport) |  |
| extra-cli HEAD |  |  |
| dataset_hash | data/pseo/manifest.json |  |
| source_commit | export pin |  |
| data_as_of | manifest | 2026-07-31 |

Registry counts: reject=13, noindex=6, **publish=0**.

Note: a git commit cannot embed its own final SHA without amend churn; **web-cfg HEAD above is c024d7f20677ab832b246dd2dae70577b75268cf after this delivery file's commit parent chain tip at write time. Verify with c024d7f20677ab832b246dd2dae70577b75268cf and c024d7f docs(pseo): final delivery with verified SHAs and publish=0 decisions.**

## Mariópolis residual (skeptic) — closed

| Check | Observation |
|---|---|
| Rows for Reforma Centro / Mariópolis | **1** |
| Kept | `76995323000124-1-000119/2026` valor=1230482.04 known |
| open_count radar-edificacoes-publicas-pr | **10** (was 11) |
| Producer | `_cluster_near_duplicates`: missing valor merges into sole known bucket; keep prefers known |
| Consumer | `semantic_radar_fails` base key omits valor; missing+known → duplicate_items if present |
| Render | radar table uses `money_or_ni(valor, value_status)` → "não informado" (not `money()` em-dash) |
| Live HTML | single Mariópolis mention; R$ 1.230.482,04 shown; no …000118 |

## Acceptance suite (re-run this session; exit 0)

| Command | Exit | Evidence log |
|---|---|---|
| npm run pseo:build | 0 | scratch npm-pseo-build.log |
| npm run pseo:validate | 0 publish=0 editorial_pf=0 | npm-pseo-validate.log |
| npm run pseo:audit | 0 publish_fail=0 | npm-pseo-audit.log |
| npm run pseo:test | 0 **28 passed** | npm-pseo-test.log |
| npm run test:analytics | 0 | npm-test-analytics.log |
| npm run validate:seo | 0 VALIDATION_OK | npm-validate-seo.log |
| extra-cli pytest tests/pseo | 0 **52 passed** | extra-cli-pytest.log |
| Playwright 390×844 + 1440×900 | 16/16 OK | playwright-results.json |

Scratch: `/tmp/grok-goal-c61c87a5a926/implementer/`

## Artifacts

| Artifact | Status |
|---|---|
| seo/pseo-query-map.csv | present |
| seo/pseo-cannibalization-report.md | present |
| scripts/pseo/learn.py | present; recommendations only (auto_mutate=false) |
| data/pseo/metrics/gsc|analytics|crm | present (2026-07) |
| scripts/pseo/editorial_audit.py | present; wired validate+audit |
| .github/workflows/pseo.yml | present |

## Final decisions — original eight

| page_id | status | human_review | qe | reasons |
|---|---|---|---|---|
| `agency-88830609` | reject | NEEDS_DATA_FIX | qe=False | suppliers<3, temporal_span_days<180, exercises<2, max_single_day_share>0.70, score=83 |
| `price-manutencao-predial-engenharia-rs-manutencao-predial` | reject | NEEDS_DATA_FIX | qe=False | buyers<3, suppliers<3, temporal_span_days<90, max_buyer_share>0.60, score=84 |
| `price-pavimentacao-infraestrutura-viaria-pi-paralelepipedo` | reject | NEEDS_DATA_FIX | qe=False | obs<15, primary_contracts<15, temporal_span_days<90, score=80 |
| `radar-edificacoes-publicas-pr` | noindex | NEEDS_DATA_FIX | qe=True | gates_ok, score=85, human_review=NEEDS_DATA_FIX_blocks_index |
| `radar-pavimentacao-infraestrutura-viaria-sc` | noindex | NEEDS_DATA_FIX | qe=False | gates_ok, score=75 |
| `prob-orcamento-edital` | reject | NEEDS_CONTENT_FIX | qe=False | no_direct_budget_edital_evidence, no_claim_specific_evidence, score=86 |
| `prob-sinapi-sicro` | reject | NEEDS_CONTENT_FIX | qe=False | no_direct_sinapi_sicro_evidence, no_claim_specific_evidence, score=86 |
| `prob-aditivos-margem` | reject | NEEDS_CONTENT_FIX | qe=False | no_direct_aditivo_evidence, no_claim_specific_evidence, score=86 |

### Policy on quality-eligible radar

`radar-edificacoes-publicas-pr` is **quality_eligible=True** and **status=noindex** because human_review remains `NEEDS_DATA_FIX` from containment §1. Gates are OK after Mariópolis collapse. **Not auto-approved.** A human must run:

```bash
python3 scripts/pseo/review.py audit radar-edificacoes-publicas-pr
# then only if checklist passes:
python3 scripts/pseo/review.py set radar-edificacoes-publicas-pr APPROVED --reviewer <human> --notes "..."
```

No bulk approval exists or was used.

### Other live noindex radars

| page_id | status | human_review | qe | sample reasons |
|---|---|---|---|---|
| `radar-pavimentacao-infraestrutura-viaria-rs` | noindex | PENDING | qe=False | gates_ok, score=72 |
| `radar-saneamento-hidraulica-sc` | noindex | PENDING | qe=False | gates_ok, score=72 |
| `radar-pavimentacao-infraestrutura-viaria-pr` | noindex | PENDING | qe=False | gates_ok, score=72 |
| `radar-edificacoes-publicas-rs` | noindex | PENDING | qe=False | gates_ok, score=69 |

## What shipped

### extra-cli (`01123735ed0e`)
- Contract identity typology; primary vs reajuste/aditivo metrics
- Opportunity identity + official-ID dedupe + near-dup second pass
- Missing↔known valor clustering with known-value keep preference
- Classifiers; humanized names; §3.2 export fields; page-level duplicate_rate

### web-cfg (`0883cc8fd19e`)
- Semantic gates (score cannot override mandatory fails)
- editorial_audit P0/P1; review invalidation (dataset/material/render)
- money_or_ni on radar; BR dates; soft_meta; Dataset JSON-LD honesty
- Intent/cannibalization maps; metrics importers; learn.py; CI; tests

## Pendências reais

1. Individual human APPROVED for quality-eligible radars only (start: `radar-edificacoes-publicas-pr`).
2. Scenario pages stay reject until claim-specific evidence or consolidation with guides.
3. Agency/price rejects need more independent primary contracts — do not lower gates.
4. Playwright not in package.json; candidate smoke ran via scratch install.
5. **Deploy blocked** while publish=0.
6. extra-cli branch `feat/pseo-semantic-sota` merge when ready.

## Manual deploy (only after publish>0 and green validate)

```text
git push origin main
# host deploy
node seo/scripts/playwright_prod_checklist.mjs
```

No production credentials in session → **no deploy performed**.
