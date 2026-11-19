# Aquisição e conversão das ferramentas CONFENGE

## Decisão e objetivo

Decisão do fundador em 19/11/2026: implementar mecanismos de aquisição e
conversão das ferramentas, abrir PR, validar, integrar e publicar na Netcup.
Estado `EXECUTE_NOW`, frente `INBOUND_ENGINE`, efeitos esperados em receita,
distribuição, confiança e aprendizado comercial.

O visitante precisa concluir uma tarefa de engenharia e obter um arquivo útil.
A hipótese é que uma entrada gratuita compreensível, os preços visíveis antes
do cadastro e a continuidade após login ou compra reduzam o abandono entre a
descoberta e a exportação. Publicação não comprova aumento de receita.

## Oferta e percurso

“Ferramentas grátis” descreve a experimentação e a consulta dos resultados.
A cortesia é uma primeira exportação por conta verificada, compartilhada entre
as ferramentas. Cada nova exportação seguinte consome um crédito. Os formatos
editáveis que já são livres permanecem identificados nas ferramentas.

O catálogo explica essas condições no HTML inicial, apresenta os pacotes a
partir da configuração pública do mesmo serviço da carteira e mantém os
destinos existentes. Não há nova lista de preços, desconto ou assinatura.
Pacotes incompatíveis com a configuração, compras desativadas e exportações
pausadas não produzem um botão de compra. Uma seleção pública apenas abre a
conta com o pacote indicado; o pedido exige uma ação posterior do visitante.

Os guias de IFC para Excel, PDF escaneado para DWG, DWG para paredes IFC,
medição em foto e escala/unidade do DWG mantêm seus exemplos e recebem acesso
contextual à ferramenta ao concluir a leitura. Os títulos permanecem ligados
às tarefas. Não são criadas páginas por variações de palavras-chave ou cidades.

Uma exportação interrompida por login, e-mail não confirmado ou falta de saldo
pode ser retomada explicitamente na carteira. O resultado preparado permanece
na aba. Login e pagamento confirmado não autorizam uma exportação automática.
O fluxo preserva a identidade da conta e a referência idempotente da emissão.

## Fontes e responsabilidade

- Catálogo e metadados: `data/site/tool-showcase.json` e seu gerador.
- Preços e formatos: política e registro em `runtime/tools-commerce/`.
- Disponibilidade: `GET /api/web/tool-credits?op=config`.
- Condições: seção de créditos de `/termos-de-uso/`.
- Recebimento e estornos: conciliação autenticada do provedor e registro
  operacional de comércio. Eventos do navegador não são receita.
- Domínio e publicação: `RUNTIME-AUTHORITY.md`, exclusivamente Netcup.

Aplicam-se ADR-STRAT-002, ADR-STRAT-004 e ADR-TOOLS-001. A mudança não altera
as responsabilidades do extra-cli, Warmbly ou Governance, nem cria CRM,
envio comercial ou outra identidade pública.

## Medição e critério de resultado

O evento interno `tool_commerce_step` distingue visualização dos preços,
abertura da carteira, necessidade de autenticação ou saldo, pedido criado,
pagamento confirmado pelo servidor, entrega ao navegador e falha de emissão.
Os campos são finitos. Não incluem conta, e-mail, pedido, nome de arquivo,
conteúdo do projeto, valores do cálculo ou texto digitado na busca.

O resumo autenticado existente `analytics_summary` inclui contagens por dia,
ferramenta e etapa em `aggregate.tool_commerce`. Essas observações servem para
localizar perdas, não para inferir um percurso individual ou uma taxa causal.
A lista de eventos e propriedades permitidos para o Google Analytics permanece
inalterada. O registro financeiro continua sendo a fonte das compras pagas,
exportações com crédito pago e estornos.

Evidência imediata: testes de contrato, catálogo e recuperação da exportação;
verificação do HTML, dos links, das condições comerciais e da versão publicada.
Após 28 dias completos, comparar entrada orgânica das mesmas URLs e as etapas
observadas com exportações e compras confirmadas. Uma amostra pequena não
autoriza concluir ausência de demanda. Priorizar a etapa em que houver perda
observada antes de expandir o catálogo ou produzir mais conteúdo.

## Validação e recuperação

As verificações incluem oferta visível sem JavaScript, preços vindos do
serviço, ausência de pedido ao selecionar pacote, estados de indisponibilidade,
visibilidade em telas pequenas, ausência de dados privados na medição e
retomada sem débito automático ou duplicado.

Os registros de integridade foram atualizados após a revisão dos componentes
e dos arquivos compartilhados. A projeção CSS do diagnóstico continua usando
as mesmas 266 exclusões, conferidas contra as 14 fontes de execução. A captura
dos arquivos protegidos vem do commit `4f2fcefb36e57526495af8f9ebf3800b403ecf04`:
somente analytics, seu bundle e as datas dos dois sitemaps têm novos hashes.
O histórico anterior permanece registrado, sem declarar aprovação humana que
não ocorreu.

Os gates existentes de `site-ci` e pSEO continuam obrigatórios para o merge.
A promoção usa o artefato aprovado e o fluxo de release Netcup. Conferir
`/.well-known/build-info.json` e a jornada pública depois da promoção.

Recuperação: reverter o commit desta campanha ou usar a release anterior pelo
procedimento Netcup. Saldo, pedidos e exportações persistidos ficam preservados.
A reversão do site não desfaz pagamentos nem substitui sua conciliação.

## Adaptação do iLovePDF: uso recorrente e continuidade

Em 19/11/2026, o fundador pediu investigar como o iLovePDF cresceu e adotar a
estratégia com adaptações. Esta é uma continuação da mesma campanha, com estado
`EXECUTE_NOW` para a melhoria do produto e `VALIDATE` para o efeito econômico.
Frente `INBOUND_ENGINE`; efeitos esperados em distribuição, receita e confiança.
O primeiro exame comercial usa 28 dias completos após a publicação, respeitando
o tamanho da amostra. Cem utilizações aproveitam a mesma integração local e as
mesmas páginas, sem acrescentar trabalho manual por utilização.

### Evidências e limites da comparação

O relato oficial e a entrevista do fundador situam o começo em 2010, resolvendo
a união e a separação de PDFs. A entrevista de maio de 2025 informa assinaturas
desde 2014. O produto atual mantém ferramentas básicas gratuitas com limites
por tarefa e arquivo; o Premium amplia a capacidade e as funções. O anúncio de
2019 documenta a passagem de um documento entre tarefas sem baixar e reenviar.
Isso comprova mecanismos do produto, não a participação causal de cada um no
crescimento.

Em dezembro de 2024, o El País informou, em reportagem com o fundador, que
80% a 90% da receita vinha de assinaturas Premium, principalmente de empresas.
É um relato datado, sem demonstração financeira auditada apresentada. A pesquisa
não fornece taxa de conversão, custo de aquisição, margem ou distribuição
histórica confiável do tráfego por canal. A entrevista de 2025 menciona a
intenção de reduzir a dependência do Google. Não se atribui a arrancada a um
blog, a uma percentagem de SEO ou a uma quantidade de ferramentas.

Fontes consultadas em 19/11/2026:

- [História oficial do décimo aniversário](https://www.ilovepdf.com/blog/happy-anniversary).
- [História dos produtos e aplicativos](https://www.ilovepdf.com/press).
- [Planos e limites atuais](https://www.ilovepdf.com/pricing).
- [Continuidade entre ferramentas, anúncio de 23/02/2019](https://www.ilovepdf.com/blog/welcome).
- [Entrevista com Marco Grossi e Anna Rubio, 24/05/2025](https://www.lavanguardia.com/neo/sociedad-neo/20250524/10695582/marco-grossi-artifice-gran-exito-ilovepdf-tuve-unir-dos-pdfs-sabia-como-hacerlo-asi-cree-herramienta-hoy-mas-usada-mundo.html).
- [Reportagem com Grossi, El País, 08/12/2024](https://english.elpais.com/technology/2024-12-08/marco-grossi-the-man-behind-the-success-of-ilovepdf.html).

### Experimento único: do BDI ao orçamento que pode ser retomado

O trabalho do visitante é calcular uma taxa, aplicá-la ao orçamento e conservar
o projeto para continuar depois. A hipótese é que menos redigitação e um
projeto reutilizável aumentem a utilidade da ferramenta e a disposição para
adquirir exportações quando forem necessárias. A escolha desse percurso vem
da compatibilidade real das duas ferramentas e de seu custo de implementação,
não de uma liderança de demanda estatisticamente demonstrada.

As três prioridades desta continuação são:

1. Explicar a utilidade gratuita recorrente nos atalhos e nas páginas existentes.
   Cálculo de BDI, edição e consulta continuam gratuitos. Salvar e reabrir o
   projeto JSON do orçamento já era gratuito e passa a ter comunicação explícita.
   Os quatro atalhos do catálogo destacam BDI, orçamento, consulta de quantitativos
   IFC e edição de DWG, cada qual com sua condição de exportação.
2. Reaproveitar a taxa calculada em uma próxima tarefa. O visitante decide levar
   apenas a taxa ao orçamento, por armazenamento temporário na própria aba.
   No destino, vê a taxa recebida e a atual antes de aplicar a substituição ou
   descartá-la. Itens e título do orçamento são preservados. Nenhuma exportação,
   compra ou débito é acionado por essa passagem.
3. Observar a utilização e o resultado econômico pelo sistema existente. Os
   cliques têm identificadores estáticos e destino `tool_action`, sem taxa, custo,
   nome de obra, arquivo ou dados da conta. Esse destino os mantém fora da contagem
   de intenção comercial. As etapas comerciais agregadas e o registro operacional
   continuam separados.

O orçamento aceita a taxa com quatro casas decimais, exibidas antes da aplicação.
A calculadora continua usando a taxa integral em seu próprio preço de venda;
portanto, a recomposição com quatro casas pode apresentar diferença por
arredondamento, proporcional ao custo direto.
A transferência é validada, tem prazo de validade e pode ser descartada.
Falha no armazenamento mantém o resultado na calculadora. Abrir outro projeto,
carregar exemplo ou começar de novo não aplica uma sugestão anterior.

O arquivo JSON conserva os dados para reabertura na própria ferramenta. Sua
entrega ao navegador não comprova salvamento permanente nem retorno posterior.
Cliques em levar, aplicar ou salvar são observações de intenção, não um percurso
individual completo nem prova de uma aplicação ou compra bem-sucedida. A leitura
comercial combina entrada orgânica nas mesmas URLs, utilização observada,
exportações com crédito pago, recebimentos conciliados, estornos, taxas,
infraestrutura e atendimento. Sem uso suficiente, não se conclui que a oferta
falhou; antes de ampliar o catálogo, revisa-se a descoberta da tarefa.

### Fronteiras e recuperação

A gratuidade básica recorrente do iLovePDF não equivale à cortesia única de
exportação da CONFENGE. A adaptação utiliza o gratuito existente: preços,
cortesia compartilhada e carteira permanecem regidos por ADR-TOOLS-001 e pela
configuração do serviço. Assinatura, processamento em lote, API, equipes e
novos idiomas ficam em `DEFER` até haver repetição e necessidade demonstradas,
além de custo e margem examinados. Não há compromisso de ferramentas ou
exportações pagas ilimitadas.

Não se cria nova URL indexável, taxonomia, identidade, CRM, envio comercial ou
fonte de preços. Os dados do trabalho permanecem no navegador no fluxo local;
os contratos de exportação existentes continuam válidos. A validação focal
inclui limites e expiração da taxa, armazenamento negado, preservação do
orçamento, reabertura JSON, aplicação explícita e ausência de dados do trabalho
em URLs e analytics. A jornada e as telas pequenas são conferidas no Chrome da
CI. A publicação mantém os gates e a release Netcup existentes.

A recuperação desta continuação é o revert da PR ou a promoção da release
anterior pelo procedimento Netcup. Ela retira os novos encaminhamentos, sem
migrar ou apagar projetos JSON, saldos, pedidos ou o registro financeiro.
