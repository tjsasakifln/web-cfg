# Lighthouse report

## Method

- CLI: `npx lighthouse` + system Chrome (`/usr/bin/google-chrome`)
- Form factor: mobile
- Categories: performance, accessibility, best-practices, seo
- **Local:** static serve of `_site`
- **Production:** live `https://confenge.com.br` URLs (required by cutover)

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

- Commercial indexable pages on production meet Performance ≥90 and A11y/BP/SEO ≥95 (all scored 100).
- `/inteligencia/` SEO 69 is **expected**: hub is intentionally `noindex,follow` while `publish_count=0`.
- Field Core Web Vitals are not claimed.

## CSS size

- Before: 72878 bytes
- After: 55216 bytes
- Reduction: 24.2%

Evidence: `docs/lighthouse-runs/summary-production.json` (production), local runs under `docs/lighthouse-runs/*` (gitignored full JSON except summaries).
