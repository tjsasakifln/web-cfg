# Campaign 11 write set

Declared before the first functional edit. `CAMPAIGN_ID=11`.
Branch: `feat/campaign-20260904-greater-florianopolis-hub-v3`.
Worktree: exclusive path ending in `c20260904-11-local-hub`.
`BASE_SHA` recorded in the PR body.

## WRITE_SET

Only these prefixes may appear in the committed delta versus `BASE_SHA`:

- `docs/campaigns/campaign-20260904/11/`
- `docs/integration/campaign-20260904/11/`
- `tests/campaigns/campaign-20260904/11/`

## DO_NOT_TOUCH_SET

- `index.html` (home)
- header/nav chrome owned by the corporate shell
- `styles.css`, `styles-tokens.css`, `styles-tools.css`, `styles-offers.css`, `styles-hubs.css`
- `script.js`, `js/`
- `package.json`, `package-lock.json`, `requirements-ci.txt`
- `.github/`
- Makefile and global npm scripts
- `robots.txt`, `sitemap.xml`, `sitemap-index.xml`, `sitemap-*.xml`
- `scripts/` including `scripts/local_entity/`, `scripts/pseo/`, `scripts/site/`
- `data/organic/public-family-registry.json`
- `data/organic/noindex-governance-registry.json`
- `data/organic/indexnow-allowlist.v1.json` and discovery allowlists
- `data/local-entity/`
- `data/commercial/` (offer catalog and page contracts)
- credential / trust registries (`data/site/proof.json`, `data/site/authority-*.json`, `/confianca/`)
- form runtime (Netlify lead function, `js/modules` form code)
- existing B2G hubs, `/especialista/`, `/conflitos/` (link only)
- `PUBLIC_TOP_DIRS` in `scripts/pseo/public_artifact.py`

Shared-owner needs are fragments under `docs/integration/campaign-20260904/11/`.
