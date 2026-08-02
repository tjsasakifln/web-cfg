# Lighthouse report

## Method

- CLI: `npx lighthouse` + system Chrome
- Form factor: mobile
- **Production URLs** on `https://confenge.com.br` (required)
- Local `_site` also exercised earlier in campaign

## Production mobile scores

| Page | Perf | A11y | BP | SEO | LCP ms | CLS | TBT ms |
|------|-----:|-----:|---:|----:|-------:|----:|-------:|
| https://confenge.com.br/ | 100 | 100 | 100 | 100 | 1060 | 0 | 0 |
| https://confenge.com.br/diretoria-b2g/ | 100 | 100 | 100 | 100 | 1360 | 0 | 0 |
| https://confenge.com.br/diagnostico-b2g-360/ | 100 | 100 | 100 | 100 | 1355 | 0 | 0 |
| https://confenge.com.br/bid-room-licitacoes-obras/ | 100 | 100 | 100 | 100 | 1353 | 0 | 0 |
| https://confenge.com.br/defesa-margem-contratos-publicos/ | 100 | 100 | 100 | 100 | 1360 | 0 | 0 |
| https://confenge.com.br/inteligencia/ | 100 | 100 | 100 | 69 | 1368 | 0 | 0 |
| https://confenge.com.br/conteudos/ | 100 | 100 | 100 | 100 | 1204 | 0 | 0 |

### Notes

- Commercial indexable pages: Perf/A11y/BP/SEO all 100 on production.
- `/inteligencia/` SEO 69 expected (intentional `noindex,follow` while publish_count=0).
- Field CWV not claimed.

## CSS size

- Before: 72878 bytes
- After: 55216 bytes
- Reduction: 24.2%

Evidence: `docs/lighthouse-runs/summary-production.json`
