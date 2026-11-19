# Contratação de projetos por disciplina

O pedido do fundador de 12/11/2026 autoriza publicar preços e contratar projetos
residenciais sob encomenda, por disciplina e prazo. Essa autorização não libera
as licenças de arquivos do catálogo anterior nem as compras das ferramentas.
O contrato único é `data/projects-ready/service-offer.v1.json`. Preço autorizado
é diferente de margem operacional validada, que permanece sem comprovação.

O módulo usa a superfície `project-orders`, o adaptador Mercado Pago existente e
o armazenamento durável do host. O pagamento não exige cadastro Firebase. Não
cria cadastro de prospectos, envio de mensagens ou gerenciamento comercial.
Warmbly e o atendimento da CONFENGE continuam responsáveis pelo aceite técnico,
documentos, produção, faturamento, cumprimento e resultado comercial.

## Preço e escopo

Para residência unifamiliar nova de 50 a 250 m², até dois pavimentos, sistema
convencional e terreno plano ou suave, as taxas de referência para 90 dias são:

| Disciplina | Valor por m² | Mínimo |
| --- | ---: | ---: |
| Arquitetônico | R$ 14,90 | R$ 1.490,00 |
| Estrutural | R$ 12,90 | R$ 1.290,00 |
| Elétrico | R$ 6,90 | R$ 690,00 |
| Hidrossanitário | R$ 6,90 | R$ 690,00 |

O fator de prioridade é `0,85 + 13,5 / prazo`, de 15 a 90 dias corridos.
`service-policy.cjs` calcula com razões inteiras, arredonda a base ao centavo e
depois o valor de cada disciplina ao centavo; a soma forma o total. O cliente
não envia preço, moeda, desconto ou status. O servidor recusa esses campos.

O atendimento envia a lista específica de insumos em até dois dias úteis após
o pagamento. Em até três dias úteis de cada envio, confirma o início e a data
final ou informa pendências específicas. Com o pagamento confirmado e os
documentos completos, o prazo de elaboração começa efetivamente até o terceiro
dia útil após o recebimento completo; a comunicação registra esse início e a
data final. O prazo escolhido cobre todas
as disciplinas do mesmo pedido, incluindo a arquitetura quando contratada;
a elaboração interna de arquitetura não posterga o início nem acrescenta prazo.
A confirmação de pagamento não faz aceite técnico automático. Casos fora do
escopo recebem proposta própria e não
passam pelo checkout. Inviabilidade constatada no exame inicial permite nova
proposta sem obrigação de aceite ou devolução integral, conforme as condições.
As condições publicadas incluem direitos autorais, entregas, duas rodadas de
ajustes, correção de erros sem consumir rodadas, ART/RRT, itens de campo,
cancelamento e ausência de garantia de aprovação por terceiros.

## Configuração operacional

Os valores ficam no ambiente privado do runtime, nunca no Git, HTML, logs ou
descrições de PR.

| Nome | Uso |
| --- | --- |
| `PROJECT_SERVICE_MODE` | `live`, `sandbox` ou `off`. Em `netcup-production`, o padrão é `live`; fora dele, `off`. |
| `PROJECT_SERVICE_MP_ACCESS_TOKEN` | Token privado da aplicação institucional no ambiente correspondente. |
| `PROJECT_SERVICE_MP_LIVE_SELLER_ID` | ID esperado do vendedor institucional real. |
| `PROJECT_SERVICE_MP_WEBHOOK_SECRET` | Segredo de assinatura do callback da aplicação. |
| `CONFENGE_STORAGE_DIR` | Raiz persistente existente, privada, modo 0700 e fora do release. |
| `PROJECT_SERVICE_PURCHASES` | `0` interrompe novas contratações sem impedir acompanhamento e conciliação. |
| `PROJECT_SERVICE_MP_TEST_SELLER_ID` | Somente ensaio, com `mode=sandbox`. |
| `PROJECT_SERVICE_MP_TEST_BUYER` | Somente ensaio em conta de teste. |
| `PROJECT_SERVICE_SANDBOX_ORIGIN` | Origem exata do navegador de ensaio. |

Na ausência de credenciais próprias, o módulo admite reaproveitar token, seller
e segredo de `PROJECT_COMMERCE_*` ou `TOOLS_COMMERCE_*` somente se o respectivo
modo estiver explicitamente em `live`. Nunca promove uma conta de teste. Antes
de oferecer checkout, consulta `/users/me`, verifica o seller esperado e a
ausência de `test_user`, e comprova escrita e releitura no armazenamento. Essa
verificação não comprova configuração correta da URL de callback ou pagamento.

Quando serviços e ferramentas compartilham exatamente modo, vendedor, Access
Token e segredo de assinatura da mesma aplicação, preservar o callback Orders
das ferramentas:

`https://confenge.com.br/api/web/tool-credits-webhook`

Esse handler valida assinatura e vendedor, consulta a ordem uma única vez no
Mercado Pago e procura primeiro o pedido de créditos. Somente quando não existe
pedido nesse ledger, encaminha o fato autenticado ao ledger residencial. O
encaminhamento exige coincidência exata das credenciais; não reaproveita fatos
de outra aplicação ou ambiente. Cada ledger conserva seus controles de valor,
referência e idempotência. Falha no armazenamento residencial não recebe uma
confirmação de sucesso; o provedor pode reenviar. Pausar novas contratações não
interrompe a conciliação dos pedidos existentes.

Para uma aplicação própria, com credenciais distintas das ferramentas,
configurar o callback Orders de serviços:

`https://confenge.com.br/api/web/project-orders-webhook?flow=service`

Não substituir o callback da aplicação compartilhada pelo callback exclusivo de
serviços, pois isso interromperia as notificações das ferramentas. A existência
desses handlers no código não comprova qual URL está configurada no painel;
conferir a URL e testar a recepção no ambiente correspondente antes de declarar
a integração externa validada. O retorno do
pagamento é `https://confenge.com.br/projetos-prontos/?pedido=UUID#pedido`.
Uma URL de retorno nunca contém credencial nem confirma pagamento.

Se o serviço herdar `PROJECT_COMMERCE_*` de outra aplicação compartilhada com
licenças de arquivos, o encaminhamento descrito acima não modifica o callback
daquela aplicação. Preservar seus consumidores e conferir o roteamento próprio
antes de operar essa configuração.

Sem credenciais e vendedor válidos, `service-config` retorna preços e termos,
mas `purchasesEnabled=false`. Não existe link de cobrança fictício ou fallback
para conta pessoal. Não declarar venda ativa sem conferir o checkout real.

## API e recibo

Todas as respostas são `private, no-store` e `noindex`. As escritas exigem
origem exata e JSON limitado. O endpoint é `/api/web/project-orders`.

| Operação | Entrada e efeito |
| --- | --- |
| GET `op=service-config` | Preços, condições e disponibilidade real de checkout; sem segredos. |
| POST `op=service-quote` | Área, prazo, disciplinas, pavimentos, tipo e terreno. Devolve total recalculado, versões e `quoteHash`. |
| POST `op=service-checkout` | Seleção, dados mínimos do comprador/município, referência, aceite, versões, `quoteHash`, `requestId` e `receiptToken`. |
| GET `op=service-status&id=UUID` | Exige `Authorization: Bearer receiptToken`; consulta independente do provedor quando necessário. |
| POST `op=service-support` | Exige o mesmo token; `orderId`, `requestId`, `kind=support|cancellation`, `message`. Cancelamento não exige justificativa. |

O navegador gera um token criptográfico aleatório de 32 bytes e um UUID antes
de iniciar o pagamento. Guarda-os para recuperar a mesma compra e pode oferecer
um arquivo de recibo para conservação pelo comprador. O token é pessoal, não
entra em URL, analytics ou logs, e seu original não é salvo pelo servidor.
Somente o SHA-256 do token é persistido. Importar o recibo restaura acesso ao
mesmo pedido; não altera o pagamento. O atendimento pode localizar o pedido
usando acesso administrativo, sem distribuir credenciais de compradores.

O pedido é salvo com `fsync`, escrita atômica e releitura antes do POST ao
Mercado Pago. A idempotência usa UUID, credencial e impressão do conteúdo. O
mesmo pedido não cria outra cobrança; alterar seu conteúdo devolve conflito.
O `quoteHash` vincula o resumo exato revisado ao valor e escopo recalculados no
servidor; uma mudança de preço posterior exige novo aceite mesmo se um operador
esquecer de alterar a versão textual do catálogo.
Cada disciplina entra como item separado do Checkout Pro. Uma resposta incerta
fica em conferência e é recuperada pela referência original, sem reemitir.

Uma recusa explícita HTTP 400, 401, 403 ou 422 do POST de criação encerra somente
aquela tentativa como `failed`, permitindo ao comprador revisar e iniciar uma
nova tentativa. O recibo recusado continua idempotente e não faz novas consultas
ao provedor quando nunca recebeu um `providerId`. O encerramento é atômico e não
substitui uma ordem já vinculada ou confirmada por webhook. Timeout, HTTP 408,
409, 423, 429, erros 5xx, resposta inválida e erro de consulta mantêm a conferência;
não liberam outra cobrança automaticamente. A distinção segue os
[erros de criação da Orders API](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-orders/create-order/post)
e não usa mensagens privadas do provedor no recibo ou nos logs.

O callback assinado somente identifica qual ordem consultar. Pagamento
confirmado requer resposta autenticada GET do provedor, com vendedor,
referência, moeda e valor coincidentes. O estado enviado pelo navegador é
ignorado. Reversão, devolução parcial ou dados contraditórios impedem marcar
cumprimento financeiro normal. Uma confirmação por webhook que anteceda o
retorno do POST não é perdida. Eventos repetidos são idempotentes.

Os registros ficam em namespaces `project-services-live` ou
`project-services-sandbox`, preservados por rollback do site. Guardam o escopo,
preço e condições exatos, consentimentos, dados necessários ao atendimento,
eventos de pagamento e pedidos de suporte. Nenhum detalhe pessoal entra em
analytics. `source=CONFENGE_WEB`, família e intenção acompanham o pedido.

## Consulta privada e continuidade

Executar no host com ambiente privado já carregado. Saídas de pedido contêm
dados pessoais e são exclusivas da equipe autorizada.

```sh
node runtime/project-commerce/service-ops.cjs preflight
node runtime/project-commerce/service-ops.cjs orders
node runtime/project-commerce/service-ops.cjs order UUID_DO_PEDIDO
node runtime/project-commerce/service-ops.cjs reconcile ORD_IDENTIFICADOR
```

`preflight` retorna somente booleans sobre configuração, armazenamento e
vendedor. Não revela os segredos. `orders` discrimina criação, pagamento e
valores mantidos. Liquidação bancária permanece nula até conferência própria.
`reconcile` consulta o provedor e persiste apenas o fato retornado por ele.
Solicitação de cancelamento gera protocolo e não finge estorno realizado.

A mesma consulta está disponível com a autenticação OPS existente em
`GET /api/web/ops?action=project_services`. Usar `op=preflight` para conferir
somente disponibilidade e `order_id=UUID` para ler um pedido no atendimento.
O token OPS continua obrigatório; as respostas são privadas e não armazenáveis
em cache. O resumo geral não contém contatos. A consulta individual identifica
expressamente dados pessoais e nunca devolve o token secreto do comprador.

Para suspender novas vendas, definir `PROJECT_SERVICE_PURCHASES=0` e conservar
credenciais, modo, callbacks e dados para pedidos existentes. Não usar `off`
para suspender a conciliação. A equipe comercial confere pedidos recebidos,
decide enquadramento, comunica documentação e início de prazo e realiza
cancelamentos e estornos cabíveis no provedor, acompanhando sua conciliação.

## Verificação

```sh
node --test tests/project-commerce/*.test.cjs tests/tools-commerce/mercado-pago.test.cjs
```

A suíte cobre limites, cálculo, adulteração, origem, consentimento, idempotência
concorrente, token errado, persistência anterior ao provedor, vendedor/ambiente,
assinatura, confirmação independente, respostas perdidas, corrida de webhook,
estornos, devoluções parciais, suporte e discriminação das disciplinas.
Os testes são locais com provedor simulado. Não provam aquisição real, acesso
ao painel institucional, configuração do callback ou recebimento de dinheiro.
O teste `shared-webhook.test.cjs` executa os ledgers de ferramentas e serviços,
com transporte Firestore em memória e armazenamento residencial real em disco.
Confere assinatura, vendedor, coincidência de credenciais, uma única consulta
da ordem por notificação, repetição, devolução e falhas de dependências. Também
confere a ligação do handler publicado. Nenhum teste cria cobrança externa.
