# Frozen spec: /auditoria-orcamento-licitacao/

**Campaign:** CONFENGE-WEB-BOFU-FROZEN-PILLAR-SPECS-01  
**Mode:** PREPARE-ONLY. `html_mutation=false`. Do not apply the `.patch.txt` before the gate.  
**Corresponding issue:** #128 (`LANDED_AWAITING_LIVE_EVIDENCE`)  
**`earliest_safe_action_at`:** `2026-09-16`  
**Decision state:** P1 / VALIDATE / INBOUND ENGINE. Leverage: revenue + distribution.

## Visitor job

Encontrar itens que concentram risco de preço/BDI/referência e conhecer a margem real antes de assumir a obra.

## HTML snapshot (live, hash-bound)

| Field | Value |
|---|---|
| title | Auditoria de orçamento, BDI, SINAPI e preço | CONFENGE |
| meta | BDI, deságio, exequibilidade, SINAPI, SICRO, composições próprias, cotações e data-base tratados como sistema econômico, não como preenchimento mecânico de planilha. |
| H1 | Auditoria de orçamento, BDI, SINAPI e preço |
| canonical | https://confenge.com.br/auditoria-orcamento-licitacao/ |
| robots | index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1 |
| schema | Organization, Country, ContactPoint, Person, CollegeOrUniversity, CollectionPage, WebSite, ItemList, ListItem, Service, BreadcrumbList, FAQPage, Question, Answer |
| og:title | Auditoria de orçamento, BDI, SINAPI e preço | CONFENGE |
| content_sha256 | `a00f9f49c758be22efd40dbb81e3b2d55b9bb8bad60bed22e0a6988b49639235` |
| hero CTA | Analisar uma demanda → `https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Gostaria%20de%20analisar%20uma%20demanda%20relacionada%20a%20licita%C3%A7%C3%A3o%2C%20contrato%20ou%20obra%20p%C3%BAblica.` |
| when-not-to-hire | True |

## Demand-control / #128 / extra-cli

- PR #159: `authorizes_html_edit=False`, `source_kind=LIVE_JOB_OK`, BOFU `observe_only`, `earliest_safe_action_at=2026-09-16`.
- Issue #128: commercial click share `0.0`, GSC row {'impressions': 3, 'clicks': 0, 'position': 9.0}, state `LANDED_AWAITING_LIVE_EVIDENCE`.
- extra-cli PR #435 COMPARABLE `publication_authorization=false`; PR #437 PARTIAL `national_claim_authorized=false`. Factual inputs only.

## GSC precondition

- `gsc_live_available`: `False`
- Other-evidence decision: `USE_HISTORICAL_EXPORT_AND_ISSUE_128_BASELINE`
- Invented live metrics: `False`

## SERP census (orcamento-bdi)

Rank status: **UNKNOWN**. Web sample returned the CONFENGE pillar URL with the H1/og string 'Auditoria de orçamento, BDI, SINAPI e preço | CONFENGE', which is NOT the current <title>. Rank number UNKNOWN.

Competitors:

- `https://licitacoesecontratos.tcu.gov.br/4-4-3-6-orcamento-detalhado-do-custo-global-da-obra/` — tcu_manual
- `https://www.orcafascio.com/papodeengenheiro/bdi-em-obras-publicas` — saas_explainer
- `https://repositorio.cgu.gov.br/bitstream/1/44963/5/Manual_de_Auditoria_de_Obras_Publicas_II.pdf` — cgu_audit_manual
- `https://www.filipemachadoengenharia.com/artigos/auditoria-tecnica-licitacao-publica-obra/` — peer_contractor_article

Intent gaps:

- Query language 'auditoria de obras públicas' often means CGU/TCU controladoria, not a contractor pre-bid audit. Negative-query hygiene matters.
- SINAPI money queries belong to /conteudos/sinapi-desonerado-nao-desonerado/ (#126). Pillar must not steal that experiment.
- Pillar GSC: 3/0 @ 9.0 — anecdotal.

## Query ownership / negatives / cannibalization

Owned: - auditoria de orçamento licitação obras
- BDI obras públicas (service, not the supporting article)

Negatives:

- auditoria TCU/CGU de obras públicas (controle externo)
- SINAPI table download / tabela SINAPI 2026 as a destination
- national SINAPI coverage claims (extra-cli #437 not authorized)

Cannibalization: `RISK_TITLE_CONTAINS_SINAPI`

- `/conteudos/sinapi-desonerado-nao-desonerado/` — 89 impr / 1 click / pos 7.27
- `/conteudos/bdi-diferenciado-obra-publica/` — 11 impr / 2 clicks / CTR 18.18%

## Before → after by block

- `title` — Align <title> with H1 and og:title (already what the web sample displayed). Apply only after gate; still do not rewrite the #126 SINAPI article.
- `meta_og_schema_description` — Complete truncated description already visible in the lead.
- `when_not_to_hire` — Hygiene / consistency with the other five pillars. No new URL.

Exact replacements: `data/bofu-dominance/frozen-specs/patches/auditoria-orcamento-licitacao.patch.txt` (hash-bound; never `git apply` in this campaign).

## Evidence / proof needed

- Do not apply while #126 is in 14/28-day observation if the title change would re-front SINAPI as the pillar query.
- 28d GSC vs 3/0 @ 9.0.
- extra-cli COMPARABLE paving group is not a BDI audit proof and must not be published here.

## Success / kill / revert

- Success: at least one click on this service URL in the next complete 28d GSC window, or the pillar leaves the documented position band
- Kill: if 28d GSC after observation still shows service clicks=0 while content clicks hold, the gap is offer/SERP not linking; #88/#60 own the next move
- Revert: revert the hash-bound patch if CTR/position on the owned query does not move while position is stable, or if a sibling cannibalizes the same non-brand intent

ADR: [ADR-STRAT-002](../../../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md).
