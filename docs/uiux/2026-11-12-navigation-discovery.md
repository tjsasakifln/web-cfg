# Descoberta de produtos, serviços e conteúdos

## Decisão e objetivo

Estado: EXECUTE_NOW, autorizado por Tiago em 12/11/2026 ao solicitar revisão adversarial do menu e publicação da melhoria.
Frente: INBOUND ENGINE. Alavancas: receita, distribuição, confiança e experiência do cliente. Evidência funcional nesta publicação; efeito comercial a observar após uso real, sem estimativa inventada de conversão.

O visitante deve identificar o que pode usar, contratar ou consultar a partir de qualquer página. A navegação anterior mostrava seis destinos planos, ocultava Inteligência e Conteúdos no cabeçalho e não revelava as ferramentas e ofertas disponíveis.

## Solução

Uma única configuração em `data/site/public-ia-map.json` define seis grupos, 38 destinos diretos, quatro atalhos e a entrada institucional. O espelho de primeiro nível continua em `data/site/brand.json`.

| Grupo | Trabalho do visitante |
| --- | --- |
| Projetos | Conhecer disciplinas, coordenação, revisão e consulta de projetos residenciais |
| Serviços | Encontrar orçamento, inspeção, perícia, avaliação, SST e serviços condominiais |
| Ferramentas | Abrir DWG/IFC, avaliar imóveis, orçar, calcular e planejar |
| Inteligência | Pesquisar clientes, mercados, concorrentes e referências de preços |
| Obras públicas | Analisar edital, medições, aditivos, atrasos e reequilíbrio |
| Conteúdos | Consultar biblioteca, guias, exemplos, casos e referências legais |

Editor DWG, BIM e IFC, Projetos prontos e Radar público permanecem visíveis na barra de acesso direto. A CONFENGE possui acesso institucional visível. Todos os links têm destino existente e indexável. Projetos prontos conduz à consulta de disponibilidade, sem anunciar compra ou catálogo já disponível. A operação de profissionais desativada permanece fora da navegação.

Os painéis usam `details` e `summary` nativos, com links no HTML entregue. Funcionam por clique, toque e teclado, inclusive sem JavaScript. A implementação abrange o cabeçalho geral, a família de Projetos, Projetos prontos, páginas geradas e o shell compartilhado do BIM.

A versão com JavaScript mantém um grupo aberto por navegação, fecha ao clicar fora, trata Escape a partir do grupo mais interno e devolve o foco. O painel móvel conserva foco dentro dele e torna o fundo inerte. O fechamento por mudança de largura acompanha o breakpoint de 1120 pixels.

## Hipótese e medição

A hipótese é que a descoberta explícita de ofertas e ferramentas reduza buscas sem resultado e passos intermediários. O êxito comercial deve ser acompanhado por solicitações qualificadas e sua progressão até proposta e recebimento, sem confundir visita com receita.

Links de descoberta têm identificadores estáveis e o atributo `data-navigation-link`. Seus cliques geram somente `cta_click` com destino de rota. Não geram sinais comerciais específicos de SST, não são conversões de conteúdo para serviço e não substituem a atribuição de uma solicitação. Os botões contextuais de contratação preservam o comportamento existente. Nenhum dado pessoal é adicionado à medição.

## Fronteiras preservadas

Aplicação de ADR-STRAT-002 e ADR-STRAT-004, sem mudança de domínio, marca, catálogo comercial, preço, cobrança ou responsabilidade operacional. `web-cfg` continua dono da navegação pública; `extra-cli` continua dono dos fatos; `warmbly` continua dono da ação comercial. Não há novas rotas, redirecionamentos em massa ou alteração de formulários.

A comparação dos corpos principais das páginas alteradas protege o conteúdo existente. Fontes editoriais sujeitas a aprovação por hash continuam protegidas; seu cabeçalho é normalizado no artefato público pelo compilador existente. A atualização de hashes do shell registra os bytes efetivamente revisados, sem alegar nova aprovação factual ou humana de conteúdo técnico.

## Aceite e recuperação

Os testes verificam contrato, destinos e fragmentos, paridade entre os quatro menus, identificadores, controles nativos, compilação determinística, acessibilidade, foco, comportamento responsivo e ausência de promessa comercial indevida. A aprovação inclui inspeção renderizada, checks de PR e o fluxo integral Netcup no SHA integrado.

A publicação usa o artefato aprovado, a promoção atômica e a verificação pública do fluxo `netcup-release`. A recuperação usa a versão anterior pelo procedimento já definido em `deploy/netcup/README.md` e `docs/ops/ROLLBACK.md`. Reverter a mudança de navegação e seus artefatos derivados não altera dados de clientes nem transações.

## Evidência revisada

O [QA 43255326548](https://github.com/tjsasakifln/web-cfg/actions/runs/43255326548) aprovou o commit fonte `00bd838d128c438b7db0da4e0c39c9c89fc1e5aa`, árvore `80ba18e77eda1a11ec2ae94faa3f67ae614fd048`. A inspeção das três capturas foi realizada pelo integrador e por dois revisores. Os arquivos originais estão em `2026-11-12-navigation-evidence/`.

| Verificação executada | Resultado |
| --- | --- |
| Navegação com JavaScript, três famílias e oito tamanhos | 24/24 |
| Navegação sem JavaScript, três famílias e três tamanhos | 9/9 |
| Abertura exclusiva de grupos sem JavaScript | 9/9 |
| Mudanças de largura em ambos os sentidos | 3/3 |
| Contato e salto para conteúdo, com e sem JavaScript | 6/6 |
| Semântica de eventos e atribuição | 67/67 |
| Primeira dobra comercial em fonte limpa | 25/25 rotas; 1.942 verificações |
| Erros de página e falhas de navegação | 0 |

A comparação dos 269 HTML alterados nesse commit confirmou identidade byte a byte de `head` e `main` contra a base `fdbc687a1d1b5ba5ede77698c8cbd64cd9f9f376`. A análise contratual aprovada recebeu prova específica de preservação do conteúdo, da autoridade e de todo o artefato fora do cabeçalho, rodapé e fingerprint CSS. A recaptura de apresentação mantém os campos factuais intactos e registra a proveniência e os hashes das capturas; não atribui aprovação humana a uma revisão feita por agentes.

As fontes dos seis pilares protegidos permanecem intactas. O compilador aplica a navegação compartilhada ao artefato público. A primeira dobra do artefato final, os gates completos da PR e o fluxo de publicação no SHA integrado continuam obrigatórios. A aprovação da fonte não declara que a publicação já ocorreu.

## Seleção de jornadas nos testes de atribuição

A CI do commit `afab6ef1` encontrou uma seleção antiga pelo primeiro `href` da página: o novo link de navegação para assistência pericial precede o link comercial no conteúdo. O teste passou a selecionar o caminho comercial dentro de `main`, preservando as dez jornadas e todas as exigências de atribuição e admissão pelo coletor. Dois casos adicionais exercitam os links reais de navegação aos mesmos destinos e exigem apenas um clique de rota, sem transição comercial. A suíte `test:analytics` passou com essa correção. Não houve alteração no código de produção nem nos controles obrigatórios.
