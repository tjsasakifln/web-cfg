# B2G outbound landing preparation — 2026-09-05

```text
PR_ONLY_UNTIL_MV09_STABLE=YES
GLOBAL_SHELL_UNTOUCHED=YES
FROZEN_ROUTES_UNTOUCHED=YES
MERGE=NO
DEPLOY=NO
```

## Decision and authority

- Decision state: `EXECUTE_NOW`, preparation only while web-cfg #611 remains open.
- Executive front: Revenue Now, without changing Warmbly dispatch or the public global surface.
- Time to evidence: route-local tests and captures in this PR; commercial evidence only after a separately authorized post-#611 integration and observation window.
- Leverage: revenue, distribution, automation and trust.
- Visitor job: after a specific B2G first-touch, confirm that CONFENGE handles the stated decision and see the artifact, proof, next step and material limit without returning to a generic page.
- Acquisition/conversion hypothesis: matching the exact email claim at the exact fragment reduces the trust break between first-touch and the public page, while preserving qualified next-action and boundaries.
- Corporate North Star: qualified commercial opportunities, not clicks, messages or page count.
- 100-repetition test: the same seven semantic roles and anchor contract validate every governed destination; this does not create one-off pages or a second destination registry.

- Source baseline: `tjsasakifln/web-cfg@3552cf228424ebb8f34266f671fd80df43d0615c` (`origin/main` when the branch was created).
- Outbound authority: [Warmbly PR #267](https://github.com/tjsasakifln/warmbly/pull/267), registry head `a4201f2ff3396f3e08030997563ec397b9627df2`.
- Owner/copy authorities: [web-cfg #528](https://github.com/tjsasakifln/web-cfg/issues/528), [#532](https://github.com/tjsasakifln/web-cfg/issues/532), [#534](https://github.com/tjsasakifln/web-cfg/issues/534), frozen-route owners #128/#327/#387/#529 and integration owner [#611](https://github.com/tjsasakifln/web-cfg/issues/611).

Contemporary registry conflict: at the pinned Warmbly head, both `APOIO_LICITACAO` and `INTELIGENCIA_PNCP` resolve as `EDITAL_OU_PROPOSTA` to the Bid Room anchor. The landing matches the first code, not PNCP market intelligence. [The open review on #267 requires a fail-closed reroute](https://github.com/tjsasakifln/warmbly/pull/267#issuecomment-5555535479). This branch does not invent PNCP copy or alter Warmbly; that upstream mismatch remains a real blocker for declaring complete message-match.

## Audit matrix

| route | outbound claim | state | first-fold | anchor | artifact | proof | CTA | boundary | delta |
|---|---|---|---|---|---|---|---|---|---|
| `/aditivos-obras-publicas/#metodo` | Execution changed; formalize scope, effect and proof. | `FROZEN_MEASUREMENT` | Route-specific decision and consequence already present. | Answers method, but caveat/source dominate and there is no next action in the fragment viewport. | Present elsewhere on route. | Source/method named. | Absent at anchor. | Present. | Gap recorded; **0 bytes changed**. Freeze AND gate is not released and `html_mutation_authorized=false`. |
| `/medicoes-glosas-obras-publicas/#metodo` | Measurement, glosa, calculation memory or receipt is disputed. | `FROZEN_MEASUREMENT` | Route-specific decision and consequence already present. | Answers method, but caveat/source dominate and there is no next action in the fragment viewport. | Present elsewhere on route. | Source/method named. | Absent at anchor. | Present. | Gap recorded; **0 bytes changed**. Stricter #387 measurement window also applies. |
| `/reequilibrio-obras-publicas/#metodo` | Distinguish the mechanism and organize nexus, calculation and documents. | `FROZEN_MEASUREMENT` | Route-specific decision and consequence already present. | Answers method, but caveat/source dominate and there is no next action in the fragment viewport. | Present elsewhere on route. | Source/method named. | Absent at anchor. | Present. | Gap recorded; **0 bytes changed**. Freeze AND gate is not released. |
| `/auditoria-orcamento-licitacao/#metodo` | Tender or spreadsheet may compromise price and margin. | `FROZEN_MEASUREMENT` | Route-specific decision and consequence already present. | Answers method, but caveat/source dominate and there is no next action in the fragment viewport. | Present elsewhere on route. | Source/method named. | Absent at anchor. | Present. | Gap recorded; **0 bytes changed**. Freeze AND gate is not released. |
| `/bid-room-licitacoes-obras/#quando-nao-contratar` | `APOIO_LICITACAO`: decide whether to bid and organize the proposal. `INTELIGENCIA_PNCP`: incorrectly collapsed here upstream and **not supported by this landing**. | `MUTABLE_NOW` for the declared `EDITAL_OU_PROPOSTA` claim; upstream PNCP mapping blocked | Good for tender/proposal: decision, consequence, artifact and proof are specific. | **Before:** fragment targeted the scope block inside a closed disclosure. **After:** visible decision section answers the supported claim in seven ordered roles. | Advance/decline recommendation, responsibility matrix, risk record and final checklist. | Linked synthetic tender-decision example plus recorded method/source. | “Registrar o edital para revisão de encaixe”, with PII-free `cta_click`. | CONFENGE coordinates/reviews; the client decides, signs and submits; no promised win. | Anchor moved to a visible route-local section; PNCP mismatch recorded without broadening the page. |
| `/atrasos-prorrogacao-obras-publicas/#metodo` | Delay, extension or closeout needs chronology and a decision. | `MUTABLE_NOW` | Good: cause, consequence, compressed work and output are specific. | **Before:** institutional method/source/limitations next to footer. **After:** claim-matched decision sequence before source notes. | Chronology, nexus, impacted days, concurrent causes, mitigation, recommendation and gaps. | Linked public delay matrix plus named technical responsibility. | “Registrar o evento para revisão de encaixe”, with PII-free `cta_click`. | Technical dossier only; no legal opinion, fine calculation or submission; no independent second reviewer named. | Existing route-local method section refined; no form or shell change. |
| `/acompanhamento-contratos-obras/#metodo` | Prioritize contract events and owners in a recurring routine. | `MUTABLE_NOW` | Good: recurring decision, consequence, artifacts and proof are specific. | **Before:** institutional method/source/limitations next to footer. **After:** claim-matched routine and next state before source notes. | Obligation matrix, deadline/measurement/cash panel, alerts and decision minutes with owners. | The public diagnosis demonstrates only fact/derived/unknown discipline; the absence of a complete public routine demonstrative is explicit. | “Registrar a rotina para revisão de encaixe”, with PII-free `cta_click`. | Preventive active-contract routine; not daily management, point defense or legal opinion; no independent second reviewer named. | Existing route-local method section refined; unrelated renewal/re-tender model is not presented as proof. |
| `/problemas-que-resolvemos/` | B2G confirmed, but no factual pain is authorized. | `NEEDS_OWNER` | Broad route chooser is appropriate, but the promoted first action assumes margin defense despite the claim having no confirmed pain. | No fragment is declared. | Route cards describe the available paths. | Four public tools are linked. | Current promoted action is narrower than the unknown claim. | Economic-fit boundary is present later. | Gap recorded; **0 bytes changed**. The file is generated by `render_nav_hubs.py`, which is being changed in the #611 integration stream; owner/hunk-port is required after stabilization. |

```text
ACTIVE_DESTINATIONS_AUDITED=8
MUTABLE_NOW=3
FROZEN_UNTOUCHED=4
COVERED_GOOD=0
NEEDS_OWNER=1
ROUTES_CHANGED=3
```

## Change boundary

Only route-local sections inside `<main>` changed:

- `bid-room-licitacoes-obras/index.html`: one visible claim-match section; the existing fragment ID moved out of the closed disclosure.
- `atrasos-prorrogacao-obras-publicas/index.html`: existing `#metodo` content refined.
- `acompanhamento-contratos-obras/index.html`: existing `#metodo` content refined.

No bytes changed in home, header/nav/footer/global shell, `/servicos/`, private wedge, specialist/trust, forms or transport, sitemap, redirects, global registry, shared styles/scripts or any measurement-frozen route. Existing canonical URLs, form payloads and `CONFENGE_WEB` attribution remain unchanged. The three new route-local anchor links use the existing `cta_click` contract with finite `outbound-*-next-step` IDs; no runtime, schema or PII field changed.

## Validation and visual evidence

Route-specific contract:

```sh
node --test tests/commercial/test_b2g_outbound_landing_prep.mjs
```

The contract verifies the eight audited destinations, both service codes currently collapsed onto Bid Room, unique/local anchors, canonical URLs, the ordered `situation → consequence → work → artifact → proof → next-step → boundary` roles, PII-free CTA observability, plain-language exclusions, frozen hashes and the untouched fallback hub. It also runs through the existing `test:page-contract-licitacao` merge script; `package.json`, which #611 changes, remains untouched.

Required anchored-viewport captures are kept under [`screenshots/`](screenshots/) for only the three altered routes:

- `before/` is rendered from the branch base SHA.
- `after/` is rendered from the working branch.
- Each directory contains 390×844 and 1366×768 PNGs for the exact Warmbly fragment.

Validated on the isolated branch: route contract `6/6`, `test:copy`, HTML integrity, authority, brand, SEO, inbound-gate unit/query checks, first-fold contract `1740/1740`, UI geometry/responsive/anchors, CTA renderer drift check and six direct axe checks on the exact changed fragments all pass. Final `npm run test:affected`: PASS in 640,417 ms, including the integrated route contract. No live smoke, merge or deploy is authorized in this campaign.

Known integration-owned gate outside this patch: `npm run test:cta-form-next-state` stops at the pre-existing census assertion `declared CTAs: 131 !== 128`. The renderer drift check itself passes, and #611 owns the concurrent census/integration update; this branch does not edit that contract or `package.json`.

## Analytics, rollback and ADR

- Analytics: existing `cta_click` only, with three new finite route-local CTA IDs and no PII, event schema or runtime change.
- Data owner/contract: Warmbly owns the finite first-touch destination registry; web-cfg consumes its audited URL/claim/fragment mapping only as campaign evidence. No crawler, identity model or parallel registry was added.
- Rollback: revert the three route-local hunks and this evidence/test commit. Frozen routes and global surface do not require rollback because they are untouched.
- Affected ADR: ADR-STRAT-002 and MARKET-CAPTURE-OS are followed; no architectural decision changes, so no ADR update is required.
- Integration: rebase and hunk-port onto post-#611 `main`, re-audit the corrected Warmbly #267 head, rerun every gate and recapture screenshots in a separate authorized session before any merge.
