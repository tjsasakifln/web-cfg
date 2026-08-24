# Expansão cumulativa do portfólio: registro de decisão da #329

- **Decision state:** P0 / VALIDATE
- **Fronts:** REVENUE NOW + MARKET INTELLIGENCE MOAT
- **Leverage:** revenue, data, trust, customer
- **Time to evidence:** 30 dias
- **Date:** 2026-08-24
- **Issues P0 deste PR:** [#329](https://github.com/tjsasakifln/web-cfg/issues/329) (pai), #330, #331, #333, #335, #336, #338, #341, #343, #344
- **Issues P1 alimentadas:** #327, #328, #332, #334, #337, #339, #340, #342
- **Guardrails:** [AGENTS.md](../../AGENTS.md), [MARKET-CAPTURE-OS](MARKET-CAPTURE-OS.md), [ADR-STRAT-002](../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md)
- **Registro canônico:** `data/commercial/deliverables-registry.v1.json` (`CFG-DELIVERABLES-2026-08-24-v1`)

> **Como esta família foi entregue.** O trabalho está dividido em dez PRs, uma por
> issue P0, para que revisão e merge aconteçam em paralelo. Esta PR carrega o rol
> taxativo em si: `data/commercial/deliverables-registry.v1.json`, o leitor
> `scripts/commercial/deliverables.cjs`, o gate fail-closed e os registros de
> primeira dobra (#327) e de prova real (#328). Os demais artefatos citados neste
> documento chegam nas PRs das issues #330, #331, #333, #335, #336, #338, #341,
> #343 e #344, cada uma com o seu próprio gate.

Este documento registra o que a família #329 decidiu, o que este PR coloca no
repositório e o que continua dependendo de evidência humana ou externa. Ele não
declara market fit, preço validado, venda ou outcome.

O fundador reescreveu a família inteira em 2026-08-24, entre 22:07 e 22:18, e
abriu as issues #337 a #344. O catálogo passou de 25 para **54 entregáveis** e de
4 para **2 contêineres**. Este documento foi refeito contra o estado atual das
issues e do registro; onde issue e registro ainda divergem, a divergência está
declarada na seção 7 em vez de ser silenciada.

## 1. Decisão do fundador de 2026-08-24

O catálogo é **cumulativo**. Nenhuma das oito entregas hoje publicadas em
`/entregas/` sai, é aposentada ou é tratada como erro. A especificação ampliada
serve para endurecer escopo, entrada, saída, prazo e fronteira das oito,
acrescentar entregáveis que cobrem dores hoje apresentadas apenas como serviço, e
organizar a escolha por problema e momento do ciclo.

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

Três decisões novas desta rodada mudam a forma do catálogo:

- **Sete portas por tarefa substituem os quatro estágios de ciclo.** A #335
  define GROW, QUALIFY, PROPOSE, START, PROTECT, CLOSE e CAPABILITY, com 12, 8,
  11, 3, 11, 5 e 4 itens. Cada item aparece exatamente uma vez na navegação
  primária. O limite de opções por tela passa a ser **seis**, não sete.
- **Dois contêineres, não quatro.** A #343 declara que a Diretoria é um único
  contêiner com três condições de contratação: Plano Mensal a R$ 20.000 por mês,
  Compromisso Semestral de 6 x R$ 15.000 e Compromisso Anual de 12 x R$ 12.500.
  São preços e prazos, não três produtos.
- **A #343 é a autoridade de nome.** O nome canônico em português vive em
  `public_name_pt_br`; o nome hoje publicado continua em `public_name`.

## 2. O que este PR entrega

### 2.1 Registro canônico versionado

`data/commercial/deliverables-registry.v1.json` declara 54 entregáveis (`CFG-D01`
a `CFG-D54`) e 2 contêineres comerciais (`expansion_package` e
`diretoria_fracionada`). `catalog_count` vale 54 e `container_count` vale 2, e
ambos são conferidos contra o tamanho real dos arrays: contagem escrita à mão
reprova.

A origem de cada bloco novo é rastreável: itens 26 a 39 vêm da #340, 40 a 42 da
#339, 43 e 44 da #342, 45 a 48 da #337 e 49 a 54 da #344.

Cada entregável carrega 29 campos obrigatórios, entre eles `public_name`,
`public_name_pt_br`, `name_aliases`, `name_state`, `task_door`,
`decision_question`, `trigger`, `price`, `price_state`, `sla`, `scope`,
`required_inputs`, `included_outputs`, `exclusions`, `data_contract`,
`offer_container`, `credit_rule`, `capacity_required`, `public_state`,
`checkout_enabled`, `blocking_issue`, `route`, `lead_destination`, `analytics`,
`source_issue` e `market_fit`. Ausência de campo é falha de CI, não valor padrão.
As sete portas por tarefa e os quatro graus de evidência são declarados no
próprio arquivo, e não em strings paralelas de página.

### 2.2 Gate fail-closed de CI

`scripts/commercial/deliverables.cjs` é o leitor read-only dos registros e o
lugar onde os invariantes vivem em código. Ele não escreve, não precifica e não
promove: promoção exige evidência observada sob o protocolo de market fit, não um
caminho de código. `tests/commercial/test_deliverables_registry.mjs` consome esse
módulo e executa **2123 verificações**, todas passando no estado atual. Preço,
estado, nome, porta, rota ou plano divergentes entre registro, HTML e snapshot de
ofertas reprovam a suíte.

### 2.3 Autoridade de nome da #343

`data/commercial/offer-naming.v1.json` traz os 54 nomes canônicos em português
com linha de valor e aliases, mais os dois contêineres. O registro mantém quatro
campos por item: `public_name` (o nome publicado hoje), `public_name_pt_br` (o
nome canônico da #343), `name_aliases` e `name_state`.

Trinta e quatro itens estão `CANONICAL`, isto é, o nome publicado coincide com o
canônico. **Vinte estão `RENAME_PENDING`**: o nome canônico está gravado, o site
ainda mostra o nome antigo e esse nome antigo permanece em `name_aliases` para
não quebrar URL, busca, analytics e atendimento. Os dois contêineres também estão
`RENAME_PENDING`.

Sem eufemismo: **a renomeação não é feita neste PR**. O que este PR faz é
registrar o alvo, preservar o nome publicado e travar a paridade entre registro e
HTML enquanto a troca não acontece. A cláusula da #331 segundo a qual nenhuma das
oito entregas "muda de nome" fica superada pela #343 quanto ao nome-alvo; quanto
ao nome publicado, ao preço e ao estado, a #331 continua valendo, e o gate prova
isso.

### 2.4 Política de preço da #341

`data/commercial/pricing-policy.v1.json` fixa a escada de sete faixas, as três
âncoras públicas com `is_market_truth = false`, os campos obrigatórios de unit
economics, o gate de promoção por margem de contribuição observada e as regras
comerciais taxativas. O estado é `NOT_STARTED` e `records` está vazio: nenhuma
entrega teve custo, horas, retrabalho ou margem registrados.

O arquivo também guarda uma conferência informativa dos preços do registro contra
as faixas. Essa conferência é inferencial, não normativa: a #341 não atribui
`deliverable_id` a faixa. Nenhum preço foi alterado para caber em faixa.

### 2.5 Contrato de comunicação da #338

`data/commercial/copy-contract.v1.json` grava o contrato editorial de 15 pontos
por oferta, a estrutura de copy do índice e da página de detalhe, as **oito
lentes adversariais** (fundador cético, diretor financeiro, engenheiro,
licitações, jurídico, comprador apressado, acessibilidade e linguagem simples,
compliance), os critérios quantitativos e o protocolo humano. O estado é
`NOT_STARTED` e `reviews` está vazio: nenhuma lente foi executada.

A lista de linguagem proibida sem prova imediata tem 21 entradas, das quais as
verificáveis por máquina entram no scanner. As exceções são documentadas em vez
de escondidas no código, com quatro registros:

- **GX-01:** termo dentro de `exclusions` marca fronteira do que a CONFENGE não
  faz; fronteira não é claim.
- **GX-02:** nome anterior em `name_aliases` existe para continuidade de URL,
  busca, analytics e atendimento; alias não é claim.
- **GX-03:** "garantia" só reprova na forma de promessa; garantia contratual,
  seguro-garantia e garantia de execução são institutos e permanecem
  descritíveis.
- **GX-04:** `public_name` legado é dado histórico enquanto `name_state` for
  `RENAME_PENDING`, e por isso não é varrido como claim novo.

### 2.6 Protocolo de market fit da #336

`data/commercial/market-fit-protocol.v1.json` fixa as três fases (entrevistas de
problema, card sort e willingness to pay observada), as dez dimensões de score,
as cinco classes de evidência (`problem`, `solution`, `price`, `delivery`,
`outcome`) e os gates `PROMOTE`, `ADJUST` e `HOLD`. O protocolo existe como
contrato; nenhuma rodada foi executada e `runs` está vazio. A amostra e a lista
de ofertas founder-led registradas no arquivo divergem da versão atual da #336;
a divergência está na seção 7.

### 2.7 Censo de primeira dobra da #327

`data/commercial/first-fold-contract.v1.json` lista as quatro respostas
obrigatórias (`what`, `who`, `why_believe`, `next_action`), os viewports e 25
rotas comerciais com `evidence_state`. O estado medido em 2026-08-24 é: 1
`MEASURED_PASS` (`/diagnostico-b2g-expansao/`), 2 `MEASURED_FAIL`
(`/servicos-obras-publicas/` e `/problemas-que-resolvemos/`) e 22 `PENDING`. Uma
superfície só declara `MEASURED_PASS` com registro de medição vinculado; passar
em axe, Lighthouse e overflow não aprova nenhuma.

### 2.8 Registro de prova real vazio da #328

`data/commercial/real-proof-registry.v1.json` registra a auditoria de 2026-08-24
com 0 `Review`, 0 `AggregateRating`, 0 logotipo de cliente, 0 depoimento e 0 caso
de cliente aprovado, mais os seis campos de consentimento exigidos pela #249, as
quatro regras de publicação e as três kill rules. O array `entries` está vazio e
o estado é `BLOCKED_EXTERNAL`.

### 2.9 Regras comerciais comuns em `common_rules`

As regras que valem para todo o catálogo saíram da prosa e viraram campo:

- adicional de urgência de **50 por cento**, informado antes da cobrança, e a
  capacidade pode recusar a urgência;
- **sem comissão de êxito** (`success_fee_allowed = false`);
- **sem acúmulo de crédito** (`credit_stacking_allowed = false`);
- escopo **nunca limitado por páginas** (`scope_limited_by_pages = false`), e sim
  por empresa, território, tipologia, período, contrato, edital, lote, evento,
  módulo e revisão;
- checkout sob a **#88**, dados sob o **extra-cli** e ação comercial no
  **warmbly**.

## 3. O que este PR deliberadamente não entrega

Cada item abaixo depende de evidência humana ou externa que não pode ser
fabricada por código, modelo de linguagem ou screenshot test.

- **As entrevistas ICP e o card sort da #336.** Nenhum participante foi
  recrutado. `state` permanece `NOT_STARTED`.
- **A willingness to pay observada.** As ofertas founder-led da fase 3 não foram
  executadas. Nenhuma proposta, aceite, negociação ou recusa foi registrada. Os
  54 entregáveis estão em `market_fit.state = HOLD` com as cinco classes de
  evidência em zero.
- **A renomeação pública da #343.** Vinte entregáveis e os dois contêineres
  seguem com o nome antigo. Nenhum HTML, slug, redirect, canonical, sitemap ou
  mapeamento de analytics foi alterado.
- **As oito lentes adversariais da #338 e o teste sem título.** Zero revisão
  executada, zero defeito classificado como bloqueante, material ou cosmético.
- **O unit economics da #341.** Zero registro de horas, retrabalho, custo direto,
  margem ou tempo até caixa. Nenhuma faixa da escada foi confirmada por proposta.
- **A arquitetura por tarefa da #335.** As sete portas existem no registro, não
  na navegação. Índice integral, filtros, comparação de 2 a 4 e deep links não
  existem.
- **As 5 sessões ICP da #327.** O teste cético de 3 segundos exige cinco
  participantes elegíveis e consentidos. `human_validation.state` é
  `NOT_STARTED`.
- **A primeira prova real consentida da #328.** Continua `BLOCKED_EXTERNAL`. Sem
  os seis campos de consentimento da #249, não há publicação. Relacionamento,
  proposta, conversa ou trabalho em andamento não são case.
- **A chave oficial e a paginação terminal da #156.** Enquanto ela não fechar,
  **dois** entregáveis permanecem `public_state = BLOCKED`, sem rota e sem
  `lead_destination`: o 11 (`CFG-D11`, Mapa de Parceiros e Consórcios) e o 43
  (`CFG-D43`, Verificação de Sanções e Restrições Públicas). CEIS e CNEP
  continuam sinal preliminar, nunca certificado de integridade.
- **As rotas dos itens 09 a 11 e 26 a 54.** Trinta e dois entregáveis têm
  `route = null`: existem como especificação comercial, não como página.
- **O checkout.** Nenhum entregável tem `checkout_enabled = true`. Terms,
  capacidade e pagamento continuam sob os gates da #88.

Nenhum preço-piloto é declarado validado. A pesquisa de mesa citada na #329 prova
que o problema existe no ambiente de obras públicas; não prova que o ICP da
CONFENGE comprará esta embalagem, neste preço e agora.

## 4. Issue a issue

### 4.1 Os dez P0 que este PR endereça

| Issue | Resolvido neste PR | Continua aberto e por quê |
| --- | --- | --- |
| #329 | Rol taxativo fechado no registro: 54 entregáveis, 2 contêineres, `catalog_count` derivado, decisão cumulativa e as nove regras comerciais comuns gravadas em `principles` e `common_rules` | Nenhum pedido comercial foi testado contra o rol; a promessa de que toda demanda mapeia para um item 01 a 54 ou é recusada por fronteira só se verifica em conversa real |
| #330 | `CFG-D12` a `CFG-D16` com escopo, SLA, insumos, exclusões e crédito, incluindo as três faixas do 16 e o crédito de 13 para 16 e 51 | Preço-piloto sem proposta real; páginas, exemplos sintéticos comparáveis e primeira venda com horas, retrabalho e margem continuam pendentes |
| #331 | `CFG-D01` a `CFG-D08` com preço congelado, aritmética do pacote (R$ 12.280 avulso, R$ 8.000 no pacote) e janela de crédito de 60 dias travadas em código | O endurecimento de objeto, entrada, saída e SLA ainda não aparece no HTML das oito rotas e do hub; a cláusula de nome desta issue foi superada pela #343 quanto ao nome-alvo |
| #333 | `CFG-D17` a `CFG-D23` declarados, com o crédito de até R$ 2.900 do 17 para um único dossiê 18 a 23 em 30 dias | Fronteira jurídica, documento mínimo e prazo seguro precisam ficar visíveis nas seis rotas; nenhuma venda registrou esforço, margem ou outcome |
| #335 | Sete portas por tarefa no registro, com 12, 8, 11, 3, 11, 5 e 4 membros, cada item exatamente uma vez, e `requires_progressive_disclosure` obrigatório acima de seis opções | Navegação, índice integral numerado, filtros sem JavaScript, comparação de 2 a 4 e deep links não foram construídos; as metas humanas dependem da amostra da #336 |
| #336 | Protocolo de três fases, score de dez dimensões, cinco classes de evidência e gates gravados como contrato versionado, com `evaluatePromotion` recusando promoção para os 54 | Zero entrevista, zero card sort, zero oferta founder-led; a amostra registrada no arquivo é a anterior à reescrita da issue (seção 7) |
| #338 | Contrato editorial de 15 pontos, oito lentes, 21 termos de linguagem proibida, quatro exceções documentadas e scanner ligado ao registro | Nenhuma lente executada, nenhum teste sem título, nenhuma página reescrita; a contagem interna da issue ainda oscila entre 48 e 54 |
| #341 | Escada de sete faixas, âncoras públicas marcadas como não sendo verdade de mercado, campos obrigatórios de unit economics e regras taxativas de preço | `records` vazio: nenhuma hora, custo, margem ou outcome observado. A escada tem vãos e um contêiner fora de qualquer faixa (seção 7) |
| #343 | 54 nomes canônicos em português mais dois contêineres, com linha de valor, aliases e `name_state` conferido item a item contra o registro | A renomeação pública não foi executada: 20 entregáveis e 2 contêineres seguem `RENAME_PENDING`. Dois dos seis anglicismos que a issue manda remover seguem em nome publicado: Go/No-Go no 12 e Bid Room no 16 |
| #344 | `CFG-D49` a `CFG-D54` com faixas, SLA, unidade, insumos, saídas, exclusões e o crédito de 13 para 51 | Nenhuma das seis rotas existe; as distinções 13 contra 51 e 14 contra 49 ainda não passaram por teste humano |

### 4.2 Os oito P1 que este PR alimenta

| Issue | O que o registro já carrega | O que falta |
| --- | --- | --- |
| #327 | Contrato de primeira dobra e censo de 25 rotas com estado de evidência por rota | 22 rotas `PENDING`, 2 `MEASURED_FAIL`; as 5 sessões ICP não foram executadas |
| #328 | Auditoria zerada, seis campos de consentimento, regras de publicação e kill rules | `BLOCKED_EXTERNAL`: depende de uma autorização válida sob a #249. Nenhuma entrada existe |
| #332 | `CFG-D09`, `CFG-D10` e `CFG-D11`, com crédito de 30 dias do 09 e do 10 para o pacote de expansão | Contratos public-read versionados no `extra-cli` não existem; o 11 espera a #156; nenhuma das três tem rota |
| #334 | `CFG-D24` e `CFG-D25`, com gate de capacidade e crédito de até R$ 2.000 do 24 para o 25 ou para a Diretoria | A tabela de diferenciação entre as quatro ofertas confundíveis não está publicada; a regra das 100 repetições não tem evidência |
| #337 | `CFG-D45` a `CFG-D48`, incluindo as três faixas do 48 e as duas cargas horárias do 47 | Quatro rotas públicas inexistentes; o item 45 é assinatura sem aviso prévio declarado (seção 7) |
| #339 | `CFG-D40` a `CFG-D42`, com preço-base e adicionais taxativos por janela, família causal, rodada e reunião | O gate de entrada de oito condições não tem instrumento; nenhum caso pago existe para recalibrar escopo |
| #340 | `CFG-D26` a `CFG-D39`, catorze itens com preço, unidade, SLA, entrada, saída e exclusão | A issue não define regra de crédito para esses catorze, e o registro não inventou uma (seção 7) |
| #342 | `CFG-D43` e `CFG-D44`, com o 43 fail-closed sob a #156 | Nenhuma rota; o exemplo sintético com homônimo, CNPJ divergente e fonte indisponível não existe |

## 5. Os 54 entregáveis declarados

Valores extraídos de `data/commercial/deliverables-registry.v1.json`. A coluna
Nome indica se `public_name` já coincide com o `public_name_pt_br` da #343.

| # | `deliverable_id` | Nome canônico (#343) | Porta | Preço | Estado | Nome |
| ---: | --- | --- | --- | ---: | --- | --- |
| 01 | CFG-D01 | Radar de Licitações Prioritárias | GROW | R$ 599 | PUBLISHED | renomeação pendente |
| 02 | CFG-D02 | Base de Mercado para Expansão | GROW | R$ 690 | PUBLISHED | renomeação pendente |
| 03 | CFG-D03 | Síntese Executiva de Expansão | GROW | R$ 890 | PUBLISHED | renomeação pendente |
| 04 | CFG-D04 | Mapa de Órgãos com Maior Potencial | GROW | R$ 1.200 | PUBLISHED | renomeação pendente |
| 05 | CFG-D05 | Radar de Contratos Próximos da Renovação | GROW | R$ 1.450 | PUBLISHED | renomeação pendente |
| 06 | CFG-D06 | Mapa de Concorrentes Relevantes | GROW | R$ 1.900 | PUBLISHED | renomeação pendente |
| 07 | CFG-D07 | Referências de Preços de Obras Públicas | GROW | R$ 2.400 | PUBLISHED | renomeação pendente |
| 08 | CFG-D08 | Plano Executivo de Expansão | GROW | R$ 3.750 | PUBLISHED | renomeação pendente |
| 09 | CFG-D09 | Radar de Obras Antes do Edital | GROW | R$ 1.490 | VALIDATE | renomeação pendente |
| 10 | CFG-D10 | Dossiê do Órgão e Risco de Pagamento | GROW | R$ 2.400 | VALIDATE | renomeação pendente |
| 11 | CFG-D11 | Mapa de Parceiros e Consórcios | GROW | R$ 2.900 | BLOCKED (#156) | renomeação pendente |
| 12 | CFG-D12 | Decisão de Disputar o Edital | QUALIFY | R$ 1.900 | VALIDATE | renomeação pendente |
| 13 | CFG-D13 | Mapa de Habilitação e Lacunas de Acervo | QUALIFY | R$ 2.900 | VALIDATE | renomeação pendente |
| 14 | CFG-D14 | Auditoria de Orçamento, BDI e Exequibilidade | QUALIFY | R$ 5.900 | VALIDATE | canônico |
| 15 | CFG-D15 | Referência de Concorrência e Faixa de Deságio | QUALIFY | R$ 3.750 | VALIDATE | renomeação pendente |
| 16 | CFG-D16 | Operação de Proposta para Licitação Crítica | PROPOSE | R$ 9.800 / R$ 14.800 / R$ 19.800 | VALIDATE | renomeação pendente |
| 17 | CFG-D17 | Diagnóstico de Riscos à Margem | PROTECT | R$ 2.900 | VALIDATE | renomeação pendente |
| 18 | CFG-D18 | Dossiê de Medição, Glosa e Pagamento | PROTECT | R$ 4.900 | VALIDATE | canônico |
| 19 | CFG-D19 | Dossiê de Aditivo e Serviço Extra | PROTECT | R$ 5.900 | VALIDATE | canônico |
| 20 | CFG-D20 | Dossiê de Atraso e Prorrogação | PROTECT | R$ 5.900 | VALIDATE | renomeação pendente |
| 21 | CFG-D21 | Cálculo de Reajuste Contratual | PROTECT | R$ 2.900 | VALIDATE | renomeação pendente |
| 22 | CFG-D22 | Dossiê de Reequilíbrio Econômico-Financeiro | PROTECT | R$ 7.900 | VALIDATE | canônico |
| 23 | CFG-D23 | Subsídio Técnico para Notificação ou Sanção | PROTECT | R$ 6.900 | VALIDATE | canônico |
| 24 | CFG-D24 | Diagnóstico da Operação em Obras Públicas | CAPABILITY | R$ 6.900 | VALIDATE | renomeação pendente |
| 25 | CFG-D25 | Acompanhamento Preventivo do Contrato Público | PROTECT | R$ 6.900 por mês | VALIDATE | renomeação pendente |
| 26 | CFG-D26 | Auditoria do Projeto Básico e dos Riscos | QUALIFY | R$ 4.900 | VALIDATE | canônico |
| 27 | CFG-D27 | Subsídio Técnico para Esclarecimento ou Impugnação | PROPOSE | R$ 3.750 | VALIDATE | canônico |
| 28 | CFG-D28 | Comprovação de Exequibilidade e Resposta à Diligência | PROPOSE | R$ 4.900 | VALIDATE | canônico |
| 29 | CFG-D29 | Desenvolvimento da Proposta Técnica | PROPOSE | R$ 7.900 / R$ 12.900 | VALIDATE | canônico |
| 30 | CFG-D30 | Plano de Garantias, Seguros e Capital de Giro | QUALIFY | R$ 2.400 | VALIDATE | canônico |
| 31 | CFG-D31 | Análise do Resultado da Licitação | CLOSE | R$ 2.400 | VALIDATE | canônico |
| 32 | CFG-D32 | Plano de Acervo para Licitações Futuras | CLOSE | R$ 3.750 | VALIDATE | canônico |
| 33 | CFG-D33 | Revisão Técnica Antes de Assinar o Contrato | START | R$ 3.750 | VALIDATE | canônico |
| 34 | CFG-D34 | Plano de Mobilização e Obrigações do Contrato | START | R$ 4.900 | VALIDATE | canônico |
| 35 | CFG-D35 | Auditoria do Fluxo de Caixa do Contrato | START | R$ 4.900 | VALIDATE | canônico |
| 36 | CFG-D36 | Dossiê de Recebimento e Encerramento do Contrato | CLOSE | R$ 4.900 | VALIDATE | canônico |
| 37 | CFG-D37 | Dossiê de Atestação e Acervo da Obra | CLOSE | R$ 2.900 | VALIDATE | canônico |
| 38 | CFG-D38 | Análise Pós-Contrato e Lições para Próximas Obras | CLOSE | R$ 3.750 | VALIDATE | canônico |
| 39 | CFG-D39 | Subsídio Técnico para Recurso e Contrarrazão | PROPOSE | R$ 4.900 | VALIDATE | canônico |
| 40 | CFG-D40 | Análise de Causas e Impactos de Atrasos | PROTECT | R$ 12.900 + R$ 4.900 | VALIDATE | canônico |
| 41 | CFG-D41 | Análise de Custos e Valores em Disputa | PROTECT | R$ 14.900 + R$ 4.900 | VALIDATE | canônico |
| 42 | CFG-D42 | Assistência Técnica em Disputa Contratual Complexa | PROTECT | R$ 19.800 + R$ 2.900 + R$ 4.900 | VALIDATE | canônico |
| 43 | CFG-D43 | Verificação de Sanções e Restrições Públicas | QUALIFY | R$ 4.900 | BLOCKED (#156) | canônico |
| 44 | CFG-D44 | Auditoria de Prontidão do Empreendimento Público | QUALIFY | R$ 4.900 | VALIDATE | canônico |
| 45 | CFG-D45 | Monitoramento Mensal de Mercado e Contratos Públicos | GROW | R$ 4.900 por mês | VALIDATE | canônico |
| 46 | CFG-D46 | Oficina para Decidir Quais Licitações Disputar | CAPABILITY | R$ 7.900 | VALIDATE | canônico |
| 47 | CFG-D47 | Capacitação de Equipes de Licitações e Contratos | CAPABILITY | R$ 12.900 / R$ 19.800 | VALIDATE | canônico |
| 48 | CFG-D48 | Estudo Sob Medida com Dados Públicos | CAPABILITY | R$ 9.800 / R$ 19.800 / R$ 39.800 | VALIDATE | canônico |
| 49 | CFG-D49 | Orçamento Completo da Proposta | PROPOSE | R$ 9.800 / R$ 14.800 / R$ 24.800 | VALIDATE | canônico |
| 50 | CFG-D50 | Cronograma e Plano Executivo da Proposta | PROPOSE | R$ 5.900 / R$ 9.800 | VALIDATE | canônico |
| 51 | CFG-D51 | Dossiê de Habilitação Pronto para Envio | PROPOSE | R$ 4.900 | VALIDATE | canônico |
| 52 | CFG-D52 | Verificação de SICAF, Certidões e Regularidade | PROPOSE | R$ 1.490 | VALIDATE | canônico |
| 53 | CFG-D53 | Acompanhamento Técnico da Sessão de Disputa | PROPOSE | R$ 3.750 + R$ 1.490 | VALIDATE | canônico |
| 54 | CFG-D54 | Dossiê de Credenciamento ou Pré-Qualificação | PROPOSE | R$ 5.900 | VALIDATE | canônico |

Notas de preço, todas lidas do registro:

- O 16 tem três faixas (essencial, complexa, especial); o 29, o 47 e o 50 têm
  duas; o 48 e o 49 têm três.
- Os valores após o sinal de adição são unidades adicionais taxativas: janela
  adicional no mesmo contrato (40), família de custos adicional com a mesma
  causalidade (41), rodada adicional documentada e reunião técnica de até um dia
  (42) e lote adicional na mesma sessão (53).
- O 25 é assinatura mensal por contrato, com ciclo inicial de 3 meses e aviso de
  30 dias. O 45 é assinatura mensal por carteira de até 20 objetos de vigilância,
  com ciclo inicial de 3 meses e sem aviso prévio declarado.
- Os 01 a 08 têm `price_state = PUBLISHED_FIRM`; os 09 a 54 têm
  `PILOT_HYPOTHESIS`. Nenhum liga checkout.

### 5.1 As sete portas por tarefa

| Ordem | Porta | Rótulo público | Itens | Disclosure |
| ---: | --- | --- | ---: | --- |
| 1 | GROW | Descobrir onde crescer e o que mudou | 12 | obrigatória |
| 2 | QUALIFY | Decidir se a oportunidade merece recursos | 8 | obrigatória |
| 3 | PROPOSE | Levar a proposta até a decisão | 11 | obrigatória |
| 4 | START | Assinar e começar sem herdar surpresa | 3 | não |
| 5 | PROTECT | Proteger caixa, prazo e margem | 11 | obrigatória |
| 6 | CLOSE | Encerrar, provar e aprender | 5 | não |
| 7 | CAPABILITY | Instalar capacidade e liderança | 4 | não |

A soma é 54 e nenhum item aparece em duas portas. Uma porta com mais de seis
membros precisa declarar `requires_progressive_disclosure = true`; uma porta com
seis ou menos precisa declarar `false`. O gate confere as duas direções.

### 5.2 Os dois contêineres

| Contêiner | Nome canônico (#343) | Rota | Planos |
| --- | --- | --- | --- |
| `expansion_package` | Diagnóstico de Expansão no Mercado Público | `/diagnostico-b2g-expansao/` | Pagamento único de R$ 8.000, compondo `CFG-D02` a `CFG-D08` |
| `diretoria_fracionada` | Diretoria Fracionada para o Mercado Público | `/diretoria-b2g/` | Plano Mensal R$ 20.000 por mês; Compromisso Semestral 6 x R$ 15.000, total R$ 90.000; Compromisso Anual 12 x R$ 12.500, total R$ 150.000 |

Os quatro `offer_id` dos planos (`CFG-DIAG-EXP-v1`, `CFG-DIRB2G-FLEX-v1`,
`CFG-DIRB2G-180-v1`, `CFG-DIRB2G-365-v1`) são conferidos contra
`data/offers/catalog.snapshot.json` em valor, meses de compromisso e compromisso
total, nas duas direções: nenhuma oferta aprovada fica fora do registro e nenhum
plano do registro inventa oferta.

## 6. Invariantes que o gate protege

Apenas afirmações que o teste realmente executa.

1. **Forma e campos.** Schema `confenge.deliverables-registry/1.0`,
   `registry_version` presente, ids únicos, `catalog_count` e `container_count`
   derivados do tamanho dos arrays, numeração contígua de `01` a `54` sem lacuna
   nem repetição, os 29 campos obrigatórios presentes nos 54, `deliverable_id`
   casando com `catalog_number`, `task_door`, `public_state`, `price_state`,
   `name_state` e `market_fit.state` restritos às enumerações,
   `decision_question` terminando em interrogação, `trigger` não sendo stub,
   insumos, saídas e exclusões não vazios, `data_contract.owner` igual a
   `extra-cli`, graus de evidência exatamente FACT, CALCULATION, INFERENCE e
   UNKNOWN nessa ordem, `offer_container` resolvendo para `none` ou contêiner
   existente, todo item precificado e nenhum escopo limitado por páginas.
2. **Preços congelados e aritmética do pacote.** Os oito publicados mantêm
   exatamente 59900, 69000, 89000, 120000, 145000, 190000, 240000 e 375000
   centavos, com `PUBLISHED_FIRM`, `PUBLISHED` e rota não vazia. A soma avulsa de
   `CFG-D02` a `CFG-D08` é 1.228.000 centavos, isto é R$ 12.280; o
   `expansion_package` permanece 800.000 centavos, isto é R$ 8.000, compondo
   exatamente esses sete, com janela de 60 dias e sem acúmulo. A unidade 01 fica
   fora do pacote, sem contêiner e sem crédito.
3. **Paridade com o HTML e com a #88.** `entregas/index.html` contém os oito
   preços formatados, o nome que o registro declara como publicado hoje para cada
   um dos oito, o total de R$ 12.280 e o pacote de R$ 8.000. Toda rota não nula
   existe como arquivo. Cada plano de contêiner casa com o snapshot de ofertas em
   valor, meses e compromisso total, e toda oferta do snapshot está mapeada em
   algum plano.
4. **Fail-closed.** `checkout_enabled = false` nos 54. Todo item de número 09 em
   diante é `PILOT_HYPOTHESIS`, não pode estar `PUBLISHED` e não pode estar
   `PROMOTE`. Item `BLOCKED` precisa de `blocking_issue` no formato de issue,
   `route`, `lead_destination` e `credit_rule` nulos; item não bloqueado precisa
   de `blocking_issue = null`, `lead_destination = warmbly:CONFENGE_WEB` e
   `analytics.deliverable_attr` igual ao próprio id. `CFG-D11` e `CFG-D43`
   precisam estar `BLOCKED` com `blocking_issue = "#156"`.
5. **Créditos e regras comuns.** Nenhum crédito acumula; a janela fica entre 1 e
   60 dias; a base é sempre `highest_single_paid`; o teto é positivo e nunca
   maior que o próprio preço; o destino existe no registro; nenhum item credita
   para si mesmo; quem pertence ao pacote usa exatamente 60 dias. Urgência de 50
   por cento, ausência de comissão de êxito, ausência de acúmulo, escopo não
   limitado por páginas, checkout sob a #88 e dados sob o `extra-cli` são
   conferidos como campo, não como prosa.
6. **Portas.** As sete existem, a ordem é inteira de 1 a 7, cada pergunta
   decisória termina em interrogação, todo membro existe, nenhum item aparece
   duas vezes, a união cobre os 54, o `task_door` de cada item bate com a porta
   que o lista, e o limite de seis opções por tela governa
   `requires_progressive_disclosure` nos dois sentidos.
7. **Nomes.** `naming_authority` é `#343`; o arquivo de nomes cobre os 54;
   `public_name_pt_br` é idêntico ao da autoridade; `name_state` é derivado, e
   não declarado à mão; todo `RENAME_PENDING` mantém o nome antigo em
   `name_aliases`; nenhum alias repete o nome canônico; e uma renomeação não pode
   virar reprecificação ou aposentadoria silenciosa, porque os oito continuam
   `PUBLISHED` com o preço congelado.
8. **Claims e linguagem.** Varredura de promessa afirmativa sobre registro e
   protocolo: prometer vitória, habilitação ou adjudicação, garantir vitória,
   habilitação, recebimento, recuperação ou afastamento, "bom pagador", "empresa
   limpa", "preço vencedor", "lance vencedor", "garantimos" e comissão de êxito
   fora da forma negativa. Os termos verificáveis por máquina da #338 são
   varridos sobre os entregáveis. Fronteiras e exclusões saem da varredura por
   GX-01 e GX-02, o `public_name` legado por GX-04 e "garantia" só reprova como
   promessa por GX-03.
9. **Protocolo e promoção.** `state = NOT_STARTED`, `runs` vazio, quotas somando
   a amostra mínima declarada, preços das ofertas founder-led idênticos aos do
   registro, funil exatamente nos dez passos, sem PII em analytics e sem tratar o
   `web-cfg` como CRM. `evaluatePromotion` é aplicado aos 54: quem não está
   `PROMOTE` precisa ser inelegível, e com `problem`, `solution`, `price` e
   `delivery` em zero nenhum item é elegível.
10. **Preço, copy, primeira dobra e prova real.** Preço: `NOT_STARTED`, `records`
    vazio, escada não vazia, toda âncora com `is_market_truth = false`. Copy:
    `NOT_STARTED`, `reviews` vazio, exatamente oito lentes e exceções de gate
    documentadas. Primeira dobra: as quatro respostas na ordem declarada,
    validação humana `NOT_STARTED` com mínimo de 5 sessões, toda rota do censo
    existindo como arquivo, `PENDING` sem medição e medido com data, e toda rota
    precificada, de item ou de contêiner, presente no censo. Prova real:
    `BLOCKED_EXTERNAL`, zero entradas, seis campos de consentimento e nenhuma
    rota do censo com `Review` ou `AggregateRating` em JSON-LD.

O gate **não** confere a conferência de faixas da #341: `registry_cross_check` é
material informativo e não é assertado. Também não confere que a escada cubra
todos os preços, nem que a #335 e a #338 concordem entre si sobre contagem.

## 7. Divergências abertas que este PR registra sem resolver

Este PR não edita issue nem inventa consenso. Cada divergência abaixo foi
conferida contra o corpo atual da issue e contra o arquivo correspondente.

1. **#335 ainda diz 48 na prosa.** O título, a seção "Arquitetura primária por
   tarefa" e o acceptance dizem 54, e a soma das sete portas fecha em 54. Mas o
   texto do problema fala em "exibir 48 cards", "todos os 48 itens" e "processar
   48 opções". O registro seguiu o título, a arquitetura e o acceptance.
2. **#338 ainda diz 48 no contrato de comunicação.** A frase "cada uma das 48
   precisa ter" convive com um teste de diferenciação cuja meta é 54/54 e com um
   acceptance que exige o contrato editorial aplicado a 54/54. O arquivo de copy
   registra os dois números no campo `scope_note` do teste de diferenciação, mas
   esse mesmo campo ainda descreve o registro como tendo "25 entregáveis e 4
   contêineres", o que era verdade antes desta reconstrução e não é mais.
3. **#329 ainda fala em quatro contêineres em um trecho.** A seção E encerra com
   "não confundir os quatro contêineres comerciais", enquanto o título da própria
   issue, a #343 e o registro dizem 2 contêineres com 3 planos. A mesma seção
   também usa "Flex" como nome de plano, uso que a #343 restringe a alias
   interno.
4. **A escada da #341 tem vãos declarados e um contêiner fora de faixa.** O
   Diagnóstico de Expansão a R$ 8.000 cai entre o teto do dossiê crítico
   (R$ 7.900) e o piso de oportunidade ou problema complexo (R$ 9.800). Nenhuma
   faixa da #341 contém esse preço. Os vãos declarados são R$ 2.400 a R$ 2.900,
   R$ 5.900 a R$ 6.900, R$ 7.900 a R$ 9.800 e R$ 19.800 a R$ 39.800. Nenhum preço
   foi movido para caber.
5. **A conferência de faixas da #341 não foi refeita para os 54 itens.** O
   bloco `registry_cross_check` agora declara `state = NOT_RECHECKED` e registra
   o que continua conhecido: a #341 não mapeia `deliverable_id` para faixa, então
   qualquer atribuição é inferência, e os vãos declarados pela própria issue
   permanecem. A faixa de R$ 39.800 e o ponto de R$ 4.900 por mês, antes vazios,
   passaram a ter item, pela faixa estratégica do 48 e pela assinatura do 45.
   Nenhum preço foi movido para caber em faixa.
6. **A amostra do protocolo de market fit foi reconciliada com a #336 atual.** O
   arquivo passa a registrar 20 participantes, quotas de 5, 5, 5 e 5, pelo menos
   14 de 20 com licitação ou contrato ativo nos últimos 12 meses, 18 cartões por
   participante com matriz de exposição, e oito ofertas founder-led, incluindo o
   49 a R$ 9.800 e o 51 a R$ 4.900. O gate deixou de fixar o tamanho da amostra
   em código: ele confere que as quotas somam exatamente o que o protocolo
   declara e que os cartões por participante são menores que o rol. Nenhuma
   entrevista foi feita.
7. **A #340 não define regra de crédito para os itens 26 a 39.** Os catorze
   ficam com `credit_rule = null`. Nenhuma janela, teto ou destino foi inventado
   para preencher o silêncio da issue.
8. **A #337 não declara aviso prévio para o item 45.** A issue fixa preço mensal
   e compromisso inicial de 3 meses e não menciona prazo de aviso. O registro
   grava o compromisso e deixa o aviso ausente, ao contrário do item 25, cuja
   issue declara 30 dias.

## 8. Rollback

Este PR adiciona dados, um módulo de leitura, um teste e a ligação em CI. Ele não
altera HTML publicado, rota, sitemap, redirect, schema ou fluxo de captura.

Reverter o commit remove o gate e os sete arquivos de `data/commercial/`. Nenhuma
página pública muda de conteúdo, preço, estado ou indexação. O efeito prático é
perder a checagem fail-closed, não desfazer uma publicação: o catálogo público
volta a depender apenas do HTML e das validações já existentes. Reversão parcial
também é segura, porque o módulo é read-only e não tem escrita, migração ou
estado persistido.

## 9. ADRs afetadas e regra de não duplicação

Nenhuma fronteira do [ADR-STRAT-002](../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md)
é cruzada: o registro nasce neste repositório e neste domínio, os fatos públicos
continuam adquiridos e versionados pelo `extra-cli` via contratos SELECT-only, e
a ação comercial continua no Warmbly com origem `CONFENGE_WEB`. Nenhum crawler,
DataLake, identidade paralela ou CRM é criado aqui. O
[ADR-STRAT-003](../architecture/ADR-STRAT-003-panorama-de-mercado-como-familia-publica.md)
não é tocado.

Quem continua dono do quê:

- **#88:** catálogo comercial, terms, capacidade, checkout e pagamento. Esta
  família especifica o que testar; não liga dinheiro nem contorna os gates. Os
  quatro `offer_id` aprovados continuam sendo os do snapshot.
- **#295:** comparação e hierarquia visual das oito entregas atuais. A
  arquitetura ampliada preserva essa biblioteca interna e sua aritmética.
- **#155:** canário técnico de bid-readiness. O `CFG-D12` é camada comercial
  humana, não parecer automático.
- **#156:** canário de integridade. `CFG-D11` e `CFG-D43` dependem dela e nunca
  concluem integridade a partir de CEIS ou CNEP.
- **#60:** prova pública da vertical de defesa de margem. Não é reaberta pelos
  dossiês 18 a 23, que productizam demanda privada.
- **#249:** contrato de consentimento e guards contra prova fabricada. A #328
  executa o primeiro caso real sob esse contrato.
- **#343:** fonte canônica de `public_name_pt_br`, linha de valor e aliases. Em
  divergência nominal prevalece a #343; escopo e preço declarados nas issues de
  especificação permanecem válidos.

## 10. Próxima evidência

A próxima decisão desta família não depende de mais código. Depende de: as
entrevistas com notas brutas e consentimento sob a amostra que a #336 e o
protocolo precisam reconciliar, um card sort balanceado que cubra os 54 sem
apagar nenhum, pelo menos oito oportunidades comerciais qualificadas com
recomendação unitária e preço explícito, o primeiro registro de horas, custo e
margem por `deliverable_id`, as oito lentes adversariais executadas com defeito
classificado, 5 sessões de primeira dobra e uma autorização válida sob a #249.

Até lá, os 54 permanecem `HOLD`, os preços-piloto permanecem hipótese, os 20
nomes pendentes permanecem pendentes e as oito entregas publicadas permanecem
exatamente como estão.
