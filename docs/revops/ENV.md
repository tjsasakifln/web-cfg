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
| `NURTURE_ADVANCE_WITHOUT_RESEND` | Test only |
| `NURTURE_RATE_WINDOW_MS` | Subscribe abuse window (default 1 hour) |
| `NURTURE_RATE_MAX_IP` | Maximum subscribes per IP/window (default 5) |
| `NURTURE_RATE_MAX_FP` | Maximum subscribes per technical fingerprint/window (default 8) |
