# Confenge Free e Pro: preparação e homologação

Estado: proposta de implementação, **não ativada**. Não é evidência de homologação externa. A carteira única, os preços avulsos, Pix, checkout Orders e a cortesia são preservados. O plano canônico v1 custa R$ 49,90 por ciclo mensal pago e inclui seis exportações não acumulativas. Créditos avulsos não vencem. Nenhum plano anual, ilimitado ou empresarial.

## Integração escolhida

A documentação oficial permite criar assinatura sem plano associado com pagamento pendente, por POST /preapproval com external_reference exclusiva, seguida de link individual do Mercado Pago. Não é um link genérico nem envolve coleta de cartão pela CONFENGE. O catálogo local versionado congela a oferta em cada contrato; não é criado um plano remoto por usuário. Confirmar o contrato real e a possibilidade de renovação automática com a conta institucional antes de ativar. Caso o fluxo hospedado não ofereça recorrência ou vínculo inequívoco, migrar para plano associado e tokenização oficial antes de liberar.

Referências:
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-authorized-payment/get
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/authorized-payment-search/get

## Contratação e termos: minuta para aprovação

Publicar em /termos-de-uso/#assinatura-ferramentas, mantendo termos de créditos v2 intactos e arquivados. Aprovação jurídica/comercial necessária antes de ativar, inclusive hash da versão publicada:

**Confenge Pro.** A assinatura custa R$ 49,90 por mês, com renovação automática e seis créditos de exportação por ciclo efetivamente pago. Os créditos incluídos são válidos somente no ciclo correspondente e não se acumulam. Os créditos comprados separadamente não vencem. A assinatura não tem fidelidade e pode ser cancelada pela conta, impedindo futuras cobranças após confirmação do provedor; benefícios do período pago permanecem até seu término, salvo reembolso/reversão aplicável. Em caso de cobrança indevida, falha de serviço ou exercício dos direitos legais, entre em contato pelos canais oficiais. O direito de arrependimento, quando aplicável, pode ser exercido em sete dias, sem prejuízo de outros direitos do consumidor. Nenhuma ferramenta substitui responsabilidade técnica, ART/RRT, projeto ou validação profissional. Limites de utilização devem ser apresentados antes da contratação. Dados de cartão são tratados pelo provedor; a CONFENGE registra apenas referências de contratação, pagamentos e movimentações necessárias à operação. Atualizar política de privacidade com finalidades, retenção, direitos e compartilhamento com o provedor.

## Controles e execução no ambiente privado

Manter todos os controles novos desligados inicialmente. Configurar somente no ambiente seguro do Netcup, nunca no Git:
- TOOLS_COMMERCE_PRO_INTEGRATION=1 (manter habilitado enquanto houver assinaturas; necessário para roteamento de eventos de pagamento)
- TOOLS_COMMERCE_PRO_READY=1
- TOOLS_COMMERCE_PRO_TERMS_APPROVED=ferramentas-pro-v1
- TOOLS_COMMERCE_PRO_HOMOLOGATED=1
- TOOLS_COMMERCE_PRO_MAX_VARIABLE_CENTS: custo total conservador (seis utilizações, taxas de cartão, tributos e provisões) no máximo 1497 centavos.
- TOOLS_COMMERCE_PRO_NEW=1 e TOOLS_COMMERCE_PRO_PUBLIC=1 somente após o aceite integral.
- TOOLS_COMMERCE_EXPERIMENT=1 e TOOLS_COMMERCE_EXPERIMENT_UNIT_COST_CENTS após medição e validação de custo. O piloto mantém grupo estável, até 50 contas de tratamento, 10000 centavos de custo incremental mensal, apenas três operações locais candidatas. Revisar a classificação antes de habilitar.

Reutilizar aplicação institucional somente após conferir permissões, vendedor, ambientes e tarifas. Habilitar subscription_preapproval, subscription_authorized_payment, payments e notificações de disputa pertinentes, preservando Orders. A rota existente precisa receber e autenticar os eventos. Validar primeiro em HML. Não configurar Pix recorrente presumidamente. Testar POST individual e URL, formato exato dos campos retornados, pesquisa por referência, status, identidade do vendedor, live_mode, moeda, valores, data de criação de fatura versus calendário efetivo, cancelamento, reembolso parcial/total e contestação. Se algum campo divergir, corrigir o adaptador, não flexibilizar a verificação financeira.

Executar periodicamente no runtime seguro: node runtime/tools-commerce/ops.cjs subscriptions-sweep. Configurar agendamento com exclusão mútua e alerta para failed>0; conciliar referências incertas por subscription-reconcile UUID. Nunca repetir um POST ambíguo. Revisar paginação/índices e volume antes de escalar. Desativar PRO_NEW/PRO_PUBLIC não desativa cancelamento nem conciliação. Não reverter para release sem suporte a assinaturas enquanto houver contratos vivos.

## Critérios ainda bloqueantes

- Homologar transações Firestore (incluindo débito concorrente, duplicata de fatura, eventos fora de ordem, reversão, cancelamento e conta desativada).
- Validar integração real, contrato do calendário de cobrança e casos de reembolso/contestação; configurar rotina de conciliação e alertas, validar cancelamento remoto periódico de contas desativadas e revisão de ciclos em disputa.
- Validar recuperação do resultado após retorno, navegação mobile e teclado; preservar formatos e SEO. Validar histórico de ciclos/pagamentos e data da próxima renovação na conta; completar alteração de cartão conforme suporte oficial.
- Publicar termos e privacidade aprovados, vincular hash da minuta publicada aos contratos, validar direito de arrependimento e atendimento.
- Completar instrumentação consentida, relatório semanal/30 dias com MRR (sem avulsos), receita líquida efetivamente disponível, tarifas, estornos, retenção, margem por modalidade e ferramenta, atribuição de indicação e integração Warmbly sem duplicatas. Dados inexistentes são desconhecidos, não zero.
- Homologar limites de custo por ferramenta, rate limits, classificação de custo, margem com franquia inteira; manter experimento desligado até validação. Conferir dados históricos e custos reais.
- Rodar suíte existente, novas unitárias, emulador e browser; ensaio externo não se confunde com mocks. Revisão de segurança antes de merge/ativação.

O draft é um incremento de código, não autorização para cobrar nem alegação de que todos os critérios do prompt foram atendidos.
