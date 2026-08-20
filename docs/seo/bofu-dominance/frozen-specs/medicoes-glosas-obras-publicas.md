# Frozen spec: /medicoes-glosas-obras-publicas/

**Campaign:** CONFENGE-WEB-BOFU-FROZEN-PILLAR-SPECS-01  
**Mode:** PREPARE-ONLY. `html_mutation=false`. Do not apply the `.patch.txt` before the gate.  
**Corresponding issue:** #128 (`LANDED_AWAITING_LIVE_EVIDENCE`)  
**`earliest_safe_action_at`:** `2026-09-16`  
**Decision state:** P1 / VALIDATE / INBOUND ENGINE. Leverage: revenue + distribution.

## Visitor job

Recuperar medição, contestar glosa e transformar serviço executado em valor recebido com prova contemporânea.

## HTML snapshot (live, hash-bound)

| Field | Value |
|---|---|
| title | Medições, glosas e pagamentos em obras públicas | CONFENGE |
| meta | Critérios de medição, glosas, parcelas incontroversas, atrasos de pagamento e documentação capaz de transformar serviço executado em valor efetivamente recebido. |
| H1 | Medições, glosas e pagamentos em obras públicas |
| canonical | https://confenge.com.br/medicoes-glosas-obras-publicas/ |
| robots | index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1 |
| schema | Organization, Country, ContactPoint, Person, CollegeOrUniversity, CollectionPage, WebSite, ItemList, ListItem, Service, BreadcrumbList, FAQPage, Question, Answer |
| og:title | Medições, glosas e pagamentos em obras públicas | CONFENGE |
| content_sha256 | `5c0d939b017d75510ab7db3b3261b49f4001401809ad5e04061204e1caa48696` |
| hero CTA | Analisar uma demanda → `https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Gostaria%20de%20analisar%20uma%20demanda%20relacionada%20a%20licita%C3%A7%C3%A3o%2C%20contrato%20ou%20obra%20p%C3%BAblica.` |
| when-not-to-hire | True |

## Demand-control / #128 / extra-cli

- PR #159: `authorizes_html_edit=False`, `source_kind=LIVE_JOB_OK`, BOFU `observe_only`, `earliest_safe_action_at=2026-09-16`.
- Issue #128: commercial click share `0.0`, GSC row {'impressions': 8, 'clicks': 0, 'position': 7.88}, state `LANDED_AWAITING_LIVE_EVIDENCE`.
- extra-cli PR #435 COMPARABLE `publication_authorization=false`; PR #437 PARTIAL `national_claim_authorized=false`. Factual inputs only.

## GSC precondition

- `gsc_live_available`: `False`
- Other-evidence decision: `USE_HISTORICAL_EXPORT_AND_ISSUE_128_BASELINE`
- Invented live metrics: `False`

## SERP census (medicoes-pagamentos)

Rank status: **UNKNOWN**. Do not invent pillar rank. Supporting article /conteudos/glosa-de-medicao-obra-publica/ was observed in the web sample; GSC historical CTR there is 12.5% (8 impr / 1 click).

Competitors:

- `https://licitacoesecontratos.tcu.gov.br/4-3-7-criterios-de-medicao-e-de-pagamento-2/` — tcu_manual
- `https://www.migalhas.com.br/depeso/231732/o-instituto-da-glosa--retencao-de-pagamentos-nos-contratos-administrativos` — legal_doctrine
- `https://effecti.com.br/glosa-contrato-publico/` — saas_explainer
- `https://confenge.com.br/conteudos/glosa-de-medicao-obra-publica/` — own_supporting

Intent gaps:

- Money query 'glosa de medição obra pública' already has a CONFENGE supporting URL with a click; the service pillar has 8 impr / 0 clicks. Transfer problem, not missing page.
- Generic glosa explainers (health-plan / TIC / public-controladoria) pollute the term.
- Pillar rank UNKNOWN beyond GSC pos 7.88.

## Query ownership / negatives / cannibalization

Owned: - medições glosas obras públicas
- glosa de medição obra pública (service landing, after transfer)

Negatives:

- glosa de convênio médico / plano de saúde
- glosa TCU as auditoria de contas (controladoria, not contractor cash)
- glosa em contratos de TIC / NMS

Cannibalization: `RISK_OWN_SUPPORTING_OUTRANKS_PILLAR`

- `/conteudos/glosa-de-medicao-obra-publica/` — 8 impr / 1 click / pos 4.0 / CTR 12.5%
- `/conteudos/medicao-de-obra-publica-rejeitada/` — 6 impr / 1 click / pos 5.5 / CTR 16.67%
- `/conteudos/atraso-na-medicao-obra-publica/` — 10 impr / 0 clicks / pos 8.1

## Before → after by block

- `meta_og_schema_description` — Hygiene snippet. No new claims. Completes a truncated description already on-page.
- `title_h1` — Title and H1 already agree. Do not front-load a query owned by a high-CTR supporting article.
- `cta` — HTML/CTA freeze.

Exact replacements: `data/bofu-dominance/frozen-specs/patches/medicoes-glosas-obras-publicas.patch.txt` (hash-bound; never `git apply` in this campaign).

## Evidence / proof needed

- 28d GSC on the pillar vs 8/0 @ 7.88 and on glosa supporting vs 8/1 @ 4.0 — do not join query to a lead.
- Whether a later snippet on the pillar steals the supporting click (cannibalization kill).
- Analytics content→service still UNKNOWN.
- extra-cli PARTIAL/COMPARABLE not applicable as published proof on this page.

## Success / kill / revert

- Success: at least one click on this service URL in the next complete 28d GSC window, or the pillar leaves the documented position band
- Kill: if 28d GSC after observation still shows service clicks=0 while content clicks hold, the gap is offer/SERP not linking; #88/#60 own the next move
- Revert: revert the hash-bound patch if CTR/position on the owned query does not move while position is stable, or if a sibling cannibalizes the same non-brand intent

ADR: [ADR-STRAT-002](../../../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md).
