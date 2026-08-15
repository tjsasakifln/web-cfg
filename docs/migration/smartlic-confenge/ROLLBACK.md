# Rollback — web-cfg#62

## Before any later cutover

Record:

- web-cfg git SHA of the approved PR
- manifesto SHA-256 (`data/migration/smartlic-confenge/manifesto.v1.sha256`)
- Netlify production deploy ID / SHA (from Netlify UI — not visible on public HTML today)
- Current `smartlic.tech` DNS records (apex A `69.46.46.88`; www/api CNAME to `*.up.railway.app` as of 2026-08-14)

## CONFENGE application rollback

```bash
# restore previous production deploy in Netlify UI, or:
git revert <merge-sha-of-this-pr>
# then Netlify rebuilds from the reverted main
```

This restores the last functional CONFENGE site. It does **not** turn SmartLic back into a product.

## Bridge rollback (SmartLic#2115)

Revert DNS/proxy to the recorded pre-cutover records. Accept Railway fallback 404 rather than rebuilding the SaaS.

## Thresholds

See `HANDOFF-SMARTLIC-2115.md`.
