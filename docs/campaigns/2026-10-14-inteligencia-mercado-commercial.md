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
atribuído a uma demanda real, nem teste de produção desta versão reconciliado.

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
| Data/hora e artefato/SHA publicado | `PENDENTE` |
| Rota e contexto do teste controlado | `PENDENTE` |
| `lead_id`/`receipt_id` persistido e relido | `PENDENTE` |
| Encaminhamento confirmado no Warmbly | `PENDENTE` |
| Resultado do teste e exclusão da fila comercial | `PENDENTE` |
| Estado técnico de sitemap/rastreamento/indexação observado | `PENDENTE` |
| Capturas e verificações de acessibilidade da produção | `PENDENTE` |

**Rollback:** este registro é documental e reversível; não altera captura,
runtime, filas, dados, envio ou cobrança.
