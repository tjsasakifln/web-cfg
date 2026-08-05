# Lead store fail-closed checklist (Story 1.1)

**IDs:** DATA-04, DATA-20, SYS-13  
**Policy:** Production must never acknowledge lead success with MemoryStore or `LEAD_ALLOW_MEMORY_FALLBACK=1`.

## Netlify production env (verify UI)

| Variable | Production value |
|----------|------------------|
| `LEAD_ALLOW_MEMORY_FALLBACK` | **unset** (must not be `1`) |
| `LEAD_STORE` | **unset** (must not be `memory`) |
| `LEAD_STORE_DIR` | unset in production (use Blobs) |
| Blobs | Site has Blobs enabled; functions can `getStore("confenge-leads")` |

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

## Code references

- `netlify/functions/lib/lead-store.cjs` — `isProductionProfile`, `assertProductionStorePolicy`, `createStore`
- `netlify/functions/lead.cjs` — rejects ephemeral / policy violations with 503, no success body
