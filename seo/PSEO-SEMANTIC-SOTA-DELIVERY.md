# pSEO Semantic SOTA — Final delivery report

Date: 2026-07-31

## Verdict
**Containment + producer identity + consumer gates + editorial/governance loop are in place.**  
**publish=0 is intentional and correct** until individual human APPROVED reviews.  
**No deploy** (nothing indexable).

Skeptic residual (Mariópolis missing-vs-known valor) is **fixed and re-verified**.

## SHAs
| Repo | Branch | SHA | Role |
|---|---|---|---|
| web-cfg | main |  | tip (docs pins) |
| web-cfg | main |  | substantive Mariópolis fix + reexport |
| extra-cli | feat/pseo-semantic-sota |  | near-dup missing↔known clusterer |

## Snapshot
- dataset_hash: 
- source_commit: 
- data_as_of: 2026-07-31
- registry: reject=13, noindex=6, **publish=0**

## Mariópolis evidence (skeptic residual)
| Check | Result |
|---|---|
| Rows for Reforma Centro / Mariópolis | **1** (, R$ 1.230.482,04, known) |
| open_count edificações-PR | **10** (was 11) |
| semantic_radar_fails |  |
| quality_eligible | True; status noindex (human review blocks index) |
| HTML mariop mentions | 1 |
| money_or_ni on radar | wired () |
| Producer keep | known valor preferred over not_informed |

## Acceptance suite (captured)

Evidence dir (session scratch): suite logs + playwright-results.json + mariopolis-check.txt

## Artifacts (§8–9)
| Path | Status |
|---|---|
| seo/pseo-query-map.csv | present |
| seo/pseo-cannibalization-report.md | present |
| scripts/pseo/learn.py | present; smoke recommendations=19, auto_mutate=false |
| data/pseo/metrics/gsc|analytics|crm/2026-07.json | present |
| scripts/pseo/editorial_audit.py | present; wired validate+audit |
| .github/workflows/pseo.yml | present |

## Fixtures §11
Covered in producer/consumer tests (identity, near-dup accent/portal, contract URL, zero/missing valor, muro/pavement classifier, soft_meta truncation, slug/prefix editorial, generic evidence, Dataset JSON-LD, approval invalidation, timezone open/closed, missing↔known valor). Fixture 10 (internal slug) covered by .

## Decisions — eight original pages
| page_id | status | human_review | notes |
|---|---|---|---|
| agency-88830609 | **reject** | NEEDS_DATA_FIX | suppliers/temporal/day concentration after primary-contract gates |
| price-manutencao-predial-engenharia-rs-manutencao-predial | **reject** | NEEDS_DATA_FIX | buyers/suppliers/span/buyer share |
| price-pavimentacao-infraestrutura-viaria-pi-paralelepipedo | **reject** | NEEDS_DATA_FIX | obs/primary_contracts/span |
| radar-edificacoes-publicas-pr | **noindex** | NEEDS_DATA_FIX | gates_ok, qe=True — **await individual human APPROVED** |
| radar-pavimentacao-infraestrutura-viaria-sc | **noindex** | NEEDS_DATA_FIX | gates_ok, qe=False (score) |
| prob-orcamento-edital | **reject** | NEEDS_CONTENT_FIX | no claim-specific evidence |
| prob-sinapi-sicro | **reject** | NEEDS_CONTENT_FIX | no claim-specific evidence |
| prob-aditivos-margem | **reject** | NEEDS_CONTENT_FIX | no claim-specific evidence |

Old bulk approvals are **not** restored. Zero indexable pages is correct.

## What shipped (summary)
### extra-cli
- Contract identity typology + primary vs reajuste/aditivo metrics
- Opportunity identity, dedupe (official IDs + near-dup second pass)
- Missing↔known valor clustering; prefer known keep
- Classifiers (muro/reajuste/estabilização); humanized agency names
- Export §3.2 fields; page-level duplicate_rate post-dedup

### web-cfg
- Semantic gates that cannot be overridden by score
- editorial_audit P0/P1; review invalidation (dataset/material/render)
- money_or_ni, BR dates, soft_meta, Dataset JSON-LD honesty
- Intent/cannibalization maps; metrics importers + learn.py
- CI workflow; 28 unit tests

## Pendências reais (honest)
1. **Human individual audit-approve** quality-eligible pages only (start with ). No bulk.
2. **Problem/scenario pages** stay reject until claim-specific evidence exists in datalake (or editorial consolidation with guides).
3. **Agency/price rejects** need more independent primary contracts in source data — not threshold relaxation.
4. **Playwright not in package.json** — candidate smoke ran via scratch install + local static server; optional: add  + committed e2e for CI.
5. **Deploy**: blocked while publish=0. When humans APPROVE, rebuild → validate → deploy → production smoke ().
6. extra-cli branch  not merged to main (worktree isolation).

## Manual step only if deploying later

No credentials available here → **no production deploy in this session**.
