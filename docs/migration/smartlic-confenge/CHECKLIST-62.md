# web-cfg#62 checklist (authoritative half)

Issue remains **OPEN**. 28-day observation is planned, not complete.

| Criterion | State | Evidence |
|---|---|---|
| 100% relevant historical URLs have decision, owner, state | YES | `manifesto.v1.json` 1255 entries; loader `scripts/migration/manifesto_lib.py` |
| Top URLs/queries/backlinks have dated baseline | PARTIAL | GSC snapshots 2026-04-27 committed; live GSC **UNKNOWN**; backlinks **UNKNOWN** (donor log empty) |
| Ready targets exist before #2115 bridge | YES | 11 REDIRECT ready → indexable CONFENGE #60/equivalent pages; crawl 200 |
| CONFENGE-only brand/canonical | YES | crawl: no SmartLic; canonical `https://confenge.com.br/...` |
| Zero indiscriminate home/parent 301 | YES | validator rejects ready home/`/consultoria-b2g`/parent without justification; RETIRE = 410 |
| CTA + allowlisted attribution, no PII | YES | `lead-core.pickAttribution` + `window.confengeAttribution`; tests inject unlisted + PII |
| Manifesto + #2115 handoff pinned by hash | YES | `c2cee8362321099205b76b11f89485d4248a00b8abbbda354d15964f6b316e0d` |
| Zero chain/loop/soft-404 on priority crawl of **targets** | YES | built artifact crawl |
| Live SmartLic 301s | NOT THIS PR | SmartLic#2115 after this hash |
| DNS/TLS/cutover | **BLOCKED** | Railway fallback 404; www TLS SAN mismatch |
| 28-day GSC window | PLANNED | not started |
| Merge / close #62 | NO | forbidden until observation + human gates |

## Verdict

**BLOCKED** for cutover (DNS/TLS/bridge not authorized).  
In-repo authoritative half is complete and reviewable.
