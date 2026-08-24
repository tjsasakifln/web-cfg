# Expansão cumulativa do portfólio: registro de decisão da #329

- **Decision state:** P0 / VALIDATE
- **Fronts:** REVENUE NOW + MARKET INTELLIGENCE MOAT
- **Leverage:** revenue, data, trust, customer
- **Time to evidence:** 30 dias
- **Date:** 2026-08-24
- **Issues:** [#329](https://github.com/tjsasakifln/web-cfg/issues/329) (pai), #330, #331, #332, #333, #334, #335, #336, #327, #328
- **Guardrails:** [AGENTS.md](../../AGENTS.md), [MARKET-CAPTURE-OS](MARKET-CAPTURE-OS.md), [ADR-STRAT-002](../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md)
- **Registro canônico:** `data/commercial/deliverables-registry.v1.json` (`CFG-DELIVERABLES-2026-08-24-v1`)

Este documento registra o que a família #329 decidiu, o que este PR coloca no
repositório e o que continua dependendo de evidência humana ou externa. Ele não
declara market fit, preço validado, venda ou outcome.

## 1. Decisão do fundador de 2026-08-24

O catálogo é **cumulativo**. Nenhuma das oito entregas hoje publicadas em
`/entregas/` sai, muda de nome, é aposentada ou é tratada como erro. A
especificação ampliada serve para endurecer escopo, entrada, saída, prazo e
fronteira das oito, acrescentar entregáveis que cobrem dores hoje apresentadas
apenas como serviço, e organizar a escolha por problema e momento do ciclo.

Consequências operacionais da decisão, reproduzidas do registro:

1. Preço novo é **hipótese de preço-piloto** (`PILOT_HYPOTHESIS`) até existir
   proposta real e outcome observado.
2. Preço publicado das oito atuais (`PUBLISHED_FIRM`) só muda com evidência paga
   e decisão comercial versionada.
3. O registro é a fonte auditável: preço ou estado divergente entre registro e
   HTML reprova CI.
4. Nenhum preço-piloto liga checkout. A #88 continua dona de terms, capacidade e
   pagamento.
5. Toda saída informa FACT, CALCULATION, INFERENCE ou UNKNOWN com fonte, data e
   cobertura.
6. `HOLD` significa não promover, não automatizar ou ajustar embalagem, nunca
   apagar uma entrega existente.

## 2. O que este PR entrega

### 2.1 Registro canônico versionado

`data/commercial/deliverables-registry.v1.json` declara 25 entregáveis
(`CFG-D01` a `CFG-D25`) e 4 contêineres comerciais (`expansion_package`,
`diretoria_flex`, `diretoria_180`, `diretoria_365`). Cada entregável carrega, no
mínimo: `deliverable_id`, `version`, `catalog_number`, `public_name`,
`decision_question`, `lifecycle_stage`, `trigger`, `price`, `price_state`, `sla`,
`scope`, `required_inputs`, `included_outputs`, `exclusions`, `data_contract`,
`offer_container`, `credit_rule`, `capacity_required`, `public_state`,
`checkout_enabled`, `blocking_issue`, `route`, `lead_destination`, `analytics`,
`source_issue` e `market_fit`.

Ausência de campo é falha de CI, não valor padrão. Os quatro estágios de ciclo
(`DISCOVER`, `DECIDE`, `PROTECT`, `OPERATE`) e os quatro graus de evidência são
declarados no próprio arquivo, e não em strings paralelas de página.

### 2.2 Gate fail-closed de CI

`scripts/commercial/deliverables.cjs` é o leitor read-only do registro e o lugar
onde os invariantes vivem em código. Ele não escreve, não precifica e não
promove: promoção exige evidência observada sob o protocolo de market fit, não um
caminho de código. O teste que consome esse módulo entra na suíte executada em
CI. Preço, estado, nome, SLA ou rota divergentes entre registro e HTML reprovam a
suíte, assim como qualquer deriva nos preços congelados das oito atuais.

### 2.3 Protocolo de market fit

`data/commercial/market-fit-protocol.v1.json` (`#336`, estado `NOT_STARTED`) fixa
as três fases (entrevistas de problema, card sort dos 25 cartões, willingness to
pay observada), as dez dimensões de score, as cinco classes de evidência
(`problem`, `solution`, `price`, `delivery`, `outcome`) e os gates `PROMOTE`,
`ADJUST` e `HOLD`. O protocolo existe como contrato; nenhuma rodada foi executada
e o campo `runs` está vazio.

### 2.4 Censo de primeira dobra

`data/commercial/first-fold-contract.v1.json` (`#327`) lista as quatro respostas
obrigatórias, os viewports e 25 rotas comerciais com `evidence_state`. O estado
medido em 2026-08-24 é: 1 `MEASURED_PASS` (`/diagnostico-b2g-expansao/`), 2
`MEASURED_FAIL` (`/servicos-obras-publicas/` e `/problemas-que-resolvemos/`) e o
restante `PENDING`. Uma superfície só declara `MEASURED_PASS` com registro de
medição vinculado; passar em axe, Lighthouse e overflow não aprova nenhuma.

### 2.5 Registro de prova real vazio

`data/commercial/real-proof-registry.v1.json` (`#328`) registra a auditoria de
2026-08-24 com 0 `Review`, 0 `AggregateRating`, 0 logotipo de cliente, 0
depoimento e 0 caso de cliente aprovado, mais os seis campos de consentimento
exigidos pela #249, as regras de publicação e as kill rules. O array `entries`
está vazio e o estado é `BLOCKED_EXTERNAL`.

## 3. O que este PR deliberadamente não entrega

Cada item abaixo depende de evidência humana ou externa que não pode ser
fabricada por código, modelo de linguagem ou screenshot test.

- **As 12 entrevistas ICP e o card sort da #336.** A amostra mínima (3 donos ou
  diretores, 3 de licitações ou comercial, 3 de orçamento ou proposta, 3 de
  contratos, obra ou financeiro, com pelo menos 8 de 12 com licitação ou contrato
  ativo nos últimos 12 meses) não foi recrutada. `state` permanece `NOT_STARTED`.
- **A willingness to pay observada.** As seis ofertas founder-led previstas na
  fase 3 não foram executadas. Nenhuma proposta, aceite, negociação ou recusa foi
  registrada. Todos os 25 entregáveis estão em `market_fit.state = HOLD` com as
  cinco classes de evidência em zero.
- **As 5 sessões ICP da #327.** O teste cético de 3 segundos exige cinco
  participantes elegíveis e consentidos, com meta de 4 de 5 identificando oferta,
  situação e próxima ação sem ajuda. `human_validation.state` é `NOT_STARTED`.
- **A primeira prova real consentida da #328.** Continua `BLOCKED_EXTERNAL`. Sem
  autorização explícita, escopo de identificação, aprovador humano nomeado,
  evidência de que a entrega ocorreu, fatos afirmáveis com fonte e regras de
  retenção, revisão e revogação, não há publicação. Relacionamento, proposta,
  conversa ou trabalho em andamento não são case.
- **A chave oficial e a paginação terminal da #156.** Enquanto ela não fechar, o
  entregável 11 (`CFG-D11`) permanece `public_state = BLOCKED`, sem rota e sem
  `lead_destination`. CEIS e CNEP continuam sinal preliminar, nunca certificado
  de integridade.
- **O checkout.** Nenhum entregável tem `checkout_enabled = true`. Terms,
  capacidade e pagamento continuam sob os gates da #88.

Nenhum preço-piloto é declarado validado. A pesquisa de mesa citada na #329
prova que o problema existe no ambiente de obras públicas; ela não prova que o
ICP da CONFENGE comprará esta embalagem, neste preço e agora.

## 4. Issue a issue

| Issue | Resolvido neste PR | Continua aberto e por quê |
| --- | --- | --- |
| #329 | Registro canônico com 25 entregáveis e 4 contêineres, decisão cumulativa e regras comerciais comuns gravadas em `principles` | Itens 26 a 48 do rol taxativo (issues #337, #339, #340, #342) não estão no registro; o rol só fecha quando essas especificações entrarem |
| #330 | `CFG-D12` a `CFG-D16` com escopo, SLA, insumos, exclusões e crédito para o intensivo da trilha, incluindo as três faixas do 16 | Preço-piloto sem proposta real; páginas, exemplos sintéticos comparáveis e primeira venda com horas, retrabalho e margem continuam pendentes |
| #331 | `CFG-D01` a `CFG-D08` com preço congelado, aritmética do pacote e janela de crédito de 60 dias travadas em código | Endurecimento de objeto, entrada, saída e SLA precisa aparecer no HTML das oito rotas e do hub, e ser conferido contra o registro |
| #332 | `CFG-D09`, `CFG-D10` e `CFG-D11` declarados, com crédito de 30 dias para o pacote de expansão e bloqueio explícito do 11 | Contratos public-read versionados no `extra-cli` não existem; o 11 espera a #156; nenhuma das três tem rota publicada |
| #333 | `CFG-D17` a `CFG-D23` declarados, com o crédito de até R$ 2.900 do 17 para um único dossiê 18 a 23 em 30 dias | Fronteira jurídica, documento mínimo e prazo seguro precisam ficar visíveis nas seis rotas; nenhuma venda registrou esforço, margem ou outcome |
| #334 | `CFG-D24` e `CFG-D25` recebem preço-piloto, gate de capacidade e crédito de até R$ 2.000 do 24 para o 25 ou para a Diretoria | Tabela de diferenciação entre as quatro ofertas confundíveis ainda não está publicada; regra das 100 repetições não tem evidência |
| #335 | Registro versionado como fonte auditável, quatro estágios de ciclo e disclosure progressiva declarada no `DISCOVER` | Arquitetura por tarefa, índice integral, filtros, comparação de 2 a 4 e deep links não foram construídos; as metas humanas dependem da amostra de 12 |
| #336 | Protocolo de três fases, quotas, score, classes de evidência e gates gravados como contrato versionado | Zero entrevista, zero card sort, zero oferta founder-led; todos os 25 permanecem `HOLD` |
| #327 | Contrato de primeira dobra e censo de 25 rotas com estado de evidência por rota | 22 rotas `PENDING` e 2 `MEASURED_FAIL`; as 5 sessões ICP de 3 segundos não foram executadas |
| #328 | Registro de prova real com a auditoria zerada, campos de consentimento, regras de publicação e kill rules | `BLOCKED_EXTERNAL`: depende de uma autorização válida sob o contrato da #249. Nenhuma entrada existe |

## 5. Os 25 entregáveis declarados

Valores extraídos de `data/commercial/deliverables-registry.v1.json`.

| # | `deliverable_id` | Nome público | Ciclo | Preço | Estado |
| ---: | --- | --- | --- | ---: | --- |
| 01 | CFG-D01 | Relatório Executivo de Priorização de Licitações | DISCOVER | R$ 599 | PUBLISHED |
| 02 | CFG-D02 | Base Quantitativa Canônica | DISCOVER | R$ 690 | PUBLISHED |
| 03 | CFG-D03 | Apresentação Executiva de Resultados | DISCOVER | R$ 890 | PUBLISHED |
| 04 | CFG-D04 | Mapa de Compradores Públicos | DISCOVER | R$ 1.200 | PUBLISHED |
| 05 | CFG-D05 | Contratos Vincendos e Recontratação | DISCOVER | R$ 1.450 | PUBLISHED |
| 06 | CFG-D06 | Mapeamento de Concorrentes | DISCOVER | R$ 1.900 | PUBLISHED |
| 07 | CFG-D07 | Painel de Preços de Obras Públicas | DISCOVER | R$ 2.400 | PUBLISHED |
| 08 | CFG-D08 | Relatório Executivo Consolidado | DISCOVER | R$ 3.750 | PUBLISHED |
| 09 | CFG-D09 | Radar de Investimentos Públicos Pré-Edital | DISCOVER | R$ 1.490 | VALIDATE |
| 10 | CFG-D10 | Dossiê de Comprador Público e Risco de Recebimento | DISCOVER | R$ 2.400 | VALIDATE |
| 11 | CFG-D11 | Mapa de Parceiros, Consórcios e Subcontratados | DISCOVER | R$ 2.900 | BLOCKED (#156) |
| 12 | CFG-D12 | Raio-X Go/No-Go do Edital | DECIDE | R$ 1.900 | VALIDATE |
| 13 | CFG-D13 | Matriz de Habilitação e Lacunas de Acervo | DECIDE | R$ 2.900 | VALIDATE |
| 14 | CFG-D14 | Auditoria de Orçamento, BDI e Exequibilidade | DECIDE | R$ 5.900 | VALIDATE |
| 15 | CFG-D15 | Benchmark de Concorrência e Estratégia de Deságio | DECIDE | R$ 3.750 | VALIDATE |
| 16 | CFG-D16 | Bid Room por Oportunidade Crítica | DECIDE | R$ 9.800 / R$ 14.800 / R$ 19.800 | VALIDATE |
| 17 | CFG-D17 | Diagnóstico de Defesa de Margem | PROTECT | R$ 2.900 | VALIDATE |
| 18 | CFG-D18 | Dossiê de Medição, Glosa e Pagamento | PROTECT | R$ 4.900 | VALIDATE |
| 19 | CFG-D19 | Dossiê de Aditivo e Serviço Extra | PROTECT | R$ 5.900 | VALIDATE |
| 20 | CFG-D20 | Dossiê de Prorrogação e Atraso | PROTECT | R$ 5.900 | VALIDATE |
| 21 | CFG-D21 | Memória de Reajuste Contratual | PROTECT | R$ 2.900 | VALIDATE |
| 22 | CFG-D22 | Dossiê de Reequilíbrio Econômico-Financeiro | PROTECT | R$ 7.900 | VALIDATE |
| 23 | CFG-D23 | Subsídio Técnico para Notificação ou Sanção | PROTECT | R$ 6.900 | VALIDATE |
| 24 | CFG-D24 | Diagnóstico B2G 360° | OPERATE | R$ 6.900 | VALIDATE |
| 25 | CFG-D25 | Acompanhamento Preventivo de Contrato | OPERATE | R$ 6.900 por mês, por contrato | VALIDATE |

O preço do 16 é declarado em três faixas (essencial, complexa, especial) e o 25 é
assinatura mensal com ciclo inicial de 3 meses e aviso de 30 dias. Os 01 a 08 têm
`price_state = PUBLISHED_FIRM`; os 09 a 25 têm `PILOT_HYPOTHESIS`.

## 6. Invariantes que o gate protege

Afirmações verificáveis contra o registro e o módulo de leitura:

1. Os oito entregáveis publicados mantêm exatamente os preços congelados em
   2026-08-24: 59900, 69000, 89000, 120000, 145000, 190000, 240000 e 375000
   centavos. Qualquer deriva reprova, em vez de publicar uma reprecificação
   silenciosa.
2. A soma avulsa das unidades 02 a 08 é 1.228.000 centavos, isto é R$ 12.280.
3. O Diagnóstico B2G de Expansão (`expansion_package`) permanece 800.000
   centavos, isto é R$ 8.000, compondo exatamente `CFG-D02` a `CFG-D08`.
4. A janela de crédito do pacote permanece 60 dias, base `highest_single_paid`, e
   nenhum crédito é acumulável (`credit_stackable = false` em todo o registro).
5. A unidade 01 fica fora do pacote e não gera crédito (`credit_rule = null`).
6. A Diretoria B2G Fracionada permanece inalterada nas três faixas: Flex
   2.000.000 centavos por mês, 180 com 1.500.000 por mês e compromisso total de
   9.000.000, 365 com 1.250.000 por mês e compromisso total de 15.000.000.
7. Nenhum entregável liga checkout: `checkout_enabled = false` nos 25.
8. O entregável 11 não pode ser publicado enquanto a #156 não fechar:
   `public_state = BLOCKED`, `blocking_issue = "#156"`, `route = null`.
9. Nenhum entregável é promovido sem evidência observada nas classes que o
   protocolo nomeia. Com `problem`, `solution`, `price` e `delivery` em zero,
   `evaluatePromotion` recusa promoção para todos os 25.
10. Nenhuma página de dinheiro publica `Review` ou `AggregateRating`, e nenhuma
    prova real é publicada sem entrada consentida no registro da #328.
11. Nenhum texto do registro afirma vitória, habilitação, adjudicação,
    recebimento, recuperação, bom pagador, empresa limpa, preço vencedor, lance
    vencedor ou comissão de êxito fora de campos de fronteira e exclusão.

## 7. Rollback

Este PR adiciona dados, um módulo de leitura, um teste e a ligação em CI. Ele não
altera HTML publicado, rota, sitemap, redirect, schema ou fluxo de captura.

Reverter o commit remove o gate e os quatro arquivos de `data/commercial/`.
Nenhuma página pública muda de conteúdo, preço, estado ou indexação. O efeito
prático da reversão é perder a checagem fail-closed, não desfazer uma publicação:
o catálogo público volta a depender apenas do HTML e das validações já
existentes. Reversão parcial também é segura, porque o módulo é read-only e não
tem escrita, migração ou estado persistido.

## 8. ADRs afetadas e regra de não duplicação

Nenhuma fronteira do [ADR-STRAT-002](../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md)
é cruzada: o registro nasce neste repositório e neste domínio, os fatos públicos
continuam adquiridos e versionados pelo `extra-cli` via contratos SELECT-only, e
a ação comercial continua no Warmbly com origem `CONFENGE_WEB`. Nenhum crawler,
DataLake, identidade paralela ou CRM é criado aqui. O
[ADR-STRAT-003](../architecture/ADR-STRAT-003-panorama-de-mercado-como-familia-publica.md)
não é tocado.

Quem continua dono do quê:

- **#88:** catálogo comercial, terms, capacidade, checkout e pagamento. Esta
  família especifica o que testar; não liga dinheiro nem contorna os gates.
- **#295:** comparação e hierarquia visual das oito entregas atuais. A
  arquitetura ampliada preserva essa biblioteca interna e sua aritmética.
- **#155:** canário técnico de bid-readiness. O `CFG-D12` é camada comercial
  humana, não parecer automático.
- **#156:** canário de integridade. O `CFG-D11` depende dela e nunca conclui
  integridade a partir de CEIS ou CNEP.
- **#60:** prova pública da vertical de defesa de margem. Não é reaberta pelos
  dossiês 18 a 23, que productizam demanda privada.
- **#249:** contrato de consentimento e guards contra prova fabricada. A #328
  executa o primeiro caso real sob esse contrato.
- **#343:** fonte canônica de `public_name_pt_br`. Em divergência nominal prevalece a #343; escopo e preço declarados aqui permanecem válidos.

## 9. Próxima evidência

A próxima decisão desta família não depende de mais código. Depende de: 12
entrevistas com notas brutas e consentimento, um card sort que cubra os 25 sem
apagar nenhum, pelo menos 5 oportunidades comerciais qualificadas com
recomendação unitária e preço explícito, 5 sessões de primeira dobra e uma
autorização válida sob a #249. Até lá, os 25 permanecem `HOLD`, os preços-piloto
permanecem hipótese e as oito entregas publicadas permanecem exatamente como
estão.
