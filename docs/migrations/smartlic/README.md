# SmartLic → CONFENGE equity (web-cfg#62)

- Inventory: `data/migrations/smartlic-url-map/inventory.v2.json`
- Execute set: `data/migrations/smartlic-url-map/execute-set.v2.json`
- Loader: `scripts/legacy_equity/inventory.py`
- Tests: `scripts/legacy_equity/tests/`
- Handoff: [HANDOFF-2115.md](HANDOFF-2115.md)
- Nominal review: [NOMINAL-REVIEW-11.md](NOMINAL-REVIEW-11.md)
- Status: [STATUS.md](STATUS.md) — verdict `PARTIAL_TARGETS_READY`
- Integration: [INTEGRATION-ORDER.md](INTEGRATION-ORDER.md)
- Runbook: [RUNBOOK.md](RUNBOOK.md)

The v1 path `data/migration/smartlic-confenge/manifesto.v1.json` is a **byte-identical** projection of the inventory so SmartLic vendors one hash. Do not edit one file without regenerating both via `python3 scripts/legacy_equity/build_inventory.py`.
