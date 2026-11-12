# Projetos residenciais: consulta, licença e entrega

Status: EXECUTE_NOW para captação e contratação de elaboração residencial por disciplina.
Decisão expressa do fundador em 12/11/2026. Frente: aquisição e receita.
Evidência inicial: contato recebido e qualificação; disposição a pagar somente
quando existir produto efetivamente disponível e compra mantida.

## Decisão posterior de 12/11/2026: elaboração por disciplina e prazo

O fundador solicitou expressamente liberar a venda por Mercado Pago, definir
preços competitivos conforme prazo de 15 a 90 dias, permitir contratação por
disciplina e publicar. Esta decisão autoriza preço público e checkout desta
oferta de serviço. Não afirma margem validada, não libera licenças de arquivos
sem produto aprovado e não muda as autorizações das ferramentas ou do B2G.

O contrato canônico é `data/projects-ready/service-offer.v1.json`: residência
unifamiliar nova de 50 a 250 m², até dois pavimentos, sistema convencional,
terreno plano ou de declividade suave. O preço parte de área e mínimo por
disciplina e acrescenta prioridade de prazo inversamente proporcional ao
número de dias. A parcela fixa protege o trabalho mínimo. Os valores são uma
decisão comercial inicial, apoiada em referências públicas e sujeita à medição
de custo efetivo, margem, conversão, cancelamento e recebimento.

A oferta acolhe links, revistas, fotos e rascunhos como referências para
desenvolver solução própria. Adaptação de obra protegida depende de autorização
do titular. A adequação urbanística e condominial, a atribuição profissional e
os insumos são conferidos antes do início técnico. O pedido registra o prazo
escolhido, o marco inicial, as disciplinas, a área, o total e as condições. Uma
incompatibilidade inicial permite cancelamento com devolução integral ou nova
proposta expressamente aceita; nunca gera cobrança adicional automática.

O módulo de serviço é separado da licença de ZIP: usa `project-orders`,
Checkout Pro do Mercado Pago e armazenamento persistente em
`/var/lib/confenge-web`. Dispensa cadastro para a compra e usa recibo aleatório
de 256 bits por pedido, enviado apenas em cabeçalho. O segredo não é gravado
em URL, analytics, provedor ou banco. O comprador pode guardar um arquivo de
acesso privado e recuperá-lo no próprio navegador. A operação administrativa
reutiliza a autenticação de OPS e expõe somente o necessário ao atendimento.

O servidor recalcula preços, grava o pedido antes da cobrança e concilia
pagamento via API autenticada e webhook assinado. Valores do navegador,
parâmetros de retorno e pedido criado não comprovam pagamento. Antes de
anunciar checkout disponível, verifica vendedor real, ambiente de produção,
credenciais específicas e capacidade de persistência. A configuração do
webhook e a abertura real do checkout também integram o aceite operacional.
A falha de configuração mantém a simulação e o contato, com estado honesto.

Quando a elaboração residencial usa a mesma aplicação Mercado Pago das
ferramentas, preserva-se o callback já existente de créditos. O encaminhamento
interno só alcança o pedido residencial depois de validar a assinatura,
conferir o vendedor e consultar a ordem no provedor. Exige coincidência de
ambiente, vendedor, token e segredo da configuração efetiva; ordens de créditos
mantêm seu tratamento próprio. Isso permite conciliar pedidos residenciais sem
trocar a URL de notificação das vendas em curso nem criar outra conta ou runtime.
Aplicações separadas conservam callbacks e credenciais próprios.

Hipótese de aquisição: referências de plantas e preço transparente atraem
pessoas que já decidiram projetar; a flexibilidade de prazo distribui produção
e permite preço de entrada com escopo delimitado. Frente: REVENUE_NOW e
INBOUND_ENGINE. Evidência: primeiras contratações e recebimentos verificados,
sem confundir simulação, consulta, pedido, aprovação do pagamento e liquidação.
Leverage: revenue, trust e customer. As mesmas quatro disciplinas e a mesma
regra atendem cem pedidos sem criar páginas por município ou novo CRM.

A medição pública continua sem dados pessoais e sem token de pedido. O
histórico financeiro e a execução comercial permanecem distinguíveis;
Warmbly continua proprietário de proposta, relacionamento e resultado.
Rollback: revert da PR pelo fluxo Netcup ou `PROJECT_SERVICE_PURCHASES=0`
para pausar novas compras, preservando pedidos, suporte e conciliação.

As seções seguintes preservam a decisão inicial sobre catálogo de arquivos.

## Decisão e fronteiras

A seção `/projetos-prontos/` integra a CONFENGE e o agrupamento operacional
`building_engineering_documentation`, na intenção existente
`projetar_revisar_compatibilizar` e família de serviço
`engineering_projects_coordination`. O novo registro público `ready_projects`
identifica a consulta residencial. Não altera os cinco agrupamentos nem o B2G.

Licença de um modelo, adaptação ao terreno e disciplinas complementares têm
escopos e contratações distintos. A proposta pode reuni-los, identificando
entregas, condições, prazo e responsabilidades por escopo.

O catálogo inicial é vazio. A busca autorizada encontrou estudos de trabalho,
sem conjunto comprovado de direitos de comercialização, revisão profissional e
preço aprovado. Nenhum arquivo ou identificação de cliente entra na publicação.
R$ 1.190 é somente hipótese do estudo; R$ 15 mil não é autorização de gasto.

O formulário reutiliza o endpoint de lead, armazenamento protegido, proteção
contra abuso, idempotência, consentimento, atribuição e consulta OPS existentes.
O objeto `project_interest` é validado pelo servidor, incluído no material da
idempotência e encaminhado no contexto do contrato `confenge.inbound.v1`.
Warmbly mantém ação comercial, qualificação, proposta, faturamento e resultado.
Não há novo CRM nem envio outbound autorizado por esta implantação.

Assim como ADR-TOOLS-001, a nova fronteira de comércio é estreita: pedido de
licença, confirmação independente do provedor e direito de acesso ao arquivo.
Reutiliza os adaptadores de autenticação e Mercado Pago; flags, coleções,
catálogo, termos e permissões de projetos são independentes de créditos das
ferramentas. Nenhuma compra das ferramentas é ativada por esta decisão.

## Aprovação por produto

A publicação paga requer um produto real, documentação de origem e direitos,
revisão profissional vinculada ao hash e à versão, preço e termos aprovados,
amostras reais publicáveis, escopo completo, conta institucional correta e
entrega protegida verificada. Preenchimento do JSON não substitui evidência nem
aprovação humana. O arquivo técnico completo fica fora de `_site` e do release.

## Medição e publicação

Visitas consentidas usam a medição existente por caminho; o denominador de
contatos usa registros persistidos, excluindo provas sintéticas. Proposta,
contrato, pagamento e acesso aos arquivos são acontecimentos independentes.
Valores, pessoas, município e dimensões não são enviados a analytics.

A avaliação ocorre ao primeiro de: 30 compras mantidas após cancelamentos,
90 dias de oferta publicada ou orçamento realmente aprovado consumido. Registrar
separadamente início de consultas e início da disponibilidade para compra.
Captação sozinha mede procura e orçamento solicitado, sem comprovar preço aceito.

Release por PR revisada, `site-ci`, pacote exato, stage e promoção Netcup.
Prova controlada verifica o formulário servido, persistência, leitura restrita
e repetição idempotente, sem misturar ensaios com demanda real. O cenário
residencial usa o modo autenticado `persist-only` já existente: o registro nasce
com encaminhamento proibido, sem tentativa ou envio agendado. A prova exige
reler essa decisão e os estados de notificação no armazenamento protegido.
Seu resultado é `CAPTURE_PERSISTENCE_READY`, sem afirmar recebimento no Warmbly.
Os cenários que verificam transporte continuam exigindo o gate Warmbly completo
antes do primeiro POST. A indisponibilidade dessa integração não transforma
captação em transporte aprovado; veja a
[evidência de 12/11/2026](../projects-ready/PROVA-DE-CAPTACAO-2026-11-12.md).
Reversão conserva `/var/lib/confenge-web` e Firestore. Desligar novas compras
não elimina a conciliação e o atendimento de pedidos existentes.

## Critérios

1. Página verdadeira, navegação, acessibilidade, canonical e sitemap coerentes.
2. Contato confirmado somente após armazenamento durável; dados editados não
   reutilizam silenciosamente um protocolo anterior.
3. Leitura e exportação restritas; dados de qualificação chegam à operação.
4. Pagamento pendente, preço adulterado, callback inválido/repetido e comprador
   incorreto não liberam arquivo; reversões preservam histórico e retiram acesso.
5. Versionamento público e runtime conferidos depois da promoção.

Cem consultas reutilizam o mesmo contrato e tornam comparáveis interesses,
qualificação e resultados, sem produzir cem páginas ou filas paralelas.
