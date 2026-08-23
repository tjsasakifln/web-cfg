# Commercial DoD — versioned BOFU loops

Decision state: **EXECUTE_NOW**. The former one-off WEB-011 verifier is now driven by
`data/money_asset/commercial-loops.v1.json`. The durable artifacts are the registry,
the pure decision functions in `scripts/money_asset/commercial_dod.mjs`, the I/O-only
operator CLI `audit_commercial_dod.mjs`, and the per-loop report at
`docs/evidence/commercial-dod/loops.v1.json`.

## Decision

`NEED_MORE_DATA` on ICP × trigger × offer × friction.

Campaign exit: **`BLOCKED`**.

A real page→use→CTA→lead→Warmbly action/outcome event was not produced. The recorder
fail-closes instead of minting a person, a WON, or INBOUND NOW from a form, fixture or
synthetic 201. `UNKNOWN` remains `UNKNOWN`.

## What is durable

- Declarative audit of the margin-defense asset/service pair and the Defesa Técnica on-page handraise.
- Fail-closed review functions + operator CLI (`npm run audit:margin-defense-dod`).
- Tests that drive shipped HTML, `diagnoseMargin`, `lead.cjs`, and `collect._scrubProps`.
- Adding a loop means adding a registry row; it does not require copying the verifier.

## What is not claimed

- Current production SHA in this file. Probe `/.well-known/build-info.json`.
- Qualified lead, pipeline, or WON.
- INBOUND NOW without consented contact + inbound env + auto-send OFF evidence.

## Next command

Use `buildNextCommand(loop)` through the operator report and follow
`docs/ops/WARMBLY-INBOUND.md`. Do not invent a person.

## Rollback

Revert this branch. No public HTML, robots, sitemap, INDEX, DNS, or env changed.
