# Lead store fail-closed checklist (Story 1.1)

**IDs:** DATA-04, DATA-20, SYS-13  
**Policy:** Production must never acknowledge lead success with MemoryStore or `LEAD_ALLOW_MEMORY_FALLBACK=1`.

## Production env

| Variable | Production value |
|----------|------------------|
| `LEAD_ALLOW_MEMORY_FALLBACK` | **unset** (must not be `1`) |
| `LEAD_STORE` | **unset** (must not be `memory`) |
| `CONFENGE_STORAGE_BACKEND` | `filesystem` na Netcup; `netlify-blobs` na janela de rollback Netlify |
| `CONFENGE_STORAGE_DIR` | absoluto, `0700`, fora do release quando backend é `filesystem` |
| `LEAD_STORE_DIR` | alias legado; não usar na nova produção |
| Blobs | somente adapter legado; carregamento lazy e contexto obrigatório quando selecionado |

## Local / CI

| Profile | Memory allowed? |
|---------|-----------------|
| `NODE_ENV=test` | Yes (ephemeral) |
| `LEAD_ALLOW_MEMORY_FALLBACK=1` + non-prod | Yes |
| `NODE_ENV=production` or `CONTEXT=production` | **No** — createStore returns null; lead API non-2xx |

## Smoke

```bash
# Unit gate
npm run test:lead-store-production

# Happy path still green
npm run test:lead-function
```

O primeiro gate inclui concorrência com 64 processos, restart, corrupção,
permissões, traversal/symlink, migração, retention e backup/restore.

## Code references

- `netlify/functions/lib/lead-store.cjs` — `isProductionProfile`, `assertProductionStorePolicy`, `createStore`
- `netlify/functions/lib/host-file-store.cjs` — atomicidade, checksums, modos e proteção de path
- `netlify/functions/lib/storage-config.cjs` — seleção explícita + readiness
- `netlify/functions/lead.cjs` — rejects ephemeral / policy violations with 503, no success body
