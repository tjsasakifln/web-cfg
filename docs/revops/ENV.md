# RevOps environment variables

Never commit secrets.

## Required for production ops API

| Variable | Purpose |
|----------|---------|
| `OPS_TOKEN` | Bearer token for `/.netlify/functions/ops` (min 16 chars) |
| `LEAD_SLA_HOURS` | Hours before `lead_persisted` is SLA breach (default 4) |

## Lead delivery (already used)

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Transactional + weekly report email |
| `RESEND_FROM` | From address |
| `OPS_REPORT_EMAIL` or `LEAD_NOTIFY_EMAIL` | Weekly report recipient |
| `OPS_WEBHOOK_URL` | Optional Slack/Discord webhook |
| `TURNSTILE_SECRET_KEY` | Bot protection |

Production capture fails closed unless `LEAD_REQUIRE_ORIGIN=1`,
`LEAD_REQUIRE_TURNSTILE=1`, a real `TURNSTILE_SECRET_KEY`, and a private
`IP_HASH_SALT` of at least 32 characters are configured. Do not reuse a public
brand string as the salt. The production build also requires the public
`TURNSTILE_SITE_KEY` and injects it only into the `_site` artifact; a missing
site key fails the build before the backend-only requirement can strand the
published form without a widget.

## Search Demand Observatory (optional API)

| Variable | Purpose |
|----------|---------|
| `GSC_SITE_URL` | e.g. `sc-domain:confenge.com.br` |
| `GSC_CREDENTIALS_JSON` | Service account JSON path |

Without GSC API credentials, use:

```bash
npm run revops:gsc:import
# or
python3 scripts/revops/search_demand_observatory.py import-csv --dir seo/gsc-YYYY-MM-DD
```

## Local lead CLI

```bash
LEAD_STORE_DIR=./.leads npm run revops:lead -- list
OPS_TOKEN=… OPS_BASE=https://confenge.com.br npm run revops:lead -- list --remote
```

## Nurture

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Required for real sends |
| `NURTURE_FROM_EMAIL` | From address |
| `OPS_TOKEN` | Daily tick + stop_commercial |
| `NURTURE_TOKEN_SECRET` | Required 32+ character secret used to seal unsubscribe bearer tokens at rest |
| `NURTURE_TOKEN_SECRET_PREVIOUS` | Previous 32+ character secret during a controlled rotation window |
| `NURTURE_ADVANCE_WITHOUT_RESEND` | Test only |
| `NURTURE_RATE_WINDOW_MS` | Subscribe abuse window (default 1 hour) |
| `NURTURE_RATE_MAX_IP` | Maximum subscribes per IP/window (default 5) |
| `NURTURE_RATE_MAX_FP` | Maximum subscribes per technical fingerprint/window (default 8) |
