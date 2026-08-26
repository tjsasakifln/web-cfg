# Lead export runbook (Story 1.5)

**IDs:** DATA-01  
**Schema:** `schema_version` `1.0.0` (JSONL meta line + lead lines)

## Local / CI (FileStore)

```bash
LEAD_STORE_DIR=/tmp/confenge-leads-private node scripts/revops/export_leads.mjs \
  --out /tmp/confenge-lead-export-private/leads.jsonl \
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
2. Para migração completa e auditável, use `storage:migrate:export/import/reconcile` conforme `HOST-OWNED-STORAGE-RUNBOOK.md`.
3. Use caminho absoluto fora do checkout, release e store live. **Não** publique em `_site/`, artifact de CI ou allowlist pública.
4. Outputs históricos sob `data/revops/exports/` estão ignorados apenas como defesa; não são destino operacional recomendado.

## Tests

```bash
npm run test:epic-td
```
