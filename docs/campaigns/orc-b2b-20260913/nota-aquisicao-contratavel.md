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

## 6. O que foi implementado

Diferenças observáveis entre `ea22bc9ce` e este candidato, na rota
`/quantitativos-orcamento-obras/`:

| Antes | Depois |
| --- | --- |
| 0 menção a infraestrutura, 0 link para `/casos/demonstrativo-infraestrutura/` | duas entradas de prova resumidas, edificação e infraestrutura, com desenho, critério, quantidade e item de planilha canônicos e os oito CSV abertos |
| `terceiriz*`, `escritório`, `incorporador*`, `empresa de engenharia` ausentes; `construtora` só em exemplo lateral | um parágrafo nomeia quem contrata e a possibilidade de terceirizar a produção do orçamento, sem estreitar a marca |
| nada distinguia serviço de software ou planilha gratuita | a primeira dobra declara serviço de engenharia contratado, com responsável técnico |
| `comparar-propostas` listava critérios | matriz estática de equalização aplicando os cinco critérios às duas propostas do exemplo sintético |
| `documentos-para-levantamento` não mostrava como pedir | exemplo de primeiro pedido, editável, sem CPF, CNPJ, endereço ou processo |
| prontidão levava ao contato o recorte do encaminhamento principal mesmo no caminho alternativo | o contato nomeia o recorte que carrega e manda abrir a página do caminho escolhido |

Nenhuma URL nova. Nenhuma ferramenta nova. Nenhum formulário novo: a rota segue
sem captura ativa, com os três canais diretos publicados.

## 7. Camadas, separadas

- **IMPLEMENTAÇÃO**: feita e testada localmente. 17 asserções de cenário e
  contraprova na suíte da campanha, `build:site` duas vezes com as 234 páginas
  HTML byte a byte iguais, CSP real aplicada no navegador sem violação.
- **PERCURSO PUBLICADO**: depende do merge pelo fluxo protegido de main e da
  promoção Netcup. Até lá, verificado apenas no artefato local.
- **RECEBIMENTO OPERACIONAL**: não comprovado. A rota não tem formulário ativo;
  a autoridade de intake adaptativo segue WITHHELD. Clique em WhatsApp não é
  mensagem recebida. O probe legado `money_asset_prod_proof.mjs` é objeto do
  PR #682 e não foi executado nem alterado aqui.
- **RESULTADO COMERCIAL**: nada a afirmar. Oportunidade qualificada, proposta e
  contratação só a partir do sistema comercial.

## 8. Verificação do candidato: o que foi executado e o que não foi

### Cenário F em navegador real, com JavaScript desativado

Evidência independente do auxiliar `staticBody` da suíte. Chromium real,
`setJavaScriptEnabled(false)` confirmado por `jsRan: false`, CSP de `_headers`
aplicada pelo servidor, viewport 390x844, `/quantitativos-orcamento-obras/`:

| Verificação | Resultado |
| --- | --- |
| HTTP | 200 |
| JavaScript executou | não (`jsRan: false`) |
| Entrada de edificação visível | sim |
| Entrada de infraestrutura visível | sim |
| Trilha conferível visível | sim |
| Memória com 19,60 presente | sim |
| Quem contrata visível | sim |
| Âncora de contato visível | sim |
| WhatsApp, e-mail e telefone presentes | sim |
| Links CSV | 8 |
| Itens ORC-PAR-01 e ORC-SUB-01 | presentes |
| Pseudocódigo publicado | não |
| Overflow horizontal | não |

Problemas: nenhum. O auxiliar corrigido da suíte é uma segunda evidência, não a
única.

### CodeQL: comparação com a base

| Referência | Alertas abertos |
| --- | --- |
| `refs/heads/main` (base) | 37 |
| Introduzidos por este PR | 3 |
| Agravados por este PR | 0 |

Os três introduzidos estavam todos em `tests/campaigns/orc-b2b-20260913/test_purchase_path.mjs`,
linhas 41 e 43, no removedor de script e estilo, e foram corrigidos na fonte,
sem supressão e sem excluir o arquivo da análise.

Os 37 da base são preexistentes, distribuídos por `tests/intake/`,
`scripts/distribution/`, `tests/coordination/` e outros arquivos que este PR não
toca. Não são agravados aqui e não constituem impedimento material à publicação
desta rota. Permanecem fora desta campanha: uma limpeza geral do repositório
seria outra entrega, com outro escopo e outra validação.

### Verificações não executadas

Na execução interrompida do candidato anterior, os passos de build, Chrome,
axe, canária de CSP e medição de primeira dobra foram **pulados** depois da
reprovação do gate de unidade. São tratados como **não executados**, nunca como
aprovados. Nada de CSP, acessibilidade, Lighthouse ou identidade de publicação
foi alterado para contornar ausência de evidência.
