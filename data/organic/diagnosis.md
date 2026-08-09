# Organic Inbound — Diagnóstico reproduzível

Gerado em: `2026-08-09T05:07:19Z`

## Stack

- **web_cfg**: static HTML + Netlify functions (lead/collect/ops/nurture)
- **build**: python scripts/pseo/build_site.py, editorial/build.py
- **extra_cli**: Postgres datalake → python -m scripts.pseo.export_web_cfg → data/pseo
- **organic_engine**: python -m scripts.organic (this module) + extra-cli scripts.organic

## Inventário

- Conteúdos HTML: 121
- Radar: 9 · Inteligência: 22 · Ferramentas: 4
- pSEO markets: 4 · problem_service: 5
- pSEO registry: 23 → {'reject': 18, 'noindex': 5}
- Editorial: 12 → {'INDEXABLE': 3, 'EDITORIAL_REVIEWED': 8, 'REJECTED': 1}
- Disposition biblioteca: {'noindex': 97, 'manter': 21, 'consolidar': 2}

## Baseline GSC

- Export: `seo/gsc-2026-07-30`
- Cliques: **10.0** · Impressões: **364.0**

## Clusters canônicos

- `reequilibrio` → pilar `/reequilibrio-obras-publicas/` · serviço `reequilibrio-obras-publicas`
- `aditivos` → pilar `/aditivos-obras-publicas/` · serviço `aditivos-obras-publicas`
- `medicoes-pagamentos` → pilar `/medicoes-glosas-obras-publicas/` · serviço `medicoes-glosas-obras-publicas`
- `atrasos-prorrogacao` → pilar `/atrasos-prorrogacao-obras-publicas/` · serviço `atrasos-prorrogacao-obras-publicas`
- `orcamento-bdi` → pilar `/auditoria-orcamento-licitacao/` · serviço `auditoria-orcamento-licitacao`
- `edital-proposta` → pilar `/diagnostico-pre-licitacao/` · serviço `bid-room-licitacoes-obras`
- `gestao-contratual` → pilar `/acompanhamento-contratos-obras/` · serviço `acompanhamento-contratos-obras`
- `inteligencia-mercado` → pilar `/inteligencia/` · serviço `metodologia-inteligencia`
- `lei-14133` → pilar `/lei-14133-obras/` · serviço `defesa-margem-contratos-publicos`

## Gargalos

- **[high]** gsc-baseline-thin: GSC export 2026-07-30: ~10 clicks / ~364 impressions — discovery still early.
- **[high]** conteudos-noindex-mass: Content library disposition: noindex=97, manter=21, consolidar=2.
- **[medium]** pseo-fail-closed: pSEO registry pages=23 statuses={'reject': 18, 'noindex': 5}; 0 publish without human+quality.
- **[medium]** editorial-human-gate: Editorial pages=12 statuses={'INDEXABLE': 3, 'EDITORIAL_REVIEWED': 8, 'REJECTED': 1}; INDEXABLE only after named human approve_cli.
- **[high]** ctr-striking-distance: sinapi-desonerado-nao-desonerado ~88 impressions / 0 clicks @ pos~7.75 — highest GSC improve lever.
- **[high]** organic-engine-gap: Prior state had pSEO export + GSC observatory but no unified SEO_OPPORTUNITIES scored by commercial value.

## Governança

- **pseo**: fail-closed; score advisory; human review for publish
- **editorial**: automated max EDITORIAL_REVIEWED; INDEXABLE via approve_cli named human
- **organic**: HTML generation ≠ index permission; Indexability Quality Gate mandatory
