# Direct convergence of #596, #598 and #599

Decision: EXECUTE_NOW for anonymous private-project readiness and labeled public
identity; VALIDATE for adaptive intake submission, withheld until its external
authority exists. Front: INBOUND ENGINE. Leverage: trust, customer, automation,
distribution. Time to evidence: final PR checks and production smoke.

Visitor jobs: identify technical evidence gaps before the next private-project
decision; find the appropriate technical intake branch; verify the public legal
entity and the specialist's explicitly labeled claims. Repeated use exercises
one engine and one registry, rather than creating pages or a second CRM.

## Source and runtime authority

Base: `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb` from `origin/main`.
New branch: `feat/direct-convergence-596-598-599`. No #601 content was imported.

| Catalog | Source HEAD | Selected patch-id before integration edits |
| --- | --- | --- |
| #596 adaptive intake | `207cb8732ee0ddb51c334060a7cfd04dd47ac5e2` | `66599cfcc92276be7a5d5598b71c0d6353df3e6b` (validation engine) |
| #598 private readiness | `fe5ef7bec40758966d57403636e382271ef20752` | `6d84524e8494d524fce0d15c5ad174478809c0ce` (engine assets) |
| #599 trust registry | `648ceff776cf2b03d46aa4d2ff05cbfba0d9a058` | `378942e4ce781e9731e8d4804f1818868b0089c6` (registry, projection, pages and tests) |

Read-only observation on 2026-09-05: Governance main
`22ad810a8c1d46d9a787efcfac825d6ba0336bff` still marks five coordination IDs
test-only in `commercial/inbound/consumer-conformance.1.0.0-draft.20260904.json`.
The canonical v1 admission policy is `NET_NEW_INBOUND_HANDRAISER-v1`, policy hash
`sha256:5f8c03b6a11af3527b202d08c74de1d59d420f181807f094e62b337f055ec4ac`.
Warmbly main `33bd329437bc04a2e95ef0f4d562d26b85f34e35` consumes a draft admission
pin. Its public health is READY but does not establish final six-contract intake
support. No complete final intake pin was found. The server authority manifest
therefore records WITHHELD, with no pin; configuration, submission and handoff
remain fail-closed. A test fixture cannot enable a deployed runtime.

Canonical public production is Cloudflare → Netcup nginx/Node, as observed in
`/.well-known/build-info.json` and the architecture response header. Netlify is
the separately requested legacy/preview deployment. ADR-STRAT-002 and
RUNTIME-AUTHORITY remain applicable; no DNS or ownership boundary changes.

## Gate fixes and provenance

#596 failed because adding adaptive code to the global bundle pushed the home
critical payload to 154869 bytes against the existing 153600-byte limit. The
integrated adaptive client is loaded only on `/triagem-tecnica/`; `script.js`,
its original source modules and all protected B2G rendering collateral are
identical to the base. No performance limit changed.

#599's frozen-provenance failure was caused by legitimate sitemap lastmod
updates from the credential registry. Before updating the derived hashes, an
XML comparison verified zero removed URLs, exactly the two new canonicals below,
and only `/confianca/` and `/especialista/tiago-jun-sasaki/` changing their existing
lastmod from 2026-08-30 to the registry's 2026-09-04 verification date:

- `/ferramentas/prontidao-tecnica-obra-privada/`
- `/triagem-tecnica/`

All pre-existing family records remain equivalent to `origin/main`. Both new
route declarations were checked against their rendered canonical, index
directive and terminal action. The readiness family also declares the exact
local-fragment header CTA that must deliver value before contact; the renderer
cannot self-authorize that exception from HTML. Only the derived buyer-map
family-registry pin and sitemap XML/index/text provenance pins were updated.
The family pin was recalculated after that explicit declaration and verified by
the inbound and query-ownership gates. Frozen HTML and rendering hashes were not
recaptured. Existing gate limits and exceptions remain unchanged; capture
inventory tests include the new route.

Analytics uses the existing event bus and carries tool/page/source metadata,
without selected answers, result counts or contact data. No SMTP is part of the
integration or its synthetic tests. Warmbly remains the commercial action owner;
extra-cli remains the canonical acquired-data owner.

Rollback: revert the integration commit and redeploy the previously verified
main SHA through the authoritative release workflow. Persistent lead storage is
outside the release directory. New intake submission stays disabled until a
reviewed final Governance pin and matching Warmbly production evidence exist.

## Final local evidence

- `npm test`: PASS on the final source tree. This includes site architecture,
  inbound gates, navigation, local-entity honesty, B2G offer contracts,
  conversion, sitemap graph, SEO and affected-suite selection.
- `npm run build:site`: PASS; 78 indexable canonicals, visible/schema parity on
  78 pages, 513-file public artifact and zero validation errors.
- `npm run audit:axe`: PASS across 57 routes at 390 px and 1440 px (114 page
  audits), with zero critical or serious findings. The new tool and trust pages
  have zero findings at both tested sizes.
- Convergence browser smoke: PASS at 390 px and desktop. The private tool
  renders all seven domains before contact, UNKNOWN remains neutral, trust
  claims match their projected schema, and unavailable intake authority keeps
  submit disabled.
- Lighthouse: all 40 policy pages passed the committed run; the post-shell
  focused run scored 100 accessibility and 100 SEO on the new route. Home p75
  TBT was 64 ms, maximum own task 114 ms, maximum LCP 1953 ms and CLS 0.
- CSP browser: PASS on seven routes with zero violations. Analytics contains no
  selected answers, free text, uploads or contact data. SMTP sends: zero.
