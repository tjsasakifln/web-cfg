# Local / organic census

Machine record: `data/local-entity/census.json`.

Channels are disjoint:

- `MAP_PACK` — Google map pack / local 3-pack / Maps card
- `ORGANIC` — classic blue-link web results (including branded entity queries)
- `LOCAL_ORGANIC` — web results for queries with a geographic modifier, **not** map-pack

Live GSC: `status=BLOCKED`, `source_kind=credential_failure` (PR #159). Impressions/clicks are `null`, not `0`. `ready_for_product_decisions=false`.

Historical SERP notes from `data/organic/search-baseline-2026-08-14.json` are labeled `STALE` organic rows with their original limitation. Historical GSC CSV branded rows are hashed (`sha256:`) and are not live Search Analytics.

Absence of a map-pack observation is UNKNOWN/BLOCKED. It is not a rank of zero and not a reason to invent LocalBusiness markup.
