# Campaign 09 write set

CAMPAIGN_ID=09
ISSUE_OWNER=589
PARENT=577
BASE_SHA=89b081a8676d8a0b30747dfcb1477f21d9ac4dfb
ACTUAL_BRANCH=feat/campaign-20260904-private-technical-intelligence-canary-v3
WORKTREE=/home/tjsasakifln/code/confenge/.worktrees/web-cfg/c20260904-09-private-intelligence

## WRITE_SET

- assets/js/private-project-technical-readiness.js
- assets/js/private-project-technical-readiness.cjs
- docs/integration/campaign-20260904/09/canary/index.html
- docs/integration/campaign-20260904/09/canary/app.js
- docs/integration/campaign-20260904/09/canary/styles.css
- scripts/site/test_private_project_technical_readiness.mjs
- docs/integration/campaign-20260904/09/WRITE_SET.md
- docs/integration/campaign-20260904/09/README.md
- docs/integration/campaign-20260904/09/slug-intent-cannibalization.md
- docs/integration/campaign-20260904/09/fragment-public-family-registry.md
- docs/integration/campaign-20260904/09/fragment-noindex-governance.md
- docs/integration/campaign-20260904/09/fragment-piloto-inventory.md
- docs/integration/campaign-20260904/09/fragment-offer-catalog.md
- docs/integration/campaign-20260904/09/fragment-campaign-08-capture.md
- docs/integration/campaign-20260904/09/fragment-package-scripts.md
- docs/integration/campaign-20260904/09/fragment-hub-listing.md
- docs/integration/campaign-20260904/09/fragment-public-artifact-allowlist.md

The committed delta must be a literal subset of this list.

## DO_NOT_TOUCH_SET

- package.json and lockfiles
- .github/**
- Makefile and global npm scripts
- data/organic/public-family-registry.json
- data/organic/noindex-governance-registry.json
- data/organic/reject-withdraw-debt.json
- data/offers/**
- home index.html and shared navigation partials
- styles.css, styles-tokens.css, styles-tools.css, styles-offers.css, styles-hubs.css
- assets/js/tools-common.js, tool-compute.js, tool-persist.js, diagnose-margin.js
- shared lead form / netlify functions
- piloto/** existing inventory
- robots.txt, _headers, sitemaps
- docs/design-audit/prototypes/**
