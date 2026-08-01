# pSEO production audit

- generated_at: `2026-08-01T00:17:31.300822+00:00`
- base_url: `https://confenge.com.br`
- web_cfg_sha: `387db28b76fa062d34fed9086a3fc3e493fcffe1`
- ok: **False**
- critical_defects: `5`
- crawlable_production: `7`

CRAWLABLE_PRODUCTION ≠ INDEXED_BY_GOOGLE. index,follow / sitemap / local build never mean 'indexado'. ok=true only when technical audit passes AND identities match live deploy.

## Critical

- `/inteligencia/:prod_html_mismatch`
- `/radar/edificacoes-publicas-pr/:prod_html_mismatch`
- `/inteligencia/cenarios/inconsistencia-orcamento-edital/:prod_html_mismatch`
- `/inteligencia/cenarios/referencia-sinapi-sicro-margem/:prod_html_mismatch`
- `/inteligencia/cenarios/aditivos-e-risco-de-margem/:prod_html_mismatch`

## Per-URL matrix

| path | role | HTTP | robots | canonical | sitemap | stage | defects |
|---|---|---:|---|---|---|---|---|
| `/inteligencia/` | hub | 200 | index,follow | https://confenge.com.br/inteligencia/ | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/inteligencia/mercados/` | hub | 200 | noindex,follow | https://confenge.com.br/inteligencia/mercados/ | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/orgaos/` | hub | 200 | noindex,follow | https://confenge.com.br/inteligencia/orgaos/ | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/precos/` | hub | 200 | noindex,follow | https://confenge.com.br/inteligencia/precos/ | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/concorrencia/` | hub | 200 | noindex,follow | https://confenge.com.br/inteligencia/concorrenci | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/cenarios/` | hub | 200 | index,follow | https://confenge.com.br/inteligencia/cenarios/ | yes | CRAWLABLE_PRODUCTION | — |
| `/radar/` | hub | 200 | index,follow | https://confenge.com.br/radar/ | yes | CRAWLABLE_PRODUCTION | — |
| `/radar/edificacoes-publicas-pr/` | publish | 200 | index,follow,max-image-preview:large,max | https://confenge.com.br/radar/edificacoes-public | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/inteligencia/cenarios/inconsistencia-orcamento-edital/` | publish | 200 | index,follow,max-image-preview:large,max | https://confenge.com.br/inteligencia/cenarios/in | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/inteligencia/cenarios/referencia-sinapi-sicro-margem/` | publish | 200 | index,follow,max-image-preview:large,max | https://confenge.com.br/inteligencia/cenarios/re | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/inteligencia/cenarios/aditivos-e-risco-de-margem/` | publish | 200 | index,follow,max-image-preview:large,max | https://confenge.com.br/inteligencia/cenarios/ad | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/inteligencia/mercados/pavimentacao-infraestrutura-viaria-sc/` | noindex_sample | 200 | noindex,follow | https://confenge.com.br/inteligencia/mercados/pa | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/mercados/pavimentacao-infraestrutura-viaria-pi/` | noindex_sample | 200 | noindex,follow | https://confenge.com.br/inteligencia/mercados/pa | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/mercados/edificacoes-publicas-mg/` | noindex_sample | 200 | noindex,follow | https://confenge.com.br/inteligencia/mercados/ed | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/mercados/edificacoes-publicas-rs/` | noindex_sample | 200 | noindex,follow | https://confenge.com.br/inteligencia/mercados/ed | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/orgaos/prefeitura-municipal-de-caxias-do-sul-rs/engenharia/` | noindex_sample | 200 | noindex,follow | https://confenge.com.br/inteligencia/orgaos/pref | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/orgaos/mrs-prefeitura-municipal-de-caxias-do-sul-rs/engenharia/` | publish_candidate | 200 | noindex,follow | https://confenge.com.br/inteligencia/orgaos/pref | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/precos/manutencao-predial-engenharia-rs-manutencao-predial/` | publish_candidate | 200 | noindex,follow | https://confenge.com.br/inteligencia/precos/manu | no | DEPLOYED_PRODUCTION | — |
| `/radar/pavimentacao-infraestrutura-viaria-sc/` | publish_candidate | 200 | noindex,follow | https://confenge.com.br/radar/pavimentacao-infra | no | DEPLOYED_PRODUCTION | — |

