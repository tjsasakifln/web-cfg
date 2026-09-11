# Map producer / consumers (POS-INB-04)

Examined SHA: `cb6facfaaf50aa8f1834aba43d0245e04cbea672` (`origin/main`, merge #669).

## Before (F03)

Producer of the published map: the static JSON in `ferramentas/prontidao-tecnica-obra-privada/index.html#pptr-destination-map`, written by INB-07. It only contained `quantity_takeoff_budgeting`.

`window.ConfengeCanonicalDestinationMap` had **zero writers** in the tree. `app.js` preferred that unread global, then fell back to the HTML script.

Consumers:

- `ferramentas/prontidao-tecnica-obra-privada/app.js` `readDestinationMap()` → `resolveCommercialDestination`
- `assets/js/private-project-technical-readiness.js` / `.cjs` `resolveCommercialDestination(offerId, map)` keyed only by `offer_id`
- `scripts/site/test_private_project_technical_readiness.mjs` locked F03 (`html_map_only_qty`, `html_no_broken_compat`, `html_no_broken_revisao`)

Nucleus already recommended `bim_coordination_clash_register` and `complementary_engineering_project_review`. Pages `/compatibilizacao-projetos-engenharia/` and `/revisao-tecnica-projetos-engenharia/` existed. Resolver returned `present=false` / `href=null`. Public copy said those pages were unpublished.

## After (this campaign)

Build point (derive, do not pick first catalog row):

`scripts/campaigns/pos-inb-20260911/04/derive-destination-map.mjs`

Authority: `data/bofu-dominance/core/purchase-route-map.v1.json` (`CONFENGE_PURCHASE_ROUTE_MAP/1.0.0`).

Lookup order in the shipped resolver: `purchase_id` → `route_id` → unique `offer_id`. Shared `complementary_engineering_project_review` is omitted from unique `by_offer_id` because it also belongs to `projetos-complementares`. Review of received material uses `purchase_id=revisao-tecnica-projetos`.

Published artifact: `#pptr-destination-map` on the owned landing (also copied to `docs/campaigns/pos-inb-20260911/04/destination-map.json`). The page does not read an unwritten window global.

Consumers:

- owned landing embed
- `app.js` `readDestinationMap()` (HTML only)
- shipped `resolveCommercialDestination`
- composition tests under `tests/pos-inb-20260911/04/`
- campaign 10 (production HTTP of resolved links; optional canonical global from this same function)
