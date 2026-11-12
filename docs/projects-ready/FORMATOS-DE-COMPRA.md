# Formatos de compra de projetos residenciais

Registro conferido em 12/11/2026, após a autorização do fundador para registrar
as formas de compra e permitir a contratação imediata. Decisão: EXECUTE_NOW.
Frente: REVENUE_NOW. Resultado esperado: o visitante escolher o escopo, conferir
o preço e registrar a contratação na mesma visita. Alavancas: receita, cliente
e automação. A primeira evidência foi obtida na própria sessão, sem pagamento.

## Autoridade e funcionamento

A oferta é a elaboração sob encomenda descrita em
[`service-offer.v1.json`](../../data/projects-ready/service-offer.v1.json),
versão `2026-11-12-v1`. A seleção e o preço são validados por
[`service-policy.cjs`](../../runtime/project-commerce/service-policy.cjs).
Este registro descreve os formatos aceitos; não cria outro catálogo, desconto,
preço contratual ou produto de arquivo.

O cliente pode contratar uma, duas, três ou quatro disciplinas. O total é a
soma dos itens e há um único prazo de elaboração para o pedido. Não é preciso
aguardar uma proposta individual para uma residência enquadrada nessa oferta.
O simulador, a revisão do resumo e o registro do pedido pertencem à mesma
jornada em [`/projetos-prontos/`](https://confenge.com.br/projetos-prontos/).

## As 15 combinações

Exemplo conferido com a função de preço vigente: **100 m² e 60 dias corridos**.
Os valores abaixo são uma referência desse exemplo. O servidor recalcula cada
contratação segundo a área e o prazo escolhidos e fixa o resumo aceito.

| Formato | Disciplinas selecionadas | Total do exemplo |
|---|---|---:|
| Individual | Arquitetônico | R$ 1.601,75 |
| Individual | Estrutural | R$ 1.386,75 |
| Individual | Elétrico | R$ 741,75 |
| Individual | Hidrossanitário | R$ 741,75 |
| Dupla | Arquitetônico + estrutural | R$ 2.988,50 |
| Dupla | Arquitetônico + elétrico | R$ 2.343,50 |
| Dupla | Arquitetônico + hidrossanitário | R$ 2.343,50 |
| Dupla | Estrutural + elétrico | R$ 2.128,50 |
| Dupla | Estrutural + hidrossanitário | R$ 2.128,50 |
| Dupla | Elétrico + hidrossanitário | R$ 1.483,50 |
| Trio | Arquitetônico + estrutural + elétrico | R$ 3.730,25 |
| Trio | Arquitetônico + estrutural + hidrossanitário | R$ 3.730,25 |
| Trio | Arquitetônico + elétrico + hidrossanitário | R$ 3.085,25 |
| Trio | Estrutural + elétrico + hidrossanitário | R$ 2.870,25 |
| Quatro disciplinas | Arquitetônico + estrutural + elétrico + hidrossanitário | R$ 4.472,00 |

As mesmas 15 seleções aceitam qualquer prazo inteiro de 15 a 90 dias e área de
50 a 250 m², com até duas casas decimais. Cada disciplina mantém o mínimo
correspondente a até 100 m². O fator de prazo é `0,85 + 13,5 / dias`, aplicado
por item, com arredondamento monetário antes da soma. Não há desconto de pacote.

A contratação direta atende casa nova unifamiliar em sistema convencional,
até dois pavimentos e terreno plano ou de declividade suave, sem contenções
especiais, subsolo ou piscina. Casos diferentes seguem para proposta própria.

Complementares sem arquitetura podem ser comprados agora; a elaboração depende
da arquitetura consolidada e dos demais insumos previstos nas condições. A
contratação das quatro disciplinas inclui o desenvolvimento da arquitetura no
prazo único. A confirmação do pagamento e os documentos completos determinam
o início da elaboração conforme o contrato. Não há entrega instantânea de
arquivos prontos.

## Meios e condições de pagamento

O adaptador usa Checkout Pro via Orders API e envia o valor integral do pedido,
com os itens discriminados. A requisição não exclui tipos ou bandeiras e não
impõe um teto próprio de parcelas. A documentação oficial informa que essa é
a configuração aberta por padrão; a disponibilidade efetiva pertence à tela
de pagamento do Mercado Pago para cada compra.

| Modalidade | Evidência em 12/11/2026 | Regra de comunicação e operação |
|---|---|---|
| Pix | Apresentado no checkout real do pedido interno | Pode ser indicado entre as opções. O teste não gerou nem pagou um Pix. |
| Cartão de crédito ou pré-pago | Apresentado como Novo cartão, com essa descrição | Pode ser indicado entre as opções. Nenhum cartão foi informado. |
| Boleto | Apresentado no checkout real do pedido interno | Pode ser indicado entre as opções. O teste não emitiu nem pagou boleto. |
| Parcelamento no cartão | Capacidade documentada; as parcelas não foram abertas no teste | Quantidade, custos e juros são apresentados pelo Mercado Pago antes da confirmação. Não prometer parcelas sem juros. |
| Cartão de débito | Capacidade geral documentada; não apareceu com esse nome no teste | Depende de disponibilização pelo provedor para a compra. Não foi validado como opção efetiva nesse pedido. |
| Dinheiro na conta Mercado Pago | Capacidade geral documentada; não observada no teste | Depende da conta e das opções apresentadas ao comprador. |
| Linha de Crédito do Mercado Pago | Capacidade geral documentada; não observada no teste | A apresentação e as condições pertencem ao provedor. Não representa crédito concedido pela CONFENGE. |
| Dois cartões ou combinação de meios | Não verificado | Não anunciar como formato garantido. Fatos com múltiplas transações exigem a revisão prevista pelo adaptador atual. |

Fontes oficiais consultadas em 12/11/2026:

- [Visão geral do Checkout Pro via Orders API](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/overview).
- [Configuração dos meios de pagamento](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/additional-settings/exclude-payment-methods).
- [Criação da order e retorno de checkout_url](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/create-order).

Na Orders API, as restrições pertencem a `config.payment_method`, no singular.
Não transpor o objeto `payment_methods` da antiga Preferences API. A fonte de
implementação é [`mercado-pago.cjs`](../../runtime/tools-commerce/mercado-pago.cjs),
função `createCheckoutOrder`.

## Evidência do pedido interno

Após autorização expressa para os aceites de contratação e privacidade, nesta
conferência foi registrado **um pedido interno** de projeto arquitetônico, 100 m²,
60 dias, R$ 1.601,75, às 20:35 de Brasília em 12/11/2026. A referência do pedido
informa que se trata de validação interna sem pagamento e sem execução.

O pedido foi recuperado com o mesmo identificador e valor após recarregar a
página e consultar novamente a situação. O link devolvido pelo provedor abriu
o checkout real no navegador conectado, com o item e o total corretos e as
três opções observadas acima. A primeira tentativa no navegador remoto exibiu
um erro genérico de acesso; essa falha de visualização não criou outro pedido.

O teste terminou com pagamento não confirmado. Não comprova aprovação de
cartão, liquidação, webhook de pagamento aprovado, recebimento ou estorno.
O identificador privado, a credencial de recuperação e os dados do comprador
permanecem fora deste documento e das evidências públicas do repositório.
O registro do pedido é preservado na operação, sem conversão artificial em
receita ou remoção para esconder o teste.

## Formatos que precisam de outra oferta

Entrada e saldo, cobrança por etapas, assinatura, prazos diferentes por
disciplina e licença de arquivo com download imediato não são modalidades
do contrato vigente. Reformas, regularizações, casas fora do enquadramento e
outros serviços são recebidos pelo atendimento para proposta própria.

Uma nova disciplina em pedido já criado exige contratação deliberada. A
recuperação de um pedido pendente preserva o pedido existente; não cria outro
como tentativa de pagamento.

## Publicação, medição e recuperação

O texto público explica a contratação direta e os meios observados sem mudar
preço, escopo, termos aceitos ou código financeiro. Os seletores atuais cobrem
as 15 combinações. A melhoria não cria eventos de analytics nem transmite dados
do comprador para medição. Registro de pedido continua diferente de pagamento
confirmado; propostas, faturamento e recebimento continuam na operação comercial.

A publicação usa a sequência protegida de `web-cfg`: revisão, testes existentes,
medição de primeira dobra da revisão limpa, merge normal e release Netcup. O
workflow de apresentação passa a atender branches `feat/projetos-*` do próprio
repositório, com as mesmas permissões de leitura e verificações, permitindo
repetir essa evidência sem nova exceção de nome a cada ajuste da oferta.

Recuperação: reverter somente esta alteração de apresentação e seu registro,
preservando os pedidos e as condições aceitas. A fronteira permanece a definida
em [ADR-PROJECTS-001](../architecture/ADR-PROJECTS-001-ready-projects.md) e no
[manual de pedidos](../../runtime/project-commerce/SERVICE-ORDERS.md).
