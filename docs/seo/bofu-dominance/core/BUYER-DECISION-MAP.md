# Buyer decision map — issue #543

**As of:** `2026-08-31`
**Origin/main baseline:** `81c600b7c26dcc606d3a03e648ecd9820d9c1c37`
**Decision state:** `EXECUTE_NOW`
**Wave decision:** `INSUFFICIENT_EVIDENCE`
**North Star:** organic/high-intent visit → useful progression → CTA → CONFENGE_WEB receipt → qualified opportunity → proposal → contract → margin

## Outcome

The canonical 15-family intent universe is projected 1:1 into **13 URL owners** and **2 explicit gaps**. Every buyer job has exactly one owner or gap; no public HTML, navigation, CTA, form, runtime or measurement window changed.

## Visitor job and hypothesis

For each economically relevant decision, the buyer must find one CONFENGE answer, a truthful proof/offer boundary and an explicit next decision. The hypothesis is that one versioned projection prevents cannibalization and sends the next wave to the highest-leverage controllable gaps instead of creating pages per keyword.

## Coverage and honesty

- buyer jobs: **15/15 (100%)**
- unique canonical owners: **13**
- explicit gaps: **2**
- GSC `UNKNOWN`: **15/15**; UNKNOWN is never zero demand or zero rank
- protected routes held at `MEASUREMENT_WAIT`: **6/6**
- coverage states: `COMMERCIAL_BRIDGE_GAP`=2, `CONTENT_GAP`=1, `MEASUREMENT_WAIT`=9, `NO_DEMAND_EVIDENCE`=1, `OWNED_BUT_WEAK`=2

## Buyer job → owner/gap → next decision

| Query family | Buyer job | Owner or gap | State | Proof | Offer / CTA | Next decision → destination |
|---|---|---|---|---|---|---|
| `aditivos` | Decidir se um acréscimo, supressão ou serviço extra cabe em aditivo formal antes de executar sem cobertura. | `https://confenge.com.br/aditivos-obras-publicas/` | `MEASUREMENT_WAIT` | `PUBLIC_METHOD_AND_SUPPORT` | `aditivos-obras-publicas` / Enquadrar o evento contratual | Formalizar termo ou apostila antes de executar, ou interromper o escopo sem cobertura. → `https://confenge.com.br/aditivos-obras-publicas/` |
| `medicoes-pagamentos` | Contestar glosa, medição rejeitada ou parcela retida com nexo contratual e prova contemporânea. | `https://confenge.com.br/medicoes-glosas-obras-publicas/` | `MEASUREMENT_WAIT` | `PUBLIC_METHOD_AND_SUPPORT` | `medicoes-glosas-obras-publicas` / Falar com Tiago | Contestar a glosa, aceitar o corte ou estruturar defesa formal com prova contemporânea. → `https://confenge.com.br/medicoes-glosas-obras-publicas/` |
| `reequilibrio` | Decidir se cabe reequilíbrio econômico-financeiro agora e como instruir o pleito. | `https://confenge.com.br/reequilibrio-obras-publicas/` | `MEASUREMENT_WAIT` | `PUBLIC_METHOD_AND_SUPPORT` | `reequilibrio-obras-publicas` / Falar com Tiago | Escolher entre reajuste, repactuação, reequilíbrio ou não pleitear com base no fato e no contrato. → `https://confenge.com.br/reequilibrio-obras-publicas/` |
| `orcamento-bdi` | Auditar orçamento, BDI e base SINAPI/SICRO do edital antes de precificar a proposta. | `https://confenge.com.br/auditoria-orcamento-licitacao/` | `MEASUREMENT_WAIT` | `PUBLIC_METHOD_AND_SUPPORT` | `auditoria-orcamento-licitacao` / Revisar esta oportunidade | Participar, impugnar a planilha ou recusar a licitação após revisar base, BDI e regime. → `https://confenge.com.br/auditoria-orcamento-licitacao/` |
| `carteira-operacao` | Diagnosticar a operação B2G da carteira, não um contrato isolado. | `https://confenge.com.br/diagnostico-b2g-360/` | `MEASUREMENT_WAIT` | `PUBLIC_METHOD_ONLY` | `diagnostico-b2g-360` / Diagnosticar a operação B2G | Escolher diagnóstico pontual da carteira, rotina contínua ou manutenção da operação interna. → `https://confenge.com.br/#formulario-contato` |
| `edital-proposta` | Decidir participar, impugnar ou ajustar a proposta antes do preço final. | `https://confenge.com.br/diagnostico-pre-licitacao/` | `MEASUREMENT_WAIT` | `PUBLIC_METHOD_AND_SUPPORT` | `diagnostico-pre-licitacao` / Falar com Tiago | Participar, impugnar ou ajustar a proposta após o go/no-go humano sobre edital, regime e risco. → `https://confenge.com.br/diagnostico-pre-licitacao/` |
| `defesa-margem` | Partir de um contrato público real e decidir se vale uma segunda leitura técnica de margem. | `https://confenge.com.br/defesa-margem-contratos-publicos/` | `OWNED_BUT_WEAK` | `PUBLIC_METHOD_ONLY` | `defesa-margem-contratos-publicos` / Avaliar contrato sob pressão | Contratar uma segunda leitura técnica do contrato ou seguir internamente com os riscos já identificados. → `https://confenge.com.br/#formulario-contato` |
| `atrasos-prorrogacao` | Proteger prazo e documentar prorrogação, paralisação ou atraso imputável. | `https://confenge.com.br/atrasos-prorrogacao-obras-publicas/` | `MEASUREMENT_WAIT` | `PUBLIC_METHOD_AND_SUPPORT` | `atrasos-prorrogacao-obras-publicas` / Enquadrar o atraso agora | Notificar, pedir prorrogação, preparar defesa ou acelerar com uma cronologia documentada. → `https://confenge.com.br/atrasos-prorrogacao-obras-publicas/` |
| `defesa-sancoes` | Responder notificação, defesa técnica ou risco de sanção/extinção com cronologia e nexo. | `https://confenge.com.br/defesa-tecnica-contratos-publicos/` | `OWNED_BUT_WEAK` | `PUBLIC_METHOD_AND_SUPPORT` | `defesa-tecnica-contratos-publicos` / Falar com Tiago | Defender, negociar ou preparar extinção e impedimento com cronologia, nexo e prova contemporânea. → `https://confenge.com.br/defesa-tecnica-contratos-publicos/` |
| `gestao-contratual` | Decidir se a construtora contrata acompanhamento contínuo de contratos públicos. | `https://confenge.com.br/acompanhamento-contratos-obras/` | `COMMERCIAL_BRIDGE_GAP` | `PUBLIC_METHOD_ONLY` | `acompanhamento-contratos-obras` / Falar com Tiago | Escolher equipe própria, acompanhamento contínuo ou diagnóstico pontual da carteira. → `https://confenge.com.br/#formulario-contato` |
| `bid-room` | Operar uma sala de licitação de obras com recorte, prazo e decisão humana. | `https://confenge.com.br/bid-room-licitacoes-obras/` | `COMMERCIAL_BRIDGE_GAP` | `PUBLIC_METHOD_ONLY` | `bid-room-licitacoes-obras` / Solicitar canal seguro para envio | Montar Bid Room para uma proposta viva ou voltar ao diagnóstico pré-licitação pontual. → `https://confenge.com.br/#formulario-contato` |
| `diagnostico-expansao` | Decidir em quais compradores, territórios e segmentos a construtora deve concentrar uma expansão B2G antes de dispersar capital comercial. | `https://confenge.com.br/diagnostico-b2g-expansao/` | `MEASUREMENT_WAIT` | `PUBLIC_METHOD_ONLY` | `diagnostico-b2g-expansao` / Enquadramento atribuído — CFG-DIAG-EXP-v1 | Contratar diagnóstico pontual, manter o recorte atual ou não investir na expansão agora. → `https://confenge.com.br/#formulario-contato` |
| `diretoria-b2g` | Decidir se a construtora precisa de direção B2G recorrente para priorizar oportunidades e contratos dentro da capacidade disponível. | `https://confenge.com.br/diretoria-b2g/` | `MEASUREMENT_WAIT` | `PUBLIC_METHOD_ONLY` | `diretoria-b2g` / Diagnosticar encaixe da Diretoria B2G | Pedir enquadramento de capacidade, contratar apoio pontual ou manter direção interna. → `https://confenge.com.br/#formulario-contato` |
| `bid-readiness` | Antes de enviar a proposta, o edital, a planilha, a documentação e o acervo estão cobertos para um go/no-go humano? | `GAP: NO_DEMAND_EVIDENCE` | `NO_DEMAND_EVIDENCE` | `NO_PUBLIC_PROOF` | `none` / none | Revalidar demanda e contrato autorizado antes de decidir qualquer consumer; o diagnóstico pré-licitação segue como owner do go/no-go amplo. → `https://confenge.com.br/diagnostico-pre-licitacao/` |
| `partner-integrity` | Consultar ocorrências públicas CEIS/CNEP de parceiro/consórcio/subcontratado antes de diligência humana. | `GAP: CONTENT_GAP` | `CONTENT_GAP` | `NO_PUBLIC_PROOF` | `none` / none | Ampliar diligência documental ou manter cobertura UNKNOWN após o contrato oficial e a revisão humana estarem disponíveis. → `GAP:partner-integrity` |

## Controllable gaps for the next wave

Rule: `commercial_intent × economic_value × search_demand × ability_to_win × content_gap`. All search-demand values are UNKNOWN, so the realized product stays null; zero and a fabricated floor are never substituted. Ordering uses only the potential ordinal ceiling, then the product of known factors, with a hard cap of five.

| Rank | Family | State | Demand-aware score | Finite next-wave output |
|---:|---|---|---:|---|
| 1 | `defesa-margem` | `OWNED_BUT_WEAK` | `UNKNOWN`; ceiling 1500, known factors 300 | Audit proof and progression for this single owner before any URL-exact content change. |
| 2 | `gestao-contratual` | `COMMERCIAL_BRIDGE_GAP` | `UNKNOWN`; ceiling 1280, known factors 256 | Specify one URL-exact next-decision bridge and validate it against the 360 owner before implementation. |
| 3 | `bid-room` | `COMMERCIAL_BRIDGE_GAP` | `UNKNOWN`; ceiling 1200, known factors 240 | Specify the Bid Room versus pre-licitation decision edge without creating another offer URL. |
| 4 | `defesa-sancoes` | `OWNED_BUT_WEAK` | `UNKNOWN`; ceiling 1125, known factors 225 | Validate the single supporting-to-owner edge and proof boundary before a URL-exact change. |

The two URL gaps are deliberately absent from this controllable queue: `bid-readiness` has independent `NO_DEMAND_EVIDENCE` governance evidence in closed #155, while `partner-integrity` is blocked on the official upstream contract in open #156.

## Data ownership, analytics and gates

- `intent-registry.v2` remains the only intent universe; this file is a hash-pinned derived projection.
- `bofu-intent-matrix` owns existing route/CTA/offer projection; `public-family-registry` remains the public conversion gate.
- `content-service-map` is read-only here because it is frozen by the active measurement window.
- `extra-cli` owns facts and provenance through versioned SELECT-only contracts.
- Warmbly owns qualified opportunity, proposal, contract, margin and outcomes after `source=CONFENGE_WEB` receipt.
- Public analytics remain aggregate allowlist only, without PII.
- `npm run bofu-ownership:check` verifies input hashes, 100% coverage, owner uniqueness/existence, closed operational issues, high-intent orphans, explicit decision edges, protected routes and UNKNOWN honesty.
- `npm run inbound:gates` embeds the same fail-closed projection gate.

## Source reconciliation

| Versioned authority | SHA-256 |
|---|---|
| `data/bofu-dominance/core/intent-registry.v2.json` | `6abc9fe2d63d88a675121c2a854ca15c4d687c65e3defa59e87d2b7fcfa61a69` |
| `data/organic/bofu-intent-matrix.json` | `c8a8c7f0e1d73144f9b3f8f938e12e7f70122b7c87e3af01ca3ea1c57de78409` |
| `data/organic/demand-map.json` | `8002daa6863981324692bda3de6fe99f93dcf98ae86a98d4d19a52d7b9321a06` |
| `data/organic/content-service-map.json` | `7f3840a5092fc2b9636899d850d9d68660d377636bce36d63a7a60f6b345d4ef` |
| `data/organic/public-family-registry.json` | `f25ce2713b9b09d17951d2fb7417a6e487e708b5ebbefb05c420b8f5e2928fb6` |
| `data/bofu-dominance/frozen-specs/query-ownership.json` | `fe4948670e8b1e01fc96cb29e21686e6a78389a3df713044375f79941627c6a2` |
| `data/organic/medicoes-glosas-query-ownership.v1.json` | `bd4f120c7e565eba03fddc843647a75a90bb9cd6413bc61418fa5df5b53567ef` |
| `data/bofu-dominance/core/gsc-live-overlay.v1.json` | `c9ff7ee00fa58fc4e7756a2c1e733c3ff6269272cf6b58a5c378386476470f14` |
| `data/bofu-dominance/core/issue-state-snapshot.v1.json` | `f7112f325b44e33192c8a85018f60b0d1e7059e6f29a0ab260dcd685249cb877` |

## Rollback and architecture

Rollback is a revert of this projection, validator, generated report and the historical/operational issue-field reconciliation in the existing registry. There is no URL, indexation, copy, link, CTA, form or runtime rollback because none changed.

Affected authorities: ADR-STRAT-002, RUNTIME-AUTHORITY and MARKET-CAPTURE-OS. No boundary changes: CONFENGE remains the only public surface, extra-cli remains truth/provenance owner and Warmbly remains commercial-action owner.

## 100-repetition test

Passes: each future query observation, owner decision and outcome enriches the same 15-family projection and deterministic priority rule. It does not create 100 pages, 100 keyword issues or a second identity/data model.
