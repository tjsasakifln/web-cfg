# Inteligência de mercado: atendimento e comercial interno

**Decisão:** `EXECUTE_NOW`, objetivo do fundador de 14/10/2026.
**Frente:** receita, automação e confiança
**Tempo para evidência:** o próximo recebimento real consentido, conciliado pelo
`lead_id`/`receipt_id`, ou uma prova sintética autenticada somente de transporte.

Este é um registro operacional interno. Não cria CRM, preço, contrato, envio,
cadência ou novo runtime.

## Recepção, integração e responsável operacional

| Item | Evidência atual | Estado e próximo gatilho |
| --- | --- | --- |
| Recepção web | A captura persiste primeiro, emite `source=CONFENGE_WEB` e encaminha `confenge.inbound.v1` com a mesma chave `lead_id`/`receipt_id`. A leitura autenticada de 14/10/2026 confirmou `READY` e o fingerprint `WARMBLY_PRODUCTION_V1`. | **Pronto para receber e encaminhar.** Confirmar o recibo pelo identificador antes de qualquer atendimento. |
| Responsável operacional único | **Atendimento comercial da CONFENGE** é o único responsável pela decisão e pelo contato. O nome de uma pessoa não está documentado; portanto não se atribui uma pessoa fictícia. O Warmbly é o mecanismo da fila `inbound_now`, não o responsável comercial. | Na primeira demanda humana, registrar no campo de owner do Warmbly a pessoa da CONFENGE que assumiu o caso. |
| Resposta e primeiro contato | O inbound apresenta contexto e ação humana recomendada. `CONFENGE_AUTO_SEND_ENABLED=false`; o despacho automático permanece desligado. | Atendimento manual, após revisar contexto, consentimento e canal. Só então registrar `CONTACTED`. |
| Proposta e outcome | O mecanismo existente aceita `CONTACTED`, `QUALIFIED_CONVERSATION`, `MEETING`, `PROPOSAL`, `WON`/`CLIENT`, `LOST`, `FOLLOW_UP`, `DNC` e `NO_RESPONSE`. | Registrar o resultado no próprio Warmbly; não criar CRM, planilha paralela ou cadência de envio. |

## Kit de atendimento na fila `inbound_now`

O atendimento comercial da CONFENGE executa este protocolo para cada pedido
humano. Ele não autoriza disparo automático, preço, aceite, cobrança ou envio
de proposta sem revisão.

1. **Confirmar a entrada:** localizar `lead_id`/`receipt_id`, a rota, a
   necessidade declarada e o canal consentido; atribuir o owner humano da
   CONFENGE no Warmbly. Se não houver recibo persistido, não contatar e tratar
   a falha no mecanismo existente.
2. **Qualificar sem ampliar a coleta:** confirmar decisão, produto ou serviço,
   território, janela temporal, uso institucional quando houver e prazo
   desejado. Identificar o que muda o recorte e o que ainda não é evidência.
   Documentos sensíveis seguem por canal reservado combinado no contato, nunca
   por upload improvisado.
3. **Delimitar a resposta:** dizer se o pedido cabe em estudo avulso,
   aplicação personalizada, atualização/acompanhamento, licença de análise
   própria, compra institucional ou execução técnica complementar. Informar os
   limites da fonte e do recorte antes de prometer conclusão.
4. **Encaminhar a proposta:** usar os módulos abaixo somente depois de o
   escopo estar suficiente. Prazo, preço, direitos especiais, exclusividade,
   revenda, cobrança e responsabilidades entram apenas quando aprovados no
   caso concreto.
5. **Registrar o estado:** atualizar o outcome existente. `PROPOSAL` significa
   proposta enviada; `WON`/`CLIENT` exige resultado real, e não interesse ou
   teste. Usar `FOLLOW_UP`, `NO_RESPONSE`, `LOST` ou `DNC` conforme o fato,
   sem contatar novamente quando o consentimento não permitir.

## Proposta modular para revisão humana

Use somente os módulos aplicáveis à demanda recebida. O documento não autoriza
aceite, cobrança, prazo ou responsabilidade técnica.

1. **Decisão e recorte:** pergunta comercial, produto/catálogo, território,
   janela temporal, organizações/categorias e unidade de análise. Quem precisa
   de um estudo completo pode contratá-lo diretamente, sem diagnóstico obrigatório.
2. **Entregas e fontes:** artefatos técnicos, fontes fornecidas ou públicas,
   evidência faltante e premissas verificáveis.
3. **Insumos e revisões:** material a receber, interlocutores, ciclos e critério
   de conclusão de cada revisão.
4. **Aceite, prazo e direitos:** campos, critérios e documentos necessários à
   decisão; entrega legível, fontes verificáveis e reconciliação dos totais.
   Prazo **a confirmar** após escopo e capacidade. Delimitar uso próprio,
   participantes institucionais, atualização e licença não exclusiva quando
   aplicáveis. Exclusividade e revenda exigem condição própria. Carteira e
   conclusões reservadas de um cliente não são reutilizadas para outro.
5. **Cobrança autorizada e exclusões:** condição de cobrança somente após as
   autorizações próprias; atividades, campo, logística, ART, terceiros e itens
   fora do recorte explicitados quando aplicáveis.

Quando houver execução técnica complementar, a aceitação técnica fica em `NEEDS_CONTEXT` até confirmar
objeto, local, campo/logística, atribuição profissional, registro/PJ ou visto e
ART quando aplicável (ADR-STRAT-004).

## Resposta inicial reutilizável

> Seu pedido registrado trata de **[decisão]**, com **[produto/território/uso
> conhecidos]**. Para fechar o escopo, falta **[insumo que muda a entrega]**.
> A proposta delimita a seleção ou comparação, as fontes, o formato da entrega,
> as revisões, os direitos de uso e o prazo. Podemos dimensionar o estudo
> completo ou a aplicação que você precisa a partir desse contexto.

O operador adapta apenas fatos disponíveis na recepção. Para qualificar, pede
somente o item que muda o escopo: decisão, produto/serviço, território, recorte
temporal, uso institucional ou prazo desejado. Não promete preço, prazo,
resultado, habilitação profissional ou envio.

## Matriz comercial mínima

| Aplicação / família | Comprador e decisão | Fonte/evidência e observação | Entrega | Esforço adicional | Receita | Estado / próximo gatilho |
| --- | --- | --- | --- | --- | --- | --- |
| Clientes, distribuidores e parceiros / A | Fabricante ou prestador seleciona organizações compatíveis com catálogo e canal. | Pares comprador–fornecedor identificados por CNPJ e objeto em 10 contratos verificados. Papel de distribuidor exige fonte própria. | Relatório e base de seleção com critérios, evidências e perguntas a esclarecer. | Cruzar catálogo/território; aprofundar documentos e papéis. | Estudo avulso ou aplicação personalizada. | **SOB ENCOMENDA VIÁVEL**: confirmar produto e critério; a amostra pública está **DISPONÍVEL**. |
| Mercado, expansão e produtos / B | Diretoria compara categorias e territórios antes de expandir presença ou catálogo. | Composição da amostra e consultas determinísticas na fonte; não há denominador total certificado. | Comparação de recortes com cobertura, calendário e consequências para a decisão. | Delimitar busca, auditar cobertura e casos determinantes. | Estudo completo, recorte adicional ou licença de análise própria. | **SOB ENCOMENDA VIÁVEL**: confirmar janela e cobertura; logística/estoque requerem local, quantidade e entrega. |
| Concorrentes, carteiras e seleção / C | Empresa ou consultoria verifica presença e complementaridade de organizações. | Identidade contratual, objetos e documentos públicos; carteira privada entra somente no escopo reservado. | Perfil documental e matriz comparativa, sem avaliação financeira ou crédito. | Reconciliar CNPJs/filiais; verificar documentos; cruzar carteira autorizada. | Aplicação personalizada ou estudo. | **SOB ENCOMENDA VIÁVEL**: definir organizações e decisão; diligência financeira/garantia de desempenho não estão disponíveis. |
| Oportunidades, ciclo de vida e acompanhamento / D | Fornecedor acompanha mudanças e investiga trabalho ainda contratável. | Datas de assinatura/publicação/vigência e fonte de atualização existente; campos nulos não comprovam subcontratação. | Lista delimitada de mudanças e pontos de investigação, com corte de cada entrega. | Reconsulta, revisão documental e atendimento em cada ciclo. | Atualização ou acompanhamento com frequência/escopo contratados. | **SOB ENCOMENDA VIÁVEL**: validar frequência pela reconsulta; não há assinatura/alerta instantâneo presumidos. |
| Preços e pesquisa documental / E | Comprador ou ofertante precisa comparar condições de fornecimento. | Valores integrais e documentos originais de contratos; a amostra não comprova preços unitários comparáveis. | Pesquisa de referências, especificações, unidades, quantidades e condições; comparáveis somente quando suficientes. | Ler itens/documentos e excluir referências incompatíveis. | Pesquisa delimitada por proposta. | **SOB ENCOMENDA VIÁVEL** para a pesquisa; **NÃO OFERTAR AINDA** indicador unitário desta amostra. Gatilho: itens/especificações/condições comparáveis. |
| Pesquisa sob encomenda e uso institucional / F | Associação, rede ou consultoria define uso por participantes ou em trabalho próprio. | Método e duas análises próprias públicas, com fontes e grão verificáveis. | Relatório, base curada/exportação e direitos delimitados conforme uso. | Adaptar pergunta, público, formato, direitos e revisão. | Compra institucional, pesquisa ou licença não exclusiva. | **SOB ENCOMENDA VIÁVEL**: confirmar setor, participantes e uso; não conceder revenda/exclusividade por inferência. |
| Similaridade e cruzamento de carteira / A+C | Cliente separa contas já atendidas de candidatas à investigação. | Identidades públicas e carteira fornecida por canal reservado. | Seleção justificada e exclusões do próprio cliente. | Reconciliar identidade e restrições confidenciais. | Aplicação personalizada. | **SOB ENCOMENDA VIÁVEL**: receber carteira autorizada em canal privado; nunca reutilizar entre compradores. |
| Execução técnica pertinente / complementar | Comprador precisa transformar conclusão em projeto, orçamento, perícia, SST ou apoio contratual. | Serviços técnicos atuais, preservados em suas rotas/condições. | Solução técnica definida na proposta, quando aplicável à necessidade. | Confirmar insumos, atribuições, responsabilidade e capacidade. | Serviço técnico complementar contratado. | **SOB ENCOMENDA VIÁVEL**, sujeito às condições técnicas existentes; não forçar engenharia em pesquisa de outro setor. |

Caixa é valor efetivamente recebido. Contribuição desconta custos e tributos
incrementais uma vez. Resultado econômico considera também esforço humano,
incluindo tentativas sem venda, revisão, atendimento, suporte e manutenção.
Nenhuma taxa, preço novo ou margem foi estimada. Reaproveitamento é uma hipótese
a medir, não lucro comprovado.

## Uma campanha, um experimento e rotina existente

Esta frente acompanha pedidos `CONFENGE_WEB` por `route_family`, `asset_id`,
URL e pack real quando houver. O atendimento comercial da CONFENGE usa a fila
humana `inbound_now` do Warmbly, atribui o owner humano à demanda real e registra
o avanço no outcome já existente. O kit é uma referência de dossiê, sem
autorização de envio. Os sintéticos ficam excluídos e não geram ação comercial.

O experimento é observar se a prova e o recorte produzem pedidos pertinentes e
se estes avançam no atendimento. A revisão cabe à rotina comercial existente:
sem descoberta, examinar navegação/distribuição permitida; visita inadequada,
rever intenção; pedido sem avanço, examinar oferta/atendimento; venda trabalhosa,
rever produção e proposta. Pedido, qualificação, proposta, contrato, faturamento
e recebimento permanecem estágios distintos no owner. Não criar controle diário
ou novas páginas por reflexo. Ainda não há venda ou receita desta execução.

## Mapa de busca, resposta e contratação por URL

| URL | Necessidade / comprador / decisão | Resposta própria e evidência | Serviço e ação |
| --- | --- | --- | --- |
| `/inteligencia/` | Empresa escolhe o estudo adequado à decisão. | Seis situações e modalidades com duas provas reais vinculadas. | Solicitar estudo com necessidade, nome e canal. |
| `/inteligencia/orgaos/` | Fabricante/prestador busca mapear distribuidores, clientes ou parceiros. | Entrega de seleção e critérios; análise de pares e objetos documentados. | Solicitar mapeamento; examinar relações verificadas. |
| `/inteligencia/mercados/` | Diretoria investiga expansão, território ou produto. | Método para recorte, cobertura e comparação; composição real da amostra. | Solicitar estudo de mercado. |
| `/inteligencia/concorrencia/` | Empresa/consultoria compara concorrentes e carteira pública. | Identidade, presença e documentação, sem rating financeiro. | Solicitar análise de empresas. |
| `/inteligencia/acompanhamento/` | Fornecedor investiga oportunidades e mudanças no ciclo contratual. | Escopo de investigação e reconsulta, sem confundir vigência com trabalho disponível. | Definir acompanhamento. |
| `/inteligencia/precos/` | Comprador/ofertante compara preço e condições. | Pesquisa documental e critério de comparabilidade; valor global separado de preço unitário. | Contratar pesquisa de referências. |
| `/inteligencia/pesquisa-sob-encomenda/` | Consultoria/associação define estudo e utilização institucional. | Entrega, insumos, direitos e formato delimitados; pesquisa para outro setor acolhida. | Solicitar proposta institucional. |
| `/inteligencia/relacoes-compradores-fornecedores/` | Comprador examina quais relações e papéis a amostra comprova. | Dez contratos e identidades, fontes e comparação de aderência por objeto. | Solicitar seleção aplicada ao catálogo/território. |
| `/inteligencia/composicao-contratos-amostra/` | Diretoria compara categoria, calendário, vigência e valores. | Agregações recalculadas por contrato, interpretação e limites de cobertura. | Solicitar comparação do próprio recorte. |

## Estado operacional observado

Leitura autenticada de 14/10/2026 confirmou captura e handoff `READY`,
fingerprint `WARMBLY_PRODUCTION_V1`, despacho pausado e autoenvio desligado.
Assim, a fila humana já recebe o pedido persistido e o encaminhamento interno,
sem envio automático ao solicitante.

O Search Console está `CURRENT`, com resumo oriundo de `search_analytics_api`,
produzido e ingerido em 13/10/2026 e disponível para decisão de conteúdo. Este
é um sinal de busca do conjunto já observado. Não comprova rastreamento,
indexação, impressão ou pedido das novas URLs, que só podem ser registrados
depois da publicação e da observação correspondente.

Ainda não há preço, margem, checkout, cobrança ou contrato autorizados para
esta frente. Também não há resultado comercial desta publicação, owner humano
atribuído a uma demanda real. Os testes sintéticos da publicação inicial foram
reconciliados por releitura autenticada; são evidência de transporte e permanecem
excluídos do resultado comercial.

## Campo de validação real a preencher após a publicação

O QA local reutilizou o shell, Archivo Var e o logotipo reais. Em 390/1440/320
e no reflow equivalente a 200%, as duas superfícies examinadas ficaram sem
overflow de página, com corpo de 16–18px, tabelas de 14px e axe sem violações
ou casos inconclusivos. A ampliação real do texto para 32px revelou palavras
longas e o e-mail do rodapé; as correções de quebra ocorreram na origem dos
componentes. Campos de pesquisa receberam a borda pelo token institucional
`--muted` após a medição da borda anterior abaixo de 3:1. O erro 503 foi
simulado só no endpoint AJAX local, com `data-form-ready=true`: sem protocolo
ou redirect, mensagem visível e recuperação do foco no botão se o visitante
não o moveu. A confirmação do artefato e da produção permanece separada.

O responsável raiz preenche esta única seção quando houver a validação em
produção; não criar registro paralelo.

| Campo | Valor a registrar |
| --- | --- |
| Data/hora e artefato/SHA publicado | Publicação inicial `05dde323eac275ec2798c196e75b236c379572b4`, workflow `38544052757` bem sucedido. Revalidação HTTP em 14/10/2026 às 12:22 UTC: build e runtime com esse SHA, Cloudflare/Netcup e nove rotas HTTP 200. |
| Rota e contexto do teste controlado | Pesquisa institucional e análise de relações, ambas com jornada `outro`; a análise conserva corte e versão da amostra. |
| `lead_id`/`receipt_id` persistido e relido | Sintéticos `lead-e2b6750a9e9ef9572a07d9b3c19` e `lead-33cf0e5d2b4ae3f7e7b1f44be45`; releitura autenticada em 14/10/2026 às 12:21:35 UTC. |
| Encaminhamento confirmado no Warmbly | Ambos `DELIVERED`, uma tentativa, downstream HTTP 201, sem ação comercial. |
| Resultado do teste e exclusão da fila comercial | Ambos `record_kind=synthetic`, `authenticated_probe=true`, `next_action=exclude_from_commercial`. Contadores anteriores e respostas de replay da execução inicial não foram preservados; não alegar delta por recibo ou HTTP do replay. |
| Estado técnico de sitemap/rastreamento/indexação observado | Sitemap vivo com nove URLs. GSC API read-only em 14/10: três URLs têm crawls anteriores com `noindex`; seis são desconhecidas ao Google. HTML vivo permite indexação. Indexação do lançamento não observada. |
| Capturas e verificações de acessibilidade da produção | QA da publicação inicial registrado na campanha: 320/390/1440, leitura, contraste e fluxo sintético. A rodada abaixo tem candidato e validação próprios; a evidência inicial não é reutilizada como teste das alterações. |

**Rollback:** este registro é documental e reversível; não altera captura,
runtime, filas, dados, envio ou cobrança.

## Melhoria pós-publicação — mesma campanha, 14/10/2026

**Decisão:** `EXECUTE_NOW`; frentes receita, distribuição e confiança. O trabalho
melhora entregas compráveis e descoberta sem criar serviço, preço, runtime,
CRM, cadência ou agendamento. A revisão cabe à rotina comercial existente,
após dados GSC com corte posterior ao lançamento e no primeiro pedido humano
pertinente. Cem aplicações devem reutilizar seleção, revisão e proposta;
profundidade adicional sem compra não vira cem dossiês gratuitos.

### Decisão por necessidade e esforço econômico

Esta tabela aplica as letras A–H do objetivo pós-publicação. Horas completas
incluem briefing, aquisição limitada, identidade, documentos, análise, revisão,
proposta, atendimento, suporte e manutenção. Sem venda comparável observada,
horas e margem/caixa permanecem **a confirmar**; não há score, volume de busca,
probabilidade ou previsão de receita. Priorizar D quando houver obrigação e
lacuna técnica reais aproveita as rotas e entregas de engenharia já existentes.
A/F vêm em seguida quando catálogo ou item e documentos permitem delimitar uma
pesquisa finita. A comparação por hora total só será fechada com propostas,
entregas, custos e recebimentos observados no owner comercial.

| Necessidade / decisão | Rota e trabalho comprado | Dados, fonte e capacidade a confirmar | Esforço completo / margem e caixa / tempo até evidência | Alternativa e estado |
| --- | --- | --- | --- | --- |
| A — canais por produto e território: melhorar copy/prova/CTA | `/inteligencia/orgaos/`: seleção justificada de organizações para o catálogo | PNCP/documento por contrato + catálogo e território; canal/revenda somente com documento específico | Reconciliação e revisão documental; horas/margem a confirmar; próximo pedido de seleção pertinente | Consulta PNCP e plataformas; nova prova de climatização delimita papéis, sem carteira prioritária |
| B — compradores semelhantes: coberto por rota existente | `/inteligencia/orgaos/`: seleção de contas semelhantes; `/mercados/` compara categorias e territórios para expansão | Carteira autorizada, identidade e objetos compatíveis; similaridade precisa de critério explícito | Reconciliação da carteira e exclusões reservadas; horas/margem a confirmar; pedido com critério de similaridade | Ferramentas de busca; não criar página sinônima |
| C — parcelas complementares: melhorar copy/CTA | `/inteligencia/acompanhamento/`: investigação documental e atualização delimitada | Obrigação, parcelas, regra de subcontratação, situação e lacuna real; contrato assinado não é demanda aberta | Leitura de contrato/TR e reconsulta por ciclo; horas/margem a confirmar; confirmação de trabalho comprável | Alertas informam eventos; não presumir parcela disponível |
| D — produção técnica concreta: coberto satisfatoriamente | Terceirização, parcerias e quantitativos/orçamento nas rotas de engenharia | Insumos, obrigação, disciplina, lacuna, atribuição/local/ART e capacidade | Produção técnica + revisão e atendimento; horas/margem a confirmar; pedido técnico e escopo suficientes | Escritórios técnicos; preservar honorários técnicos e a proposta da engenharia |
| E — concorrentes/substituição: melhorar copy | `/inteligencia/concorrencia/`: matriz histórica de empresas e objetos | CNPJ, períodos, compradores e documentos; troca observada não explica motivo | Identidade e reconciliação temporal; horas/margem a confirmar; pedido de comparação | Plataformas/PNCP; não alegar sucesso ou causa não observados |
| F — preço comparável: melhorar copy/CTA | `/inteligencia/precos/`: caderno por item, especificação, unidade e condição | Item, quantidade, praça/data-base, tributos e entrega; excluir incompatíveis | Leitura de itens e condições + revisão; horas/margem a confirmar; pedido com item/especificação | Compras.gov.br/Precex/cotação; não criar indicador unitário da amostra de valores globais |
| G — estudo/licença: melhorar copy/CTA | `/inteligencia/pesquisa-sob-encomenda/`: estudo, edição ou licença não exclusiva delimitada | Pergunta, fontes, participantes, finalidade e direitos da análise própria | Pesquisa/edição/revisão e suporte delimitados; horas/margem a confirmar; pedido institucional com uso definido | Consultorias; não conceder revenda/exclusividade por inferência |
| H — ciclo posterior à aquisição: não ofertar ainda base instalada ou oportunidade presumida | `/inteligencia/acompanhamento/` atende pesquisa documental sob escopo | Entrega, local, quantidade, condições e evento determinante precisam ser comprovados | Verificação por documento e ciclo; horas/margem a confirmar; evidência de entrega e necessidade real | Alertas/manutenção publicada; histórico sozinho não certifica parque instalado |

As seis ofertas receberam introdução/insumos próprios, exemplo distinto,
entrega conferível e critério de aceitação. A proposta reutilizável existente
define escopo, fontes, insumos, revisão, direitos e aceite; preço, prazo e
cobrança dependem da autorização do caso. Os quatro demonstrativos B2G
continuam exemplos das entregas e condições do catálogo vigente, sem mudança
de preço, duplicação ou redirecionamento.

### Prova de valor e uma nova URL

`/inteligencia/fornecedores-climatizacao-contratos-publicos/` responde à
seleção de fornecedores pelo papel observado. É a única URL nova da rodada:
cinco casos com contratos e documentos oficiais permitem comparar fornecimento
sem instalação, fornecimento/instalação, locação com serviços, manutenção
continuada e intervenção corretiva. Não se anunciam revendedores, integradores,
base instalada, demanda futura, ranking ou valor unitário.

Fonte: `extra-cli`, release `14c8b2473c4e52566a7fed96c45057bd3214a2fe`,
leitura `REPEATABLE READ READ ONLY`, timeout 25 s e retorno limitado a 30
candidatos; plano usa índice GIN, sem varredura sequencial. Publicações do
recorte de candidatos: 01/09 a 11/10/2026. Cinco casos escolhidos para contrastar
papéis foram rechecados no PNCP e nos documentos determinantes em 14/10.
Consulta, filtros e hashes ficam na proveniência; os dados públicos curados e
manifesto independente são `data/pseo/climatizacao-sample.v1.json` e
`climatizacao-verification.v1.json`. A amplitude examinada para selecionar o
setor não é denominador censitário nem alegação de procura.

A busca pública mostra intenção de consulta sobre fornecedores, instalação e
manutenção. Não prova contratação ou volume: a janela GSC ainda antecede o
lançamento. Climatização foi escolhida pela combinação de pergunta útil e
documentos capazes de separar papéis; os demais setores ficam em backlog,
sem novas URLs ou coleta ampla.

As duas análises de dez contratos conservam o resultado original e agora
explicitam a origem em revisão exploratória de 26 CNPJs, a ausência de regra
reproduzível para essa seleção inicial e a delimitação à engenharia. A cobertura
“Brasil” foi retirada do JSON-LD. Datas e vigências são rotuladas como campos
publicados no PNCP, sem resolver por inferência divergências entre metadado e
instrumento.

### Uso próprio executado

O contrato PNCP `46223756000109-2-000026/2026` (Tejupá → LOTEARQ), Contrato
44/2026, cláusulas 1.1 e 2.1, confirma obrigação de projetos executivos BIM,
compatibilização, planilha, cronograma, modelo e responsabilidades por
disciplina. CONFENGE aplicou o método a uma hipótese de produção complementar
ou conferência de compatibilização/quantitativos/orçamento. O contrato inteiro
continua obrigação da contratada; não é oportunidade ou lead.

O documento declara assinatura 02/10 e vigência 02/10/2026–01/10/2027;
o PNCP registra 05/10 e 05/10/2026–04/10/2027. A divergência precisa de
reconciliação antes de usar data como gatilho. O próximo fato decisivo é o TR
e a regra de subcontratação/anuência, seguidos de lacuna declarada pela
contratada. Não houve abordagem, envio, inclusão em CRM ou receita.
Documento oficial: `https://pncp.gov.br/pncp-api/v1/orgaos/46223756000109/contratos/2026/26/arquivos/1`,
SHA-256 `e6bf73a59b1fc90b9b51b676eceb5b47a06951b246bd3e3f5324c525c87a2b06`.

### Busca, descoberta e indicador editorial

GSC read-only em 14/10: janela 14/09–11/10, 41 pares consulta/página devolvidos.
Consultas pertinentes retornadas tiveram uma impressão cada, sem clique:
“mapa de concorrentes” posição 11, “licitação pública” 14, “proposta para
licitação” 5, “empreitada por preço unitário” 3. A ausência de `/inteligencia/`
nas linhas retornadas não significa zero; Search Analytics devolve linhas
selecionadas. Não há evidência de canibalização do lançamento nem de conversão.
Inspeção das nove URLs: hub/concorrência/preços conservam crawls antigos com
noindex (14/09, 02/08, 01/08); as outras seis são desconhecidas ao Google.
O HTML HTTP atual é indexável. Sitemap, rastreamento, indexação e pedido são
estados separados; nenhuma Indexing API foi usada.

Home, parcerias, terceirização e quantitativos passaram a explicar a ponte
contextual para inteligência; quantitativos liga à pesquisa de preços e
parcerias/terceirização à seleção de organizações. `/servicos/` já tinha um
caminho editorial no conteúdo. A navegação principal, demais serviços,
formulários técnicos e preços do catálogo foram preservados. Os dois contratos
de páginas técnicas e seus renderizadores mantêm as pontes após rebuild.

O indicador `inbound:gates` continua ativo. Na primeira execução desta rodada,
o gate geral passou, mas `specific_value` ainda alerta nas ofertas e na análise
de relações: seu padrão conta datas/quantias, ignorando IDs PNCP/CNPJs e
critérios específicos de entrega. O aviso `caveats_preserved` da composição
não reconhece “não representa tamanho de mercado” e “não é censo”, embora
ambas as limitações estejam no HTML. São falsos positivos registrados por
leitura e comparação do algoritmo, não dispensas de qualidade. Não foram
adicionados números, afrouxados thresholds ou desativados gates para elevar nota.
O contador foi corrigido apenas nas duas famílias de amostras vinculadas a
manifesto: passa a reconhecer IDs PNCP exatos e distintos como fatos concretos,
mantendo o mínimo e a verificação independente da fonte. Os demais avisos
editoriais permanecem visíveis para conferência por leitura.

O candidato final deve passar pelos checks protegidos `site-ci` e `pSEO quality
gates`, e só depois pelo `netcup-release` com SHA exato, promoção atômica,
verificação de HTML/manifesto/CDN e nova prova autenticada de transporte.
A identidade final, resultados desses controles e pós-publicação pertencem
ao relatório de entrega desta mesma rodada; merge sozinho não comprova deploy.
