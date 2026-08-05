# Lead export runbook (Story 1.5)

**IDs:** DATA-01  
**Schema:** `schema_version` `1.0.0` (JSONL meta line + lead lines)

## Local / CI (FileStore)

```bash
LEAD_STORE_DIR=./.leads node scripts/revops/export_leads.mjs \
  --out data/revops/exports/leads.jsonl \
  --kind real
```

Stdout prints **path + count only** (no contact PII). Artifact file may contain PII — keep private.

## Filters

| Flag | Meaning |
|------|---------|
| `--kind real` | Commercial export (ADR-004 `record_kind=real`) |
| `--kind all` | Include synthetic/qa |
| `--from` / `--to` | ISO date bounds on `received_at` |

## Production

1. Ensure ops auth secrets available for any remote listing path.
2. Prefer export from durable store backup / FileStore mirror — **do not** publish under `_site/` or public artifact allowlist.
3. Store outputs under private ops storage (local secure dir, encrypted bucket, or `GSC_BACKUP_DIR`-style private path).

## Tests

```bash
npm run test:epic-td
```
