# GSC insights single-source + backup (Story 1.12)

**IDs:** DATA-06, DATA-13  
**ADR-007 / BR-PRIV-02:** insights are **ops-auth only** — never public static JSON.

## Generator

Primary writer: `scripts/revops/search_demand_observatory.py` (`dashboard` command) writes **both**:

1. `data/ops/gsc-insights.json`
2. `netlify/functions/data/gsc-insights.json`

Same content, private paths only.

## Parity check / force sync

```bash
npm run test:gsc-parity
# or
node scripts/revops/gsc_insights_sync.mjs --check
node scripts/revops/gsc_insights_sync.mjs --sync-from data/ops/gsc-insights.json
```

## Backup (private)

```bash
GSC_BACKUP_DIR=/secure/path node scripts/revops/gsc_insights_sync.mjs --backup
```

Refuses destinations under `_site/`.

## Consumption

`GET /.netlify/functions/ops?action=gsc_insights` with `OPS_TOKEN` — see ops auth runbook.
