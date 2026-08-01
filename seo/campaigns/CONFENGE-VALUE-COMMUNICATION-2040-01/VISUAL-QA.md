# Visual QA

## Method

Local static server (`python3 -m http.server 8765`) + Playwright/Chromium screenshots.

## Viewports

- 390 × 844
- 768 × 1024
- 1440 × 1000

## Pages

home, diretoria-b2g, diagnostico-b2g-360, bid-room, contract-defense, inteligencia, radar, pillar (diagnostico-pre-licitacao), obrigado, home form (mobile)

## Results

- 27 viewport screenshots captured
- H1 home: “Licitação vencida não paga a conta. Contrato rentável, sim.”
- Offer pages show correct titles
- Intelligence hub decision-first H1 verified
- Radar durable empty state (no “nenhum item nesta onda”)
- One overflow fixed: `/obrigado` mobile button row → stacked `.hero-actions`

Artifacts: `screenshots/*.png`, `visual-qa.json` in this campaign folder.
