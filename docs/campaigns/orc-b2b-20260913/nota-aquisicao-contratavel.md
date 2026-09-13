# ORC-B2B-20260913 - nota curta de aquisição contratável

Campanha única. Decisão: EXECUTE_NOW para a implementação delimitada; VALIDATE para resultado de
aquisição e contratação. Alavancas: aquisição qualificada, reaproveitamento da prova, distribuição
e oportunidades comerciais. Base: `origin/main` em `ea22bc9ce172ccb15e8e0c017735d177be898191`.

## 1. Correspondência do percurso

| Necessidade do comprador | Destino principal | Apoio | Prova | Contato |
| --- | --- | --- | --- | --- |
| Levantar as quantidades de um projeto | `/quantitativos-orcamento-obras/` | `/conteudos/documentos-para-levantamento-quantitativos/` | `/casos/demonstrativo-projeto-privado/#quantitativos` | `#triagem-quantitativos` (WhatsApp, e-mail, telefone) |
| Elaborar a planilha orçamentária | `/quantitativos-orcamento-obras/` | `/conteudos/documentos-para-levantamento-quantitativos/` | `/casos/demonstrativo-projeto-privado/`, `/casos/demonstrativo-infraestrutura/` | `#triagem-quantitativos` |
| Conferir ou revisar a planilha recebida | `/quantitativos-orcamento-obras/` | `/conteudos/revisar-ou-refazer-orcamento-obra/` | `/casos/demonstrativo-projeto-privado/` (referência de revisão RF-01) | `#triagem-quantitativos` |
| Comparar propostas de execução | `/quantitativos-orcamento-obras/` | `/conteudos/comparar-propostas-execucao-obra/` | `/casos/demonstrativo-projeto-privado/` | `#triagem-quantitativos` |
| Orçar obra de infraestrutura | `/quantitativos-orcamento-obras/` | `/conteudos/documentos-para-levantamento-quantitativos/` | `/casos/demonstrativo-infraestrutura/` | `#triagem-quantitativos` |

Nenhuma URL nova. Nenhuma ferramenta nova.

## 2. Observação (pesquisa de 13/09/2026)

Rodada limitada, mecanismo de busca em português, sem contexto geográfico declarado pelo
mecanismo e sem dados de volume. Amostra pequena, ordem não personalizada para o ICP e não
comparável a um ranking universal. Consultas usadas: `empresa de orçamento de obras terceirização
levantamento de quantitativos para construtoras`; `contratar levantamento de quantitativos projeto
engenharia serviço`; `revisão de orçamento de obra serviço de engenharia de custos contratar
revisar planilha orçamentária`; `"orçamento de obras" serviço para construtoras incorporadoras
escritórios de arquitetura terceirizado engenharia de custos`.

O resultado mistura três coisas diferentes: prestadores de serviço, software de orçamento
(OrçaFascio, Sienge, Brickup) e conteúdo educacional ou curso (IBEC, Guia da Engenharia, Sienge
blog). Quem procura contratar precisa distinguir serviço de software na primeira dobra.

Páginas primárias de prestadores examinadas em 13/09/2026 (cinco tentativas, quatro respostas;
`exatoec.com.br/orcamento-de-obras` retornou 404 e foi lida a home):

- Celere (`celere-ce.com.br/levantamento-quantitativo`): "PRECISÃO NO QUANTITATIVO PARA O SEU
  ORÇAMENTO", quantitativo por BIM, rastreabilidade, alinhamento à EAP do cliente. Prova por
  agregados (bilhões orçados, milhões de m², número de projetos). Convite "VER EXEMPLO PRÁTICO"
  sem amostra aberta na página.
- Lamare Engenharia (`lamareengenharia.com.br/orcamento-e-quantitativos`): destinatário declarado
  como "quem vai construir, reformar, contratar uma empreiteira ou participar de uma licitação";
  entrega inclui auditoria de orçamento de terceiros e responsável técnico com ART. CTA
  "Solicitar proposta". Sem amostra.
- Exato Engenharia de Custos (`exatoec.com.br`): "Orçamento de Obras e Controle de Custos", prova
  por anos, m² orçados, número de obras e logotipos de clientes. Sem amostra.
- 3A Engenharia (`3aengenharia.com/orcamentistas-de-obras`): "Empresa especializada em Orçamento de
  obras públicas"; entrega nomeada como planilha sintética, planilha analítica com composições e
  cronograma físico-financeiro. CTA "Solicitar Orçamento". Sem amostra.

Nenhuma das quatro publica uma amostra conferível da própria entrega. Nenhuma publica preço ou
prazo. Todas provam capacidade por agregado de volume.

Vocabulário de contratação observado e ausente da nossa página em `ea22bc9ce`: `engenharia de
custos` (0), `orçamentista` (0), `terceiriz*` (0), `planilha orçamentária sintética/analítica` (0),
`escritório` (0), `incorporador*` (0), `construtora` (1 ocorrência, em exemplo lateral). A palavra
`infraestrutura` não aparecia nenhuma vez e o segundo demonstrativo não era alcançável da página.

## 3. Hipótese

Compradores técnicos em construtoras, empresas de engenharia e escritórios de projeto chegam a
este mercado com uma necessidade concreta (levantar, elaborar ou revisar) e não conseguem
distinguir prestador de software nem conferir a entrega antes de pedir proposta. Se a página
nomear o serviço no vocabulário de contratação, distinguir as três modalidades, e deixar a
amostra conferível e os dois demonstrativos a um clique, o comprador reconhece a entrega e pede a
proposta certa sem recomeçar a seleção.

Isto é hipótese, não resultado. Incorporadoras, loteadores, proprietários, demanda pequena e obra
pública continuam acolhidos; a priorização B2B é de linguagem, não de recusa.

## 4. Decisão de implementação

Por que isto é melhor que só acrescentar "orçamento de obras" a títulos existentes: o diferencial
observável no mercado examinado não é a expressão, é a prova aberta. Quatro prestadores provam
capacidade por agregado e nenhum deixa conferir um número. A página já publica a trilha
`W-02 -> critério -> memória -> 19,60 m² -> ORC-PAR-01`; a entrega desta campanha é tornar essa
prova encontrável nos dois domínios que o comprador reconhece (edificação e infraestrutura) e
nomear o serviço nas palavras com que ele o contrata. Acrescentar a expressão ao título
duplicaria a concorrência de palavra sem entregar o que nenhum concorrente entrega.

## 5. Linha de base antes da publicação

Exportação de Search Console recalculada, Pesquisa Web de 04/09 a 10/09/2026 (o nome do arquivo
diz 13/09):

- 182 impressões, 18 cliques, CTR 9,89% no site.
- 9 cliques na home, 2 no perfil profissional. Não comprova busca de marca nem origem individual.
- `/quantitativos-orcamento-obras/`: 9 impressões, 0 clique, posição média 1 nessa amostra. Não é
  prova de liderança em busca comercial.
- Apenas 3 consultas divulgadas, 12 impressões, 0 clique. As consultas que produziram os 18
  cliques são desconhecidas.
- A janela precede as publicações de 11 e 12/09; nenhum efeito desses releases pode ser atribuído
  a ela. As janelas 02-08 e 04-10 se sobrepõem e não são semanas independentes.

Como avaliar depois, sem confundir camadas: descoberta é impressão e clique do conjunto de
orçamento a partir da data de publicação desta campanha; contato é solicitação efetivamente
recebida, nunca clique em WhatsApp; contratação só a partir do sistema comercial. Falta de dado é
desconhecido, nunca zero.
