# Organic demand-control report

- campaign: `CONFENGE-WEB-SEO-DEMAND-CONTROL-02`
- as_of (last complete day): `2026-08-18`
- timezone: `America/Sao_Paulo`
- source_kind: `credential_failure`
- freshness: `BLOCKED`
- ready_for_product_decisions: `false`
- live: `false`
- synthetic/fixture/historical: `False` / `False` / `False`
- truncated: `False`
- versions: `{"baseline": "organic_demand_control_baseline/v1", "brand_classification": "brand-class/v1", "window_policy": "complete-days/v1"}`

## Complete-day windows

- pulse 7: `2026-08-12` → `2026-08-18` coverage `ABSENT`
- trend 28: `2026-07-22` → `2026-08-18` coverage `ABSENT`
- prior 28: `2026-06-24` → `2026-07-21` coverage `ABSENT`
- context 90: `2026-05-21` → `2026-08-18` coverage `ABSENT`

Absence is ABSENT/UNKNOWN with null value — never numeric zero. Search Analytics top-row omission is not zero impressions.

## Brand split (returned set only)

### pulse_7
- brand: impressions `None` clicks `None`
- legacy_brand: impressions `None` clicks `None`
- non_brand: impressions `None` clicks `None`

### trend_28
- brand: impressions `None` clicks `None`
- legacy_brand: impressions `None` clicks `None`
- non_brand: impressions `None` clicks `None`

### prior_28
- brand: impressions `None` clicks `None`
- legacy_brand: impressions `None` clicks `None`
- non_brand: impressions `None` clicks `None`

### context_90
- brand: impressions `None` clicks `None`
- legacy_brand: impressions `None` clicks `None`
- non_brand: impressions `None` clicks `None`

## Authorities (uncollapsed)

- appearance / click: Search Analytics
- session / referral / engagement: analytics (UNKNOWN unless imported)
- lead / pipeline: Warmbly (UNKNOWN; query is never joined to a person)

## Technical defects

- `gsc_credentials_missing` (blocker): GSC_CREDENTIALS_JSON and/or GSC_SITE_URL unset or empty in the runtime env

## External blocker

- secret: `GSC_CREDENTIALS_JSON`
- required_env: `GSC_SITE_URL, GSC_CREDENTIALS_JSON, GSC_CLIENT_SECRETS_JSON, GSC_TOKEN_JSON`
- consequence: Search Analytics live loop cannot run. Historical CSV and fixtures stay non-live. Product decisions from GSC remain blocked.
- one external action: Set GitHub Actions secrets GSC_CREDENTIALS_JSON (Search Console service-account JSON) and GSC_SITE_URL=sc-domain:confenge.com.br (or https://confenge.com.br/). Grant that service account Search Console read on the property. Do not paste the JSON into the repository.

## Next-action queue (max 3, recommendation only)

- queue_length: `3`
- authorizes_html_edit: `false`

### 1. ctr_gap (observe_only)
- query/job/intent: desonerado e não desonerado / sinapi desonerado (informational)
- current landing: `https://confenge.com.br/conteudos/sinapi-desonerado-nao-desonerado/`
- intended landing: `https://confenge.com.br/conteudos/sinapi-desonerado-nao-desonerado/`
- evidence denominator: `None` status `ABSENT`
- hypothesis: Snippet rewrite already shipped; CTR on the named query moves vs 1.12% URL CTR after 14/28 complete days.
- impact: Qualified clicks on the only URL with enough historical impressions to falsify a snippet hypothesis. No revenue invented.
- cannibalization risk: `NOT_CANNIBALIZATION`
- minimal change: none_this_cycle_observe_only
- first test: Compare next complete 14d and 28d Search Analytics windows to seo/gsc-2026-08-09. Do not edit copy now.
- earliest_safe_action_at: `2026-09-16`
- owner: `tiago.sasaki`
- exclusion: `#126`
- kill/revert: Revert if the next two complete GSC windows show no lift on the named query while position is stable, or if a sibling URL cannibalizes the same non-brand intent.

### 2. observe_only (observe_only)
- query/job/intent: BOFU service-pillar commercial bridges (aditivos / reequilíbrio / auditoria)
- current landing: `https://confenge.com.br/aditivos-obras-publicas/`
- intended landing: `https://confenge.com.br/aditivos-obras-publicas/`
- evidence denominator: `None` status `ABSENT`
- hypothesis: Post-deploy BOFU bridges change qualified next-action rate without a new editorial URL.
- impact: Service-pillar discovery already in 14/28-day observation. No revenue invented.
- cannibalization risk: `NOT_CANNIBALIZATION`
- minimal change: none_this_cycle_observe_only
- first test: Keep measurement. Do not restage title/H1/CTA in this cycle.
- earliest_safe_action_at: `2026-09-16`
- owner: `tiago.sasaki`
- exclusion: `#128`
- kill/revert: Revert if the next two complete GSC windows show no lift on the named query while position is stable, or if a sibling URL cannibalizes the same non-brand intent.

### 3. observe_only (observe_only)
- query/job/intent: striking-distance noindex canary (chuva prorrogação)
- current landing: `https://confenge.com.br/conteudos/chuva-prorrogacao-prazo-obra-publica/`
- intended landing: `https://confenge.com.br/conteudos/chuva-prorrogacao-prazo-obra-publica/`
- evidence denominator: `None` status `ABSENT`
- hypothesis: Demand is a review signal, not an index warrant. approve_cli INDEXABLE remains the only robots flip.
- impact: Avoid premature indexation of a thin/generic answer. No revenue invented.
- cannibalization risk: `NOT_CANNIBALIZATION`
- minimal change: none_this_cycle_observe_only
- first test: Leave noindex in place until rewrite_complete and named human INDEXABLE.
- earliest_safe_action_at: `2026-09-16`
- owner: `tiago.sasaki`
- exclusion: `#127`
- kill/revert: Revert if the next two complete GSC windows show no lift on the named query while position is stable, or if a sibling URL cannibalizes the same non-brand intent.

## Coverage limits

- Search Analytics may return top rows only and is not an exhaustive total. Row counts describe the returned set, not the property universe.
- Individual queries are hashed in git-safe output and are never joined to a lead.

