# WEB-032 — Search Ads canary (sensor, no spend)

**Issue:** [#87](https://github.com/tjsasakifln/web-cfg/issues/87)  
**Decision:** `READY_BEHIND_HUMAN_GATE`  
**Primary metric:** `qualified_learning_or_pipeline` (never click/CTR)

This document is the human reading of `data/paid_search/canary.v1.json`.
It does not authorize a Google Ads account, budget or campaign.

## Family

`glosa_medicao` — Glosa / medição rejeitada em obra pública.

Scored from versioned GSC (`seo/gsc-2026-07-30`, `seo/gsc-2026-08-09`) plus
landing eligibility. Impression volume is recorded and is **not** in the score.
Paid demand is `UNKNOWN`. WEB-016 `demand-engine/1.0` is **ABSENT** on this
branch (PR #98). #84's paving-ticket page is not on `origin/main` and is
noindex/fixture; it is not the paid landing.

Evidence queries (organic, not paid):

| Query | Snapshot | Clicks | Impressions | Position |
|---|---|---:|---:|---:|
| glosa de medição obra pública | gsc-2026-08-09 | 1 | 8 | 4.0 |
| medição rejeitada obra pública | gsc-2026-08-09 | 1 | 5 | 5.5 |

## Hypothesis

A construtora with an active public-works contract that searches exact/phrase
terms in this family uses Diagnóstico de Defesa de Margem to identify the
contract and requests segunda leitura. The canary measures qualified learning
and pipeline. Organic GSC is not TAM and does not authorize spend.

## Targeting (proposed)

- **ICP:** technical director / partner of a B2G contractor with an active contract
- **Geo:** Brasil only
- **Device:** desktop only
- **Schedule:** Mon–Fri 08:00–19:00 America/Sao_Paulo (confirmation is HUMAN_REQUIRED)
- **Split:** non-brand. Brand term `confenge` is recorded and excluded.
- **Exclusions:** mobile/tablet, remarketing/retargeting, SmartLic, AVCB, SINAPI table, jobs, students

## Landing

`https://confenge.com.br/ferramentas/diagnostico-defesa-margem/`  
Issue #60 utility. `index,follow`, in sitemap, events + Warmbly inbound already
shipped. One landing. No new public URL.

## Conversion and attribution

Hierarchy: `qualified_engagement → valid_lead → qualified_lead → meeting_pipeline`.

Source `CONFENGE_WEB`. Final URL keep-list is the intersection with
`lead-core` ATTR_ALLOWLIST. No email, CNPJ, name, phone or free-text identifier
in params, ads or analytics.

## HUMAN_REQUIRED (unapproved)

owner, ads_account_id, budget_total_brl, budget_daily_brl, cpc_cap_brl,
cpa_cap_qualified_lead_brl, hard_stop_spend_brl.

## Kill (machine-checkable)

1. `cap_without_qualified_intent` — spend ≥ cap and zero qualified-intent signals
2. `misaligned_search_terms` — mismatch rate ≥ 0.40 with ≥ 5 observed terms
3. `low_lead_quality` — ≥ 3 valid leads and qualified-lead rate < 0.20
4. `tracking_does_not_reconcile` — `tracking_reconcile_ok` is false

## Commands

```bash
python3 -m scripts.paid_search preflight
python3 -m scripts.paid_search dry-run
python3 -m scripts.paid_search preflight --variant pii
```

Exit 2 on preflight is expected: go-live is blocked. Dry-run of the
representative package exits 0 and still reports `executable: false`,
`campaign_created: false`, `ads_mutate: false`.
