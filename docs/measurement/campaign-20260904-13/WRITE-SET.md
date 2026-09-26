# Campaign 13 write set

Declared before the first functional edit. The committed diff versus `BASE_SHA` must be a literal subset of `WRITE_SET`.

## WRITE_SET

- `data/measurement/multivertical-event-metric-contract.v1.json`
- `data/measurement/privacy-matrix.v1.json`
- `data/measurement/attribution-conservation.v1.json`
- `data/measurement/test-only-coordination-contracts.v1.json`
- `scripts/measurement/multivertical_measurement_contract.mjs`
- `tests/measurement/test_multivertical_measurement_contract.mjs`
- `data/commercial/market-fit-protocol.v1.json`
- `data/commercial/market-fit-exposure-plan.v1.json`
- `scripts/commercial/market_fit_exposure_plan.mjs`
- `scripts/commercial/market_fit_evidence.mjs`
- `tests/commercial/test_market_fit_protocol.mjs`
- `docs/research/market-fit-v1/README.md`
- `docs/research/market-fit-v1/RUNBOOK.md`
- `docs/research/market-fit-v1/TASK-SCRIPT.md`
- `docs/research/market-fit-v1/CONSENT-MINIMIZATION.md`
- `docs/research/market-fit-v1/ANALYSIS-TEMPLATE.md`
- `docs/research/market-fit-v1/DECISION-CRITERIA.md`
- `docs/research/market-fit-v1/templates/research-aggregate.template.json`
- `docs/research/market-fit-v1/templates/qco-aggregate.template.json`
- `docs/research/market-fit-v1/templates/product-decisions.template.json`
- `docs/research/market-fit-v1/templates/session-log.template.json`
- `docs/research/icp-trust-session-v1/protocol.json`
- `docs/research/icp-trust-session-v1/README.md`
- `docs/research/icp-trust-session-v1/RECRUITMENT.md`
- `docs/research/icp-trust-session-v1/CONSENT-RETENTION.md`
- `docs/research/icp-trust-session-v1/STATE.json`
- `docs/research/icp-trust-session-v1/RUNBOOK.md`
- `docs/research/icp-trust-session-v1/PROTOCOL-FIVE-SECOND.md`
- `docs/research/icp-trust-session-v1/PROTOCOL-TREE-TEST.md`
- `docs/research/icp-trust-session-v1/PROTOCOL-COPY-COMPREHENSION.md`
- `docs/research/icp-trust-session-v1/templates/aggregate.template.json`
- `scripts/user_research_protocol/validate.py`
- `scripts/user_research_protocol/tests/test_validate.py`
- `docs/measurement/campaign-20260904-13/WRITE-SET.md`
- `docs/measurement/campaign-20260904-13/INSTRUCTIONS-08-10-99.md`
- `docs/integration/campaign-20260904/13/08-event-registry-dimensions.md`
- `docs/integration/campaign-20260904/13/10-corporate-shell-stimuli.md`
- `docs/integration/campaign-20260904/13/99-integration.md`
- `docs/integration/campaign-20260904/13/01-adr-fragment.md`

## DO_NOT_TOUCH_SET

- `js/**`
- `assets/js/**`
- `netlify/functions/**`
- `package.json`
- `package-lock.json`
- `pnpm-lock.yaml`
- `yarn.lock`
- `.github/**`
- `Makefile`
- `index.html`
- `entregas/**`
- `netlify/functions/lib/event-registry.json`
- `netlify/functions/lib/event-contract.cjs`
- `docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md`
- `docs/strategy/MARKET-CAPTURE-OS.md`
- `docs/architecture/RUNTIME-AUTHORITY.md`
- `data/organic/public-family-registry.json`
- `data/offers/**`
- `data/commercial/task-doors.v1.json`
- `data/commercial/pricing-policy.v1.json`
- `data/commercial/copy-contract.v1.json`
- `data/commercial/deliverables-registry.v1.json`
- any other campaign worktree
- any dashboard, form, home, analytics emitter, or capture endpoint
