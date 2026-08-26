# DSAR + retention purge (Story 1.11)

**IDs:** DATA-10, DATA-16  
**Default retention:** 730 days (`LEAD_RETAIN_DAYS` / `delete_after`)

## Always dry-run first

```bash
# Export subject package (secured file path; not public)
CONFENGE_STORAGE_DIR=/var/lib/confenge-web node scripts/revops/dsar_cli.mjs export \
  --id lead_xxx --out /tmp/dsar.json

# Or by contact hash (preferred for argv hygiene)
CONFENGE_STORAGE_DIR=/var/lib/confenge-web node scripts/revops/dsar_cli.mjs export \
  --hash "$CONTACT_SHA256" --out /tmp/dsar.json

# Delete dry-run (default)
CONFENGE_STORAGE_DIR=/var/lib/confenge-web node scripts/revops/dsar_cli.mjs delete \
  --id lead_xxx --dry-run --out /tmp/dsar-delete.json

# Retention purge report (dry-run default)
CONFENGE_STORAGE_DIR=/var/lib/confenge-web node scripts/revops/dsar_cli.mjs purge \
  --dry-run --out /tmp/retention-purge.json
```

## Apply (mutates store)

Only after human confirmation:

```bash
CONFENGE_STORAGE_DIR=/var/lib/confenge-web node scripts/revops/dsar_cli.mjs delete --id lead_xxx --apply
CONFENGE_STORAGE_DIR=/var/lib/confenge-web node scripts/revops/dsar_cli.mjs purge --apply --out /tmp/purge-applied.json
```

## Evidence

Keep dry-run report paths under `data/revops/dsar/` (gitignored if PII) or private ops storage. Never `_site/`.
