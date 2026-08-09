# Organic Opportunity Engine — operação

## Comandos

```bash
npm run organic:diagnose   # data/organic/diagnosis.{json,md}
npm run organic:run        # data/organic/SEO_OPPORTUNITIES.json + demand-map.json
npm run organic:cohort     # data/organic/pilot-cohort.json (dry)
python3 -m scripts.organic cohort --apply
npm run organic:test
```

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
