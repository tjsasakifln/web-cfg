# CONFENGE runtime authority

This file is both the human map and the machine-readable authority record.
Operators and `scripts/site/runtime_authority.mjs` parse the YAML block below.
There is one public production plane. Stage and legacy are named separately so
they cannot be mistaken for it.

Observed 2026-08-29: `https://confenge.com.br/` is proxied through Cloudflare
and serves `Server: cloudflare` while preserving
`X-Confenge-Host-Architecture-Version: confenge-nginx-node/v2` from the Netcup
origin. `/.well-known/build-info.json` must match `origin/main`. Public apex and
`www` A answers are dynamic Cloudflare anycast addresses and must never expose
the authoritative origin address `159.195.18.88`. Cloudflare is the public edge;
the Netcup nginx/Node runtime remains the one production origin.

```yaml
authority_version: 2
effective_at: 2026-08-29
decision: ADR-STRAT-002
compare_gate: scripts/site/runtime_authority.mjs
public_canonical:
  plane: production
  domain: confenge.com.br
  repository: tjsasakifln/web-cfg
  host: Cloudflare proxy in front of Netcup VPS nginx reverse proxy plus Node 22 portable runtime
  host_kind: nginx-netcup
  host_architecture_version: confenge-nginx-node/v2
  expected_server_header: cloudflare
  expected_environment: production
  expected_profile: netcup-production
  deployment: every successful GitHub push to protected main runs site-ci, packages the exact public artifact, stages and verifies it on Netcup, then atomically promotes that immutable SHA under /opt/confenge-web/releases; SHA-pinned manual package_only, stage_verify and promote remain available for recovery
  dns:
    proxy: cloudflare
    nameservers:
      - grannbo.ns.cloudflare.com
      - kai.ns.cloudflare.com
    origin_apex_a:
      - 159.195.18.88
    apex_aaaa: []
    www_cname: confenge.com.br
  process: systemd unit confenge-web-runtime.service bound to 127.0.0.1:18100; public vhost nginx confenge.com.br
  service_manager: systemd and nginx
  env_authority: root-owned /etc/confenge-web/runtime.env mode 0640
  storage:
    backend: filesystem
    root: /var/lib/confenge-web
    contract_version: confenge-host-file-record/v1
    survives_release_rollback: true
    gsc_private_snapshot:
      namespace: ops-system
      snapshot_schema: confenge-private-gsc-snapshot/v1
      pointer_schema: confenge-private-gsc-pointer/v1
      consumer: authenticated ops gsc_insights
      freshness_probe: market-answer-freshness.yml read-only GET
      packaged_fallback_can_be_current: false
  scheduler:
    http_process: systemd confenge-web-runtime.service
    revops: GitHub Actions workflow revops-scheduled.yml against live HTTPS
    search_observation_host_timer: packaged disabled until /opt/confenge-web/shared/schedule-cutover.json
    storage_retention_host_timer: packaged disabled until the current full SHA and jobs.storage-retention=true are authorized in /opt/confenge-web/shared/schedule-cutover.json
    netlify_scheduled_functions: leftover declaration in netlify.toml; not the public production plane
  health:
    public_identity: /.well-known/build-info.json
    runtime_identity: /.well-known/runtime-info.json
    live: /healthz
    ready: /ready
    ops: /.netlify/functions/ops?action=health
    ops_alias: /api/web/ops?action=health
  rollback: /opt/confenge-web/bin/rollback FULL_SHA
  release_root: /opt/confenge-web
  current_symlink: /opt/confenge-web/current
  purpose: public acquisition, utility, lead capture and conversion
stage:
  plane: stage
  host: same Netcup VPS
  github_environment: netcup-stage
  traffic: none
  path: /opt/confenge-web/releases/FULL_SHA after stage-release
  loopback_origin: http://127.0.0.1:8088
  dns: none
  purpose: verify a candidate without swapping current
legacy:
  plane: legacy
  host: Netlify leftover
  public_canonical: false
  leftover_hostname: confenge.netlify.app
  functions_source: netlify/functions
  blobs: netlify-blobs adapter is not the production store
  dns: not authoritative for confenge.com.br
  purpose: leftover preview hostname and source-compatible handler tree executed by the portable runtime
truth_data:
  plane: extra-cli
  repository: tjsasakifln/extra-cli
  host: Netcup 159.195.18.88 (ssh ec-prod)
  deployment: versioned release under /opt/extra-consultoria
  dns: none required for public visitors
  service_manager: systemd timers/services
  env_authority: root-owned systemd EnvironmentFile on ec-prod
  health: python3 -m scripts.ops.health
  rollback: previous approved release SHA plus database-safe migration procedure
  purpose: canonical facts, identity, provenance and commercial intelligence
commercial_action:
  plane: warmbly
  repository: tjsasakifln/warmbly
  host: Netcup 159.195.18.88 (CONFENGE execution plane)
  deployment: deploy/confenge-vps Docker Compose overlay
  dns: private/loopback; no SmartLic public domain
  service_manager: Docker daemon and Compose restart policies
  env_authority: deploy/confenge-vps/.env on host, mode 0600
  health: deploy/confenge-vps/status.sh and loopback service health endpoints
  rollback: pinned images/git SHA plus deploy/confenge-vps restore procedure
  purpose: approved founder action, delivery receipts and observed outcomes
smartlic:
  repository: tjsasakifln/SmartLic
  role: legacy migration source only
  permanent_runtime: none
  product_deployment: forbidden
  bridge_owner:
    - https://github.com/tjsasakifln/web-cfg/issues/62
    - https://github.com/tjsasakifln/SmartLic/issues/2115
  bridge_status: target not yet authorized
  netcup_rebuild_authorized: false
  observed_dns:
    smartlic.tech: 69.46.46.88
    api.smartlic.tech: 1us7c4ob.up.railway.app
  observed_http: Railway edge fallback 404; evidence, not authority
  netcup_cleanup:
    unit_state: not-found
    quarantined_units: /root/retired-smartlic-units-20260814
    retained_for_sunset_review: [/opt/smartlic, /etc/smartlic]
ambiguous_repositories:
  cfgweb: archived; empty legacy repository
  site-confenge: archived; superseded public-site source
  dev-br: independent development tooling; never a CONFENGE public/runtime destination
```

## Planes

| Plane | What it is | What it is not |
|---|---|---|
| Production | `confenge.com.br` through the Cloudflare edge to this VPS: nginx, portable Node 22, host-owned filesystem | Netlify CDN, Netlify Functions hosting, Netlify Blobs |
| Stage | SHA unpacked under `releases/` and checked on loopback `127.0.0.1:8088` | Public DNS, `current` symlink, visitor traffic |
| Legacy | `netlify/functions` source, portable URL aliases, leftover `confenge.netlify.app` | Canonical public host, production env, production rollback |

## Rules

- New public capabilities deploy only from `web-cfg` onto the production plane
  recorded above.
- Cloudflare proxying is part of the production ingress contract, not a second
  runtime plane. The public A answers may change, but neither apex nor `www` may
  expose an address listed under `origin_apex_a`.
- Do not instruct Netlify UI publish, Netlify env, or Netlify rollback as the
  production path.
- Private GSC state is authoritative only after a versioned snapshot and its
  pointer have been durably read back from `/var/lib/confenge-web`. Packaged JSON,
  an Actions workspace and an Actions artifact can never satisfy `CURRENT`.
- Netcup hosts data/action planes because those services need to exist; it is not
  a destination for rebuilding SmartLic.
- `smartlic.tech` may point only to a minimal URL-specific migration/redirect
  bridge approved by web-cfg #62 and SmartLic #2115. DNS must not change before
  the target, reverse proxy, TLS, rollback and removal trigger are verified.
- Railway/Supabase unavailability accelerates retirement. It never creates a
  request for a token, usage-limit increase or product redeploy.

## Operator path

Release, atomicity, verification, rollback, lead recovery and the authorized
drill checklist live in [`docs/ops/ROLLBACK.md`](../ops/ROLLBACK.md). Host
packaging lives in [`deploy/netcup/README.md`](../../deploy/netcup/README.md).
Compare live or fixture observations with:

```sh
npm run test:runtime-authority
node scripts/site/runtime_authority.mjs --fixture matching
node scripts/site/runtime_authority.mjs --fixture divergent-host
```

Live compare (read-only; SHA versus `origin/main`, never versus an unpublished
PR HEAD):

```sh
node scripts/site/runtime_authority.mjs --live
```
