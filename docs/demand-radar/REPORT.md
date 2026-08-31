# Minimum Viable CONFENGE Demand Radar

- **As of:** `2026-08-31`
- **Origin/main pin:** `81c600b7c26dcc606d3a03e648ecd9820d9c1c37`
- **Decision state:** `EXECUTE_NOW`
- **Executive front:** `INBOUND_ENGINE`
- **Method:** staged lexicographic decisions; no composite score
- **Authority:** internal advisory only; no public mutation

The engine answers which few search-market opportunities deserve engineering attention now, why, who owns the canonical answer, and which bounded action class is justified. Qualified commercial opportunities—not pages, keywords, impressions, CTR or raw leads—remain the North Star.

## Source state

- Approved-source manifest: `e72ed9cf69e387f080278b3fdde1f1796df1a2a331dc1b463dae5eb9fe902891`
- `CANONICAL_BOFU_OWNER_PROJECTION` → `bofu-owner-projection-2026-08-31-pr545`; 15 records; freshness `CURRENT`; envelope `e9bd9cb13207c384e50f39d9e7bcddceca07bdc80108c823b371db649596b837`
- `GSC_PAGE_OVERLAY` → `gsc-page-overlay-2026-08-02-2026-08-29`; 15 records; freshness `ACCEPTED_HISTORICAL`; envelope `d5b2388653fe013dd7badc1312ece0bdee167b34b6eeb26d2faa609b489e475d`
- `KEYWORD_PLANNER` is `UNKNOWN` — No as-of-valid snapshot supplied.
- `GOOGLE_TRENDS` is `UNKNOWN` — No as-of-valid snapshot supplied.
- `SERP_RESEARCH` is `UNKNOWN` — No as-of-valid snapshot supplied.
- `WARMBLY_AGGREGATE_OUTCOMES` is `UNKNOWN` — No as-of-valid snapshot supplied.
- Visible GSC query impressions are heavily censored/anonymized; page evidence does not establish query completeness, demand volume, conversion failure or causality.

## Decision order

1. Hard eligibility: buyer fit, canonical owner/gap, freeze and truth.
2. First-party GSC page evidence.
3. Valid Keyword Planner market breadth.
4. Google Trends relative momentum.
5. PII-free Warmbly QCO/proposal/contract feedback.
6. Execution leverage and the 100-repetition test.
7. Cannibalization, compliance and evidence risk.

`UNKNOWN` remains `UNKNOWN`; it never becomes zero. CPC, if later supplied, is advertiser economics—not CONFENGE contract value. SERP research is qualitative intent/format evidence—not volume or durable rank.

## ACTIONABLE_NOW (4/5)

### 1. `defesa-sancoes` — `IMPROVE_CANONICAL_OWNER`

- Buyer job: Responder notificação, defesa técnica ou risco de sanção/extinção com cronologia e nexo.
- Owner/gap: `https://confenge.com.br/defesa-tecnica-contratos-publicos/` (`OWNED_BUT_WEAK`)
- Evidence/sample: owner 6 imp / 0 clicks / pos 5.33; family 10 imp / 0 clicks; page evidence only
- Commercial relevance: `HIGH` — Resposta frágil pode ampliar exposição a multa, impedimento ou extinção contratual.
- Mechanism: Strengthen proof and decision progression on the existing owner without creating another route.
- Smallest finite next action: Validate the single supporting-to-owner edge and proof boundary before a URL-exact change.
- Owner issue: `#61`
- Authorization: advisory only; public mutation remains `false`.

### 2. `defesa-margem` — `IMPROVE_CANONICAL_OWNER`

- Buyer job: Partir de um contrato público real e decidir se vale uma segunda leitura técnica de margem.
- Owner/gap: `https://confenge.com.br/defesa-margem-contratos-publicos/` (`OWNED_BUT_WEAK`)
- Evidence/sample: owner 6 imp / 0 clicks / pos 7.83; family 6 imp / 0 clicks; page evidence only
- Commercial relevance: `HIGH` — Riscos contratuais não revistos podem permanecer sem enquadramento e continuar pressionando a margem.
- Mechanism: Strengthen proof and decision progression on the existing owner without creating another route.
- Smallest finite next action: Audit proof and progression for this single owner before any URL-exact content change.
- Owner issue: `#60`
- Authorization: advisory only; public mutation remains `false`.

### 3. `bid-room` — `FIX_COMMERCIAL_BRIDGE`

- Buyer job: Operar uma sala de licitação de obras com recorte, prazo e decisão humana.
- Owner/gap: `https://confenge.com.br/bid-room-licitacoes-obras/` (`COMMERCIAL_BRIDGE_GAP`)
- Evidence/sample: owner 4 imp / 0 clicks / pos 5.5; family 4 imp / 0 clicks; page evidence only
- Commercial relevance: `HIGH` — Entradas fragmentadas e decisões tardias podem elevar retrabalho e risco de submissão inadequada.
- Mechanism: Specify one owner-to-CONFENGE_WEB next-decision edge without creating another offer or handoff.
- Smallest finite next action: Specify the Bid Room versus pre-licitation decision edge without creating another offer URL.
- Owner issue: `#88`
- Authorization: advisory only; public mutation remains `false`.

### 4. `gestao-contratual` — `FIX_COMMERCIAL_BRIDGE`

- Buyer job: Decidir se a construtora contrata acompanhamento contínuo de contratos públicos.
- Owner/gap: `https://confenge.com.br/acompanhamento-contratos-obras/` (`COMMERCIAL_BRIDGE_GAP`)
- Evidence/sample: owner 3 imp / 0 clicks / pos 5.0; family 3 imp / 0 clicks; page evidence only
- Commercial relevance: `HIGH` — Rotina fragmentada aumenta omissões, pleitos tardios e perda de continuidade documental.
- Mechanism: Specify one owner-to-CONFENGE_WEB next-decision edge without creating another offer or handoff.
- Smallest finite next action: Specify one URL-exact next-decision bridge and validate it against the 360 owner before implementation.
- Owner issue: `#61`
- Authorization: advisory only; public mutation remains `false`.

## WAIT (9)

### 1. `medicoes-pagamentos` — `WAIT_MEASUREMENT`

- Buyer job: Contestar glosa, medição rejeitada ou parcela retida com nexo contratual e prova contemporânea.
- Owner/gap: `https://confenge.com.br/medicoes-glosas-obras-publicas/` (`MEASUREMENT_WAIT`)
- Evidence/sample: owner 99 imp / 1 clicks / pos 6.61; family 150 imp / 3 clicks; page evidence only
- Commercial relevance: `HIGH` — Glosa, rejeição ou retenção sem resposta sustentada pressiona caixa e pode consolidar perda contratual.
- Mechanism: Keep the protected owner unchanged and ingest the next accepted observation into the same ledger.
- Smallest finite next action: Record the next accepted measurement-window observation; do not edit the protected owner.
- Owner issue: `#128`
- Authorization: advisory only; public mutation remains `false`.

### 2. `aditivos` — `WAIT_MEASUREMENT`

- Buyer job: Decidir se um acréscimo, supressão ou serviço extra cabe em aditivo formal antes de executar sem cobertura.
- Owner/gap: `https://confenge.com.br/aditivos-obras-publicas/` (`MEASUREMENT_WAIT`)
- Evidence/sample: owner 66 imp / 0 clicks / pos 26.91; family 131 imp / 1 clicks; page evidence only
- Commercial relevance: `HIGH` — Executar escopo sem cobertura formal pode comprometer preço, prazo, caixa e defesa contratual.
- Mechanism: Keep the protected owner unchanged and ingest the next accepted observation into the same ledger.
- Smallest finite next action: Record the next accepted measurement-window observation; do not edit the protected owner.
- Owner issue: `#128`
- Authorization: advisory only; public mutation remains `false`.

### 3. `orcamento-bdi` — `WAIT_MEASUREMENT`

- Buyer job: Auditar orçamento, BDI e base SINAPI/SICRO do edital antes de precificar a proposta.
- Owner/gap: `https://confenge.com.br/auditoria-orcamento-licitacao/` (`MEASUREMENT_WAIT`)
- Evidence/sample: owner 28 imp / 1 clicks / pos 8.64; family 436 imp / 7 clicks; page evidence only
- Commercial relevance: `HIGH` — Base de custos ou BDI inadequados podem transformar uma proposta vencedora em obrigação economicamente frágil.
- Mechanism: Keep the protected owner unchanged and ingest the next accepted observation into the same ledger.
- Smallest finite next action: Record the next accepted measurement-window observation; do not mutate SINAPI or the protected owner.
- Owner issue: `#126`
- Authorization: advisory only; public mutation remains `false`.

### 4. `atrasos-prorrogacao` — `WAIT_MEASUREMENT`

- Buyer job: Proteger prazo e documentar prorrogação, paralisação ou atraso imputável.
- Owner/gap: `https://confenge.com.br/atrasos-prorrogacao-obras-publicas/` (`MEASUREMENT_WAIT`)
- Evidence/sample: owner 22 imp / 1 clicks / pos 5.41; family 69 imp / 1 clicks; page evidence only
- Commercial relevance: `HIGH` — Documentação tardia pode comprometer prorrogação, defesa de atraso e exposição a sanções.
- Mechanism: Keep the protected owner unchanged and ingest the next accepted observation into the same ledger.
- Smallest finite next action: Record the next accepted measurement-window observation; do not edit the protected supporting route.
- Owner issue: `#127`
- Authorization: advisory only; public mutation remains `false`.

### 5. `carteira-operacao` — `WAIT_MEASUREMENT`

- Buyer job: Diagnosticar a operação B2G da carteira, não um contrato isolado.
- Owner/gap: `https://confenge.com.br/diagnostico-b2g-360/` (`MEASUREMENT_WAIT`)
- Evidence/sample: owner 16 imp / 0 clicks / pos 4.12; family 16 imp / 0 clicks; page evidence only
- Commercial relevance: `HIGH` — Falhas repetidas de gestão podem reproduzir atrasos, omissões documentais e pressão de margem em vários contratos.
- Mechanism: Keep the protected owner unchanged and ingest the next accepted observation into the same ledger.
- Smallest finite next action: Record the next accepted measurement-window observation; do not edit the protected owner.
- Owner issue: `#128`
- Authorization: advisory only; public mutation remains `false`.

### 6. `reequilibrio` — `WAIT_MEASUREMENT`

- Buyer job: Decidir se cabe reequilíbrio econômico-financeiro agora e como instruir o pleito.
- Owner/gap: `https://confenge.com.br/reequilibrio-obras-publicas/` (`MEASUREMENT_WAIT`)
- Evidence/sample: owner 14 imp / 1 clicks / pos 6.36; family 25 imp / 2 clicks; page evidence only
- Commercial relevance: `HIGH` — Um choque de custo mal enquadrado pode permanecer sem recomposição e pressionar a margem do contrato.
- Mechanism: Keep the protected owner unchanged and ingest the next accepted observation into the same ledger.
- Smallest finite next action: Record the next accepted measurement-window observation; do not edit the protected owner.
- Owner issue: `#128`
- Authorization: advisory only; public mutation remains `false`.

### 7. `edital-proposta` — `WAIT_MEASUREMENT`

- Buyer job: Decidir participar, impugnar ou ajustar a proposta antes do preço final.
- Owner/gap: `https://confenge.com.br/diagnostico-pre-licitacao/` (`MEASUREMENT_WAIT`)
- Evidence/sample: owner 11 imp / 0 clicks / pos 4.64; family 132 imp / 1 clicks; page evidence only
- Commercial relevance: `HIGH` — Um go/no-go frágil consome custo de proposta e pode assumir risco contratual incompatível com preço e capacidade.
- Mechanism: Keep the protected owner unchanged and ingest the next accepted observation into the same ledger.
- Smallest finite next action: Record the next accepted measurement-window observation; do not edit the protected owner.
- Owner issue: `#128`
- Authorization: advisory only; public mutation remains `false`.

### 8. `diretoria-b2g` — `WAIT_MEASUREMENT`

- Buyer job: Decidir se a construtora precisa de direção B2G recorrente para priorizar oportunidades e contratos dentro da capacidade disponível.
- Owner/gap: `https://confenge.com.br/diretoria-b2g/` (`MEASUREMENT_WAIT`)
- Evidence/sample: owner 2 imp / 0 clicks / pos 6.0; family 2 imp / 0 clicks; page evidence only
- Commercial relevance: `HIGH` — Prioridade sem limite de capacidade pode sobrecarregar a equipe e alocar esforço em oportunidades inadequadas.
- Mechanism: Keep the protected owner unchanged and ingest the next accepted observation into the same ledger.
- Smallest finite next action: Wait for an accepted attribution observation; do not change the route from this radar.
- Owner issue: `#237`
- Authorization: advisory only; public mutation remains `false`.

### 9. `diagnostico-expansao` — `WAIT_MEASUREMENT`

- Buyer job: Decidir em quais compradores, territórios e segmentos a construtora deve concentrar uma expansão B2G antes de dispersar capital comercial.
- Owner/gap: `https://confenge.com.br/diagnostico-b2g-expansao/` (`MEASUREMENT_WAIT`)
- Evidence/sample: owner 1 imp / 0 clicks / pos 1.0; family 1 imp / 0 clicks; page evidence only
- Commercial relevance: `HIGH` — Foco disperso pode consumir capacidade comercial em compradores, territórios ou segmentos pouco aderentes.
- Mechanism: Keep the protected owner unchanged and ingest the next accepted observation into the same ledger.
- Smallest finite next action: Wait for an accepted attribution observation; do not change the route from this radar.
- Owner issue: `#237`
- Authorization: advisory only; public mutation remains `false`.

## RESEARCH / DEPRIORITIZE (2)

### 1. `bid-readiness` — `DEPRIORITIZE`

- Buyer job: Antes de enviar a proposta, o edital, a planilha, a documentação e o acervo estão cobertos para um go/no-go humano?
- Owner/gap: `GAP:NO_DEMAND_EVIDENCE` (`NO_DEMAND_EVIDENCE`)
- Evidence/sample: `UNKNOWN` — No valid canonical page mapping exists; manual page evidence remains UNKNOWN and is not zero demand.
- Commercial relevance: `HIGH` — Uma proposta enviada com lacunas pode gerar retrabalho, inabilitação ou compromisso incompatível com o edital.
- Mechanism: Retain the evidence and stop engineering work until a new valid signal arrives.
- Smallest finite next action: Keep the gap in the ledger; do not create a page, issue or owner without new valid demand evidence.
- Owner issue: `#155`
- Authorization: advisory only; public mutation remains `false`.

### 2. `partner-integrity` — `RESEARCH_REQUIRED`

- Buyer job: Consultar ocorrências públicas CEIS/CNEP de parceiro/consórcio/subcontratado antes de diligência humana.
- Owner/gap: `GAP:CONTENT_GAP` (`CONTENT_GAP`)
- Evidence/sample: `UNKNOWN` — No valid canonical page mapping exists; manual page evidence remains UNKNOWN and is not zero demand.
- Commercial relevance: `HIGH` — Cobertura incompleta ou interpretada como certidão pode expor a decisão de parceria e a proposta a risco de integridade.
- Mechanism: Fill the named evidence or authority gap with one bounded snapshot before engineering work.
- Smallest finite next action: Obtain one versioned SELECT-only extra-cli contract snapshot with provenance, freshness and UNKNOWN semantics.
- Owner issue: `#156`
- Authorization: advisory only; public mutation remains `false`.

## Repetition and rollback

Additional observations are normalized into snapshots and rebuild this one ledger; they do not create pages or issues. The stable outputs are this report and `data/demand_radar/ledger.v1.json`.

Rollback is a revert of the internal files and package-script entries. No HTML, CSS, public JavaScript, analytics contract, measurement variable, canonical registry, conversion flow or runtime is changed.
