# CONFENGE runtime authority

This file is both the human map and the machine-readable authority record.

```yaml
authority_version: 1
effective_at: 2026-08-14
decision: ADR-STRAT-002
public_canonical:
  domain: confenge.com.br
  repository: tjsasakifln/web-cfg
  host: Netlify
  deployment: GitHub main push -> Netlify build (npm run build:site)
  dns:
    apex_a: [75.2.60.5, 99.83.231.61]
    www_cname: confenge.netlify.app
  service_manager: Netlify
  env_authority: Netlify site production environment
  health:
    public: /.well-known/build-info.json
    authenticated_ops: /.netlify/functions/ops?action=health
  rollback: publish previous known-good Netlify deploy
  purpose: public acquisition, utility, lead capture and conversion
truth_data:
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

## Rules

- New public capabilities deploy only from `web-cfg` to the Netlify authority.
- Netcup hosts data/action planes because those services need to exist; it is not
  a destination for rebuilding SmartLic.
- `smartlic.tech` may point only to a minimal URL-specific migration/redirect
  bridge approved by web-cfg #62 and SmartLic #2115. DNS must not change before
  the target, reverse proxy, TLS, rollback and removal trigger are verified.
- Railway/Supabase unavailability accelerates retirement. It never creates a
  request for a token, usage-limit increase or product redeploy.
