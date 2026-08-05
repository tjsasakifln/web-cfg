# Ops token rotation runbook (Story 1.2)

**IDs:** DATA-12  
**Tokens:** `OPS_TOKEN`, optional `REVOPS_TOKEN` (either accepted by `ops.cjs`).

## Principles

- Fail-closed: if no token is configured, sensitive actions return **503** `ops_token_not_configured`.
- Invalid/missing bearer → **401** `unauthorized` with **no lead PII** in body.
- Comparison is timing-safe (`crypto.timingSafeEqual`).
- `safeLog` on auth failure logs only `reason` + truncated IP — never the token or contact fields.

## Dual-key window (recommended)

1. Generate new token (≥16 chars, high entropy).
2. Temporarily set **both** if dual-key is implemented; current code accepts a single expected value from `OPS_TOKEN || REVOPS_TOKEN`.
3. Practical dual-key: put new value in `OPS_TOKEN`, keep old in `REVOPS_TOKEN` for one deploy window, update all callers, then clear `REVOPS_TOKEN`.
4. Update GitHub Actions / local ops scripts / ntfy/cron that call ops.

## Post-rotation smoke

```bash
# Must 401 without token
curl -sS -o /dev/null -w "%{http_code}\n" \
  "https://confenge.com.br/.netlify/functions/ops?action=leads"

# Must 200 with new token (PII optional via query flags as implemented)
curl -sS -H "Authorization: Bearer $OPS_TOKEN" \
  "https://confenge.com.br/.netlify/functions/ops?action=health"

curl -sS -H "Authorization: Bearer $OPS_TOKEN" \
  "https://confenge.com.br/.netlify/functions/ops?action=gsc_insights" | head -c 200
```

## Automated coverage

```bash
npm run test:ops-auth
```
