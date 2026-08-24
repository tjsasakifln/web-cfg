# web-cfg#62 checklist (authoritative half)

Issue remains **OPEN**. 28-day observation is planned, not complete.

| Criterion | State | Evidence |
|---|---|---|
| 100% relevant historical URLs have decision, owner, state | YES | `inventory.v2.json` 1255 entries (11 REDIRECT_301 / 54 HOLD / 1190 RETIRE_410); loader `scripts/legacy_equity/inventory.py` |
| Top URLs/queries/backlinks have dated baseline | PARTIAL | GSC snapshots 2026-04-27 committed; live GSC **UNKNOWN**; backlinks **UNKNOWN** (donor log empty) |
| Ready targets exist before #2115 bridge | YES | 11 REDIRECT ready → indexable CONFENGE #60/equivalent pages; crawl 200 |
| CONFENGE-only brand/canonical | YES | crawl: no SmartLic; canonical `https://confenge.com.br/...` |
| Zero indiscriminate home/parent 301 | YES | validator rejects ready home/`/consultoria-b2g`/parent without justification; RETIRE = 410 |
| CTA + allowlisted attribution, no PII | YES | `lead-core.pickAttribution` + `window.confengeAttribution`; tests inject unlisted + PII |
| Manifesto + #2115 handoff pinned by hash | YES | `9c47b1b26e1dfb83cb8ea476091d9893931d17ce434ca54e7b6af933b85433fa` |
| Zero chain/loop/soft-404 on priority crawl of **targets** | YES | built artifact crawl |
| Live SmartLic 301s | NOT THIS PR | SmartLic#2115 after this hash |
| DNS/TLS/cutover | **BLOCKED** | Railway fallback 404; www TLS SAN mismatch |
| 28-day GSC window | PLANNED | not started |
| Merge / close #62 | NO | forbidden until observation + human gates |

## Verdict

| Lane | State |
|---|---|
| In-repo 11-row accept | READY_FOR_HUMAN_ACCEPTANCE (WEB-017 remapped payment-delay row; pin `9c47b1b2…`) |
| DNS / TLS / Cloudflare / Railway cutover | BLOCKED (not authorized; Railway fallback 404; www TLS SAN mismatch) |
| 28-day GSC Change-of-Address | HUMAN ACTION REQUIRED after cutover (window not started) |

**Verdict: PARTIAL_TARGETS_READY.** BLOCKED for cutover (DNS/TLS/bridge not authorized).  
In-repo authoritative half is complete and reviewable. Do not merge until a human accepts the 11-row execute set. #62 stays OPEN.
