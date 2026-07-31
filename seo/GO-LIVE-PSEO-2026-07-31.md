# Go-live pSEO — checklist (deploy Netlify pendente)

## Estado validado (2026-07-31)

| Item | Valor |
|------|--------|
| Repo site | `web-cfg` branch `main` |
| Repo export | `extra-cli` branch `feat/pseo-durable-export` @ `4dda5065` |
| Export | `python -m scripts.pseo.export_web_cfg` |
| dataset_hash | `65927f2034db594e3144de147309fa5fe8fb51bb35e5576a91b4f692b4c24d52` |
| Publish indexável | **8** (human APPROVED + quality) |
| noindex / reject | 7 / 5 |
| Gold classificador | n=83 P=1.0 FP=0 |

## Testes (últimos)

- [x] extra-cli `pytest tests/pseo` — 34 passed  
- [x] `npm run pseo:validate` — ok  
- [x] `npm run pseo:audit` — ok  
- [x] `npm test` (unit + analytics + attribution) — ok  
- [x] `npm run validate:seo` — VALIDATION_OK  
- [x] Sitemap inteligência só com publish; robots aponta `sitemap-inteligencia.xml`

## URLs que entrarão no índice após deploy

1. `/inteligencia/orgaos/mrs-prefeitura-municipal-de-caxias-do-sul-rs/engenharia/`
2. `/inteligencia/precos/manutencao-predial-engenharia-rs-manutencao-predial/`
3. `/inteligencia/precos/pavimentacao-infraestrutura-viaria-pi-paralelepipedo/`
4. `/radar/edificacoes-publicas-pr/`
5. `/radar/pavimentacao-infraestrutura-viaria-sc/`
6. `/inteligencia/cenarios/inconsistencia-orcamento-edital/`
7. `/inteligencia/cenarios/referencia-sinapi-sicro-margem/`
8. `/inteligencia/cenarios/aditivos-e-risco-de-margem/`

## Único passo pendente: deploy Netlify

O site publica a raiz do repositório (`netlify.toml` → `publish = "."`).

1. Confirmar que `main` em `github.com/tjsasakifln/web-cfg` contém o commit de go-live (push feito nesta preparação).
2. No Netlify: **Deploy site** / aguardar auto-deploy do branch `main`.
3. Smoke pós-deploy (produção):
   - abrir 1 preço + 1 radar + 1 cenário e checar `robots` index,follow + link oficial;
   - CTA → home#contato com hidden fields / WhatsApp;
   - `https://confenge.com.br/sitemap-inteligencia.xml` lista só as 8 URLs (+ hubs se aplicável).
4. (Opcional) GSC: solicitar indexação das 8 URLs após deploy estável.

## Extra-cli (não bloqueia Netlify)

Branch durable pushada como `feat/pseo-durable-export` para re-export futuro:

```bash
cd "/mnt/d/extra consultoria"
git checkout feat/pseo-durable-export
set -a && source .env && set +a
python3 -m scripts.pseo.export_web_cfg --out /mnt/d/webcfg/data/pseo --as-of $(date -I) --validate
```

Após re-export: `review.py set` por página + `npm run pseo:build` no web-cfg (APPROVED invalida se hash mudar).
