# pSEO production audit

- generated_at: `2026-08-24T14:26:04.063072+00:00`
- base_url: `https://confenge.com.br`
- web_cfg_sha: `dac27b11359a9476e4673e058add92a40b31990d`
- ok: **False**
- critical_defects: `5`
- crawlable_production: `0`

CRAWLABLE_PRODUCTION ≠ INDEXED_BY_GOOGLE. index,follow / sitemap / local build never mean 'indexado'. ok=true only when technical audit passes AND identities match live deploy.

## Critical

- `/inteligencia/mercados/:prod_html_mismatch`
- `/inteligencia/orgaos/:prod_html_mismatch`
- `/inteligencia/precos/:prod_html_mismatch`
- `/inteligencia/concorrencia/:prod_html_mismatch`
- `sitemap:production_sitemap_unavailable`

## Per-URL matrix

| path | role | HTTP | robots | canonical | sitemap | stage | defects |
|---|---|---:|---|---|---|---|---|
| `/inteligencia/` | hub | 200 | noindex,follow | https://confenge.com.br/inteligencia/ | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/mercados/` | hub | 200 | noindex,follow | https://confenge.com.br/inteligencia/mercados/ | no | DEPLOYED_PRODUCTION | prod_html_mismatch |
| `/inteligencia/orgaos/` | hub | 200 | noindex,follow | https://confenge.com.br/inteligencia/orgaos/ | no | DEPLOYED_PRODUCTION | prod_html_mismatch |
| `/inteligencia/precos/` | hub | 200 | noindex,follow | https://confenge.com.br/inteligencia/precos/ | no | DEPLOYED_PRODUCTION | prod_html_mismatch |
| `/inteligencia/concorrencia/` | hub | 200 | noindex,follow | https://confenge.com.br/inteligencia/concorrenci | no | DEPLOYED_PRODUCTION | prod_html_mismatch |
| `/inteligencia/cenarios/` | hub | 200 | noindex,follow | https://confenge.com.br/inteligencia/cenarios/ | no | DEPLOYED_PRODUCTION | — |
| `/radar/` | hub | 200 | noindex,follow | https://confenge.com.br/radar/ | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/mercados/pavimentacao-infraestrutura-viaria-sc/` | noindex_sample | 200 | noindex,follow | https://confenge.com.br/inteligencia/mercados/pa | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/mercados/pavimentacao-infraestrutura-viaria-pi/` | noindex_sample | 200 | noindex,follow | https://confenge.com.br/inteligencia/mercados/pa | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/mercados/edificacoes-publicas-mg/` | noindex_sample | 200 | noindex,follow | https://confenge.com.br/inteligencia/mercados/ed | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/mercados/edificacoes-publicas-rs/` | noindex_sample | 200 | noindex,follow | https://confenge.com.br/inteligencia/mercados/ed | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/orgaos/mrs-prefeitura-municipal-de-caxias-do-sul-rs/engenharia/` | noindex_sample | 200 | noindex,follow | https://confenge.com.br/inteligencia/orgaos/mrs- | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/cenarios/aditivos-e-risco-de-margem/` | noindex_sample | 200 | noindex,follow | https://confenge.com.br/inteligencia/cenarios/ad | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/cenarios/inconsistencia-orcamento-edital/` | noindex_sample | 200 | noindex,follow | https://confenge.com.br/inteligencia/cenarios/in | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/cenarios/referencia-sinapi-sicro-margem/` | noindex_sample | 200 | noindex,follow | https://confenge.com.br/inteligencia/cenarios/re | no | DEPLOYED_PRODUCTION | — |
| `/radar/edificacoes-publicas-pr/` | noindex_sample | 200 | noindex,follow | https://confenge.com.br/radar/edificacoes-public | no | DEPLOYED_PRODUCTION | — |
| `/inteligencia/precos/manutencao-predial-engenharia-rs-manutencao-predial/` | publish_candidate | 404 | noindex,nofollow |  | no | DEPLOYED_PRODUCTION | — |
| `/radar/pavimentacao-infraestrutura-viaria-sc/` | publish_candidate | 200 | noindex,follow | https://confenge.com.br/radar/pavimentacao-infra | no | DEPLOYED_PRODUCTION | — |

