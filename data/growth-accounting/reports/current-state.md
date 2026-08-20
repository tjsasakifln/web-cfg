# CONFENGE_COMPOUNDING_STANDARD/1.0 growth-accounting report

- as_of: `2026-08-20T12:00:00-03:00`
- timezone: `America/Sao_Paulo`
- cohort_days: `28`
- current_state: **INSUFFICIENT_EVIDENCE**
- exponential_gate_eligible: `False`
- primary_series: `non_branded_clicks_approved_routes`
- north_star: `inbound_qualified_pipeline_per_month_observed` status=`UNKNOWN` value=`None`
- cohorts_complete: `0` / available `0`
- labeled_synthetic: `False`

## Flags

- `source_families_separated`: `True`
- `unknown_preserved`: `True`
- `query_to_lead_join`: `False`
- `page_count_kpi`: `False`
- `scale_allowed_auto_emitted`: `False`
- `impression_is_not_click`: `True`
- `click_is_not_lead`: `True`
- `lead_is_not_qualified_pipeline`: `True`
- `contracted_is_not_received`: `True`

## Reason codes

- `GSC_SYNC_BLOCKED`
- `INSUFFICIENT_COHORTS`
- `INCOMPLETE_WINDOW`

## Components (always visible; no composite score)

### input

```json
{
  "approved_indexable_assets": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "corrections": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "defects": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "editorial_hours": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "refresh_cost": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "stale_rate": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "substantive_changes": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  }
}
```

### discovery

```json
{
  "commercial_clicks_snapshot": {
    "denominator": null,
    "reason": null,
    "status": "ZERO",
    "value": 0
  },
  "commercial_impressions_snapshot": {
    "denominator": null,
    "reason": null,
    "status": "OBSERVED",
    "value": 29
  },
  "ctr": {
    "denominator": null,
    "reason": "NO_CLOSED_COHORT",
    "status": "UNKNOWN",
    "value": null
  },
  "non_branded_clicks": {
    "denominator": null,
    "reason": null,
    "status": "OBSERVED",
    "value": 10
  },
  "non_branded_impressions": {
    "denominator": null,
    "reason": null,
    "status": "OBSERVED",
    "value": 373
  },
  "note": "Snapshot totals are not a closed 28-day cohort. Impression is not a click.",
  "query_coverage_count": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  }
}
```

### qualified_use

```json
{
  "content_to_service": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "contract": "#153 content→service IDs; observed events only",
  "engagement_admitted": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "method_evidence_opened": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "utility_completed": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  }
}
```

### commercial

```json
{
  "contracted_revenue_brl": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "lead_valid": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "lost": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "meeting": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "note": "Warmbly #88 outcomes remain UNKNOWN until observed. UNKNOWN never becomes zero.",
  "proposal": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "qualified": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "qualified_pipeline_brl": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "received_revenue_brl": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "won": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  }
}
```

### moat

```json
{
  "citations": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "download_embed_reuse": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "referring_domains": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  },
  "return_visits": {
    "denominator": null,
    "reason": "MISSING",
    "status": "UNKNOWN",
    "value": null
  }
}
```

### efficiency

```json
{
  "clicks_per_active_asset": {
    "denominator": null,
    "reason": "NO_CLOSED_COHORT",
    "status": "UNKNOWN",
    "value": null
  },
  "cost_per_click": {
    "denominator": null,
    "reason": "NO_CLOSED_COHORT",
    "status": "UNKNOWN",
    "value": null
  },
  "pipeline_per_mature_active_asset": {
    "denominator": null,
    "reason": "NO_CLOSED_COHORT",
    "status": "UNKNOWN",
    "value": null
  }
}
```

## Source families (separated)

Paid, branded, legacy_brand/SmartLic, outbound, partner and direct are never folded into the primary series.

- `organic_non_branded` clicks_status=`OBSERVED` in_primary=`True`
- `organic_branded` clicks_status=`UNKNOWN` in_primary=`False`
- `paid` clicks_status=`UNKNOWN` in_primary=`False`
- `legacy_brand` clicks_status=`UNKNOWN` in_primary=`False`
- `outbound` clicks_status=`UNKNOWN` in_primary=`False`
- `partner` clicks_status=`UNKNOWN` in_primary=`False`
- `direct` clicks_status=`UNKNOWN` in_primary=`False`

## Classification

- state: `INSUFFICIENT_EVIDENCE`
- scale_allowed: `False` (never auto-emitted)
- compounding.passed: `False`
- exponential.passed: `False`

SCALE_ALLOWED is a human decision recorded outside this generator.
This report does not make a public claim of crescimento exponencial.

input_hash: `sha256:8e89252bcd8a7451e7303c420ae4ca94092820ef9ddc20894a3595e6d0f71529`
report_hash: `sha256:8dfc857817d09bd8cfe28f73b097852a2a021a557e9bdfe322b3068e31418627`
