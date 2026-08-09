# Organic Opportunity Engine — operação

## Comandos

```bash
npm run organic:diagnose   # data/organic/diagnosis.{json,md}
npm run organic:run        # data/organic/SEO_OPPORTUNITIES.json + demand-map.json + metrics
npm run organic:growth     # docs/ops/ORGANIC-GROWTH-REPORT.md + data/organic/growth-report.json
npm run organic:bridges    # editorial commercial bridges on indexable /conteudos/
npm run organic:sitemap-audit
npm run organic:cohort     # data/organic/pilot-cohort.json (dry)
python3 -m scripts.organic cohort --apply
npm run organic:test
```

Default GSC export: `seo/gsc-2026-08-09` (fallback `seo/gsc-2026-07-30`).
Override: `python3 -m scripts.organic run --gsc-dir seo/gsc-YYYY-MM-DD`

## SERP / CTR gap

Thresholds live in `data/organic/serp-ctr-config.json` (not magic numbers in code):

| Key | Role |
|-----|------|
| `min_impressions` | Floor for opportunity |
| `min_position_for_opportunity` / `max_position_for_opportunity` | Competitive band |
| `expected_ctr_by_position_band` | Planning expected CTR by position |
| `ctr_gap_ratio` | Flag when actual CTR < ratio × expected |
| `absolute_ctr_floor` | Absolute low-CTR flag with enough impressions |
| `priority_paths` | Baseline URLs always diagnosed when min impressions met |

Each opportunity includes structured SERP diagnosis (title, meta, H1, lead, canonical, robots, JSON-LD, breadcrumb, service_fit, issues).

## Content → service map

`data/organic/content-service-map.json` drives `content ↔ service ↔ tool` and editorial bridges.
Coverage metrics: `content_to_service_link_coverage`, `commercial_bridge_coverage`, `service_to_supporting_content_coverage`.

## Aggregation honesty

GSC chart vs pages vs devices tables may disagree (privacy/aggregation). Reports document the discrepancy; never force-reconcile.

## Extra-cli (produtor a partir do export)

```bash
python3 -m scripts.organic \
  --pseo-dir ../web-cfg/data/pseo \
  --gsc-dir ../web-cfg/seo/gsc-2026-07-30 \
  --out /tmp/SEO_OPPORTUNITIES.json
```

## Content Value Score (default)

| Componente | Peso |
|------------|-----:|
| commercial_intent | 25 |
| service_fit | 20 |
| data_moat | 20 |
| demand_evidence | 15 |
| topical_authority | 10 |
| freshness_trigger | 5 |
| competitive_opportunity | 5 |

Score aconselha ranking. **Indexability Quality Gate** manda.

## Não confundir

- `scripts.opportunity_intel` (extra-cli) = editais/comercial operacional  
- `scripts.organic` = oportunidades **editoriais/SEO** orientadas a receita inbound
