# Fragment — page regeneration (campaigns 09/10/11 and goal 97)

- target_path: home, nucleus hubs, and the 21 public pages
- operation: embed `diagnostico-confenge` adaptive form (see consumer-contract.md); do **not** clone form.js
- stable_key: `data-adaptive-intake`
- dependency: campaign 08 runtime + pin/flag
- test: `node seo/scripts/test_form_funnel.mjs` must keep home B2G assertions; adaptive coverage via `node scripts/site/test_adaptive_intake.mjs`
- rollback: feature-flag off restores B2G-only capture
- this branch does not regenerate those pages
