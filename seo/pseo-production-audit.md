# pSEO production audit

- generated_at: `2026-07-31T21:29:57.778373+00:00`
- base_url: `https://confenge.com.br`
- web_cfg_sha: `662ee7fca0c36942f3f2b23fc00dab1f31991e4b`
- ok: **False**
- critical_defects: `27`
- crawlable_production: `15`

CRAWLABLE_PRODUCTION ≠ INDEXED_BY_GOOGLE. index,follow / sitemap / local build never mean 'indexado'.

## Critical

- `/inteligencia/:prod_html_mismatch`
- `/inteligencia/mercados/:prod_html_mismatch`
- `/inteligencia/orgaos/:prod_html_mismatch`
- `/inteligencia/precos/:prod_html_mismatch`
- `/inteligencia/concorrencia/:prod_html_mismatch`
- `/inteligencia/cenarios/:prod_html_mismatch`
- `/radar/:prod_html_mismatch`
- `/radar/edificacoes-publicas-pr/:prod_html_mismatch`
- `/inteligencia/cenarios/inconsistencia-orcamento-edital/:prod_html_mismatch`
- `/inteligencia/cenarios/referencia-sinapi-sicro-margem/:prod_html_mismatch`
- `/inteligencia/cenarios/aditivos-e-risco-de-margem/:prod_html_mismatch`
- `/inteligencia/mercados/pavimentacao-infraestrutura-viaria-sc/:empty_or_soft404`
- `/inteligencia/mercados/pavimentacao-infraestrutura-viaria-sc/:http_4xx`
- `/inteligencia/mercados/pavimentacao-infraestrutura-viaria-pi/:empty_or_soft404`
- `/inteligencia/mercados/pavimentacao-infraestrutura-viaria-pi/:http_4xx`
- `/inteligencia/mercados/edificacoes-publicas-mg/:empty_or_soft404`
- `/inteligencia/mercados/edificacoes-publicas-mg/:http_4xx`
- `/inteligencia/mercados/edificacoes-publicas-rs/:empty_or_soft404`
- `/inteligencia/mercados/edificacoes-publicas-rs/:http_4xx`
- `/inteligencia/orgaos/prefeitura-municipal-de-caxias-do-sul-rs/engenharia/:empty_or_soft404`
- `/inteligencia/orgaos/prefeitura-municipal-de-caxias-do-sul-rs/engenharia/:http_4xx`
- `/inteligencia/orgaos/mrs-prefeitura-municipal-de-caxias-do-sul-rs/engenharia/:orphan_page`
- `/inteligencia/precos/manutencao-predial-engenharia-rs-manutencao-predial/:orphan_page`
- `/inteligencia/precos/manutencao-predial-engenharia-rs-manutencao-predial/:prod_html_mismatch`
- `/inteligencia/precos/pavimentacao-infraestrutura-viaria-pi-paralelepipedo/:orphan_page`
- `/inteligencia/precos/pavimentacao-infraestrutura-viaria-pi-paralelepipedo/:prod_html_mismatch`
- `/radar/pavimentacao-infraestrutura-viaria-sc/:prod_html_mismatch`

## Per-URL matrix

| path | role | HTTP | robots | canonical | sitemap | stage | defects |
|---|---|---:|---|---|---|---|---|
| `/inteligencia/` | hub | 200 | index,follow | https://confenge.com.br/inteligencia/ | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/inteligencia/mercados/` | hub | 200 | index,follow | https://confenge.com.br/inteligencia/mercados/ | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/inteligencia/orgaos/` | hub | 200 | index,follow | https://confenge.com.br/inteligencia/orgaos/ | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/inteligencia/precos/` | hub | 200 | index,follow | https://confenge.com.br/inteligencia/precos/ | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/inteligencia/concorrencia/` | hub | 200 | index,follow | https://confenge.com.br/inteligencia/concorrenci | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/inteligencia/cenarios/` | hub | 200 | index,follow | https://confenge.com.br/inteligencia/cenarios/ | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/radar/` | hub | 200 | index,follow | https://confenge.com.br/radar/ | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/radar/edificacoes-publicas-pr/` | publish | 200 | index,follow,max-image-preview:large,max | https://confenge.com.br/radar/edificacoes-public | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/inteligencia/cenarios/inconsistencia-orcamento-edital/` | publish | 200 | index,follow,max-image-preview:large,max | https://confenge.com.br/inteligencia/cenarios/in | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/inteligencia/cenarios/referencia-sinapi-sicro-margem/` | publish | 200 | index,follow,max-image-preview:large,max | https://confenge.com.br/inteligencia/cenarios/re | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/inteligencia/cenarios/aditivos-e-risco-de-margem/` | publish | 200 | index,follow,max-image-preview:large,max | https://confenge.com.br/inteligencia/cenarios/ad | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |
| `/inteligencia/mercados/pavimentacao-infraestrutura-viaria-sc/` | noindex_sample | 404 | noindex,nofollow |  | no | DEPLOYED_PRODUCTION | empty_or_soft404, http_4xx |
| `/inteligencia/mercados/pavimentacao-infraestrutura-viaria-pi/` | noindex_sample | 404 | noindex,nofollow |  | no | DEPLOYED_PRODUCTION | empty_or_soft404, http_4xx |
| `/inteligencia/mercados/edificacoes-publicas-mg/` | noindex_sample | 404 | noindex,nofollow |  | no | DEPLOYED_PRODUCTION | empty_or_soft404, http_4xx |
| `/inteligencia/mercados/edificacoes-publicas-rs/` | noindex_sample | 404 | noindex,nofollow |  | no | DEPLOYED_PRODUCTION | empty_or_soft404, http_4xx |
| `/inteligencia/orgaos/prefeitura-municipal-de-caxias-do-sul-rs/engenharia/` | noindex_sample | 404 | noindex,nofollow |  | no | DEPLOYED_PRODUCTION | empty_or_soft404, http_4xx |
| `/inteligencia/orgaos/mrs-prefeitura-municipal-de-caxias-do-sul-rs/engenharia/` | publish_candidate | 200 | index,follow,max-image-preview:large,max | https://confenge.com.br/inteligencia/orgaos/mrs- | yes | CRAWLABLE_PRODUCTION | orphan_page |
| `/inteligencia/precos/manutencao-predial-engenharia-rs-manutencao-predial/` | publish_candidate | 200 | index,follow,max-image-preview:large,max | https://confenge.com.br/inteligencia/precos/manu | yes | CRAWLABLE_PRODUCTION | orphan_page, prod_html_mismatch |
| `/inteligencia/precos/pavimentacao-infraestrutura-viaria-pi-paralelepipedo/` | publish_candidate | 200 | index,follow,max-image-preview:large,max | https://confenge.com.br/inteligencia/precos/pavi | yes | CRAWLABLE_PRODUCTION | orphan_page, prod_html_mismatch |
| `/radar/pavimentacao-infraestrutura-viaria-sc/` | publish_candidate | 200 | index,follow,max-image-preview:large,max | https://confenge.com.br/radar/pavimentacao-infra | yes | CRAWLABLE_PRODUCTION | prod_html_mismatch |

