# Lighthouse report

## Method

- Local static `_site` via `python3 -m http.server`
- Mobile form factor
- CLI: `npx lighthouse` + system Chrome

## Local mobile scores

| Page | Perf | A11y | BP | SEO | LCP ms | CLS | TBT ms |
|------|-----:|-----:|---:|----:|-------:|----:|-------:|
| / | 100 | 100 | 100 | 100 | 1815 | 0 | 0 |
| /diretoria-b2g/ | 100 | 100 | 100 | 100 | 1813 | 0 | 22 |
| /diagnostico-b2g-360/ | 99 | 100 | 100 | 100 | 1967 | 0 | 0 |
| /bid-room-licitacoes-obras/ | 100 | 100 | 100 | 100 | 1812 | 0 | 0 |
| /defesa-margem-contratos-publicos/ | 99 | 100 | 100 | 100 | 1967 | 0 | 43 |
| /inteligencia/ | 100 | 100 | 100 | 69 | 1816 | 0 | 0 |
| /conteudos/ | 99 | 100 | 100 | 100 | 1887 | 0 | 0 |

### Notes

- Commercial static pages (home + four offers + conteudos hub): Performance ≥99, A11y/BP/SEO = 100 (or SEO 100).
- `/inteligencia/` SEO 69 is **expected**: hub is intentionally `noindex,follow` while `publish_count=0` (pSEO containment until human-approved seeds). Not a soft SEO defect on an indexable surface.
- Field Core Web Vitals are not claimed.

## Optimizations

- CSS 72878 → 55216 bytes (~24.2%) via dead legacy rule removal
- JS not increased
- axe landmark + contrast fixes

Evidence summary: `docs/lighthouse-runs/summary.json`
