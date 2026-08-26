# Frozen spec: /diagnostico-pre-licitacao/

**Campaign:** CONFENGE-WEB-BOFU-FROZEN-PILLAR-SPECS-01  
**Mode:** PREPARE-ONLY. `html_mutation=false`. Do not apply the `.patch.txt` before the gate.  
**Corresponding issue:** #128 (`LANDED_AWAITING_LIVE_EVIDENCE`)  
**`earliest_safe_action_at`:** `2026-09-16`  
**Decision state:** P1 / VALIDATE / INBOUND ENGINE. Leverage: revenue + distribution.

## Visitor job

Decidir participar, esclarecer, impugnar, ajustar estrutura ou abandonar um edital de obra pública antes de imobilizar a equipe na proposta.

## HTML snapshot (live, hash-bound)

| Field | Value |
|---|---|
| title | Diagnóstico pré-licitação para obras públicas | CONFENGE |
| meta | Edital, regime de execução, matriz de riscos, atestados, projeto, cronograma e exequibilidade analisados antes de transformar uma vitória na licitação em um contrato ruim. |
| H1 | Diagnóstico pré-licitação para obras públicas |
| canonical | https://confenge.com.br/diagnostico-pre-licitacao/ |
| robots | index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1 |
| schema | Organization, Country, ContactPoint, Person, CollegeOrUniversity, CollectionPage, WebSite, ItemList, ListItem, Service, BreadcrumbList, FAQPage, Question, Answer |
| og:title | Diagnóstico pré-licitação para obras públicas | CONFENGE |
| content_sha256 | `12d7d0e59003adfac61d03ddebbb3f2a869bc78811f6176f36840647c2ec1a06` |
| hero CTA | Analisar uma demanda → `https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Gostaria%20de%20analisar%20uma%20demanda%20relacionada%20a%20licita%C3%A7%C3%A3o%2C%20contrato%20ou%20obra%20p%C3%BAblica.` |
| when-not-to-hire | True |

## Demand-control / #128 / extra-cli

- PR #159: `authorizes_html_edit=False`, `source_kind=LIVE_JOB_OK`, BOFU `observe_only`, `earliest_safe_action_at=2026-09-16`.
- Issue #128: commercial click share `0.0`, GSC row {'impressions': 1, 'clicks': 0, 'position': 18.0}, state `LANDED_AWAITING_LIVE_EVIDENCE`.
- extra-cli PR #435 COMPARABLE `publication_authorization=false`; PR #437 PARTIAL `national_claim_authorized=false`. Factual inputs only.

## GSC precondition

- `gsc_live_available`: `False`
- Other-evidence decision: `USE_HISTORICAL_EXPORT_AND_ISSUE_128_BASELINE`
- Invented live metrics: `False`

## SERP census (edital-proposta)

Rank status: **UNKNOWN**. Web sample returned the CONFENGE pillar on the branded/offer query. Generic 'como analisar edital' is TOFU legal/SaaS. Rank UNKNOWN.

Competitors:

- `https://conlicitacao.com.br/como-analisar-um-edital-de-licitacao/` — saas_howto
- `https://schiefler.adv.br/edital-de-licitacao/` — law_firm
- `https://metalicitacoes.com.br/os-10-principais-pontos-a-serem-observados-em-um-edital-para-licitacoes-de-obras-publicas/` — listicle
- `https://www.youtube.com/watch?v=RmPXRMjPOg8` — video_howto

Intent gaps:

- TOFU 'como ler um edital' ≠ BOFU 'diagnóstico pré-licitação para obras com matriz de riscos e exequibilidade'.
- Pillar GSC 1/0 @ 18 anecdotal.
- Bid Room is a sibling commercial format; do not keyword-variant this URL into Bid Room.

## Query ownership / negatives / cannibalization

Owned: - diagnóstico pré-licitação obras públicas
- análise de edital de obra pública (service)

Negatives:

- como analisar edital (generic goods/services)
- impugnação de edital as standalone legal product
- tenders/licitações TOFU without contractor margin job (#60 VALIDATE next, not this pillar rewrite)

Cannibalization: `RISK_OFFER_AND_LIBRARY`

- `/bid-room-licitacoes-obras/` — execution format vs diagnostic decision
- `/conteudos/empreitada-preco-global-preco-unitario/` — library guide listed on this pillar

## Before → after by block

- `meta_og_schema_description` — Complete truncated description already in the visible lead.
- `title_h1_canonical` — Already aligned. Do not doorway-keyword 'análise de edital'.
- `cta` — CTA/offer freeze.

Exact replacements: `data/bofu-dominance/frozen-specs/patches/diagnostico-pre-licitacao.patch.txt` (hash-bound; never `git apply` in this campaign).

## Evidence / proof needed

- 28d GSC vs 1/0 @ 18.0.
- Do not publish extra-cli COMPARABLE contract as a pre-bid case study (publication_authorization=false).
- Kill if the meta completion does not move CTR while n stays anecdotal, or if Bid Room cannibalizes the same query.

## Success / kill / revert

- Success: at least one click on this service URL in the next complete 28d GSC window, or the pillar leaves the documented position band
- Kill: if 28d GSC after observation still shows service clicks=0 while content clicks hold, the gap is offer/SERP not linking; #88/#60 own the next move
- Revert: revert the hash-bound patch if CTR/position on the owned query does not move while position is stable, or if a sibling cannibalizes the same non-brand intent

ADR: [ADR-STRAT-002](../../../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md).
