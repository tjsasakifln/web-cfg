# Resultados de testes (main @ 902f1884)

## Unit / structure / lint (shipped entry points)
```
python3 scripts/site/lint_editorial_copy.py  → em_dash hits: 0 / PASS
node scripts/site/test_tool_compute.mjs      → ALL passed
  (BRL, 25/50, independent balances, reequilibrio blockers+N/A,
   matrix concurrent/no-evidence, pack/unpack/TTL/schema, report text,
   aditivo readiness)
node scripts/site/test_tools_structure.mjs   → ALL passed
node scripts/site/test_tool_events.mjs       → ALL passed
```

## Editorial
```
interaction_type explicit on all 12 data/editorial/pages/*.json
resolve_interaction_type matches; guia-docs-reequilibrio = operational_guide
editorial:build ok; checklist-aditivo retains tri-state after regen
```

## E2E + a11y (puppeteer-core + axe + Chrome)
```
npm run test:tools-uiux-e2e  /  node scripts/site/verify_tools_uiux_e2e.mjs
Viewports: 1440, 1024, 768, 390, 360, 320
Pilots: hub, limite, reequilibrio, matriz, aditivo

failed=0
overflows=0
axe critical=0 serious=0
flows:
  - limite panels + wording + invalid BRL kept + no silent zero
  - limite persist→reload + erase storage/UI + copy/download + print
  - reeq blockers + fieldsets + persist
  - matriz hypothesis + dur/conc/obs fields + full event result + persist
  - aditivo tri-state + result
  - keyboard reach form
```

## Evidence paths
- `docs/uiux-tools-remediation/evidence/e2e-report.json`
- `docs/uiux-tools-remediation/evidence/axe-report.json`
- `docs/uiux-tools-remediation/evidence/e2e-report-skeptic-round.json`
- `docs/uiux-tools-remediation/evidence/screenshots/after/` (34+)
- `docs/uiux-tools-remediation/evidence/screenshots/before/README.md` (honest unavailability)
- `docs/editorial/COPY-LINT-REPORT.json`
