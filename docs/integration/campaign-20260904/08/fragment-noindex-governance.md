# Fragment — noindex governance (goal 97)

- target_path: `data/organic/noindex-governance-registry.json`
- operation: add family `adaptive-intake-sandbox` with `reason_code=fixture_synthetic` **only if** the HTML is moved out of `tests/` onto a visitor path
- stable_key: `adaptive-intake-sandbox`
- dependency: campaign 08 sandbox remains under `tests/fixtures/` until promotion
- test: `gate_instance_index_ready` must not report `noindex_without_reason` for a visitor path
- rollback: keep the fixture in `tests/` (skipped by visitor census)
