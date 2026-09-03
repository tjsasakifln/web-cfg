# Labeled live-intelligence fixture — never official_live

`extra-cli` has not shipped `CONFENGE_LIVE_INTELLIGENCE/1.0` yet. This catalog is
the only input the consumer has, and it is labeled as such at every level.

| Path | Role |
|---|---|
| `manifest.json` | Fixture catalog head. `schema=confenge-live-intelligence-fixture/1.0`, `catalog_mode=fixture`, `claimed_live=false`, `test_only=true`, `never_index=true`. |
| `opportunities/<opportunity_id>.json` | `live-opportunity/1.0` shaped records. |
| `companies/<company_digest>.json` | `company-fit-profile/1.0` shaped records, keyed by the consumer-side CNPJ digest. |

The fixture schema is **not** a variant of `CONFENGE_LIVE_INTELLIGENCE/1.0`. It is
a disjoint name, so `scripts/live_intelligence/consume.py:negotiate_schema`
rejects it as a live producer export (`accepted is False`) and no additive-1.x
rule can widen into it. The same call still classifies it (`kind == "fixture"`),
which is what lets a labeled fixture render at NOINDEX behind the
`fixture_schema` index bar instead of being mistaken for a broken payload.

`negotiate_schema` is the only schema gate in that module.
`inspect_producer_integrity`, `index_bars` and `load_export_dir` read their
verdict from it, and `decide` is built from those three — so a fixture record
projects at `PUBLISHABLE_NOINDEX` at best and can never reach
`PUBLISHABLE_INDEX`, through exactly one enforcement path.

The records are invented for development and tests. The CNPJs behind the three
`company_digest` keys have valid check digits and belong to no real company; the
raw CNPJ never appears in a payload, a route or an analytics event.

Regenerate the validated projection with:

```
python3 -m scripts.live_intelligence.consume --write
```
