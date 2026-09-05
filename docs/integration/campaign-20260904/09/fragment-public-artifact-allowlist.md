# Fragment: public artifact allowlist

CAMPAIGN_ID=09
ISSUE_OWNER=589

- target_path: `scripts/pseo/public_artifact.py` (`PUBLIC_TOP_DIRS` already contains `ferramentas` and `assets`)
- operation: `copy_route_into_ferramentas`
- stable_key: `ferramentas/prontidao-tecnica-obra-privada/index.html`
- dependency: family registry; noindex or index decision; do not copy `docs/integration/**`
- test: `python3 -m pytest scripts/pseo/tests/test_prototype_isolation.py -q` and confirm the new route is not under `docs/design-audit/prototypes`
- rollback: delete the copied ferramentas path from the next artifact build

The canary HTML in this branch stays under `docs/integration/campaign-20260904/09/canary/` so it is skipped by the visitor census and does not enter `_site`. Goal 97 copies it to `ferramentas/prontidao-tecnica-obra-privada/` when promoting.
