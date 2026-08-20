# Local / organic census

Machine record: `data/local-entity/census.json`.

Channels are disjoint:

- `MAP_PACK` — Google map pack / local 3-pack / Maps card
- `ORGANIC` — classic blue-link web results (including branded entity queries)
- `LOCAL_ORGANIC` — web results for queries with a geographic modifier, **not** map-pack

Live GSC overlay: `gsc_live_state=LIVE_JOB_OK`, `core_ready_for_product_decisions=false` (`data/bofu-dominance/core/gsc-live-overlay.v1.json`). Impressions/clicks on non-returned rows stay `null`, not `0`. PR #159 historically recorded `credential_failure`; that is not the current mechanical state.

Historical SERP notes from `data/organic/search-baseline-2026-08-14.json` are labeled `STALE` organic rows with their original limitation. Historical GSC CSV branded rows are hashed (`sha256:`) and are not live Search Analytics.

Absence of a map-pack observation is UNKNOWN/BLOCKED. It is not a rank of zero and not a reason to invent LocalBusiness markup.
