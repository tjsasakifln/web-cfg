# External-demand intake (#561)

Decision state: `EXECUTE_NOW` for the intake contract; external evidence state: `FOUNDER_ACTION_REQUIRED` until a founder supplies a legitimate export. This is the one path by which aggregate Planner, Trends, or bounded SERP evidence can enter the existing Demand Radar. It does not create a keyword backlog, crawler, score, public page, or authorization to mutate the public surface.

The complete founder packet is versioned at `data/demand_radar/external-intake/founder-action-required.v1.json`. It specifies the exact UI/export, Brazil/Portuguese scope, period, permitted aggregate columns, prohibited fields, sanitization, checksum, expiry, import/replay and revocation process. Its absence remains `UNKNOWN`, never zero.

Create the reviewed aggregate draft from the packet, then run:

```sh
python3 -m scripts.demand_radar.external_intake normalize --as-of YYYY-MM-DD --input DRAFT --output data/demand_radar/snapshots/YYYY-MM-DD/SOURCE.json
```

The command rejects raw-query/contact-like keys and values, unapproved source kinds, future observations, stale/expired evidence, a non-`BRA`/`pt-BR` scope, missing limitations, invalid seals, and replay content that differs at the same output path. It emits a source-content pointer and deterministic per-record seals inside a sealed full envelope. A reviewer adds the exact envelope and provenance to `approved-sources.v1.json`; only then does `verify` accept it and the ordinary Radar build can select it.

Planner normalizes only to qualitative breadth/competition/bid bands. Trends normalizes only to qualitative momentum and matching geography. Neither measure is revenue, WTP, absolute volume, causal priority, or a public-mutation authorization. The engine retains its `ACTIONABLE_NOW` cap and `authorizes_public_mutation=false`.
