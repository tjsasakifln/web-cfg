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

A seção proposta está em /termos-de-uso/#assinatura-ferramentas, com termos de créditos v2 intactos e hash da seção Pro vinculado ao contrato. Aprovação jurídica/comercial necessária antes de ativar, inclusive hash da versão publicada:

**Confenge Pro.** A assinatura custa R$ 49,90 por mês, com renovação automática e seis créditos de exportação por ciclo efetivamente pago. Os créditos incluídos são válidos somente no ciclo correspondente e não se acumulam. Os créditos comprados separadamente não vencem. A assinatura não tem fidelidade e pode ser cancelada pela conta, impedindo futuras cobranças após confirmação do provedor; benefícios do período pago permanecem até seu término, salvo reembolso/reversão aplicável. Em caso de cobrança indevida, falha de serviço ou exercício dos direitos legais, entre em contato pelos canais oficiais. O direito de arrependimento, quando aplicável, pode ser exercido em sete dias, sem prejuízo de outros direitos do consumidor. Nenhuma ferramenta substitui responsabilidade técnica, ART/RRT, projeto ou validação profissional. Limites de utilização devem ser apresentados antes da contratação. Dados de cartão são tratados pelo provedor; a CONFENGE registra apenas referências de contratação, pagamentos e movimentações necessárias à operação. Atualizar política de privacidade com finalidades, retenção, direitos e compartilhamento com o provedor.

## Controles e execução no ambiente privado

Manter todos os controles novos desligados inicialmente. Configurar somente no ambiente seguro do Netcup, nunca no Git:
- TOOLS_COMMERCE_PRO_INTEGRATION=1 (manter habilitado enquanto houver assinaturas; necessário para roteamento de eventos de pagamento)
- TOOLS_COMMERCE_PRO_READY=1
- TOOLS_COMMERCE_PRO_TERMS_APPROVED=ferramentas-pro-v1
- TOOLS_COMMERCE_PRO_TERMS_HASH: confirmar a versão publicada e usar o hash de require('./runtime/tools-commerce/subscription-terms.cjs').termsHash
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
- Aprovar a redação dos termos e privacidade, conferir o hash publicado e validar direito de arrependimento e atendimento.
- Medição consentida estendida com eventos finitos de oferta, contratação, consulta e cancelamento. Rodar semanalmente `node runtime/tools-commerce/ops.cjs hybrid-usage AAAA-MM-DD AAAA-MM-DD` e `hybrid-financial-handoff` para conciliar com Warmbly por chave idempotente. O relatório mede retenção por exportações em coortes maduras de 7/30 dias; complementar visitantes, conclusão de tarefas sem exportação, custos, tarifas efetivas e recebimento bancário; os indicadores sem evidência permanecem nulos. O handoff não gera faturamento nem contabiliza recebimento automaticamente.
- Homologar limites de custo por ferramenta, rate limits, classificação de custo, margem com franquia inteira; manter experimento desligado até validação. Conferir dados históricos e custos reais.
- Rodar suíte existente, novas unitárias, emulador e browser; ensaio externo não se confunde com mocks. Revisão de segurança antes de merge/ativação.

O draft é um incremento de código, não autorização para cobrar nem alegação de que todos os critérios do prompt foram atendidos.


## Matriz de encerramento para Codex

| Diretriz | Implementação no draft | Evidência / ação indispensável antes da ativação |
|---|---|---|
| 2. Investigação | Código, documentação, main e PRs examinados; carteira e rotas reutilizadas | Ler configuração pública e privada efetiva do Netcup, inventário de ferramentas, extratos e baseline, sem segredos |
| 3. Oferta | Preços antigos mantidos, catálogo Pro versionado, condições e hash | Conferir preço efetivo e homologar oferta no ambiente do provedor |
| 4. Carteira | Transações, prioridade de franquia, histórico separado e reversão localizada | Executar testes emulador e regressão de formatos; verificar divergências e política de compensação |
| 5. Assinaturas | Checkout individual oficial, notificações, verificação, cancelamento e sweep | Testar API real, calendário, ambiente/vendedor, tokenização/alteração de cartão quando suportada, disputes e recuperação de POST incerto |
| 6. Margem | Bloqueio de ativação acima de R$ 14,97 de custo variável total por ciclo | Medir custos e tarifas reais por operação, publicar limites e revisar abuso; não presumir taxa Pix |
| 7. Experimento | Distribuição e teto atômicos, seleção de operações candidatas, controles desligados | Classificar custos reais, testar UX e orçamento; ativar só após baseline e volume |
| 8/9. Interface/SEO | Oferta contextual no catálogo e carteira, mesma URL, histórico e cancelamento | Testar Pro em Chrome mobile/desktop, acessibilidade, preservação de resultado, preços antes do login |
| 10. Medição | Eventos finitos, relatório de exportação/receita/MRR/coortes, handoff financeiro privado | Completar denominadores de visitantes, custos, extrato bancário e reconhecimento no Warmbly |
| 11. Termos | Seção separada, privacidade, hash e controle de aceite | Aprovação jurídica/comercial e readback do conteúdo publicado |
| 12. Testes | Unitários e testes transacionais no emulador adicionados | Verificar CI do SHA final, ampliar casos faltantes e homologar externamente |
| 13/14. Publicação e aceite | PR sem ativação por padrão, parâmetros e rollback documentados | Não integrar nem ativar antes da aprovação; validar deploy e agenda de conciliação |
| 15. Revisão | Revisão por inspeção e endurecimento de concorrência, eventos, proteção do fluxo legado | Revisão independente com testes executados e evidências do provedor; registrar problemas restantes |

### Ordem de execução

1. Fazer checkout deste draft e executar a suíte completa, corrigindo todas as regressões.
2. Revisar a matriz acima; transformar qualquer lacuna em teste ou implementação, não apenas marcar como resolvida.
3. Homologar a aplicação Mercado Pago em ambiente segregado usando os procedimentos oficiais e respostas reais; confirmar a modalidade de assinatura hospedada, calendário, busca, estorno e cancelamento. Se incompatível, manter desativado e implementar a modalidade oficial com plano associado/tokenização.
4. Instalar o sweep com exclusão mútua, alertas de reconciliação e controle de configuração; revisar integração financeira e aprovar termos/custos.
5. Validar produção com as chaves de novas assinaturas e exposição desligadas; somente após aceite ligar a oferta. Nunca desativar a conciliação de contratos existentes.
