# PR_PORTFOLIO_DISPOSITION — CONFENGE-WEB-PR-PORTFOLIO-TO-PRODUCTION-01

Campaign report. Organic ranking is not claimed. No new public page family.

**Timestamp:** 2026-08-20 America/Sao_Paulo  
**Decision state:** EXECUTE_NOW  
**Executive front:** INBOUND ENGINE + GOVERNANCE  
**Leverage:** revenue, trust, automation  
**Time to evidence:** integration SHA on required checks; GSC 28-day window unchanged

## Terminal

CAMPAIGN: CONFENGE-WEB-PR-PORTFOLIO-TO-PRODUCTION-01  
MAIN_SHA_BEFORE: `8ced783468a70ea8208398ec4202dc4b89b4d4fe`  
INTEGRATION_SHA: `PENDING_COMMIT`  
INTEGRATION_PR: #217  
OPEN_PRS_BEFORE: 31  
OPEN_PRS_AFTER: 14  
ABSORBED: #178, #189, #194, #200, #207, #208, #211, #214, #215, #216  
HELD: #174, #175, #190, #191, #192, #193, #196, #199, #201, #205, #206, #210, #213  
REJECTED: #195, #197, #198, #202, #203, #204, #209, #212  
PRODUCER: WARMBLY_COMMERCIAL_EVENT_CAPABILITY_ANNOUNCED  
PRODUCER_CANARY: SIGNED_CANARY_HELD_NO_HMAC_SECRET  
ASAAS_GOVERNANCE: PINNED `e2b0498a68092c1bdbf64aa31854d652c07afdc0` `sha256:3ddf29b13971e8dcfcef2be7df6649fa7d8dd43d80a67c9f4bd4c484ccceed38`  
ASAAS_MODE: disabled  
PRODUCTION_CHECKOUT: false  
PROVIDER_MAPPING_IDS: null  
DEPLOY: NOT_AUTHORIZED  
FINAL_VERDICT: WEB_PRODUCTION_CONVERGED_READY_FOR_ASAAS_MAPPING  

Warmbly inbound health announces `confenge.commercial_event.v1`. Signed POST is held without the server HMAC secret. Governance PR #9 is merged and pinned; provider IDs remain null. Residuals are named, not `WEB_CONVERGENCE_BLOCKED_*`.

## Inventário

Every then-open PR is classified as exactly one of the seven labels. Unique P0/P1 deltas landed on one branch from `8ced783468a7` in order: #178, then #189/#194/#200/#214/#216, then #211, then #208, then #215 (intent/SEO held), then #207 isolated (query-first title that still names SINAPI). #193 is HOLD_FOR_EVIDENCE (no Node 22 + Lighthouse 13 + Netlify lockstep evidence). Live open set after this fetch is 14 (#217 + 13 held).

| PR | TÍTULO | DESTINO | ISSUE OWNER | CI | RISCO | VISITOR IMPACT | ROLLBACK |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #217 | feat(release): converge P0/P1 PR portfolio for BOFU-preserving production | MERGE_AS_IS | CONFENGE-WEB-PR-PORTFOLIO-TO-PRODUCTION-01 | site-ci fix in flight; reviews required | medium | combined chrome + BOFU + checkout-prepare | revert PR #217; flags stay off |
| #216 | fix(ui): drop the invalid inner WhatsApp SVG path | CHERRY_PICK_UNIQUE_DELTA | #187 | BLOCKED (reviews) | low | WhatsApp icon valid SVG | restore inner path only if needed |
| #215 | feat(copy): replace internal strategy language with visitor jobs (#188) | CHERRY_PICK_UNIQUE_DELTA | #188 | CLEAN | low | visitor jobs instead of internal strategy | revert two content-lead sentences |
| #214 | fix(a11y): raise pillar-evidence contrast above muted overview text | CHERRY_PICK_UNIQUE_DELTA | #186 | CLEAN | low | pillar-evidence readable on navy | revert descendant color rules |
| #213 | feat(home): label the Fato-Prova-Impacto panel as illustrative (#184) | HOLD_FOR_EVIDENCE | #184 | CLEAN | low | none this release | n/a |
| #212 | feat(conversion): prepare-only bid-readiness triage canary (#155) | REJECT | #155 | CLEAN | medium | none | close; parent issue stays |
| #211 | fix(perf): size home logos to the display box and idle non-critical JS | CHERRY_PICK_UNIQUE_DELTA | #185 | CLEAN | low | home LCP budget; idle reveal | revert logo attrs + requestIdleCallback |
| #210 | feat(editorial): HOLD_NOINDEX human gate for three striking-distance URLs (#127) | HOLD_FOR_EVIDENCE | #127 | CLEAN | high | none this release | n/a |
| #209 | feat(market-answers): coverage/UNKNOWN fail-closed on canary (#84) | REJECT | #84 | CLEAN | low | none | close; parent issue stays |
| #208 | fix(nav): split Conteúdos and Ferramentas in the global shell | CHERRY_PICK_UNIQUE_DELTA | #183 | CLEAN | medium | Conteúdos vs Ferramentas split | revert brand.json + nav strings |
| #207 | feat(organic): unique SINAPI title, H1 and meta for desonerado CTR (#126) | CHERRY_PICK_UNIQUE_DELTA | #126 | BLOCKED (reviews) | low | unique SINAPI title/H1/meta | revert that one article |
| #206 | feat(editorial): fail-closed language on contract-analysis canary (#83) | HOLD_FOR_EVIDENCE | #83 | CLEAN | low | none this release | n/a |
| #205 | feat(authority): sameAs and as_of on specialist page (#74) | HOLD_FOR_EVIDENCE | #74 | CLEAN | low | none this release | n/a |
| #204 | feat(research): block recurring index until the flagship gate opens (#91) | REJECT | #91 | CLEAN | medium | none | close; parent issue stays |
| #203 | feat(distribution): prepare-only Radar syndication canary (#66) | REJECT | #66 | CLEAN | low | none | close; parent issue stays |
| #202 | feat(nurture): consent-first Market Signals Brief track (#90) | REJECT | #90 | CLEAN | medium | none | close; parent issue stays |
| #201 | feat(research): citation provenance on Radar Nacional (#65) | HOLD_FOR_EVIDENCE | #65 | CLEAN | low | none this release | n/a |
| #200 | fix(ui): point Analisar meu caso at the form on mobile | CHERRY_PICK_UNIQUE_DELTA | #182 | CLEAN | low | mobile Analisar meu caso hits form | revert #formulario-contato |
| #199 | feat(offers): ICP × trigger × oferta on home journeys (#64) | HOLD_FOR_EVIDENCE | #64 | CLEAN | medium | none this release | n/a |
| #198 | feat(data-desk): prepare-only syndication canary for the live SC page (#89) | REJECT | #89 | CLEAN | low | none | close; parent issue stays |
| #197 | feat(market-answers): priority ranking with live canary first (#63) | REJECT | #63 | CLEAN | medium | none | close; parent issue stays |
| #196 | feat(migration): explicit RETIRE for one SmartLic donor URL (#62) | HOLD_FOR_EVIDENCE | #62 | CLEAN | medium | none this release | n/a |
| #195 | feat(distribution): prepare-only paid search canary as demand sensor (#87) | REJECT | #87 | CLEAN | high if merged | none | close; parent issue stays |
| #194 | fix(ui): move lead-inline below H1 instead of before main | CHERRY_PICK_UNIQUE_DELTA | #181 | CLEAN | medium | CTA not before H1 | revert lead-inline placement + hashes |
| #193 | chore(runtime): resume Node 22.19 + Lighthouse 13 | HOLD_FOR_EVIDENCE | #149 | CLEAN | high | none until lockstep | n/a — not landed |
| #192 | feat(knowledge-funnel): visitor-path article → pillar → offer (#61) | HOLD_FOR_EVIDENCE | #61 | CLEAN | low | none this release | n/a |
| #191 | feat(discovery): visible as_of provenance on shipped llms.txt (#86) | HOLD_FOR_EVIDENCE | #86 | CLEAN | low | none this release | n/a |
| #190 | feat(authority): visible provenance on defesa de margem (#60) | HOLD_FOR_EVIDENCE | #60 | CLEAN | low | none this release | n/a |
| #189 | fix(ui): restore article-cover aspect with height:auto | CHERRY_PICK_UNIQUE_DELTA | #180 | CLEAN | low | article cover no longer squashed | revert height:auto on img |
| #178 | feat(bofu): close search readiness and prepare catalog checkout (#128, #88) | CHERRY_PICK_UNIQUE_DELTA | #128 / #88 | CLEAN | medium | service snippet + when-not-hire + prepare-only checkout | revert integration SHA; flags stay off |
| #175 | feat(growth-accounting): CONFENGE_COMPOUNDING_STANDARD/1.0 (#154) | HOLD_FOR_EVIDENCE | #154 | BEHIND | low | none | n/a |
| #174 | feat(public-integrity): prepare-only fail-closed CEIS/CNEP consumer | HOLD_FOR_EVIDENCE | public-integrity campaign | BEHIND | medium | none (not shipped) | n/a |

## Integração

Semantic outcome over commit preservation. Generated HTML was not mechanically stacked. Chrome transforms (WhatsApp SVG, Conteúdos/Ferramentas nav, lead-inline after H1) plus CSS/JS unique deltas plus isolated SINAPI snippet. Frozen BOFU hashes recaptured. Checkout flags untouched.

## Producer / Asaas

- `confenge.commercial_event.v1` persist-first HMAC producer in `netlify/functions/lib/commercial-event.cjs`.
- Fail-closed if consumer omits the version. Checkout/callback cannot emit `payment_received`.
- Health negotiation accepts `accepted_event_versions` (live Warmbly field) as well as `capabilities`.
- Flag `CONFENGE_COMMERCIAL_EVENT_ENABLED` default off. Live health announces the version; signed canary held without HMAC secret.
- Governance PR #9 merged at `e2b0498a68092c1bdbf64aa31854d652c07afdc0`, `AUTHORITY_HASH sha256:3ddf29b13971e8dcfcef2be7df6649fa7d8dd43d80a67c9f4bd4c484ccceed38`. Pin only; no second writable catalog. Provider IDs remain null. No Asaas HTTP.

## Rollback

Revert the integration PR. Flags stay `ASAAS_MODE=disabled`, `production_checkout_enabled=false`. No real money.
