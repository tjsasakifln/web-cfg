# Frozen spec: /reequilibrio-obras-publicas/

**Campaign:** CONFENGE-WEB-BOFU-FROZEN-PILLAR-SPECS-01  
**Mode:** PREPARE-ONLY. `html_mutation=false`. Do not apply the `.patch.txt` before the gate.  
**Corresponding issue:** #128 (`LANDED_AWAITING_LIVE_EVIDENCE`)  
**`earliest_safe_action_at`:** `2026-09-16`  
**Decision state:** P1 / VALIDATE / INBOUND ENGINE. Leverage: revenue + distribution.

## Visitor job

Decidir se cabe reequilíbrio agora e estruturar evento, matriz de riscos, nexo e impacto auditável — sem confundir com reajuste.

## HTML snapshot (live, hash-bound)

| Field | Value |
|---|---|
| title | Reequilíbrio econômico-financeiro de obra pública: o que é e quando cabe | CONFENGE |
| meta | Reequilíbrio econômico-financeiro de obra pública: o que é, quando pode existir, diferença entre reajuste e revisão, evento, matriz de riscos, nexo e demonstração do impacto. |
| H1 | Reequilíbrio econômico-financeiro de obra pública |
| canonical | https://confenge.com.br/reequilibrio-obras-publicas/ |
| robots | index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1 |
| schema | Organization, Country, ContactPoint, Person, CollegeOrUniversity, CollectionPage, WebSite, ItemList, ListItem, Service, BreadcrumbList, FAQPage, Question, Answer |
| og:title | Reequilíbrio econômico-financeiro de obra pública: o que é e quando cabe | CONFENGE |
| content_sha256 | `df2c4d5d010fdd617eddd9346b2a32a946e2a93a7f2c6f09848e05f6fbd0b72e` |
| hero CTA | Verificar o contrato no diagnóstico de defesa de margem → `/ferramentas/diagnostico-defesa-margem/` |
| when-not-to-hire | True |

## Demand-control / #128 / extra-cli

- PR #159: `authorizes_html_edit=False`, `source_kind=credential_failure`, BOFU `observe_only`, `earliest_safe_action_at=2026-09-16`.
- Issue #128: commercial click share `0.0`, GSC row {'impressions': 4, 'clicks': 0, 'position': 7.75}, state `LANDED_AWAITING_LIVE_EVIDENCE`.
- extra-cli PR #435 COMPARABLE `publication_authorization=false`; PR #437 PARTIAL `national_claim_authorized=false`. Factual inputs only.

## GSC precondition

- `gsc_live_available`: `False`
- Other-evidence decision: `USE_HISTORICAL_EXPORT_AND_ISSUE_128_BASELINE`
- Invented live metrics: `False`

## SERP census (reequilibrio)

Rank status: **UNKNOWN**. data/organic/search-baseline-2026-08-14.json records CONFENGE_NOT_OBSERVED for 'reequilíbrio contrato obra pública consultoria' and NO_CURRENT_ASSET_RESULT_OBSERVED for site:confenge.com.br/reequilibrio-obras-publicas. Absence in a sample is not non-indexation.

Competitors:

- `https://licitacoesecontratos.tcu.gov.br/6-2-2-1-1-reequilibrio-economico-financeiro-recomposicao-ou-revisao-2/` — tcu_manual
- `https://zenite.blog.br/metodologia-ao-restabelecimento-do-equilibrio-economico-financeiro-inicial-em-contratos-de-obras-publicas/` — legal_blog
- `https://contreinamentos.com.br/curso/reajuste-e-reequilibrio-economico-financeiro-nas-obras-publicas/` — course

Intent gaps:

- SERP is doctrine/TCU/course. Contractor decision utility (when NOT to mount the pleito, nexo, no deferment promise) is the gap CONFENGE already wrote.
- CONFENGE not observed on the 2026-08-14 focused sample. Rank UNKNOWN.

## Query ownership / negatives / cannibalization

Owned: - reequilíbrio econômico-financeiro obra pública
- reequilíbrio contrato obra pública

Negatives:

- reajuste ordinário / índice contratual (not reequilíbrio)
- reequilíbrio econômico-financeiro without obras públicas
- national coverage / national claim copy (extra-cli #437 national_claim_authorized=false)

Cannibalization: `RISK_DECLARED_NOT_MEASURED_LIVE`

- `/conteudos/curva-abc-reequilibrio-contrato/` — 7 impr / 1 click / pos 4.43
- `/ferramentas/checklist-reequilibrio/` — tool vs service; keep distinct jobs

## Before → after by block

- `title_og` — Title/H1 alignment and truncation risk. Do not add invented legal percentages.
- `schema` — Do not silently rewrite ItemList from extra-cli facts.
- `cta` — CTA freeze.

Exact replacements: `data/bofu-dominance/frozen-specs/patches/reequilibrio-obras-publicas.patch.txt` (hash-bound; never `git apply` in this campaign).

## Evidence / proof needed

- URL inspection in GSC/Bing remains the index diagnostic; the 2026-08-14 sample is not proof of non-indexation.
- 28d GSC vs 4/0 @ 7.75.
- Do not cite extra-cli PR #435 COMPARABLE paving peer group as a reequilíbrio case. publication_authorization=false.
- Do not cite extra-cli PR #437 PARTIAL as a national coverage claim. national_claim_authorized=false.

## Success / kill / revert

- Success: at least one click on this service URL in the next complete 28d GSC window, or the pillar leaves the documented position band
- Kill: if 28d GSC after observation still shows service clicks=0 while content clicks hold, the gap is offer/SERP not linking; #88/#60 own the next move
- Revert: revert the hash-bound patch if CTR/position on the owned query does not move while position is stable, or if a sibling cannibalizes the same non-brand intent

ADR: [ADR-STRAT-002](../../../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md).
