> **DO NOT MERGE OR DEPLOY WHILE #611 / MV-09 IS INTEGRATING.**

```text
PR_ONLY_UNTIL_MV09_STABLE=YES
GLOBAL_SHELL_UNTOUCHED=YES
FROZEN_ROUTES_UNTOUCHED=YES
MERGE=NO
DEPLOY=NO
```

## Visitor job and hypothesis

A recipient arriving from a specific B2G first-touch must find the same decision at the exact destination fragment, followed by consequence, compressed work, tangible artifact, proof, next state and material boundary. The hypothesis is that this removes the trust break between outbound and the public page and improves qualified commercial opportunities, without expanding page count or adding another registry.

Decision state: `EXECUTE_NOW` for isolated preparation only. Executive front: Revenue Now. Time to evidence: route-local tests/captures in this PR; commercial evidence only after separately authorized post-#611 integration. Leverage: revenue, distribution, automation and trust.

## Contemporary audit

Warmbly #267 head audited: `a4201f2ff3396f3e08030997563ec397b9627df2`.

- ACTIVE B2G destinations: 8
- `MUTABLE_NOW`: 3
- `FROZEN_MEASUREMENT`: 4, zero bytes changed
- `COVERED_GOOD`: 0
- `NEEDS_OWNER`: 1, `/problemas-que-resolvemos/`, zero bytes changed
- Routes changed: Bid Room, atrasos/prorrogações and acompanhamento de contratos

The pinned Warmbly head incorrectly collapses `INTELIGENCIA_PNCP` and `APOIO_LICITACAO` into the Bid Room destination. This landing matches only the tender/proposal claim. The [open #267 review](https://github.com/tjsasakifln/warmbly/pull/267#issuecomment-5555535479) requires a fail-closed reroute; this PR records the mismatch and does not invent PNCP positioning.

Full matrix and before/after captures: [`docs/qa/b2g-outbound-landing-prep-2026-09-05/README.md`](https://github.com/tjsasakifln/web-cfg/blob/prep/b2g-outbound-landings/docs/qa/b2g-outbound-landing-prep-2026-09-05/README.md).

## Scope and boundaries

Only route-local sections inside `<main>` changed. Home, nav/footer/global shell, `/servicos/`, private wedge, specialist/trust, form transport, sitemap, redirects, shared runtime/styles and global registry are untouched. Canonicals, form payloads and `CONFENGE_WEB` attribution are preserved. The three new next-step links reuse the existing PII-free `cta_click` contract with finite route-local IDs.

The four protected routes remain byte-identical to the current freeze hashes. The fallback hub remains byte-identical because its generator and output are in the #611 integration stream.

## Evidence and gates

- Route-specific outbound contract: PASS, 6/6; included in the existing `test:page-contract-licitacao` merge script without editing #611-owned `package.json`.
- `npm run test:affected`: PASS, 640,417 ms.
- `npm run test:copy`: PASS.
- HTML integrity and static accessibility: PASS.
- Exact-fragment axe at 390×844 and 1366×768: PASS, 0 violations in 6/6 checks.
- UI geometry, responsive matrix, anchor resolution, authority, brand, SEO and inbound unit/query gates: PASS.
- Known integration-owned blocker: `npm run test:cta-form-next-state` has the pre-existing assertion `declared CTAs: 131 !== 128`; #611 owns the concurrent census update. Its renderer drift check passes. No bypass is added here.

## Ownership, analytics, rollback and integration

- Data owner/contract: Warmbly owns the finite destination registry; web-cfg consumes the pinned URL/claim/fragment audit only. No crawler, DataLake or identity model was added.
- Analytics: existing `cta_click` only; three finite IDs, no PII or schema/runtime change.
- Rollback: revert the three route-local HTML hunks plus evidence/test wiring.
- ADR: ADR-STRAT-002 and MARKET-CAPTURE-OS remain satisfied; no architectural decision changed.
- 100-repetition test: one semantic/anchor contract scales across governed destinations; it does not create 100 bespoke pages.
- Post-#611 only: rebase/hunk-port onto stable `main`, audit the then-current Warmbly #267 head, rerun all gates and recapture both viewports in another authorized session.

References: tjsasakifln/warmbly#267, #528, #532, #534, #611.
