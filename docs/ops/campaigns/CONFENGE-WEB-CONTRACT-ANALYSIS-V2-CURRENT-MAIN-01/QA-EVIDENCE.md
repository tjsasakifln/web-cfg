# QA evidence

## Contract-analysis pytest

`python3 -m pytest scripts/contract_analysis/tests -q` → **198 passed** together with `scripts/organic/tests/test_sitemap_graph.py` (11.88s). Isolated contract-analysis suite: **179 passed** after XOR updates.

New shipped tests: `scripts/contract_analysis/tests/test_index_gate_v2.py` drive consume → gate → render → `approve_conditional_canary` → withdraw. Hashes are computed, not hardcoded.

## Clean-dir builds

Two directories under the campaign scratch dir. Both exit 0, `index_count=1`, HTML SHA-256 identical:

`823c6b057a68916480b0973c5843dca9ed406973d1bcf1ba1adebcc6e0b35dbb`

Also matches the worktree live file.

## Required npm suites (local)

| Suite | Result |
|---|---|
| `test:authority` | pass |
| `test:visible-parity` | pass |
| `test:sitemap-graph` | 19 passed |
| `discovery:test` | 90 passed |
| `test:attribution` | ATTRIBUTION_OK |
| `test:analytics` | ANALYTICS_UNIT_OK / EDITORIAL_ANALYTICS_OK / EVENT_DICTIONARY_OK |
| `test:ui` | **failed locally**: Chromium missing `libnspr4.so` / `libnss3.so` / `libasound.so.2`; sudo unavailable. Not waived. Required proof is GitHub `site-ci`. |

`npm test` includes `test:ui` and was not completed locally for that reason.

## Scan

Canary HTML, overlay, approvals: no `#435`, no `HOLD_FOR_DATA`, no CaseStudy, no customer success, no `CASO_CONFENGE` identity, no GSC query, no legacy tokens as live grants. `comparable_consumed=false` visible.

## Rollback

See `ROLLBACK.md`. Proven.

## IndexNow

Prepare-only. No submit. Receipt is not indexation.

## Required CI on final HEAD `691ed189`

Re-queried GitHub Actions after merge. Both required checks on `origin/main` SHA `691ed189b5af39d1e637f219d4170d943085f034` completed **success**:

| Check | Conclusion | Completed | Run |
|---|---|---|---|
| `site-ci` | success | 2026-08-20T12:37:40Z | https://github.com/tjsasakifln/web-cfg/actions/runs/32369464249 |
| `pSEO quality gates` | success | 2026-08-20T12:35:33Z | https://github.com/tjsasakifln/web-cfg/actions/runs/32369464335 |

PR head `f2239f4f` was already green before merge. `CI=green` is now verified on the integration SHA, not only on the PR SHA.
