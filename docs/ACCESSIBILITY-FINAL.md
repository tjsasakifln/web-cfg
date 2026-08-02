# Accessibility final

## axe-core (commercial + chrome set)

Runner: `npm run audit:axe` (puppeteer-core + axe-core against local static sources).

| Page | critical | serious | moderate | minor |
|------|----------|---------|----------|-------|
| / | 0 | 0 | 0 | 0 |
| /diretoria-b2g/ | 0 | 0 | 0 | 0 |
| /diagnostico-b2g-360/ | 0 | 0 | 0 | 0 |
| /bid-room-licitacoes-obras/ | 0 | 0 | 0 | 0 |
| /defesa-margem-contratos-publicos/ | 0 | 0 | 0 | 0 |
| /especialista/tiago-jun-sasaki/ | 0 | 0 | 0 | 0 |
| /inteligencia/ | 0 | 0 | 0 | 0 |
| /conteudos/ | 0 | 0 | 0 | 0 |
| /obrigado.html | 0 | 0 | 0 | 0 |
| /404.html | 0 | 0 | 0 | 0 |

**Totals:** critical=0, serious=0, moderate=0, minor=0

Evidence: `docs/uiux-evidence/axe-report.json`

## Floating contact landmark

- WhatsApp control wrapped in `<aside class="contact-float" aria-label="Contato rápido">`
- Accessible name on the link: "Falar com a CONFENGE pelo WhatsApp"
- Keyboard reachable (anchor)
- Hidden under 620px viewport (does not compete with primary CTA); safe-area aware positioning when visible
- pSEO shell template updated in `scripts/pseo/html_shell.py`

## Contrast remediation

Darkened muted text tokens used on light surfaces (`.related-card small`, `.cluster-card small`, breadcrumbs, meta) from ~#7c8996-range to ≥ #3d4d60 / #4a5a6a for WCAG AA.

## Manual checks remaining after deploy

- Zoom 200%/400% on production home
- Escape closes mobile menu + focus return (existing script.js behavior)
- Form validation messages with screen reader (status live region present)
