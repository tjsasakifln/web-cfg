# Frozen spec: /aditivos-obras-publicas/

**Campaign:** CONFENGE-WEB-BOFU-FROZEN-PILLAR-SPECS-01  
**Mode:** PREPARE-ONLY. `html_mutation=false`. Do not apply the `.patch.txt` before the gate.  
**Corresponding issue:** #128 (`LANDED_AWAITING_LIVE_EVIDENCE`)  
**`earliest_safe_action_at`:** `2026-09-16`  
**Decision state:** P1 / VALIDATE / INBOUND ENGINE. Leverage: revenue + distribution.

## Visitor job

Enquadrar uma mudança de obra (acréscimo, supressão, item novo, serviço extra) em fato documentado, preço justificável e decisão formal antes de executar sem cobertura.

## HTML snapshot (live, hash-bound)

| Field | Value |
|---|---|
| title | Aditivos em obras públicas: documentos e margem | CONFENGE |
| meta | Aditivos em obras públicas: tipos de alteração, documentos, decisão formal e proteção de margem antes de executar sem cobertura. |
| H1 | Aditivos e serviços extras em obras públicas: documentar, precificar e decidir |
| canonical | https://confenge.com.br/aditivos-obras-publicas/ |
| robots | index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1 |
| schema | Organization, Country, ContactPoint, Person, CollegeOrUniversity, CollectionPage, WebSite, ItemList, ListItem, Service, BreadcrumbList, FAQPage, Question, Answer |
| og:title | Aditivos em obras públicas: documentos e margem | CONFENGE |
| content_sha256 | `a4be02dc6705bb15cbbec882412e3b383887e18800abdd85272d506c1c56c450` |
| hero CTA | Verificar o contrato no diagnóstico de defesa de margem → `/ferramentas/diagnostico-defesa-margem/` |
| when-not-to-hire | True |

## Demand-control / #128 / extra-cli

- PR #159: `authorizes_html_edit=False`, `source_kind=LIVE_JOB_OK`, BOFU `observe_only`, `earliest_safe_action_at=2026-09-16`.
- Issue #128: commercial click share `0.0`, GSC row {'impressions': 12, 'clicks': 0, 'position': 49.25}, state `LANDED_AWAITING_LIVE_EVIDENCE`.
- extra-cli PR #435 COMPARABLE `publication_authorization=false`; PR #437 PARTIAL `national_claim_authorized=false`. Factual inputs only.

## GSC precondition

- `gsc_live_available`: `False`
- Other-evidence decision: `USE_HISTORICAL_EXPORT_AND_ISSUE_128_BASELINE`
- Invented live metrics: `False`

## SERP census (aditivos)

Rank status: **UNKNOWN**. SERP ranks are not invented. GSC historical position for this URL is 49.25 (seo/gsc-2026-08-09). Live rank tracking was not run.

Competitors:

- `https://www.jusbrasil.com.br/artigos/alteracoes-contratuais-aditivos-nas-obras-publicas/1289579327` — legal_article
- `https://prefeitura.sp.gov.br/web/procuradoria_geral/w/cejur/cejur-debate-aditivos-em-contratos-de-obras-públicas-com-base-na-lei-n-1413321` — public_sector_event
- `https://www.interempresas.net/ObrasPublicas/494172-Master-Builders-Solutions-referente-mundial-en-aditivos-para-la-Construccion.html` — chemical_admixture_vendor

Intent gaps:

- Query 'aditivos obras públicas' collides with concrete-admixture SERPs; the commercial job (documentos, limite 25/50, margem) is under-served by generic legal explainers.
- No observed contractor-side decision utility that names when NOT to hire. CONFENGE already has that block; it is not yet a ranking claim.
- CONFENGE rank for the generic query is UNKNOWN; GSC shows pos 49.25 / 0 clicks / 6 query impressions on 'aditivos obras públicas'.

## Query ownership / negatives / cannibalization

Owned: - aditivos obras públicas
- aditivos em obras públicas

Negatives:

- aditivos para concreto / aditivos químicos / Master Builders
- aditivo de prazo sem mudança de escopo (atrasos family)
- SmartLic product or legacy brand queries

Cannibalization: `RISK_DECLARED_NOT_MEASURED_LIVE`

- `/conteudos/aditivo-qualitativo-quantitativo/` — 22 impr / 0 clicks / pos 6.09
- `/conteudos/limite-aditivo-25-50-obra-publica/` — 14 impr / 0 clicks / pos 11.0

## Before → after by block

- `h1` — Front-load the GSC query lead already present in <title> so H1 and snippet agree. No new section.
- `title_meta_canonical` — Issue #128 snippet pass already landed (LANDED_AWAITING_LIVE_EVIDENCE). This patch is the next hypothesized alignment, not a second snippet rewrite of title.
- `schema` — CollectionPage is a hub signal; changing @type is a larger experiment than this frozen draft.
- `cta` — CTA/offer code is out of scope for this campaign.

Exact replacements: `data/bofu-dominance/frozen-specs/patches/aditivos-obras-publicas.patch.txt` (hash-bound; never `git apply` in this campaign).

## Evidence / proof needed

- Live GSC 28d on /aditivos-obras-publicas/ vs 12/0 @ 49.25 — requires GSC_CREDENTIALS_JSON or a new manual export. LIVE_JOB_OK is not zero.
- Query 'aditivos obras públicas' clicks/position vs 6/0 @ 35.
- Content→service transitions remain UNKNOWN without analytics export.
- extra-cli PR #435 COMPARABLE (publication_authorization=false) must not appear as a public case on this page. Proof-needed only if a later offer cites a named contract.
- Do not close #128 on deploy; evidential close needs the 28d GSC window.

## Success / kill / revert

- Success: at least one click on this service URL in the next complete 28d GSC window, or the pillar leaves the documented position band
- Kill: if 28d GSC after observation still shows service clicks=0 while content clicks hold, the gap is offer/SERP not linking; #88/#60 own the next move
- Revert: revert the hash-bound patch if CTR/position on the owned query does not move while position is stable, or if a sibling cannibalizes the same non-brand intent

ADR: [ADR-STRAT-002](../../../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md).
