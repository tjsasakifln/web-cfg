# Campaign 03 — offer catalog ownership

CAMPAIGN_ID=03
BRANCH declared: `feat/campaign-20260904-multivertical-offer-system-v3`
Issue owner: #583 (parent #577)
Decision state: P1 / EXECUTE_NOW for modeling; VALIDATE before scale

## WRITE_SET

- `data/offers/multivertical/**`
- `scripts/offers/multivertical/**`
- `tests/offers/test_multivertical_catalog.mjs`
- `docs/integration/campaign-20260904/03/**`
- `docs/contracts/offer-catalog/**`

The committed diff versus `BASE_SHA` must be a subset of this list.

## DO_NOT_TOUCH_SET

- `package.json`, lockfiles, `.github/**`, Makefile, global npm scripts
- `index.html`, public HTML, home, nav, formulário
- `data/organic/public-family-registry.json`
- `data/commercial/deliverables-registry.v1.json`
- `data/commercial/offer-naming.v1.json`
- `data/offers/catalog.snapshot.json`
- `data/offers/flags.json`
- `scripts/offers/registry.cjs`, `scripts/offers/flags.cjs`, `scripts/offers/public.cjs`
- conflict runtime, analytics runtime, capture form modules

Shared-owner mutations required for #587/#343 (54→55) and CI wiring live in fragments in this directory, not in those files.
