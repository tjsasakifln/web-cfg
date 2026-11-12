# Seleção da base do marketplace de engenharia

Data da verificação: 12/11/2026.

Estado da decisão: `EXECUTE_NOW`, por solicitação expressa do fundador para
investigar, integrar, abrir PR e avançar para produção. A decisão autoriza o
trabalho; a operação de pagamentos reais exige configuração válida da conta e
comprovação do fluxo implantado. Este documento registra a seleção técnica,
não certifica publicação nem movimentação financeira.

## Decisão

Adotar **Mercur v2.4.1** como base de contas, autenticação, permissões e
vínculo dos prestadores com **Stripe Connect Express**. Integrar a jornada à
marca e ao domínio `confenge.com.br`. O cadastro financeiro e a atualização da
conta conectada reaproveitam o conector nativo; a contratação de engenharia,
a avaliação elegível e a cobrança por Stripe Checkout são adaptações próprias.

A investigação começou buscando reaproveitar pedidos, avaliações, comissões
e repasses de uma plataforma inteira. A inspeção do código mostrou que o
fluxo comercial nativo não atende diretamente à contratação de engenharia:
usa pedidos de comércio e captura manual do cartão, cuja autorização pode
expirar antes de terminar um projeto. A implementação adota, portanto, o
módulo `engineering_request`, com proposta e aceite anteriores à cobrança,
e uma destination charge com captura automática após o cliente iniciar o
pagamento. O SDK Stripe é o mesmo provedor financeiro, mas esse fluxo de
cobrança não é o fluxo nativo de pedidos Mercur.

Essa revisão mantém o reaproveitamento da infraestrutura de marketplace e do
cadastro financeiro. **Não equivale a uma adaptação mínima de toda a jornada
transacional.** O usuário não exigiu Mercado Pago; substituir o provedor
também exigiria adaptar contas, webhooks e conciliação. A seleção de Mercur é
uma decisão entre as bases examinadas, não uma medição comprovada do menor
custo total possível.

**Não foi encontrada uma base pronta que entre no site estático atual sem
infraestrutura adicional e sem adaptação de domínio.** Mercur é a escolha entre
plataformas completas mantidas e autohospedáveis; não é a menor instalação
possível nem um sistema de engenharia pronto. A decisão aceita um serviço
Node separado, PostgreSQL, persistência operacional e os respectivos custos
de operação. Redis é usado na configuração de produção examinada para cache,
eventos, workflows e locks.

## Origem, versão e licença

| Item | Valor verificado |
| --- | --- |
| Repositório | [mercurjs/mercur](https://github.com/mercurjs/mercur) |
| Tag selecionada | [v2.4.1](https://github.com/mercurjs/mercur/releases/tag/v2.4.1) |
| Commit da tag | `fd4e5a3e311fe1d39596f6b53c5e729a65ff2d4d` |
| Data do commit | 04/11/2026, conforme objeto Git |
| Licença do repositório | [MIT, copyright 2025 Rigby](https://github.com/mercurjs/mercur/blob/fd4e5a3e311fe1d39596f6b53c5e729a65ff2d4d/LICENSE) |
| Pacotes examinados | `@mercurjs/core`, `@mercurjs/client` e `@mercurjs/stripe-connector-plugin`, todos 2.4.1 e MIT |
| Base de comércio | Medusa 2.22.3 nos manifests da tag |
| Runtime mínimo do core | Node `>=22.22.0` |
| Banco | PostgreSQL, com migrações Medusa/Mercur |
| SHA-256 do LICENSE | `28e6cee89a908a9f718c7796f4472fd6322b9ae20e159a020dbec0ec75a52ccf` |
| SHA-256 de `packages/core/package.json` | `61d6fbd433ed43952d99cadcdab11bc8b85f039df7e489e35b5a05cf49500524` |
| SHA-256 de `packages/plugins/stripe-connector/package.json` | `461e1ac0837829cd0bb4a9cc9929d504a460f8f986a08d78afec1c29c8a07707` |

Os valores foram conferidos no checkout da tag, inclusive por `git rev-parse
HEAD`, `git describe --tags --exact-match` e SHA-256 dos arquivos. A branch
`main` consultada já continha `2.4.2-canary.1`; não é a referência desta decisão.
Preservar os avisos de licença de código copiado ou distribuído e verificar as
licenças das dependências do artefato efetivamente instalado. A licença do
repositório não transfere a marca Mercur para a CONFENGE.

## Alternativas examinadas

| Base | Evidência de licença e manutenção | Ganho de reaproveitamento | Motivo da decisão |
| --- | --- | --- | --- |
| **Mercur v2.4.1** | MIT; release de 04/11/2026; código e manifests conferidos | Contas, permissões, administração e onboarding Stripe Connect reaproveitados; ofertas, pedidos, comissões e avaliações existem na base | Selecionado como fundação. Contratação, cobrança e avaliações de engenharia usam módulo próprio; exige infraestrutura e manutenção dessa adaptação |
| **Sharetribe Web Template** | Apache 2.0 no LICENSE; frontend mantido | Jornada próxima de serviços, perfis e transações | Depende do backend SaaS Sharetribe; documentação declara Brasil não suportado pela integração padrão de pagamentos |
| **Sharetribe Go** | Sharetribe Community Public License; README declara ausência de manutenção ativa | Marketplace tradicional com anúncios e reputação | Source available com restrições a SaaS concorrente; stack Ruby/Rails/MySQL/Sphinx e risco de manutenção |
| **Cocorico** | MIT; commit padrão observado de 09/02/2021; manifest com PHP `^7.1` e Symfony `^3.4` | Reservas e serviços, mensagens e avaliações | Modernização ampla antes de produção; fornecedor direciona ao produto Second |
| **HivePress + ExpertHive** | Núcleo GPL 3.0; tema/extensões comerciais e documentação ativa | Pedidos, propostas, entregas, revisões, avaliações verificadas e Stripe Connect | Forte ajuste funcional, mas exige WordPress/WooCommerce e aquisição de tema/extensões; não reaproveita o runtime atual |
| **Freelancezero** | MIT; projeto se apresenta como fundação MVP v0.1 | Modelos, autenticação e APIs iniciais | ROADMAP ainda lista pagamentos Stripe Connect, ciclo de contratos e avaliações mútuas como pendentes |
| **Gigflow** | API não informou licença e consulta a LICENSE retornou 404 | README descreve gigs, entregas, disputas e Stripe Connect | Não foi localizada concessão de reutilização; não adotar código sem licença |
| **MarketplaceKit** | GPL 3.0; push observado de 05/01/2023 | Marketplace genérico Laravel | Stack adicional e atividade antiga, sem vantagem demonstrada para o objetivo |
| **Módulo nativo + SDK Mercado Pago** | SDK oficial Node MIT, versão consultada 3.6.2 | Reutilizaria o runtime e o financeiro já conhecidos pela CONFENGE | Exigiria construir contas, permissões, perfis e domínio transacional. Como Mercur também exigiu domínio próprio para engenharia, essa alternativa continua válida para futura comparação de custo; não foi a base implementada nesta entrega |

As datas de atividade descrevem a observação da pesquisa, não um compromisso
de suporte. Ausência de licença localizada não equivale a autorização de uso.

## Verificações de código que sustentam a escolha

Todos os caminhos abaixo se referem ao commit fixado acima.

| Fonte upstream | Constatação | Consequência para a integração |
| --- | --- | --- |
| `templates/basic/packages/api/package.json` | Pacotes Mercur 2.4.1, Medusa 2.22.3, Node `>=22.22.0` | Instalar versões fixadas; não seguir `latest` ou canary automaticamente |
| `templates/basic/packages/api/medusa-config.ts` | `DATABASE_URL` e painéis `/dashboard` e `/seller` | O backend deve existir e ter banco; uma página estática ou SDK não o substitui |
| `apps/api/medusa-config.ts` | Redis para cache, eventos, workflows e locks | Dimensionar a implantação e a persistência, especialmente com mais de uma instância |
| `packages/client/src/index.ts` | Cliente HTTP real com `fetch`, autenticação e tratamento de erros | O site pode consumir a API; instalar o cliente sozinho não entrega o marketplace |
| `packages/core/src/api/store/sellers/route.ts` | API de listagem de prestadores/vendedores | Reaproveitar leitura pública com projeção dos campos adequados |
| `packages/core/src/api/vendor/sellers/route.ts` | Conta de vendedor vinculada à identidade autenticada | Reaproveitar ciclo de cadastro e permissões |
| `packages/core/src/api/store/reviews/validators.ts` | Nota inteira entre 1 e 5 | Preservar validação de entrada |
| `packages/core/src/workflows/review/steps/validate-review.ts` | Confere comprador dono do pedido, vínculo do alvo e duplicação | Não reutilizar diretamente sem um Order nativo; a avaliação própria exige cliente da contratação, pagamento confirmado, conclusão e unicidade |
| `packages/plugins/stripe-connector/src/providers/payout-stripe-connect/service.ts` | `manualPayouts` controla a opção de agenda manual da conta | No Brasil, configurar sem payout manual |
| `packages/plugins/stripe-connector/src/providers/payment-stripe/service.ts` | O provedor de pagamento nativo usa captura manual | Não registrar esse provedor para as contratações de engenharia; usar Checkout próprio depois do aceite |
| `packages/plugins/stripe-connector/src/workflows/captures/utils/capture-decision.ts` | O fluxo nativo contempla captura pela proximidade do vencimento da autorização | Não usar expiração como autorização para cobrar um serviço ainda não aceito |
| `packages/core/src/workflows/payout/workflows/create-payout-account.ts` e `create-onboarding.ts` | Criam/vinculam a conta financeira e o link de onboarding | Reaproveitar a conta local e seu `external_id` Stripe; o navegador não escolhe o destinatário financeiro |

O guia `create-a-review.mdx` consultado dizia que o workflow não validava se o
alvo pertencia ao pedido. O código da v2.4.1 já faz essa validação. Esta decisão
usa o código fixado, não a descrição desatualizada do guia.

## Adaptações financeiras expressas

### Brasil e agenda de repasses

A [documentação oficial Stripe de repasses](https://docs.stripe.com/payouts)
informa que contas brasileiras usam agenda automática diária e não suportam
payouts manuais. A configuração entregue usa `manualPayouts: false`. O plugin
fica com `settlements.mode: "provider"`, mas com `settlements.enabled: false`:
a contratação própria não cria uma segunda liquidação financeira Mercur.
A elegibilidade da conta CONFENGE e de cada prestador ainda precisa ser
comprovada no ambiente de implantação.

O Checkout próprio usa
[`payment_intent_data.transfer_data.destination` e `application_fee_amount`](https://docs.stripe.com/connect/destination-charges.md?platform=web&ui=stripe-hosted).
O pagamento confirmado destina a parcela do prestador à sua conta Stripe e
separa a comissão da plataforma. A disponibilidade desse saldo e o crédito
em banco seguem regras e agenda da Stripe, sem esperar a entrega do serviço.
A operação não oferece conta de garantia ou liberação por aceite da entrega.

Uma **Transfer** para a conta Stripe e uma **Payout** para o banco são eventos
distintos. O estado `paid_out` da liquidação nativa, no modo `provider`, não
é prova de crédito bancário; a interface própria não o apresenta como tal.

### Contratação, captura e entrega

O conector de pagamentos nativo usa captura manual e depende da validade da
autorização do cartão. O código também possui uma decisão de captura próxima
ao vencimento. Esse comportamento não foi adotado para os serviços de
engenharia. Se outro fluxo futuro utilizar autorização e ela expirar, será
necessário cancelar ou obter nova autorização do cliente; o vencimento não
autoriza uma nova cobrança automática.

O módulo próprio exige proposta do prestador com escopo, prazo, valor e
comissão congelada, aceite pelo cliente da revisão atual e uma ação posterior
de pagar. O servidor calcula os centavos e valida o destinatário. A cobrança
implementada é por cartão, em BRL, com captura automática no Checkout.
Entrega e confirmação de conclusão são estados próprios, separados do estado
financeiro. O campo nativo `requiredFulfillmentStatus: "delivered"` permanece
inativo e não representa aceite técnico nem regra de retenção de dinheiro.

Não registrar o provedor nativo de pagamento e manter transfers, reversals e
settlements nativos desabilitados evita executar dois fluxos financeiros para
a mesma contratação. Reembolsos e disputas seguem atendimento operacional,
consulta à Stripe e conciliação no módulo próprio. A
[Stripe não oferece escrow](https://docs.stripe.com/connect/manual-payouts).
Taxas, condições de cancelamento e efeitos de reembolso precisam ser claros
na proposta e nos termos aplicáveis; nenhum percentual comercial é inventado
por esta decisão.

### Requisitos operacionais de pagamento

- Credenciais e segredos de webhook ficam no servidor, fora do bundle público.
- Onboarding deve vincular o prestador correto à conta conectada, sem permitir
  que o navegador escolha outro destinatário financeiro.
- Preço e comissão são obtidos da revisão aceita da proposta no servidor.
- Confirmar pagamento por evento autenticado e consulta ao provedor; o retorno
  do navegador não é recibo.
- Testar repetição de requisições, reenvio de eventos, recusa, cancelamento,
  reembolso e falha de repasse sem duplicação financeira.
- Registrar os eventos de pagamento, transferência e payout sem tratá-los
  como equivalentes.

O adaptador tem testes locais de validação, idempotência, assinatura e
conciliação, com cliente Stripe substituído nos cenários financeiros. Esses
testes não são uma transação externa nem um ensaio completo com contas
Stripe. `MARKETPLACE_PAYMENTS_ENABLED=false` é o padrão até a comprovação do
fluxo completo. A pausa mantém providers e webhooks configurados quando há
chaves, para continuar conciliando pagamentos anteriores.

## Escopo próprio da engenharia

Mercur fornece a fundação de contas e permissões. O módulo próprio de
engenharia implementa o ciclo de contratação, sem criar Order nativo:

- Perfil com especialidades, território, portfólio e dados profissionais.
- Solicitação com objeto, local e descrição da demanda; documentos e
  entregáveis podem ser referenciados no texto, sem upload nesta versão.
- Proposta com escopo, preço, prazo, revisão e comissão; entregáveis e
  responsabilidades, inclusive ART/RRT quando aplicável, pertencem ao escopo.
- Aceite da revisão vigente, vinculado ao conteúdo da proposta.
- Entrega, eventual revisão e confirmação de conclusão.
- Nova avaliação vinculada ao cliente da contratação paga e concluída;
  devolução ou disputa posterior não exclui automaticamente uma avaliação
  histórica elegível. A média considera todas as avaliações publicadas e
  continua sem nota quando não há nenhuma.

Validação de identidade pelo processador não verifica atribuições profissionais.
Selo de profissional verificado exige evidência e revisão próprias. Não criar
perfis, notas, casos ou credenciais fictícias na base pública.

## Relação com a arquitetura CONFENGE

O visitante permanece sob a marca CONFENGE em `confenge.com.br`. Os módulos
técnicos não criam outra marca nem um segundo site público. O novo fluxo de
marketplace precisa de delimitação explícita no ADR da integração, pois os ADRs
vigentes atribuem ao Warmbly a operação comercial institucional. A nova
autorização do fundador sustenta o produto solicitado, mas não transfere
automaticamente CRM, aquisição, cadências ou contratos existentes para Mercur.

O enquadramento deve preservar a taxonomia e a matriz de intenções existentes,
a responsabilidade técnica e a reversão por rota. A hipótese comercial é
reduzir o esforço para localizar e contratar um profissional compatível; o
resultado deve ser medido por solicitações qualificadas, contratações,
pagamentos confirmados, comissão efetivamente recebida e custo de atendimento.
Cadastro, clique e valor de pedido não são receita recebida.

## Limite desta decisão e evidência de liberação

Não foram executadas transações financeiras nem comprovada implantação de
Mercur por esta pesquisa. A PR deve relatar separadamente o que está
implementado, o que foi testado localmente e o que foi observado no ambiente
publicado. Dependências de infraestrutura ou de conta pendentes impedem
afirmar que pagamentos reais estão operantes.

A liberação da integração exige fluxo real de cliente e prestador, isolamento
entre contas, cadastro persistido, autorização de compra, pagamento confirmado,
tratamento de falhas e avaliação elegível. Uma página publicada com backend
desconectado não é a conclusão dessa plataforma.

## Referências primárias

1. [Mercur, release v2.4.1](https://github.com/mercurjs/mercur/releases/tag/v2.4.1).
2. [Mercur, árvore do commit selecionado](https://github.com/mercurjs/mercur/tree/fd4e5a3e311fe1d39596f6b53c5e729a65ff2d4d).
3. [Mercur, anúncio do conector Stripe](https://www.mercurjs.com/updates/stripe-connector).
4. [Mercur, configuração do conector no commit selecionado](https://github.com/mercurjs/mercur/blob/fd4e5a3e311fe1d39596f6b53c5e729a65ff2d4d/apps/docs/resources/integrations/stripe-connect/configuration.mdx).
5. [Mercur, repasses e liquidações no commit selecionado](https://github.com/mercurjs/mercur/blob/fd4e5a3e311fe1d39596f6b53c5e729a65ff2d4d/apps/docs/resources/integrations/stripe-connect/payouts-and-settlements.mdx).
6. [Stripe, repasses e restrições por país](https://docs.stripe.com/payouts).
7. [Stripe, regras específicas do Brasil](https://support.stripe.com/questions/brazil-specific-payout-schedule-and-payment-availability).
8. [Sharetribe, pagamentos e exceção Brasil](https://github.com/sharetribe/dev-docs/blob/main/content/concepts/payments/payments-overview/index.mdx).
9. [Sharetribe Web Template, licença](https://github.com/sharetribe/web-template/blob/main/LICENSE).
10. [Sharetribe Go, README e estado de manutenção](https://github.com/sharetribe/sharetribe).
11. [Sharetribe Go, licença](https://github.com/sharetribe/sharetribe/blob/master/LICENSE).
12. [Cocorico, dependências](https://github.com/Cocolabs-SAS/cocorico/blob/master/composer.json).
13. [HivePress Marketplace](https://hivepress.io/extensions/marketplace/), [ExpertHive](https://hivepress.io/themes/experthive/) e [repasses automáticos](https://help.hivepress.io/article/154-how-to-enable-automated-payouts).
14. [Freelancezero, ROADMAP](https://github.com/freelancezero/freelancezero/blob/master/ROADMAP.md).
15. [Gigflow](https://github.com/Sayuni2003/Gigflow).
16. [MarketplaceKit](https://github.com/marketplacekit/marketplacekit).
17. [Mercado Pago, SDK oficial Node](https://github.com/mercadopago/sdk-nodejs) e [split 1:1](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace).
18. [Stripe, destination charges pelo Checkout](https://docs.stripe.com/connect/destination-charges.md?platform=web&ui=stripe-hosted).
19. [Mercur, provedor de pagamento nativo na tag selecionada](https://github.com/mercurjs/mercur/blob/v2.4.1/packages/plugins/stripe-connector/src/providers/payment-stripe/service.ts).
20. [Mercur, decisão de captura na tag selecionada](https://github.com/mercurjs/mercur/blob/v2.4.1/packages/plugins/stripe-connector/src/workflows/captures/utils/capture-decision.ts).

Detalhes da implementação, limites e ensaio de liberação:
[pagamentos](payments.md), [operação](operations.md) e
[ADR da integração](../architecture/ADR-MARKETPLACE-001-engineering-services.md).
