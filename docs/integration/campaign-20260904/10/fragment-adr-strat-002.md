# Fragment: ADR-STRAT-002 exclusive-B2G lock

- target_path: `docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md`
- operation: `update` category from exclusive B2G to umbrella **Engenharia, Perícias e Inteligência Técnica**, preserving B2G as a vertical
- stable_key: founder authorization 2026-09-04 on #577
- dependency: campaign 02 (ADR owner)
- test: home title/H1/footer/schema no longer claim exclusive B2G (`test_title_schema_and_footer_are_not_exclusive_b2g`)
- rollback: revert campaign 10 home/nav SHA; ADR remains campaign 02
