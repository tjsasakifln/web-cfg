# Rollback — web-cfg#62

## Before any later SmartLic bridge cutover

Record:

- web-cfg git SHA of the approved PR
- manifesto SHA-256 (`data/migration/smartlic-confenge/manifesto.v1.sha256`)
- CONFENGE production identity from `https://confenge.com.br/.well-known/build-info.json` and `/.well-known/runtime-info.json`
- Current `smartlic.tech` DNS records (apex A `69.46.46.88`; www/api CNAME to `*.up.railway.app` as of 2026-08-14)

## CONFENGE application rollback

```bash
# restore a verified SHA on the production nginx/Netcup host
# see docs/ops/ROLLBACK.md — never the leftover Netlify UI
CONFENGE_LOCAL_ORIGIN=http://127.0.0.1:8088 /opt/confenge-web/bin/rollback <FULL_SHA>
```

This restores the last functional CONFENGE site. It does **not** turn SmartLic back into a product.

## Bridge rollback (SmartLic#2115)

Revert DNS/proxy to the recorded pre-cutover records. Accept Railway fallback 404 rather than rebuilding the SaaS.

## Thresholds

See `HANDOFF-SMARTLIC-2115.md`.
