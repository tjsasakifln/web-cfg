# pSEO Semantic SOTA — Final delivery report

Date: 2026-07-31

## Verdict

- **publish=0** intentional; old eight approvals revoked; nothing indexable by inertia.
- **No deploy** (publish=0).
- Mariópolis missing-vs-known near-dup residual is **fixed on the shipped path**.
- Quality-eligible radars remain noindex until **individual** human APPROVED (no bulk).

## Verified SHAs

Captured with git rev-parse and data/pseo/manifest.json at write time.

| Artifact | Branch/path | SHA |
|---|---|---|
| web-cfg HEAD (before this docs commit) | main | 943ed540c92c4c063f17a058dad4476b0225dc81 |
| web-cfg Mariópolis code+reexport | main | 57b5d3a19623356267b9549ad7bc98f3dcc97b23 |
| extra-cli HEAD | feat/pseo-semantic-sota | 01123735ed0e240b0adf2233269ac947fa6d56c2 |
| dataset_hash | data/pseo/manifest.json | faf85d953e46b6c39c20a649cba4adb7d23a754df0048151bb68dc14a4c1c333 |
| source_commit | export pin | 01123735ed0e240b0adf2233269ac947fa6d56c2 |
| data_as_of | manifest | 2026-07-31 |

Registry: {'reject': 13, 'noindex': 6}

After committing this file, verify tip with: git rev-parse HEAD

## Mariópolis residual — closed

| Check | Result |
|---|---|
| Rows | **1** |
| Kept | 76995323000124-1-000119/2026 valor=1230482.04 known |
| open_count | **10** (was 11) |
| Producer | cluster missing into sole known bucket; keep prefers known |
| Consumer gate | base key omits valor; missing+known fails if both present |
| Render | radar uses money_or_ni (not money em-dash) |
| HTML | single Mariopolis mention; R$ 1.230.482,04 |

## Acceptance suite (this session, all exit 0)

| Command | Result |
|---|---|
| npm run pseo:build | 0 |
| npm run pseo:validate | 0; publish=0; editorial publish_fail=0 |
| npm run pseo:audit | 0; publish_fail_count=0 |
| npm run pseo:test | 0; 28 passed |
| npm run test:analytics | 0 |
| npm run validate:seo | 0; VALIDATION_OK |
| extra-cli pytest tests/pseo | 0; 52 passed |
| Playwright 390x844 + 1440x900 | 16/16 OK |

Logs: /tmp/grok-goal-c61c87a5a926/implementer/

## Artifacts

- seo/pseo-query-map.csv
- seo/pseo-cannibalization-report.md
- scripts/pseo/learn.py (recommendations only, auto_mutate=false)
- data/pseo/metrics/gsc|analytics|crm/2026-07.json
- scripts/pseo/editorial_audit.py + CI .github/workflows/pseo.yml

## Final decisions — original eight

| page_id | status | human_review | qe | reasons |
|---|---|---|---|---|
| agency-88830609 | reject | NEEDS_DATA_FIX | qe=False | suppliers<3, temporal_span_days<180, exercises<2, max_single_day_share>0.70, score=83 |
| price-manutencao-predial-engenharia-rs-manutencao-predial | reject | NEEDS_DATA_FIX | qe=False | buyers<3, suppliers<3, temporal_span_days<90, max_buyer_share>0.60, score=84 |
| price-pavimentacao-infraestrutura-viaria-pi-paralelepipedo | reject | NEEDS_DATA_FIX | qe=False | obs<15, primary_contracts<15, temporal_span_days<90, score=80 |
| radar-edificacoes-publicas-pr | noindex | NEEDS_DATA_FIX | qe=True | gates_ok, score=85, human_review=NEEDS_DATA_FIX_blocks_index |
| radar-pavimentacao-infraestrutura-viaria-sc | noindex | NEEDS_DATA_FIX | qe=False | gates_ok, score=75 |
| prob-orcamento-edital | reject | NEEDS_CONTENT_FIX | qe=False | no_direct_budget_edital_evidence, no_claim_specific_evidence, score=86 |
| prob-sinapi-sicro | reject | NEEDS_CONTENT_FIX | qe=False | no_direct_sinapi_sicro_evidence, no_claim_specific_evidence, score=86 |
| prob-aditivos-margem | reject | NEEDS_CONTENT_FIX | qe=False | no_direct_aditivo_evidence, no_claim_specific_evidence, score=86 |

### Quality-eligible radar policy

radar-edificacoes-publicas-pr: quality_eligible=True, status=noindex, human_review=NEEDS_DATA_FIX.
Gates OK after Mariopolis collapse. Not auto-approved. Human must run review.py audit then set APPROVED individually.

### Other noindex radars

| page_id | status | human_review | qe | reasons |
|---|---|---|---|---|
| radar-pavimentacao-infraestrutura-viaria-rs | noindex | PENDING | qe=False | gates_ok, score=72 |
| radar-saneamento-hidraulica-sc | noindex | PENDING | qe=False | gates_ok, score=72 |
| radar-pavimentacao-infraestrutura-viaria-pr | noindex | PENDING | qe=False | gates_ok, score=72 |
| radar-edificacoes-publicas-rs | noindex | PENDING | qe=False | gates_ok, score=69 |

## Pendencias

1. Individual human APPROVED for quality-eligible radars only.
2. Scenario pages reject until claim-specific evidence.
3. Agency/price need more independent primary contracts.
4. Playwright not in package.json (scratch smoke only).
5. No deploy while publish=0.
6. extra-cli feat/pseo-semantic-sota merge when ready.

## Manual deploy (only if publish>0 later)

    git push origin main
    # host deploy
    node seo/scripts/playwright_prod_checklist.mjs

No production credentials → no deploy performed.

