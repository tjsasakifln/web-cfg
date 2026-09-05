# Fragment — public-family registry (goal 97)

- target_path: `data/organic/public-family-registry.json`
- operation: add family only if the sandbox is published as a visitor route
- stable_key: `adaptive-intake-sandbox`
- dependency: campaign 08 capture runtime; do not index
- test: `npm run inbound:gates` must stay green; noindex pages are not undeclared indexable families
- rollback: omit the family; keep the fixture under `tests/fixtures/adaptive-intake/`
- decision: this campaign does **not** publish an indexable route. Goal 97 should not add a public family unless a founder decision promotes the sandbox.
