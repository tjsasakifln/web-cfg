# Labeled fixtures — never official_live

| Path | Role |
|---|---|
| `extra-cli-export/` | Snapshot of extra-cli `--fixture` canary catalog. `catalog_mode=fixture`. |
| `extra-cli-fixture-as-live/` | extra-cli `--fixture` with `claimed_live=true` → `fixture_as_live`. |
| `extra-cli-data-hold/` | Same shape with `DATA_HOLD`. |
| `extra-cli-data-reject/` | Same shape with `DATA_REJECT`. |
| `canary.v1.json` | Editorial overlay fixture for preview/tests. |

None of these may reach `PUBLISHABLE_INDEX`.
