# GSC private operational state

**IDs:** DATA-06, DATA-13  
**ADR-007 / BR-PRIV-02:** insights are **ops-auth only** — never public static JSON.

## Authority and flow

The only durable operational authority is the host-owned filesystem record
`system/gsc-insights-latest-v1` under `CONFENGE_STORAGE_DIR` (namespace
`ops-system`), accessed through authenticated `ops` actions.
It contains the versioned/hash-verified `confenge_private_gsc_history_v1` state
and the last-known-good redacted insights. GitHub Actions cache is not a data
plane.

The daily workflow performs this sequence:

1. authenticated `GET gsc_history` restores the previous state;
2. `search_demand_observatory.py sync` validates schema, contract and SHA-256,
   then merges the provider observation idempotently;
3. authenticated `POST gsc_insights_ingest` stores history and, only when
   ready, promotes redacted insights;
4. `GET gsc_history` and `GET gsc_insights` prove state hash, insight hash and
   `as_of` before the job applies the readiness exit code.

`data/revops/gsc/history.json`, `last_sync.json`, `daily/` and the publish
receipt are gitignored run artifacts. The uploaded Actions artifact is evidence,
not the restore source. Raw queries remain only in ephemeral private paths and
are never sent to the history store, public artifact, analytics or logs.

## Readiness contract

`gsc-readiness/v2` is fail-closed. `ready_for_product_decisions` is true only
when all 28 expected provider dates are observed, three distinct `as_of` values
have been durably composed, the newest `as_of` is no more than 14 days old, and
the current state passed schema/version/hash checks. Missing dates remain a date
list and never become numeric zero.

Repeated snapshots do not add an observation or renew last-known-good
freshness. Out-of-order snapshots may backfill coverage but cannot replace a
newer last-known-good. Missing credentials, unavailable dependencies, partial
or truncated pulls persist an explicit reason code and expose the previous
last-known-good as `STALE` / `READ_ONLY` when one exists.

## Packaged compatibility copy

The generator still writes the two private packaged copies used for rollback:

1. `data/ops/gsc-insights.json`
2. `netlify/functions/data/gsc-insights.json`

They are never a product-ready history source. Without valid durable history,
the authenticated consumer returns them only as fail-closed read-only fallback.

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

- `GET /.netlify/functions/ops?action=gsc_history` with `OPS_TOKEN` restores the
  operational history.
- `GET /.netlify/functions/ops?action=gsc_insights` with `OPS_TOKEN` reads the
  current state or last-known-good with readiness/status/reason metadata.
