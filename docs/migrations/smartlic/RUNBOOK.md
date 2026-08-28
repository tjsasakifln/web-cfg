# Runbook — web-cfg#62 inventory pin (not a DNS apply)

**Owner (map):** web-cfg#62 / `@dev`  
**Owner (bridge/DNS):** SmartLic#2115 operator (Gage / @devops)  
**Cost:** UNKNOWN  
**Exact SHA:** `35aca764cc455fea3031286700e0310315c9bff34fcf41b883cb53e8f9277698`
**Observation window:** 28 days after the first production 301 of this hash — **not started** as of 2026-08-16.

This file is the CONFENGE-side pin and validation runbook. Live DNS/TLS/ACME commands are in the SmartLic counterpart `bridge/docs/CUTOVER.md` and `bridge/docs/RUNBOOK.md`. They are **not** executed from this checkout.

## Current state (2026-08-16)

| Surface | State |
|---|---|
| `confenge.com.br` | nginx/Netcup production (`confenge-nginx-node/v2`). Canonical host `confenge.com.br`. |
| `smartlic.tech` A | `69.46.46.88` (Railway) TTL 60 → fallback 404 |
| `www.smartlic.tech` | CNAME `app.smartlic.tech.` → TLS SAN mismatch `*.up.railway.app` |
| Bridge process | not deployed |
| First production 301 | none |

## Target bridge

Caddy ACME SAN `{smartlic.tech, www.smartlic.tech}` → `127.0.0.1:8765` (`python3 -m bridge.serve`). 11 ready paths 301; HOLD/RETIRE/unmapped 410 no Location. See SmartLic `bridge/docs/CUTOVER.md` for records, TTL, certificate, preflight, deploy, smoke, rollback threshold.

## Commands (web-cfg, this repo)

```text
python3 scripts/legacy_equity/build_inventory.py
python3 -m pytest scripts/legacy_equity/tests scripts/migration/tests -q
python3 scripts/migration/crawl_targets.py
```

Do not run Cloudflare/DNS/ACME from here. Do not `netlify deploy`. Do not close #62.

## 28-day observation (planned)

Starts only at the first production 301 of this hash. Track: requests per URL, 301/410/error, loops/chains, destination errors, remaining indexed SmartLic URLs, GSC clicks/impressions, critical backlinks, unexpected SmartLic-branded page. Thresholds are in `HANDOFF-2115.md`.

## Removal → #2111

After the window, zero residual priority errors, later backlinks accepted or remapped, and the #2111 archive gate. The bridge is the only retained SmartLic runtime until then. This goal does not archive the repo.
