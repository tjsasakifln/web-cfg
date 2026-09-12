# Fragment: local-entity surface decision

- `target_path`: `data/local-entity/surface-decision.json` and `docs/seo/local-entity/SURFACE-DECISION.md`
- `operation`: `update_enum_if_owner_agrees`
- `stable_key`: `REGIONAL_LANDING_CANDIDATE` → later public noindex landing, never city farm
- `depends_on`: this hub remaining a **single** URL; local-entity campaign still forbids `LocalBusiness`/`PostalAddress`
- `teste`: `npm run test:local-entity` still rejects invented NAP. `new_public_landing_created` may become true only when the HTML is in a public top-level dir, and must stay noindex until goal 99
- `rollback`: keep `USE_EXISTING_SERVICE` and `new_public_landing_created: false` if the hub is retired

Campaign 11 does not edit the exclusive local-entity trees.
