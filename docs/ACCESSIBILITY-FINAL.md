# Accessibility final

## axe-core page set

Runner: `npm run audit:axe` (puppeteer-core + axe-core against local static sources).

| Page | critical | serious | moderate | minor |
|------|----------|---------|----------|-------|
| / (includes formulário #contato) | 0 | 0 | 0 | 0 |
| /diretoria-b2g/ | 0 | 0 | 0 | 0 |
| /diagnostico-b2g-360/ | 0 | 0 | 0 | 0 |
| /bid-room-licitacoes-obras/ | 0 | 0 | 0 | 0 |
| /defesa-margem-contratos-publicos/ | 0 | 0 | 0 | 0 |
| /especialista/tiago-jun-sasaki/ | 0 | 0 | 0 | 0 |
| /inteligencia/ | 0 | 0 | 0 | 0 |
| /conteudos/ | 0 | 0 | 0 | 0 |
| /obrigado.html | 0 | 0 | 0 | 0 |
| /404.html | 0 | 0 | 0 | 0 |
| /inteligencia/cenarios/inconsistencia-orcamento-edital/ | 0 | 0 | 0 | 0 |
| /inteligencia/cenarios/referencia-sinapi-sicro-margem/ | 0 | 0 | 0 | 0 |
| /inteligencia/cenarios/aditivos-e-risco-de-margem/ | 0 | 0 | 0 | 0 |

**Totals:** critical=0, serious=0, moderate=0, minor=0

Evidence: `docs/uiux-evidence/axe-report.json`

## Floating contact landmark

- WhatsApp control wrapped in `<aside class="contact-float" aria-label="Contato rápido">`
- Accessible name on the link retained
- Hidden under 620px viewport; safe-area aware when visible
