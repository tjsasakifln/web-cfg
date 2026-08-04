# Resultados de testes

## Unit / structure / lint (shipped entry points)
```
npm run test:tool-compute  → ALL tool compute unit tests passed
npm run test:tools         → ALL tools structure checks passed  
npm run test:tool-events   → ALL tool/organic activation checks passed
npm run lint:editorial-copy → em_dash hits: 0 / PASS
pytest scripts/editorial/tests/test_markdown_checklist.py → 5 passed
```

## E2E + a11y (puppeteer-core + axe + Chrome)
Script: `scripts/site/verify_tools_uiux_e2e.mjs` → `npm run test:tools-uiux-e2e`

Viewports: 1440, 1024, 768, 390, 360, 320  
Pilots: hub, limite, reequilibrio, matriz, aditivo

```
failed=0
overflows=0
axe critical=0 serious=0
flows: limite panels+wording, reeq blockers, matriz hypothesis, aditivo tri-state
keyboard: reach form controls
```

Evidence: `docs/uiux-tools-remediation/evidence/`
