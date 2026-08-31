# Integrated commercial release measurement ledger

> Generated from `data/organic/experiments/integrated-commercial-release-2026-08-31/ledger.json`. Edit the ledger, not this report.

## Frozen release boundary

The pre-release baseline is `origin/main = public live = 81c600b7c26dcc606d3a03e648ecd9820d9c1c37` as observed at `2026-08-31T18:58:27Z`. The treatment SHA and promotion timestamp are **UNKNOWN** until one public build contains the accepted #548 and #549 changes plus an implementation satisfying #547.

PR heads are component evidence only. They are never substituted for the exact promoted SHA:

| Ref | Kind | State at freeze | Head | Role |
|---|---|---|---|---|
| #548 | pull_request | OPEN | `4c827c5fbf737c25d475ebca2b56a8e0a5cad7c3` | value-first narrative on eight mutable money pages |
| #549 | pull_request | OPEN | `c4af85f58d426f6d617ed0ab63d9b8d397543ced` | explicit CTA/form next-state semantics |
| #547 | issue | OPEN | `UNKNOWN` | truthful D01 credit boundary and recurring-direction offer-ladder step |

## Manual Search Console baseline

Source: User-supplied Google Search Console manual export reported 2026-08-31; values embedded in this ledger because raw CSV files were not supplied. Range: `2026-08-02` through `2026-08-29` (Web, 28 days). This does not update the durable freshness authority owned by #413.

Site context: **27 clicks / 1201 impressions / 2.248% CTR / 8.24 weighted daily position**.

Only 52 of 1201 impressions (4.3297%) appear in the query export. The visible queries are not the query universe. The two weekly samples are context, not a trend.

A page absent from the export is `NO_ROW_IN_EXPORT`; its clicks, impressions, CTR and position remain `UNKNOWN`, never zero.

Cohort membership is frozen locally in the ledger. `page-contract-eight.v1.json` matched the nine-route offer cohort at freeze time; later contract drift is reported separately and never rewrites this historical cohort.

## Route-level frozen baseline

GSC cells are `clicks / impressions / CTR / position`.

| Cohort | Route | GSC page row | Current primary CTA | Primary CTA event | Current form submit | Protection |
|---|---|---|---|---|---|---|
| `money_pages_528` | `/servicos-obras-publicas/` | NO_ROW_IN_EXPORT (UNKNOWN) | Avaliar o Dossiê de Medição, Glosa e Pagamento → `/medicoes-glosas-obras-publicas/` | `content_to_service` | Enviar para análise | NOT_PROTECTED |
| `money_pages_528` | `/diagnostico-b2g-expansao/` | 0 / 1 / 0% / 1.0 | Solicitar o diagnóstico → `#pedido-diagnostico` | `cta_click` | Enviar pedido de enquadramento | NOT_PROTECTED |
| `money_pages_528` | `/bid-room-licitacoes-obras/` | 0 / 4 / 0% / 5.5 | Enviar edital para triagem → `#captura-pilar` | `cta_click` | Solicitar canal seguro para envio | NOT_PROTECTED |
| `money_pages_528` | `/defesa-margem-contratos-publicos/` | 0 / 6 / 0% / 7.83 | Solicitar canal seguro para envio → `#captura-pilar` | `cta_click` | Solicitar canal seguro para envio | NOT_PROTECTED |
| `money_pages_528` | `/atrasos-prorrogacao-obras-publicas/` | 1 / 22 / 4.55% / 5.41 | Enviar dados para análise → `#captura-pilar` | `UNKNOWN (#550)` | Enviar para análise | NOT_PROTECTED |
| `money_pages_528` | `/defesa-tecnica-contratos-publicos/` | 0 / 6 / 0% / 5.33 | Enviar dados para análise → `#captura-pilar` | `UNKNOWN (#550)` | Enviar para análise | NOT_PROTECTED |
| `money_pages_528` | `/acompanhamento-contratos-obras/` | 0 / 3 / 0% / 5.0 | Enviar dados para análise → `#captura-pilar` | `UNKNOWN (#550)` | Enviar para análise | NOT_PROTECTED |
| `money_pages_528` | `/diretoria-b2g/` | 0 / 2 / 0% / 6.0 | Falar sobre minha operação → `WHATSAPP_PREFILLED` | `whatsapp_click` | Pedir avaliação de enquadramento | NOT_PROTECTED |
| `offer_ladder_547` | `/entregas/` | NO_ROW_IN_EXPORT (UNKNOWN) | Encontrar a entrega certa → `#enquadrar` | `cta_click` | Enviar para análise | NOT_PROTECTED |
| `offer_ladder_547` | `/casos/modelo-relatorio-inteligencia-licitacoes/` | NO_ROW_IN_EXPORT (UNKNOWN) | Configurar meu relatório por R$ 599 → `/comercial/radar-decisorio/` | `cta_click` | Registrar pedido de relatório de priorização de licitações | NOT_PROTECTED |
| `offer_ladder_547` | `/casos/modelo-base-quantitativa-canonica/` | NO_ROW_IN_EXPORT (UNKNOWN) | Quero minha base por R$ 690 → `WHATSAPP_PREFILLED` | `whatsapp_click` | Registrar pedido de base quantitativa canônica | NOT_PROTECTED |
| `offer_ladder_547` | `/casos/modelo-apresentacao-executiva-resultados/` | NO_ROW_IN_EXPORT (UNKNOWN) | Quero minha apresentação por R$ 890 → `WHATSAPP_PREFILLED` | `whatsapp_click` | Registrar pedido de apresentação executiva de resultados | NOT_PROTECTED |
| `offer_ladder_547` | `/casos/modelo-mapa-compradores-publicos/` | NO_ROW_IN_EXPORT (UNKNOWN) | Quero meu mapa por R$ 1.200 → `WHATSAPP_PREFILLED` | `whatsapp_click` | Registrar pedido de mapa de compradores públicos | NOT_PROTECTED |
| `offer_ladder_547` | `/casos/modelo-contratos-vincendos-relicitacao/` | NO_ROW_IN_EXPORT (UNKNOWN) | Quero meu mapa de vincendos por R$ 1.450 → `WHATSAPP_PREFILLED` | `whatsapp_click` | Registrar pedido de painel de contratos vincendos | NOT_PROTECTED |
| `offer_ladder_547` | `/casos/modelo-mapeamento-concorrentes-publicos/` | NO_ROW_IN_EXPORT (UNKNOWN) | Quero meu mapeamento por R$ 1.900 → `WHATSAPP_PREFILLED` | `whatsapp_click` | Registrar pedido de mapeamento de concorrentes | NOT_PROTECTED |
| `offer_ladder_547` | `/casos/modelo-painel-precos-obras-publicas/` | NO_ROW_IN_EXPORT (UNKNOWN) | Quero meu painel por R$ 2.400 → `WHATSAPP_PREFILLED` | `whatsapp_click` | Registrar pedido de painel de preços de obras públicas | NOT_PROTECTED |
| `offer_ladder_547` | `/casos/modelo-relatorio-executivo-consolidado/` | NO_ROW_IN_EXPORT (UNKNOWN) | Quero o consolidado por R$ 3.750 → `WHATSAPP_PREFILLED` | `whatsapp_click` | Registrar pedido de relatório executivo consolidado | NOT_PROTECTED |

## Funnel availability

| Stage | Availability | Canonical event / owner | Interpretation |
|---|---|---|---|
| Route visit | AVAILABLE_RAW_AND_AGGREGATED | `page_view` | Denominator, not a lead |
| Primary CTA | Exact raw-event predicate per route; 3 routes incomplete | `content_to_service`, `cta_click`, or `whatsapp_click` | Route aggregates are forbidden; #550 owns the missing hash-CTA semantic |
| Form start | AVAILABLE_RAW_AND_AGGREGATED | `lead_form_start` | Engagement |
| Validation category | PARTIAL_RAW_NOT_AGGREGATED | `lead_form_error` | Ordinary client-validation category is missing; #550 owns the gap |
| Submit | AVAILABLE_RAW_NOT_ROUTE_AGGREGATED | `lead_form_submit` | Attempt, not persistence |
| Receipt | AVAILABLE_RAW_AND_AGGREGATED | `lead_persisted` | Persisted lead denominator, not QCO |
| QCO and downstream | CONDITIONAL_EXTERNAL_OBSERVATION | Warmbly | Missing/unmatchable evidence remains UNKNOWN |

No route-level analytics counts were supplied for the pre-release period. Their baseline values are `UNKNOWN_NOT_EXPORTED`; event availability is not a zero count and later counts cannot become an uplift claim by subtraction.

## Post-release observation contract

- Technical smoke: exact-SHA identity, all 17 routes, CTA/form presence, D01/ladder truth, `CONFENGE_WEB`, consent, Turnstile, idempotency, receipt and PII rejection within 24 hours.
- First read: after 7 complete days on a stable treatment, for data quality and directional progression only.
- Minimum honest decision window: 28 complete days, at least 100 route visits and 20 exact-predicate raw primary CTA events **per cohort**. These are sufficiency gates, not effect or success thresholds.
- Money pages and offer-ladder pages remain separate cohorts. SERP exposure remains context only and is never combined with conversion into one score.
- Any later SHA touching a cohort route or shared CTA/form/offer contract must be logged and segmented or must end the window.
- The extractor remains blocked while the treatment anchor is UNKNOWN. After promotion it requires the matching exact SHA plus an explicit single-treatment stability assertion, emits that SHA and promotion time, and accepts only an explicitly asserted-complete raw-event export with an inclusive UTC start and exclusive UTC end; without those bindings it fails closed instead of returning zeros. Its per-route predicates exclude final CTAs and submit-side CTA aliases from the primary-CTA gate.

## Terminal decision

- **REPEAT:** After the minimum window and fixed sufficiency gate, keep the treatment for another declared window when invariants remain green, the next state and receipt stay coherent, and at least one persisted receipt is observed. REPEAT is not a causal win or ROI claim.
- **CHANGE:** After the minimum window and fixed sufficiency gate, use when a reproducible CTA/receipt semantic mismatch, offer-ladder contradiction, or observable progression defect has a concrete corrective hypothesis. This is not proof that the release caused a business outcome.
- **STOP:** Use immediately for a confirmed fail-closed, privacy, consent, Turnstile, idempotency, receipt, CONFENGE_WEB, offer-truth or protected-route regression. Do not wait 28 days for a safety or truth failure.
- **INSUFFICIENT_EVIDENCE:** Use when the exact promoted SHA/window is missing or mixed, either cohort misses a fixed denominator, required CTA semantics remain unobservable, GSC is incomparable for an SEO read, or Warmbly evidence is missing/unjoinable for downstream claims. Never replace this state with zero.

Thresholds, windows and decision rules are frozen before promotion. Tiny-sample CTR movement, visible-query rows, clicks, form submissions or receipts cannot prove causality, ROI, QCO, proposal, contract or margin.

## Ownership, protection and rollback

`web-cfg` owns public acquisition, capture and PII-free analytics. `extra-cli` owns facts/identity/provenance through SELECT-only contracts. Warmbly owns commercial action and downstream outcomes. Issues #126, #127, #128, #327, #387 and #529 remain protected; this ledger neither resets nor releases them. #413 remains the GSC freshness authority and #545 remains the BOFU ownership projection.

Rollback this ledger, validator and report together. A later public treatment rollback must preserve this frozen baseline and all observation history.
