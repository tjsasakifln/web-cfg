# Pagamentos do marketplace de engenharia

Verificação: 12/11/2026. Base examinada: `mercurjs/mercur`, tag `v2.4.1`. SDK utilizado pela extensão: `stripe@19.1.0`.

## Decisão e alcance

O Mercur fornece cadastro de prestadores, contas de repasse e integração Stripe Connect. A contratação de engenharia usa uma extensão própria: solicitação, proposta versionada, aceite, pagamento, entrega e avaliação. Não foi apresentado como um marketplace completo de engenharia disponível sem adaptação.

A cobrança usa Stripe Checkout com `destination charge`, em reais e por cartão. O cliente paga o valor da proposta aceita, a conta Stripe do prestador recebe a parcela correspondente e a comissão configurada fica com a plataforma. O checkout usa captura automática. O valor não fica condicionado à aprovação posterior da entrega. Não há serviço de custódia, garantia de resultado técnico ou promessa de dinheiro retido até a conclusão.

A cobrança, a transferência para a conta Stripe do prestador e o crédito no banco são acontecimentos diferentes. No fluxo escolhido, taxas da Stripe, devoluções e contestações são debitadas do saldo da plataforma. A comissão bruta não equivale à margem líquida da CONFENGE. Fonte: [Stripe, destination charges](https://docs.stripe.com/connect/destination-charges.md?platform=web&ui=stripe-hosted).

O código parte com `MARKETPLACE_PAYMENTS_ENABLED=false`. A configuração e os testes locais não comprovam aprovação da conta Stripe, funcionamento em produção, recebimento de dinheiro ou homologação bancária.

## Por que não usar a cobrança nativa do Mercur para projetos longos

A inspeção do código da tag encontrou:

| Comportamento nativo | Consequência para engenharia |
| --- | --- |
| O provider `payment-stripe` força `capture_method: manual` | Uma autorização de cartão não é uma forma de manter valores indefinidamente durante um projeto |
| A decisão de captura aproxima o prazo por uma janela configurável, inicialmente sete dias | Não comprova o prazo efetivo da autorização de cada cartão |
| O padrão captura o valor remanescente perto da expiração, mesmo com pedidos não decididos | Não assegura aceite técnico antes da cobrança |
| `captureBeforeAcceptance` considera `accepted: null` suficiente | Ausência de informação não pode funcionar como aceite de uma proposta |
| `requiredFulfillmentStatus: delivered` consulta o estado comercial de entrega | Esse estado, isoladamente, não é aceite técnico do cliente |
| Em `settlements.mode: provider`, a apuração pode nascer `paid_out` | Esse campo não comprova crédito bancário |

Arquivos examinados no código original:

- [Provider de pagamento](https://github.com/mercurjs/mercur/blob/v2.4.1/packages/plugins/stripe-connector/src/providers/payment-stripe/service.ts).
- [Decisão de captura](https://github.com/mercurjs/mercur/blob/v2.4.1/packages/plugins/stripe-connector/src/workflows/captures/utils/capture-decision.ts).
- [Leitura do aceite](https://github.com/mercurjs/mercur/blob/v2.4.1/packages/plugins/stripe-connector/src/workflows/captures/utils/capture-rows.ts).
- [Planejamento da apuração](https://github.com/mercurjs/mercur/blob/v2.4.1/packages/plugins/stripe-connector/src/workflows/settlements/utils/plan-settlements.ts).

Se um fluxo futuro voltar a usar autorização manual, expiração deve resultar em cancelamento ou solicitação de nova autorização ao cliente. Nunca deve provocar uma nova cobrança automática. Alterar apenas a janela de autorização não resolve o problema.

Pix não está habilitado nesta entrega. O provider manual nativo não é compatível com a captura necessária para Pix, e o adapter próprio foi delimitado e testado para cartão. A Stripe documenta Pix no Brasil e Connect, mas também informa ausência de captura manual. Essa possibilidade futura não é apresentada como recurso já integrado. Fonte: [Stripe, Pix](https://docs.stripe.com/payments/pix).

## Configuração concreta

O arquivo `apps/engineering-marketplace/config/stripe-connect.cjs` exporta `buildStripeConnectConfig(env)` e `WEBHOOK_PATHS`.

Ele devolve `paymentsEnabled`, `integrationConfigured`, `mode`, `country`, `currencyCode`, `plugins`, `modules` e `webhookPaths`.

| Configuração | Valor aplicado | Motivo |
| --- | --- | --- |
| Conta recebedora | Stripe Express, pelo provider nativo do Mercur | Reaproveitar criação, atualização e verificação da conta |
| `manualPayouts` | `false` | Deixar a agenda bancária com a Stripe |
| `settlements.mode` | `provider` | Não criar agenda bancária própria |
| `settlements.enabled` | `false` | Contratações de engenharia não usam a apuração de Orders do Mercur |
| `transfers.enabled` | `false` | Evitar segundo repasse após a destination charge |
| `reversals.enabled` | `false` | As devoluções da extensão não são devoluções de Orders do Mercur |
| Provider de pagamento Medusa | Não registrado por essa configuração | Impedir que a contratação use dois fluxos financeiros |
| País padrão | `BR` | Cadastro brasileiro; o adapter também confere o país real da conta |
| Moeda da contratação | `brl` | O adapter recusa outra moeda |
| Métodos de pagamento | `card` | Escopo de homologação desta versão |
| Retorno do cadastro | `/profissionais/#minha-conta` | Retornar a uma tela existente da CONFENGE |

O plugin `v2.4.1` não oferece uma opção `capture.enabled`. Não foi inventada essa configuração. Seu job de captura não encontra collections de pagamento para as solicitações próprias de engenharia; o serviço também bloqueia as rotas financeiras nativas. Como defesa adicional, `safetyBufferMs` fica em zero e `captureBeforeAcceptance` em falso. Essas opções não substituem o bloqueio das rotas nem o aceite no servidor.

O requisito `requiredFulfillmentStatus: delivered` permanece na configuração do plugin, mas não decide as transferências da extensão porque `transfers.enabled=false`. A extensão considera seu próprio registro de entrega e aceite. Não se deve usar o campo `delivered` do Mercur como prova automática de aceitação técnica.

### Variáveis do servidor

| Variável | Conteúdo |
| --- | --- |
| `MARKETPLACE_PAYMENTS_ENABLED` | `false` por padrão; `true` somente após homologação do fluxo completo |
| `MARKETPLACE_PAYMENT_MODE` | `test` ou `live`, explicitamente |
| `STRIPE_SECRET_KEY` | Chave privada do ambiente correspondente, somente no servidor |
| `STRIPE_OPERATOR_WEBHOOK_SECRET` | Segredo de assinatura do endpoint financeiro da extensão |
| `STRIPE_SELLERS_WEBHOOK_SECRET` | Segredo distinto do endpoint de contas conectadas |
| `BACKEND_URL` | Endereço público canônico usado pelo módulo de contas do Mercur |
| `MARKETPLACE_PUBLIC_ORIGIN` | `https://confenge.com.br` em produção |
| `MARKETPLACE_COMMISSION_BPS` | Comissão em pontos-base, definida comercialmente e preservada na proposta aceita |

O builder recusa mistura entre chave `sk_test_` e modo `live`, ou o inverso; segredos de webhook repetidos; URLs com credenciais, parâmetros ou domínio alheio. URLs HTTP e localhost são aceitas somente em teste. Não imprime credenciais em mensagens de erro.

**Desabilitar novas cobranças não desliga a conciliação.** Se a chave Stripe estiver configurada, o plugin e o provider de contas continuam carregados quando `MARKETPLACE_PAYMENTS_ENABLED=false`. O adapter impede apenas `createCheckout`; assinatura, leitura de pagamentos, devoluções e contestações continuam disponíveis. Retirar a chave ou o segredo de webhook interrompe essas consultas e não deve ser usado como forma de pausar novas vendas.

O país padrão não verifica atribuições profissionais, registro no conselho ou responsabilidade técnica. Essas verificações pertencem ao cadastro e à aprovação técnica do prestador, antes da contratação.

## Como a cobrança é construída

O arquivo `config/checkout.cjs` exporta `createCheckoutAdapter({stripe, mode, webhookSecret, paymentsEnabled, publicBaseUrl})`.

### `createCheckout`

Recebe exclusivamente dados montados no servidor a partir da proposta aceita:

```js
{
  request: {
    id, revision, title, amountCents, currency: 'brl',
    customerId, sellerId,
    customerAcceptedRevision, providerAcceptedRevision
  },
  accountId,
  feeCents,
  customerId
}
```

Os dois aceites devem corresponder à revisão atual. O comprador deve ser o titular da solicitação. O preço deve ser inteiro em centavos; a comissão não pode excedê-lo. A revisão é imutável após o início da cobrança. A assinatura de um contrato ou aceite de uma revisão anterior não autoriza preço ou escopo diferentes.

Antes de criar o checkout, o adapter consulta a conta Stripe. Exige país BR, cadastro completo, recebimentos e repasses habilitados, capacidades `card_payments` e `transfers` ativas e ausência de exigências pendentes de verificação.

A requisição usa:

```js
{
  mode: 'payment',
  payment_method_types: ['card'],
  line_items: [{price_data: {currency: 'brl', unit_amount: amountCents}, quantity: 1}],
  payment_intent_data: {
    capture_method: 'automatic',
    application_fee_amount: feeCents,
    transfer_data: {destination: accountId}
  }
}
```

O código completo também envia o nome do serviço, referências internas e URLs de retorno. O ID do comprador no Mercur não é enviado como se fosse um Customer Stripe. Metadados não contêm CPF, endereço, escopo reservado ou outros dados pessoais desnecessários.

A sessão desabilita `adaptive_pricing`, acréscimo automático de imposto e códigos promocionais. Assim, uma configuração do painel Stripe não muda a moeda ou o total de uma proposta já aceita. Obrigações fiscais continuam na composição comercial e na emissão dos documentos pertinentes; não se acrescenta valor no checkout sem novo aceite. O SDK `19.1.0` informa que Adaptive Pricing, quando omitido, herda a configuração do painel. Fonte: [Stripe, criação de sessão e Adaptive Pricing](https://docs.stripe.com/api/checkout/sessions/create.md?query=adaptive_pricing).

A chave de idempotência é estável por solicitação e revisão. O servidor grava a sessão e reutiliza seu endereço. Em falha de comunicação depois do início da criação, o estado fica pendente de conciliação, em vez de gerar uma segunda cobrança. A retenção da chave de idempotência pelo processador não substitui essa persistência local.

O retorno de sucesso leva a `/profissionais/?session_id=...#contratacoes`; cancelamento leva a `/profissionais/#contratacoes`. Nenhuma dessas URLs altera o estado financeiro sozinha.

### `retrieveCheckout`

Consulta a sessão e o PaymentIntent, com a charge correspondente, usando a chave privada. Compara os valores com a proposta persistida: solicitação, revisão, comprador, prestador, conta de destino, comissão, montante, moeda e ambiente. Só confirma pagamento com sessão concluída e pagamento efetivamente capturado.

O resultado diferencia `paymentCaptured`, `paid`, `refundedAmountCents`, `refundPendingAmountCents`, `refundFailedAmountCents`, `fullyRefunded` e `disputed`. A lista autenticada de Refunds é consultada com paginação: somente valores com `status=succeeded` entram no total devolvido. Solicitações pendentes, que exigem ação, falhas e canceladas ficam separadas. Não basta consultar `charge.amount_refunded` para chamar uma solicitação de devolução concluída.

Qualquer devolução, pendência, falha de restituição ou contestação torna `paid=false`, preservando o fato histórico da captura. O chamador usa `reconcileEngineeringPayment(record, facts)`, em `finance-state.cjs`, para decidir os estados. A função retorna `{status, paymentStatus}`; pendências e falhas suspendem a execução para análise. Uma confirmação repetida preserva entrega e conclusão; um evento pago tardio não reabre contratação cancelada, devolvida ou contestada. Casos restritos exigem decisão operacional explícita.

### `verifyEvent` e `readPaymentEvent`

`verifyEvent` usa `stripe.webhooks.constructEvent` com o corpo bruto original, a assinatura e o segredo do endpoint. Um JSON já interpretado não é aceito como corpo bruto.

`readPaymentEvent` só aceita o mesmo objeto que passou pela verificação. Busca a sessão, charge, disputa e PaymentIntent na Stripe para localizar a solicitação. Depois, o servidor carrega sua própria proposta e chama `retrieveCheckout` para conferir o pagamento completo. Eventos de outros produtos da plataforma ou de contas conectadas são ignorados por esse endpoint.

## Configuração da Stripe e dos webhooks

1. Ativar a conta brasileira da CONFENGE e completar a configuração da plataforma Connect.
2. Usar o ambiente de teste para validar cadastro e cobrança. Contas conectadas de teste não são as contas de produção.
3. Cada prestador conclui seu cadastro e a verificação solicitada pela Stripe. O retorno ao site não significa aprovação do cadastro; a situação precisa ser consultada.
4. Configurar os dois destinos abaixo no ambiente correspondente e guardar cada segredo apenas na configuração protegida do servidor.
5. Executar os casos de homologação antes de ativar novas cobranças.

| Destino público | Origem dos eventos | Eventos |
| --- | --- | --- |
| `https://confenge.com.br/api/web/engineering-marketplace-webhook` | Conta da plataforma | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed` |
| `https://confenge.com.br/api/web/engineering-marketplace-connect-webhook` | Contas conectadas | `account.updated`, `payout.paid`, `payout.failed`, `payout.canceled`, `payout.updated` |

O gateway encaminha os corpos brutos para `/hooks/engineering-stripe` e `/hooks/payout`, respectivamente. Deve preservar `stripe-signature` e os bytes exatos; não pode reserializar JSON antes da validação.

O endpoint de conexão fornece `return_url` e `refresh_url` fixos para `/profissionais/#minha-conta`. Se o link expirar, o prestador retorna à sua conta e pede outro link. O refresh nativo `/payout/onboarding/refresh` não é apresentado ao visitante. Um link criado automaticamente pelo workflow original não deve ser publicado se não corresponder às rotas efetivamente disponíveis.

O contrato foi conferido no código da tag: `createPayoutAccountWorkflow` retorna a conta local em `result`, com `result.id`; o ID Stripe está no campo `external_id` da conta. `createOnboardingWorkflow` retorna o registro de cadastro, cujo endereço é `result.data.url`. Para uma conta que já informou seus dados, o serviço pode devolver um link de login Express no mesmo campo. Não interpretar o ID local como `acct_`, nem presumir que o retorno do cadastro significa verificação aprovada.

O provider original cria contas Express e pede `card_payments` e `transfers`. A Stripe possui requisitos de verificação específicos para contas brasileiras. Não marcar uma conta como apta apenas porque existe um ID `acct_`. Fontes: [provider Mercur v2.4.1](https://github.com/mercurjs/mercur/blob/v2.4.1/packages/plugins/stripe-connector/src/providers/payout-stripe-connect/service.ts) e [Stripe, atualizações de verificação no Brasil](https://support.stripe.com/questions/2025-brazil-verification-requirement-updates-for-platforms?locale=en-GB).

## Comissão, repasse e devoluções

A comissão é uma condição comercial da contratação e precisa ser conhecida pelo prestador. Antes de abrir a cobrança, conferir que valor e comissão da proposta aceita foram preservados. Alterar uma variável de comissão não autoriza alterar retroativamente uma proposta. O valor bruto transacionado, a receita de comissão e o dinheiro disponível para retirada são registros diferentes.

O calendário bancário é controlado pela Stripe. A documentação brasileira informa repasses diários e prazos de disponibilidade diferentes por meio de pagamento. Não publicar um prazo de recebimento para o prestador sem conferir a conta concreta. Fonte: [Stripe, cronograma e disponibilidade no Brasil](https://support.stripe.com/questions/brazil-specific-payout-schedule-and-payment-availability?locale=pt-BR).

`config/finance-state.cjs` traduz os estados internos sem declarar dinheiro recebido no banco. Em especial, `paid_out` no modo `provider` aparece como apuração registrada na Stripe. Um transfer `paid` significa destinação à conta Stripe do prestador. Até uma informação de payout pago continua identificada como informação da Stripe, sujeita à conferência do extrato bancário.

Devoluções deste fluxo são feitas por operador autorizado na Stripe. Para destination charges, conferir expressamente a reversão da transferência e da comissão. A API oferece `reverse_transfer` e `refund_application_fee`; devolver somente a cobrança não implica automaticamente desfazer todas as parcelas financeiras. O plugin Mercur não deve fazer uma segunda reversão para a mesma contratação. Fonte: [Stripe, devoluções de destination charges](https://docs.stripe.com/connect/destination-charges.md?platform=web&ui=stripe-hosted#issue-refunds).

O adapter consulta as devoluções e contestações pelos eventos autenticados. A extensão não oferece interface de cliente para ordenar reembolso nesta primeira entrega. Uma decisão de devolução ou uma solicitação enviada à Stripe não equivale a dinheiro creditado no banco do cliente.

Reembolsos por cartão podem permanecer pendentes por saldo ou falhar posteriormente. Por isso os eventos `refund.created`, `refund.updated` e `refund.failed` também são necessários. Uma restituição pendente não é publicada como concluída; uma falha exige acompanhamento, mesmo quando a cobrança original continua capturada. Fonte: [Stripe, estados e eventos de devolução](https://docs.stripe.com/refunds).

## Homologação e critérios para ativar

Os testes locais incluem dados artificiais e não realizam cobranças. Há teste de assinatura HMAC com o SDK Stripe instalado, incluindo rejeição de corpo adulterado. Os demais casos usam cliente Stripe injetado para examinar as chamadas e forçar falhas financeiras específicas.

```bash
cd apps/engineering-marketplace
npm test
```

Casos obrigatórios no ambiente conectado antes da ativação:

- Cadastro e restrição de conta brasileira; capacidade pendente impedindo checkout.
- Proposta criada pelo prestador autenticado, aceite do cliente na revisão vigente e recusa de revisão alterada.
- Comissão conhecida e congelada na proposta; conta recebedora obtida do vínculo persistido do prestador.
- Cobrança aprovada, recusada e expirada; confirmação apenas após consulta autenticada.
- Clique repetido, timeout após envio e retorno do processo sem segunda sessão ou segunda cobrança.
- Assinatura inválida, evento duplicado, evento fora de ordem e evento de outra contratação.
- Devolução parcial, total, reversão da transferência e da comissão; contestação e atualização posterior.
- Desativação de novas cobranças mantendo webhooks e conciliação dos pagamentos já existentes.
- Entrega, aceite de conclusão e avaliação vinculada ao comprador real, sem avaliação de contratação não paga ou contestada.

Enquanto a aplicação, as contas e esses resultados não forem verificados, a cobrança permanece desativada. Isso preserva o código para integração sem confundir testes locais com operação financeira homologada.

## Alternativas consideradas

Mercado Pago Split 1:1 é tecnicamente viável, mas substituir Stripe agora reduziria o reaproveitamento do Mercur. O fluxo clássico pede autorização OAuth de cada vendedor e usa `marketplace_fee` no Checkout Pro. Há restrições para devolução quando o recebedor não tem saldo. Fontes: [integração de split](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace) e [pré-requisitos](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites).

Não foi assumida equivalência entre o pagamento Pix de ferramentas da CONFENGE e um marketplace: documentos do Checkout Transparente Orders e Checkout Pro Orders descrevem caminhos diferentes para comissão. Uma migração futura precisa validar o produto exato, a conta recebedora, a divisão e a devolução. Fontes: [migração Payments para Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/migrate-payments-to-orders) e [Checkout Pro Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/create-order?scope=prod).

Pagar.me oferece divisão entre recebedores, mas sua documentação restringe a função a clientes PSP. Não foi escolhido um novo processo comercial e uma segunda integração de recebedores para esta primeira versão. Fonte: [Pagar.me, split](https://docs.pagar.me/docs/pedidos-com-split).
