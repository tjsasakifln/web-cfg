# Fragment: public family registry / noindex for withheld hubs

- target_path: `data/organic/public-family-registry.json`
- operation: `add` four withheld families only when goal 97 promotes a hub; until then keep `index_state=withheld` and do not emit public routes
- stable_key: `CONFENGE_CORPORATE_TAXONOMY/1.0.0-draft.20260904` nucleus ids
  - `expert_evidence_assistance`
  - `property_valuation`
  - `building_engineering_documentation`
  - `occupational_safety`
  - `public_works_b2g` (already public via existing B2G routes; do not duplicate)
- dependency: campaign 02/03 registry owners; campaign 10 templates in `docs/integration/campaign-20260904/10/hubs/`
- test: `python3 -m pytest scripts/site/test_corporate_shell_five_nuclei.py -q` (hubs absent from sitemap and `shipped_html_files`)
- rollback: delete any new registry rows; do not redirect B2G URLs
