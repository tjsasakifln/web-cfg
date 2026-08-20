# Frozen spec: /diagnostico-b2g-360/

**Campaign:** CONFENGE-WEB-BOFU-FROZEN-PILLAR-SPECS-01  
**Mode:** PREPARE-ONLY. `html_mutation=false`. Do not apply the `.patch.txt` before the gate.  
**Corresponding issue:** #128 (`LANDED_AWAITING_LIVE_EVIDENCE`)  
**`earliest_safe_action_at`:** `2026-09-16`  
**Decision state:** P1 / VALIDATE / INBOUND ENGINE. Leverage: revenue + distribution.

## Visitor job

Mapear onde a operação B2G de obras perde tempo, margem e controle, e sair com um plano de 90 dias — not a generic 'vender para o governo' quiz.

## HTML snapshot (live, hash-bound)

| Field | Value |
|---|---|
| title | Diagnóstico B2G 360° | CONFENGE |
| meta | Mapeie capacidade, mercado, acervo, carteira de oportunidades e riscos da operação B2G. Plano executivo de 90 dias para prioridades e backlog de implantação. |
| H1 | Diagnóstico B2G 360° |
| canonical | https://confenge.com.br/diagnostico-b2g-360/ |
| robots | index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1 |
| schema | Organization, WebPage, Service, Country, BreadcrumbList, ListItem |
| og:title | Mapeie onde a frente pública perde tempo, margem e controle. |
| content_sha256 | `cedffd31e29fb55bbb248993435b575464b91ef231b462c5ce6948ff93a4863c` |
| hero CTA | Diagnosticar a operação B2G → `/#contato?jornada=operacao` |
| when-not-to-hire | True |

## Demand-control / #128 / extra-cli

- PR #159: `authorizes_html_edit=False`, `source_kind=LIVE_JOB_OK`, BOFU `observe_only`, `earliest_safe_action_at=2026-09-16`.
- Issue #128: commercial click share `0.0`, GSC row {'impressions': 1, 'clicks': 0, 'position': 15.0}, state `LANDED_AWAITING_LIVE_EVIDENCE`.
- extra-cli PR #435 COMPARABLE `publication_authorization=false`; PR #437 PARTIAL `national_claim_authorized=false`. Factual inputs only.

## GSC precondition

- `gsc_live_available`: `False`
- Other-evidence decision: `USE_HISTORICAL_EXPORT_AND_ISSUE_128_BASELINE`
- Invented live metrics: `False`

## SERP census (carteira-operacao)

Rank status: **UNKNOWN**. Web sample shows CONFENGE on branded/offer queries. Generic 'diagnóstico B2G' is occupied by free quizzes. Do not invent rank.

Competitors:

- `https://www.redeb2g.com.br/` — generic_b2g_platform
- `https://diagnosticob2g.com.br/` — generic_b2g_diagnostic
- `https://conquistagov.com.br/` — b2g_consulting
- `https://b2gsmart.com.br/` — licitacoes_saas

Intent gaps:

- Generic B2G diagnostics are not obras-públicas margin-defense. CONFENGE unique utility is the engineering/contract portfolio, not a 5-dimension quiz.
- GSC 1 impr / 0 clicks / pos 15 — anecdotal. Brand query 'confenge' is separate (4 impr / 1 click).

## Query ownership / negatives / cannibalization

Owned: - diagnóstico B2G 360 CONFENGE
- diagnóstico operação B2G obras públicas

Negatives:

- diagnóstico B2G gratuito / quiz de maturidade
- B2G glossário (business-to-government definition)
- SmartLic / legacy brand

Cannibalization: `RISK_OFFER_CLUSTER`

- `/diretoria-b2g/` — continuous retainer vs one-shot diagnostic
- `/#contato?jornada=operacao` — hero CTA already points here

## Before → after by block

- `og_title` — Snippet/social title mismatch. Canonical already present (href-before-rel). Do not touch offer copy.
- `canonical` — Parser must accept either attribute order; this is not a missing canonical.
- `schema` — Offer page already uses Service. extra-cli facts stay unpublished.

Exact replacements: `data/bofu-dominance/frozen-specs/patches/diagnostico-b2g-360.patch.txt` (hash-bound; never `git apply` in this campaign).

## Evidence / proof needed

- 28d GSC vs 1/0 @ 15.0 — n is anecdotal; kill if the og:title change does not produce a click and n stays < 30.
- Do not treat extra-cli national coverage PARTIAL as a 360° proof asset.
- Qualified conversation from jornada=operacao remains the commercial evidence (#88/#60), not this patch.

## Success / kill / revert

- Success: at least one click on this service URL in the next complete 28d GSC window, or the pillar leaves the documented position band
- Kill: if 28d GSC after observation still shows service clicks=0 while content clicks hold, the gap is offer/SERP not linking; #88/#60 own the next move
- Revert: revert the hash-bound patch if CTR/position on the owned query does not move while position is stable, or if a sibling cannibalizes the same non-brand intent

ADR: [ADR-STRAT-002](../../../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md).
