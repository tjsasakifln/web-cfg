# Notícias de contratos públicos

Decisão: EXECUTE_NOW, autorizada pelo fundador em 19/11/2026.
Frente: INBOUND ENGINE. Alavancas: distribuição, dados, confiança e automação.
Evidência inicial: notícia real acessível e rotina repetida sem duplicação.
Avaliação comercial: 30 dias de aquisição, transição para serviços e pedidos
atribuíveis; publicação, proposta, contratação e recebimento são estados distintos.

## Objetivo e responsabilidades

A seção `/noticias/contratos-publicos/` informa contratações recentes relacionadas
a obras e engenharia e oferece continuidade para pesquisa e serviços da CONFENGE.
O valor ordena os contratos elegíveis depois da conferência dos fatos oficiais.
Não se publica uma cópia integral do acervo nem se cria uma página por palavra-chave.

`extra-cli` continua responsável por aquisição, identidade e procedência. Um
exportador de leitura seleciona registros recentes da base e confirma a semântica
na fonte oficial, preservando a distinção entre valor global e inicial. O site
consome o contrato `confenge.contract-news-facts/v1`; não recebe credenciais do
banco operacional nem implementa coletor PNCP.

`web-cfg` responde pela seleção editorial, redação pela API OpenAI, verificações,
publicação, navegação e atribuição. O pedido atual autoriza a rotina automática;
não se atribui revisão humana a cada texto. A conferência automática combina
limites determinísticos e revisão independente do texto contra os fatos.

## Publicação e recuperação

O código passa pelos controles normais de PR e pelo deploy Netcup. Os artigos
aprovados são uma projeção durável fora dos releases: snapshots imutáveis por
SHA-256 e um ponteiro `current.json` substituído atomicamente. O leitor valida
contrato, bytes e conteúdo antes de servir HTML completo. Datas históricas não
expiram. Dados antigos ou incompletos impedem novas publicações.

A rotina tem limite inicial de duas notícias por execução e seis por dia, sem
meta mínima. Cota de chamadas, prazo de resposta, tamanho de saída e tentativas
impedem consumo indefinido. Um lock serializa as execuções. Repetir a mesma entrada
não duplica notícia nem chama novamente a API para conteúdo já aceito. Correção
material conserva URL e data original e atualiza a data de modificação.

A falha de aquisição, redação ou validação conserva o último snapshot aceito.
Parar a rotina impede novas publicações e preserva o acervo. A reversão do código
segue o controlador Netcup; a reversão de conteúdo restaura um ponteiro válido.
O estado privado de cotas e verificações não é exposto pelo servidor HTTP.

## Fatos e experiência pública

Valores não são pagamentos; vigência não é prazo de execução; município do órgão
não comprova localização da obra. O contrato registrado não é uma oportunidade
aberta de licitação. Títulos, descrições e texto obedecem às mesmas restrições.
Não se inventam benefícios, empregos, entrevistas, irregularidades ou vínculos
com a CONFENGE. A publicação identifica fonte oficial, datas e responsabilidade
editorial da organização e oferece canal para correções.

Uma URL representa um contrato. O índice tem paginação rastreável; cada artigo
tem canonical próprio, metadados específicos, `NewsArticle`, acesso à fonte e
chamada contextual. O sitemap do acervo conserva artigos históricos; o sitemap
de notícias inclui apenas as últimas 48 horas. Eventos de transição utilizam
identificadores opacos, sem nomes, documentos fiscais ou textos dos contratos.

O visitante chega a serviços existentes e à captura canônica. Warmbly permanece
responsável pela ação comercial, proposta, faturamento e recebimento. Esta
decisão aplica ADR-STRAT-002 e ADR-STRAT-004 sem alterar seus planos de autoridade.

## Critérios de aceite

Testar fonte tipada, datas, conteúdo não sustentado, injeção no objeto, falhas da
API, cotas em concorrência, repetição, correções, integridade do snapshot, HTML
sem JavaScript, navegação móvel, metadados, sitemaps e contato. Liberar a rotina
somente após verificar seus insumos reais e uma publicação controlada. O relatório
de implantação deve distinguir código publicado, rotina habilitada e execução
real comprovada.
