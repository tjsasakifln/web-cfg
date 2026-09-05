# Fragment — brand.json corporate positioning

- **campaign_id:** 02
- **target_path:** `data/site/brand.json`
- **operation:** replace exclusive-B2G org_description / hero / footer with umbrella category while keeping B2G journeys as the published vertical until campaign 08
- **stable_key:** `positioning.org_description`, `hero.meta_title`, `positioning.footer_blurb`
- **owner_after:** campaigns 08 / 09 / 10
- **depends_on:** taxonomy contract + home/nav HTML that this campaign must not touch
- **test:** `scripts/site/test_brand_contract.py` today requires the B2G home copy (`KEEP_VERTICAL`); changing brand.json without HTML would fail CI
- **rollback:** restore brand.json; no URL mutation

Do not edit `brand.json` in campaign 02.

Suggested future positioning (not applied):

- public category: Engenharia, Perícias e Inteligência Técnica
- published vertical: Obras Públicas e B2G
- `taxonomy_nucleus_id` is not stored here; consumers read `data/corporate/taxonomy.v1.json`

Campaign 03 intake invariants (not taxonomy, not runtime fallback):
`CONFENGE_WEB_INTAKE/2.0.0-draft.20260904`, `source=CONFENGE_WEB`,
`outbound_eligible=false`, `auto_send=false`.
