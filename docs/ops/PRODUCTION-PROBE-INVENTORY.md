# Production probe inventory

Every `package.json` script, `scripts/**` entry point and `.github/workflows`
step whose name matches `/prod|production|smoke|probe|canary|verify|proof|e2e/i`,
plus the scheduled RevOps scripts that touch production regardless of name.
`scripts/site/test_probe_inventory.mjs` (`npm run test:probe-inventory`) fails
when a matching `package.json` script is missing from this table. No entry may
be UNKNOWN: each row was classified by reading the script.

Classification:

- `READ_ONLY`: no request that changes state on a non-localhost host (GET/HEAD,
  a documented dry-run, a local server, a unit test with a mocked network, or
  no network at all).
- `SYNTHETIC_MUTATING_AUTHORIZED`: creates or dispatches a record on production
  that is tagged synthetic, and only under an explicit secret or flag.
- `REAL_MUTATING`: changes production state or sends to a person (lead queue
  drain, data ingest, email, host promotion).

Verified on 2026-09-15 against `main` after #682 (money-asset inspection is
GET-only). Dates in the notes are from `docs/ops/CONFENGE-INBOUND-RELEASE-CONVERGENCE-01.md`
and the RevOps run artifacts.

## Entry points

| Name | Path | Methods against non-localhost | Credentials | Classification |
| --- | --- | --- | --- | --- |
| `probe:money-asset` | `scripts/site/money_asset_prod_proof.mjs` | GET `/ferramentas/diagnostico-defesa-margem/`, GET `/sitemap.xml` on `https://confenge.com.br` only (any other base is BLOCKED before a request) | none; `OPS_TOKEN`/`LEAD_PROBE_SECRET` ignored when present | READ_ONLY |
| `probe:money-asset:prod` | `scripts/site/money_asset_prod_proof.mjs https://confenge.com.br` | same as above | none | READ_ONLY |
| `probe:lead` | `scripts/site/synthetic_lead_probe.mjs` (default base `https://confenge.com.br`) | POST `/.netlify/functions/lead` twice (create + idempotent replay), static `X-Forwarded-For: 198.51.100.27` (documentation range, not rotated) | `LEAD_PROBE_SECRET` (>= 32 chars) as `X-Confenge-Probe`; exits early without it | SYNTHETIC_MUTATING_AUTHORIZED |
| `probe:lead:prod` | `scripts/site/synthetic_lead_probe.mjs https://confenge.com.br` | same as above | `LEAD_PROBE_SECRET` | SYNTHETIC_MUTATING_AUTHORIZED |
| `revops:scheduled-daily` (workflow `revops-scheduled.yml` job `daily`, step "Daily scheduled run") | `scripts/revops/scheduled_daily.mjs` | GET public pages and `build-info.json`; POST `/.netlify/functions/lead` twice (unauthenticated synthetic lead, `X-Confenge-Probe: 1`); GET ops counters; POST `ops?action=drain_inbound`; POST `ops?action=produce_search_observation`; POST `ops?action=drain_search_observation` | `OPS_TOKEN`/`REVOPS_TOKEN` (Bearer) for ops; none for the lead leg | REAL_MUTATING |
| `revops:daily` | `scripts/revops/revenue_daily.mjs` | GET ops health/funnel/reports (Bearer); POST `/.netlify/functions/lead` twice (unauthenticated synthetic lead, `X-Confenge-Probe: 1`) | `OPS_TOKEN`/`REVOPS_TOKEN` for ops reads; none for the lead leg | SYNTHETIC_MUTATING_AUTHORIZED (not scheduled; the lead leg is unauthenticated and is rejected by production Turnstile since 2026-08-24) |
| `revops:inbound-proof` (workflow step "Read-only authenticated inbound counters proof") | `scripts/revops/inbound_counters_proof.mjs` | GET ops `health`, `inbound_handoff`, `audit_inbound_requeue`, `funnel`; POST `ops?action=requeue_inbound` with `dry_run: true` (server returns before any write, `inbound-handoff.cjs`) | `OPS_TOKEN` (Bearer) | READ_ONLY |
| workflow step "Nurture tick" | `scripts/revops/scheduled_nurture.mjs` | GET `nurture?action=health`; POST `nurture?action=tick` | `OPS_TOKEN` (Bearer) | REAL_MUTATING |
| workflow steps "GSC incremental sync", "Persist private GSC history and redacted insights", "Restore authenticated durable GSC history" | `scripts/revops/publish_gsc_insights.mjs` | GET `ops?action=gsc_insights` / private history (Bearer); POST `ops?action=gsc_insights_ingest`; POST `ops?action=gsc_insights_rollback` (explicit rollback command only); Google Search Console API reads | `OPS_TOKEN` (Bearer, >= 16 chars), `GSC_*` OAuth read-only scope | REAL_MUTATING |
| workflow step "Weekly real-only report + email" | `scripts/revops/scheduled_weekly.mjs` | GET `ops?action=weekly_report`; POST `ops?action=weekly_email` unless `WEEKLY_SEND_EMAIL=0` | `OPS_TOKEN` (Bearer) | REAL_MUTATING |
| `audit:margin-defense-dod` | `scripts/money_asset/audit_commercial_dod.mjs` | GET published surfaces, `sitemap.xml`, `robots.txt`, `build-info.json`, `snapshot.json` (8 s deadline each); the unsigned POST `{}` to the Warmbly inbound webhook runs only with `--live-inbound`; `--skip-live` makes no request | none | READ_ONLY by default; `--live-inbound` is an explicit rejection probe (see mutating table) |
| `canary:commercial-event` | `scripts/offers/commercial_event_canary.mjs` | GET Warmbly inbound `health`; POST a signed `offer_selected` commercial_event with `origin: canary` only when the HMAC secret is present and `CONFENGE_COMMERCIAL_EVENT_ENABLED=1` (held otherwise) | `CONFENGE_COMMERCIAL_EVENT_WEBHOOK_SECRET` or `CONFENGE_INBOUND_WEBHOOK_SECRET` | SYNTHETIC_MUTATING_AUTHORIZED (not scheduled) |
| `revops:gsc:smoke` | `scripts/revops/search_demand_observatory.py pull-api --days 7 --smoke` | Google Search Console Search Analytics API query (`webmasters.readonly` scope); no request to confenge.com.br | `GSC_CLIENT_SECRETS_JSON` + `GSC_TOKEN_JSON` or `GSC_CREDENTIALS_JSON` | READ_ONLY |
| `revops:gsc:verify` (workflow `market-answer-freshness.yml` step "Read authenticated durable consumer") | `scripts/revops/verify_gsc_freshness.mjs` | GET `ops?action=gsc_insights` | `OPS_TOKEN`/`REVOPS_TOKEN` (Bearer) | READ_ONLY |
| `pseo:audit:production` | `scripts/pseo/production_audit.py` | GET on `https://confenge.com.br` (Googlebot UA, manual redirects) | none | READ_ONLY |
| `pseo:verify:release` | `scripts/pseo/verify_release.py` | GET on the public origin | none | READ_ONLY |
| `test:production-cutover` | `scripts/site/test_production_cutover.mjs` | GET on `https://confenge.com.br` (or `--resolve` origin IP) | none | READ_ONLY |
| `test:production-cutover:local` | `scripts/site/test_production_cutover.mjs http://127.0.0.1:8765` | localhost only | none | READ_ONLY |
| `test:redirects:prod` | `scripts/site/test_redirects.mjs https://confenge.com.br` | GET with `redirect: "manual"` | none | READ_ONLY |
| `test:entity-gone:prod` | `scripts/site/test_entity_gone_prod.mjs https://confenge.com.br` | GET pages, `robots.txt`, `/conteudos/` | none | READ_ONLY |
| `test:prod-build-info` | `scripts/site/test_prod_build_info.mjs` | GET `/.well-known/build-info.json`, `/.well-known/pseo-build.json` | none | READ_ONLY |
| `verify:promised-public-resources` | `scripts/site/verify_promised_public_resources.mjs` | none by default (artifact/tarball modes); GET/HEAD only when `--mode http --http-base` is given | none | READ_ONLY |
| `test:money-asset-canary-e2e` | `scripts/site/test_money_asset_canary_e2e.mjs` | none (puppeteer against `127.0.0.1:8766` and a local downstream webhook; `RESEND_API_KEY`/`TURNSTILE_SECRET_KEY` deleted from env) | none | READ_ONLY |
| `test:xray-turnstile-e2e` | `scripts/site/test_xray_turnstile_e2e.mjs` | none (local server; Turnstile script request intercepted) | none | READ_ONLY |
| `test:tools-uiux-e2e` | `scripts/site/verify_tools_uiux_e2e.mjs` | none (local server + puppeteer) | none | READ_ONLY |
| `design:probe` | `scripts/site/design_direction_probe.mjs` | none (local server + puppeteer) | none | READ_ONLY |
| `test:asaas-production` | `tests/offers/asaas-production/test_asaas_production.mjs` | none (`globalThis.fetch` replaced by a recorder; fixture keys) | none | READ_ONLY |
| `test:lead-store-production` | `scripts/site/test_lead_store_production_profile.mjs`, `scripts/storage/test_host_owned_storage.mjs` | none (unit; fixture env, `store.example.test` never reached) | none | READ_ONLY |
| `test:real-proof-registry` | `tests/commercial/test_real_proof_registry.mjs` | none | none | READ_ONLY |
| `test:probe-inventory` | `scripts/site/test_probe_inventory.mjs` | none (reads `package.json` and this file) | none | READ_ONLY |
| `test:ativacao-01` | `tests/ativacao_20260912/01/*.mjs` | none (`--import` fetch mocks around `money_asset_prod_proof.mjs` and `audit_commercial_dod.mjs`) | none | READ_ONLY |
| `generate:private-project-proof` | `scripts/demonstrative/private_project/generate.py` | none (local files) | none | READ_ONLY |
| `compose:purchase-proof` | `scripts/campaigns/pos-inb-20260911/02/compose_purchase_proof.mjs` | none (local files) | none | READ_ONLY |
| `compose:proof-entrances` | `scripts/campaigns/orc-b2b-20260913/compose_proof_entrances.mjs` | none (local files) | none | READ_ONLY |
| (no script) | `scripts/campaigns/pos-inb-20260911/01/netcup_proof_gate.mjs` | none; consult-only, `--consult-live` is disabled in campaign 01, `--execute` is always blocked, `post_authorized` is always `false` | reads `OPS_TOKEN` presence only | READ_ONLY |
| (no script) | `scripts/site/inbound_capture_surface_probe.mjs` | GET `sitemap.xml`, pages, home and the form script (`redirect: "error"`) | none | READ_ONLY |
| (no script) | `scripts/discovery/probe.py` | GET/HEAD only, no search queries | none | READ_ONLY |
| (no script; workflow `site-ci.yml` job `execution_evidence`) | `scripts/site/verify_required_execution.py` | GET GitHub Actions API for one run | `GITHUB_TOKEN` | READ_ONLY |
| (no script; workflow `netcup-release.yml` step "Verify the served runtime family and its applicable behavior") | `scripts/site/runtime_lighthouse_acceptance.mjs` | GET on the public origin (identity, overlay, withdrawal probe) plus Lighthouse page loads | none | READ_ONLY |
| (no script) | `scripts/editorial/verify_chuva_ui.mjs`, `scripts/site/verify_wave1_checklist_ui.mjs`, `scripts/site/verify_wave1_title_wrap.mjs`, `scripts/site/verify_wave1_ux_polish.mjs` | none (local server + puppeteer) | none | READ_ONLY |
| (no script) | `scripts/pseo/reproducible.py`, `scripts/site/permissioned_proof.py`, `scripts/commercial/real_proof_registry.mjs`, `scripts/commercial/render_contract_defense_products.mjs`, `scripts/commercial/render_licitacao_products.mjs`, `scripts/revops/inbound_proof_contract.mjs` | none (local generators, hashers and contracts) | none | READ_ONLY |
| (no script) | `scripts/offers/providers/asaas-production.cjs`, `scripts/offers/providers/config-production.cjs` | library, not an entry point: POST `https://api.asaas.com/v3` checkout sessions when the checkout function runs in production | `ASAAS_PRODUCTION_API_KEY`, `ASAAS_PRODUCTION_WEBHOOK_TOKEN` (runtime env, never in CI) | REAL_MUTATING (runtime provider; see mutating table) |
| (no script) | `scripts/site/test_*.mjs`, `scripts/site/test_*.py`, `scripts/pseo/tests/*.py`, `scripts/contract_analysis/tests/test_canary.py`, `scripts/legacy_equity/tests/test_target_probe.py`, `scripts/revops/test_gsc_freshness_probe.mjs`, `scripts/site/fixtures/permissioned_proof/*`, `scripts/contract_analysis/fixtures/canary.v1.json` | none (unit tests and fixtures) | none | READ_ONLY |
| workflow `pseo.yml` step "HTTP smoke on _site artifact" | inline Python server on `127.0.0.1` | localhost only | none | READ_ONLY |
| workflow `market-answer-freshness.yml` step "Prove fixture polarity" | `scripts/revops/test_gsc_freshness_probe.mjs` | none | none | READ_ONLY |
| workflow `netcup-release.yml` step "Upload, stage, and verify without changing current" | `deploy/netcup/*` over SSH | SSH to the Netcup host: stages a release directory, verifies it, leaves `current` untouched | `NETCUP_SSH_PRIVATE_KEY`, `NETCUP_DEPLOY_*` | REAL_MUTATING (host filesystem; see mutating table) |
| workflow `netcup-release.yml` steps "Confirm the public verification uses the qualified toolchain", "Confirm the candidate carries the release identity", "Measure the candidate with the release verifier" | `scripts/site/run_lighthouse.mjs` on a local server | localhost only | none | READ_ONLY |

## Mutating entries

| Entry | Purpose | Authorization | Idempotency key | Cleanup | Synthetic marker | Zero-outbound / zero-SMTP guarantee | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `probe:lead[:prod]` | Prove capture + idempotent replay + Warmbly transport of an authenticated synthetic lead | `LEAD_PROBE_SECRET` (>= 32 chars) sent as `X-Confenge-Probe`; the server only tags a probe when it matches `LEAD_PROBE_SECRET` | `Idempotency-Key: synthetic-probe-<stamp>` (body `idempotency_key` too); second POST must return `idempotent: true` | none required: record persists as `record_kind=synthetic`, excluded from commercial counters | `record_kind: synthetic`, `test_mode: true`, nome `SYNTHETIC-PROBE`, `example.com` e-mail | Transported to Warmbly synchronously as `record_kind=synthetic`; Resend/notify skip `non_real`; no WhatsApp/e-mail to a person | web-cfg inbound (docs/ops/WARMBLY-INBOUND.md) |
| `scheduled_daily.mjs` lead leg | Daily isolated capture probe | none (`X-Confenge-Probe: 1` is not a secret); rejected by production Turnstile since 2026-08-24, so the daily job fails on this leg | `Idempotency-Key: scheduled-probe-<stamp>` | none; nothing persists while Turnstile rejects it | `record_kind: synthetic`, `test_mode: true`, `probe+daily-<stamp>@example.com` | none beyond the server's `non_real` skip; the unauthenticated leg should be retired or moved to `LEAD_PROBE_SECRET` | RevOps schedule |
| `scheduled_daily.mjs` `drain_inbound` leg | Deliver pending real inbound handoffs (limit 20) to Warmbly | Bearer `OPS_TOKEN` | per-record `lead_id`/inbound idempotency in `inbound-handoff.cjs` | n/a (queue drain) | none: real records | Delivers to Warmbly only; no e-mail | RevOps schedule / inbound owner |
| `scheduled_daily.mjs` search-observation legs | Produce and drain the search-observation queue | Bearer `OPS_TOKEN` | server-side queue ids | n/a | none | Warmbly transport only | RevOps schedule |
| `revenue_daily.mjs` lead leg | Manual daily health + synthetic probe (not scheduled) | none (`X-Confenge-Probe: 1`); rejected by Turnstile since 2026-08-24 | `Idempotency-Key: probe-daily-<stamp>` | none; nothing persists while rejected | `record_kind: synthetic`, `test_mode: true`, `example.com` | none beyond the server's `non_real` skip | RevOps |
| `publish_gsc_insights.mjs` | Ingest GSC history + redacted insights into the durable ops store | Bearer `OPS_TOKEN` (>= 16 chars), https base required | `history.state_sha256` echoed back by the server; rollback by `snapshot_sha256` | `gsc_insights_rollback` with an explicit reason | none: real data | No e-mail; data-only ingest | RevOps GSC |
| `scheduled_weekly.mjs` | Weekly real-only report and its e-mail | Bearer `OPS_TOKEN`; `WEEKLY_SEND_EMAIL=0` disables the send | none (one send per run; 502 observed on 2026-09-14) | none | none: real report | Sends e-mail via Resend to `OPS_REPORT_EMAIL` when configured; 503 when not | RevOps schedule |
| `scheduled_nurture.mjs` | Process due nurture sends (double opt-in and suppression server-side) | Bearer `OPS_TOKEN` | server-side per-send state | server-side suppression / `stop_commercial` | none: real recipients | Sends e-mail (Resend) when due; none when nothing is due | Nurture owner |
| `audit_commercial_dod.mjs --live-inbound` | Prove the Warmbly inbound rejects an unsigned empty POST | explicit `--live-inbound` flag; default runs make no POST (`tests/ativacao_20260912/01/test_audit_commercial_dod_inbound_opt_in.mjs`) | none (empty body, expected 401/403, creates no record) | none needed | unsigned `{}` body, audit UA | Response body discarded; only the status is stored; no e-mail | money-asset DoD |
| `canary:commercial-event` | Signed `offer_selected` canary against the Warmbly commercial_event capability | HMAC secret present and `CONFENGE_COMMERCIAL_EVENT_ENABLED=1`; held otherwise | `event_id: ce_canary_<timestamp>` | outbox record stays as canary | `origin: canary` | Never emits `payment_received`; no e-mail | offers |
| Asaas production provider | Create real checkout sessions for authorized offers when a visitor pays | runtime `ASAAS_MODE=production` + `ASAAS_PRODUCTION_API_KEY`; checkout authorization is a separate state (AGENTS.md) | provider `externalReference` per checkout | webhook-driven | none: real payment | Asaas sends its own receipts; this repo sends none | offers/checkout |
| netcup-release stage / promote | Stage and promote a release on the host | pinned SSH secrets + post-ADR cutover authorization | release SHA directory | `rollback <SHA>` | n/a | Host filesystem only; no e-mail | release (deploy/netcup/README.md) |

## Notes

- `X-Forwarded-For` rotation (`203.0.113.<random>`) was removed from
  `scheduled_daily.mjs` and `revenue_daily.mjs`; the only remaining header is
  the fixed documentation-range value in `synthetic_lead_probe.mjs`, which
  cannot evade rate limits.
- `probe:money-asset[:prod]` lost its POST legs in #682; `tests/ativacao_20260912/01`
  fails the build if any non-GET, authorized or `/functions` request appears.
