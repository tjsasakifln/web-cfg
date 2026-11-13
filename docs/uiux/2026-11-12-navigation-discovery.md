# Descoberta de produtos, serviços e conteúdos

## Decisão e objetivo

Estado: EXECUTE_NOW, autorizado por Tiago em 12/11/2026 ao solicitar revisão adversarial do menu e publicação da melhoria.
Frente: INBOUND ENGINE. Alavancas: receita, distribuição, confiança e experiência do cliente. Evidência funcional nesta publicação; efeito comercial a observar após uso real, sem estimativa inventada de conversão.

O visitante deve identificar o que pode usar, contratar ou consultar a partir de qualquer página. A navegação anterior mostrava seis destinos planos, ocultava Inteligência e Conteúdos no cabeçalho e não revelava as ferramentas e ofertas disponíveis.

## Solução

Uma única configuração em `data/site/public-ia-map.json` define seis grupos, 38 destinos diretos, quatro atalhos e a entrada institucional. O espelho de primeiro nível continua em `data/site/brand.json`.

| Grupo | Trabalho do visitante |
| --- | --- |
| Projetos | Conhecer disciplinas, coordenação e revisão; calcular projetos residenciais por disciplina e prazo |
| Serviços | Encontrar orçamento, inspeção, perícia, avaliação, SST e serviços condominiais |
| Ferramentas | Abrir DWG/IFC, avaliar imóveis, orçar, calcular e planejar |
| Inteligência | Pesquisar clientes, mercados, concorrentes e referências de preços |
| Obras públicas | Analisar edital, medições, aditivos, atrasos e reequilíbrio |
| Conteúdos | Consultar biblioteca, guias, exemplos, casos e referências legais |

Editor DWG, BIM e IFC, Projetos prontos e Radar público permanecem visíveis na barra de acesso direto. A CONFENGE possui acesso institucional visível. Todos os links têm destino existente e indexável. Projetos prontos conduz ao cálculo de projetos residenciais por disciplina e prazo e à revisão do pedido. O pagamento pelo Mercado Pago depende da disponibilidade da contratação online. A operação de profissionais desativada permanece fora da navegação.

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

A revisão dos outros percursos identificou três preparações de teste dependentes do menu plano anterior. A semântica do link editorial agora seleciona seu alvo em `main`; o catálogo sem JavaScript abre o grupo nativo Ferramentas e segue o link por teclado; a jornada de condomínio abre Serviços na navegação visível antes de seguir seu destino. As asserções comerciais foram mantidas, e a validação em navegador do artefato continua obrigatória na CI.

## Dependência do pacote Netcup

O teste de execução isolada do pacote em `d9c081f3` identificou a ausência do novo renderizador na lista explícita de arquivos enviados ao servidor. `navigation_discovery.py` foi incluído nas duas listas do pacote, com suas dependências transitivas já cobertas. Passaram os testes de conteúdo/reprodutibilidade e execução isolada sob `-I -S`, incluindo contraprovas separadas que retiram `shell_nav.py` e `navigation_discovery.py`. As oito suítes restantes da etapa estática, ainda não alcançadas na CI interrompida, também passaram localmente. A validação integral e a publicação permanecem condicionadas à CI da revisão final.

## Atribuição e conferência antecipada do artefato

A suíte pSEO em `b1d1d71d` encontrou um mock de âncora sem `getAttribute`, método DOM usado pela proteção que separa navegação de ação comercial. A simulação foi completada sem alterar o código publicado. A suíte de atribuição passou localmente, incluindo uma contraprova que mantém o contexto comercial salvo após clicar em navegação. Uma varredura dos mocks equivalentes não encontrou outro caso concreto.

Para reduzir o tempo até detectar regressões no HTML compilado, o workflow de revisão ganhou uma conferência paralela restrita à branch desta alteração. Ela compila `_site` e executa os testes existentes de navegação, eventos, primeira dobra, catálogo e contato com o mesmo Chrome contratado. Esse job é somente de leitura, não publica e não substitui os controles integrais da PR nem a liberação Netcup.

O [QA 43269222907](https://github.com/tjsasakifln/web-cfg/actions/runs/43269222907), no commit `86e860860a47bee83f1338bb2a2281e47ad0d6b0`, aprovou tanto a fonte quanto o artefato compilado. No artefato passaram os 33 cenários de navegação, três mudanças de largura, seis verificações de âncoras, 67 verificações de eventos, 25 rotas de primeira dobra, o catálogo e 27 jornadas de contato com 928 verificações e zero falhas. As três capturas finais foram inspecionadas pelo integrador. O artifact `navigation-artifact-qa`, ID `13968086234`, teve seu SHA256 conferido contra a API: `e73245cd71796703e1ba3afec7ab41f4c0bf0073436fdf8511e0a6a24718ecbe`.

A etapa geral pSEO desse commit identificou uma proibição de `details` que abrangia o cabeçalho nos testes dos modelos de entrega. A correção mantém a proibição de recolher o documento e permite somente grupos da navegação compartilhada dentro do cabeçalho. Também rejeita qualquer `main` envolvido por `details`, preservando as proibições globais de dialog, PDF e download. Os dois arquivos passaram com 153 casos, incluindo sete contraprovas da exceção. Nenhum arquivo de produção foi alterado nessa correção.

## Correção da geometria encontrada na revisão completa

A CI de `5a4fa1ff` encontrou três regressões no contrato geral de interface: CTA do cabeçalho com 13 px, cabeçalho móvel de 154 px em uma tela de 360 px e CTA do diagnóstico de expansão abaixo da tela de 1280 × 720. Os limites foram mantidos. A barra de atalhos passou a ser um landmark chamado Acesso direto, imediatamente após o cabeçalho fixo, com os mesmos cinco destinos e alvos de 44 px. Os botões do cabeçalho usam 14 px. Somente na oferta de diagnóstico e em desktop, quatro ajustes de espaçamento liberam 62 px antes da ação, preservando texto, ordem, fontes, preço, prazo e destino.

A comparação contra `5a4fa1ff` confirmou os 269 HTML com `head`, `main` e todos os bytes fora do cabeçalho/barra intactos. O conteúdo interno da barra permanece idêntico após remover exclusivamente o novo wrapper de navegação. Os seis pilares protegidos continuam intactos na fonte. Passaram os 34 testes de navegação, a sincronização das 13 páginas de projetos, a composição CSS e a comparação entre os módulos e o bundle JS.

A revisão antecipada passou a executar também a matriz completa de geometria da fonte e o contrato de UI depois da compilação. Dois casos reproduzem as falhas e geram capturas específicas: cabeçalho em 360 × 800, com altura máxima de 96 px, e diagnóstico em 1280 × 720, exigindo o botão inteiro dentro da primeira tela. A nova apresentação só pode ser recapturada após essa revisão renderizada; a integração e a publicação continuam condicionadas aos controles completos.

## Alinhamento do botão móvel na fonte

A matriz completa de geometria na fonte `72d8f963` encontrou um único desvio restante: a home ainda guardava somente o ícone do botão móvel, enquanto Projetos e o HTML compilado já incluíam o texto Menu. Isso produzia larguras de 84 px e 92,16 px. Foi aplicado à home o normalizador já existente de `public_navigation.py`, preservando o botão, os estados ARIA e os SVGs. Não houve alteração de CSS nem dos limites do teste. O gerador e o finalizador já produziam esse rótulo; fontes editoriais protegidas não foram modificadas. A nova rodada deve confirmar a mesma identidade visual nas duas famílias antes da recaptura.

## Aceite da geometria e recaptura final da apresentação

O [QA de fonte 43288875329](https://github.com/tjsasakifln/web-cfg/actions/runs/43288875329), no commit `00cd0faddc3414080f287d3ec491260278310a91`, passou os 44 cenários, 67 verificações de eventos, 25 rotas de primeira dobra e a matriz completa de geometria. A identidade do botão Menu passou sem alterar os limites. As cinco capturas foram inspecionadas pelo integrador e por revisores independentes; os arquivos e a prova estão em `2026-11-12-navigation-evidence/geometry-00cd0fad/`. O artifact `13975248602` teve o SHA256 do ZIP conferido contra a API: `3a0f98c3697f3792d560e88378c229aa04d22e55f8552b2983b04d9d4ed098f8`.

A área fixa do cabeçalho mede 65 px em 360 × 800, com os cinco atalhos de 44 px fora dela. Em 1280 × 720, a ação do diagnóstico ocupa de 660,36 a 704,36 px, inteiramente visível, e o CTA do cabeçalho usa 14 px. A prova determinística passou os 13 checks de preservação.

A recaptura atualizou somente os cinco campos de apresentação da aprovação ativa, acrescentou um evento ao histórico, recapturou os dois bundles no registro congelado e copiou os dois JSON de primeira dobra medidos nessa revisão. A fonte do canário foi persistida exatamente como `candidate/source.html`, enquanto a aprovação usa o hash do artefato público. Os 15 demais arquivos protegidos, os seis pilares e todos os campos factuais permaneceram intactos. Antes da recaptura, o gate recusava INDEX somente por `approval_rendered_hash_mismatch`; depois, confirmou `PUBLISHABLE_INDEX`, com o HTML fonte igual à QA e ao renderizador. Passaram os 229 testes contratuais e de histórico e as 1.942 verificações de primeira dobra.

A confirmação da fonte libera a montagem do candidato final. Os testes do artefato compilado, os controles integrais da PR e a publicação Netcup no SHA integrado continuam obrigatórios. Esta evidência não declara a implantação concluída.

A compilação local completa `npm run build:site` concluiu com saída zero após a recaptura. Os cinco arquivos recapturados permaneceram byte a byte iguais ao plano aplicado. O HTML do canário no escopo de aprovação `public_artifact_v2` mantém o hash `905caa77b27d137b579007e77f2ab06db4d180e033380716ece7efb2e91d6604`. Reaplicar sobre ele os dois transformadores já existentes do build, marcação de identificadores para quebra responsiva e versão da referência a `script.js`, reproduziu byte a byte o HTML final do `_site`, hash `28276b02fa1f1aae1d987da70eeabbe3d7a44f70c317a453ff9d95cb38cffb90`. Essa diferença reproduzível está registrada em `local-build-canary-proof.json`; o escopo de aprovação não foi modificado. Relatórios gerados incidentalmente pelo build não integram esta alteração.

## Abertura nativa e Escape imediato

A matriz responsiva do artefato `a9a11c99` identificou dois casos em 390 px, nas rotas `/projetos/` e `/projeto-estrutura-metalica/`: Enter seguido imediatamente de Escape deixava o menu nativo aberto. A geometria completa, a navegação com espera pela inicialização, os eventos, as 25 rotas de primeira dobra, o catálogo e as 27 jornadas de contato passaram nessa mesma execução. A falha expôs a janela entre a abertura nativa de `details` e o evento `toggle` que inicializava o modal.

A ativação do botão nativo passa a inicializar e fechar o modal no próprio clique, que também atende Enter e Space. O listener de `toggle` continua atendendo alterações programáticas. A correção conserva o limite de largura, o foco, o controle de fundo inerte e a navegação sem JavaScript. Quatro jornadas adicionais cobrem fechamento imediato no mesmo ciclo de execução, Enter/Escape, Space/Escape e reabertura antes do evento de fechamento pendente. A matriz responsiva original permanece sem espera adicional e sem critérios reduzidos.

A mudança de comportamento afeta somente o módulo e seu bundle JavaScript. Não altera HTML, CSS ou o registro de aprovação do canário. Após a nova QA, a atualização derivada fica limitada ao hash congelado de `script.js` e às duas medições de primeira dobra. As capturas do artefato compilado passam também a ser emitidas pelo workflow, em lista fechada de arquivos públicos, para permitir inspeção independente da disponibilidade do ambiente local.


## Evidência da ativação síncrona

O [QA de fonte 43296642366](https://github.com/tjsasakifln/web-cfg/actions/runs/43296642366), no commit `0196297247d41f74a1ea4d3a0883ad41225b26b4`, concluiu com sucesso os 48 cenários de navegação, os eventos, as 25 rotas de primeira dobra, a geometria completa e a preservação da apresentação. As medições foram produzidas em árvore limpa e identificam o mesmo bundle JavaScript revisado. As cinco capturas são byte a byte idênticas às imagens de `geometry-00cd0fad`, já inspecionadas pelo integrador e por revisores independentes. Os arquivos e seus hashes estão em `2026-11-12-navigation-evidence/activation-01962972/`.

A atualização derivada altera somente o hash congelado de `script.js` e o JSON medido de primeira dobra. O contrato de primeira dobra não mudou. Os 16 outros hashes congelados, os seis pilares e a aprovação editorial do canário permanecem intactos. O histórico conserva a proveniência da recaptura; não há alegação de nova revisão humana ou factual. O digest do ZIP é o informado pela API, enquanto os bytes de cada arquivo aqui persistido foram conferidos contra os registros emitidos pela QA.

Esta evidência da fonte não declara publicação concluída. Os testes integrais do artefato, os controles obrigatórios da PR e a liberação Netcup no SHA exato de main continuam necessários.

## Controles gerais de altura e confirmação de envio

O QA de navegação `43299220253` aprovou a fonte e o artefato de `ed51b4ef`, incluindo 48 cenários, 67 verificações de eventos, 25 rotas de primeira dobra e 27 jornadas de contato com 928 verificações. Os controles gerais encontraram dois pontos adicionais nos testes.

O [pSEO da base](https://github.com/tjsasakifln/web-cfg/actions/runs/43225430844/job/131207257222) mediu a página de entregas em 390 px com altura total de 24.400 px e 24.285 px após descontar a preferência de analytics. No [pSEO de `ed51b4ef`](https://github.com/tjsasakifln/web-cfg/actions/runs/43299220190/job/131465592180), os valores foram 24.547 px e 24.432 px. A diferença de 147 px corresponde aos 89 px da nova barra, 54 px do novo link no rodapé e 4 px do cabeçalho. O conteúdo e o CSS da rota permanecem intactos.

O teste conserva o teto histórico de 24.300 px e o orçamento de 130 px da preferência. Ele passa a medir separadamente apenas as duas adições de navegação: barra com limite fixo de 90 px e link Projetos prontos no rodapé com limite de 54 px. O crédito exige identidade, ordem, visibilidade, alvos de toque, contribuição confirmada por ocultação e restauração e preservação da altura de `main`. Contraprovas exercitam crescimento, ocultação, duplicação e crescimento de conteúdo fora desses componentes. Os 4 px do cabeçalho continuam no orçamento histórico. A execução renderizada da nova medição permanece obrigatória.

Isso altera explicitamente o escopo do teto: a navegação nova possui orçamento próprio, e o restante da página continua limitado a 24.300 px após os descontos válidos. Com os 143 px atuais de navegação, o limite efetivo sem a preferência é 24.443 px; os orçamentos permitem no máximo 24.444 px. A revisão de UX manteve os intervalos de 10 px do rodapé, consistentes com as demais rotas. A QA também captura o rodapé móvel após restaurar todas as contraprovas, para inspeção visual dos links e da preferência.

O enquadramento dessa captura mantém a largura de 390 px e amplia temporariamente apenas a altura da viewport para caber o rodapé inteiro abaixo do cabeçalho fixo, sem ocultar elementos nem alterar CSS. Antes de gravar o PNG, o teste confirma que o rodapé preservou largura e altura, está abaixo do cabeçalho e respeita as bordas da viewport, com tolerância de até 1 px somente na borda inferior para o arredondamento da rolagem. Essa altura maior serve somente à imagem: a medição contratual anterior continua em 390 × 844, configuração restaurada antes da próxima verificação.

Na [QA de R, `7c570c0a`](https://github.com/tjsasakifln/web-cfg/actions/runs/43311442249/job/131508467134), todos os demais controles de entregas passaram; a captura foi bloqueada porque a borda inferior medida ficou em 1.751,375 px para uma viewport de 1.751 px. O excesso de 0,375 px e a tolerância passam a constar do relatório. A captura preserva a rolagem validada com `scrollIntoView: false` e inclui a fração inteira com `captureBeyondViewport: true`, evitando a recentralização automática do Puppeteer. Não houve PNG nessa execução; a nova imagem ainda depende de geração e inspeção na QA seguinte.

O [canário de envio](https://github.com/tjsasakifln/web-cfg/actions/runs/43299220417/job/131465593545) encontrou uma simulação que reduzia o prazo do formulário para um segundo em todos os cenários. O cenário de sucesso persistiu o pedido, mas a página de agradecimento não foi alcançada. O prazo artificial aplicado a todos os cenários introduzia uma corrida desnecessária. A resposta simulada também omitia o recibo exigido pelo transporte. O servidor de teste passa a servir os bytes originais; o prazo curto fica restrito ao envio que testa timeout e é restaurado antes do reenvio. A resposta inclui o recibo correspondente, e o sucesso exige estado DELIVERED e recibo persistido coerente. Permanecem as esperas de cinco e quinze segundos, o atraso intencional, os casos de duplicação e indisponibilidade e todas as verificações anteriores.

A revisão antecipada agora executa também o teste completo de entregas e o canário em passos separados. As correções alteram somente testes, workflow de revisão e este registro. Os 56 insumos da primeira dobra continuam idênticos aos da fonte medida `01962972`; não há mudança de código público, nova recaptura editorial ou alegação de publicação concluída.

## Compatibilização com a contratação de projetos

A integração paralela da PR #837 levou `main` a `d59f9166889b5eb49c9a718e21beabf402e932e2`. A navegação incorpora essa base preservando a oferta por disciplina, os preços, as condições, o checkout e os testes próprios da contratação. Nas duas páginas de projetos prontos, `head`, `main`, rodapé e scripts permanecem idênticos aos dessa base; somente os dois blocos de navegação e a barra de acessos recebem a estrutura compartilhada. O botão “Calcular meu projeto” é preservado, sem reintroduzir o antigo botão móvel de consulta.

O contrato e o inventário canônico de ações preservam as 42 rotas e as 294 ações da base integrada. O censo da primeira dobra agora inclui 26 rotas e 60 insumos. As medidas anteriores são históricas e não comprovam a versão combinada: no merge de base, os dois JSON de primeira dobra ficaram provisoriamente iguais aos de `d59f9166`, aguardando os arquivos originais de uma medição em commit limpo. Os 17 arquivos congelados e a autoridade editorial não são alterados por essa compatibilização.

### Recaptura da fonte combinada

A [QA de fonte 43309372181](https://github.com/tjsasakifln/web-cfg/actions/runs/43309372181/job/131501061112) aprovou `bdf0f0846956b7227ca9c0ed24ba81e1899a37af`, árvore `193ec30259c3f6200bc228da002a80356101bcc1`: 48 cenários de navegação, 67 verificações de eventos, 26 rotas de primeira dobra e 2.010 verificações contratuais. A medição foi executada em fonte limpa, sem falhas nem pendências. Os 60 hashes de entrada foram conferidos novamente contra os arquivos locais antes da incorporação dos derivados.

Os dois JSON em `data/commercial/` são cópias byte a byte dos arquivos originais dessa execução, sem edição de identificadores, hashes, números ou estado humano. As capturas, os relatórios e sua procedência estão em [integration-bdf0f084](2026-11-12-navigation-evidence/integration-bdf0f084/review.json). Todos os arquivos selecionados tiveram tamanho e SHA256 conferidos contra os registros emitidos pelo job; o digest do ZIP é informação da API, sem alegação de download ou verificação do ZIP.

Quatro capturas permanecem idênticas às anteriores. A nova imagem de projetos prontos foi inspecionada pelo integrador e pelo revisor de interface: seis grupos, oito destinos no painel Projetos e botão Calcular meu projeto legíveis, sem cortes internos. A ação principal da página cabe na primeira dobra em desktop e em 390 px. A inspeção é de agentes; a validação humana do contrato continua NOT_STARTED, com zero sessões.

Na [QA anterior de 535746b2](https://github.com/tjsasakifln/web-cfg/actions/runs/43305953785), a medição real de entregas confirmou 89 px para a barra, 54 px para o novo link do rodapé e 115,3 px para a preferência. A altura normalizada foi 24.289 px, abaixo do limite de 24.300 px; identidade, visibilidade, restauração e todas as contraprovas passaram. O canário de envio também passou. A captura isolada do rodapé recebeu a correção de enquadramento descrita acima e ainda depende da inspeção da imagem gerada na revisão final.

A incorporação desses derivados e do ajuste de captura não altera os 60 insumos públicos medidos. A aprovação dos controles completos da revisão final e a aceitação pública do SHA integrado continuam obrigatórias. Este registro não declara a publicação concluída.

## Descrição coerente com a nova contratação

A revisão da integração identificou a descrição herdada “Consulte disponibilidade e adaptação ao terreno.” no destino Projetos prontos. Ela passa a ser “Calcule seu projeto por disciplina e prazo.”, em acordo com o simulador e o botão Calcular meu projeto da oferta integrada. O rótulo, a URL, os preços, as condições e o funcionamento da contratação permanecem iguais. A frase descreve o cálculo disponível e não afirma que o pagamento esteja habilitado.

O contrato de navegação e os 269 HTML mutáveis recebem somente essa descrição, nos links identificados que já existem em cada cabeçalho: 536 spans ao todo. No candidato `e58244c9`, o canário editorial permaneceu com a fonte anterior até a nova inspeção. A prova de apresentação usa o checkpoint `7c570c0a` e exige a troca exata dos dois spans do canário, com igualdade byte a byte de todo o restante do cabeçalho, na fonte e no HTML finalizado. Head, main, rodapé, barra, conteúdo externo, 17 arquivos protegidos e seis pilares continuam sujeitos à igualdade estrita. Contraprovas recusam vínculos, rótulos, URLs, eventos, descrições e quantidades incorretos.

A nova medição em fonte limpa e a inspeção das imagens precedem qualquer atualização dos cinco campos de apresentação e do evento de auditoria do canário. Os dois JSON de primeira dobra serão incorporados a partir dos arquivos originais da mesma execução. Nenhuma aprovação factual, estado humano ou registro congelado é alterado por esse ajuste de navegação. Os controles completos e a publicação do SHA integrado continuam pendentes.


## Aceite da descrição e da captura final do rodapé

A [QA de fonte 43317003538](https://github.com/tjsasakifln/web-cfg/actions/runs/43317003538/job/131527708986) aprovou `e58244c9fefa90e872f01ce401759c30925e7031`, árvore `04607a8646f213f99fea944bce50661aaaae768e`: 48 cenários, 67 verificações de eventos, 26 rotas e 2.010 verificações de primeira dobra, sem falhas ou pendências. Os 60 hashes de entrada foram reconferidos na fonte limpa. Os 13 arquivos originais, com tamanho e SHA256 verificados, estão em [description-e58244c9](2026-11-12-navigation-evidence/description-e58244c9/review.json).

O integrador e o revisor independente inspecionaram as novas imagens móvel e desktop de Projetos. A descrição está íntegra, sem sobreposição entre os destinos; o CTA Calcular meu projeto permanece visível. As outras três imagens são byte a byte idênticas às da revisão integrada anterior. Os 13 controles da prova de apresentação passaram. A atualização limita a aprovação aos cinco campos de apresentação e a um evento com SHA, árvore, execução, tentativa e hashes conferidos contra a QA. A fonte do canário é cópia exata do candidato, hash `6c63ae9780766607f2d8f413065f74ffee5fee3b7dffbe47960f4d5796257536`; o hash aprovado do artefato é `7d2a34502d7cd623c6a8916e36ce817fe7c6895beda77a23c6da6a6b18588cb1`. Campos factuais, histórico anterior, 17 arquivos protegidos e seis pilares permanecem intactos.

Os dois JSON de primeira dobra provêm dos originais da mesma execução; o contrato permanece idêntico e somente as medições precisam ser atualizadas. O estado humano continua NOT_STARTED, com zero sessões. O digest do ZIP é o informado pela API; os arquivos individuais foram conferidos, sem alegação de download ou verificação do ZIP.

A [QA de artefato de S](https://github.com/tjsasakifln/web-cfg/actions/runs/43314396142/job/131518485545) passou no controle completo de entregas e gerou o rodapé sem recentralização. O integrador e o revisor independente aprovaram o PNG, hash `b72311c1ead0589958b0a7d2e96e3dfe33c9130cc6dcaff7a4a3a769e796504f`: Estruturas, Instalações, contatos, políticas e preferência de analytics estão legíveis e completos. A borda inferior excede a viewport em 0,375 px, dentro do limite de 1 px; a altura normalizada é 24.289 px para o teto histórico de 24.300 px. Imagem e relatório originais estão em [footer-a4a77d8d](2026-11-12-navigation-evidence/footer-a4a77d8d/review.json). O job foi cancelado pela atualização seguinte depois dos testes substantivos, portanto essa evidência não equivale a uma execução integral concluída.

Os controles completos da revisão derivada, a integração por merge commit e a liberação Netcup no SHA exato de main continuam obrigatórios. A aprovação destas capturas não declara publicação concluída.

## Correção de desempenho após a medição completa

A QA funcional da revisão `12db134a7e2fd08c1fa1355865340a288beb9e39` passou na fonte e no artefato. O [site-ci 43319312840](https://github.com/tjsasakifln/web-cfg/actions/runs/43319312840), porém, concluiu suas 83 medições com `MEASURED_FAIL`, sem erro de infraestrutura nem rotas não medidas. A publicação permaneceu bloqueada.

| Página | Reprovação medida |
| --- | --- |
| Home e Diretoria B2G | 893 elementos para limite de 800, nos três runs |
| Entregas | 1.241 elementos para limite de 1.100, nos três runs |
| Diagnóstico de defesa da margem | 157.755 bytes comprimidos para limite de 153.600; LCP de 2.030,43 ms no segundo run, para limite de 2.000 ms |
| Documentos para reequilíbrio | TBT de 290,6512 ms e performance 94 no terceiro run, para limites de 200 ms e 95 |

O artefato `site-ci-reports`, ID `13994215192`, foi baixado e verificado: 52.166.468 bytes e SHA256 `d9b41ad7ea6ee1f474c9439c2df891405dd6b31c2c3392230cf6c694d38342c4`. Esses resultados permanecem registrados. Nenhum limite, quantidade de medições, configuração de simulação ou regra de classificação foi afrouxado.

A correção estrutural retira 80 elementos de cada variante de menu, portanto 160 nas páginas que carregam desktop e celular. Títulos e summaries passam a usar texto direto; indicadores decorativos passam para CSS. Os painéis deixam de repetir introduções genéricas e apresentam diretamente os destinos, com a visão geral no rodapé. Permanecem os 38 destinos, suas descrições, atributos, IDs, controles nativos, teclado e funcionamento sem JavaScript. O JavaScript do menu permanece idêntico.

O integrador e o revisor de interface conferiram os [269 HTML alterados](2026-11-12-navigation-evidence/compact-source-audit.json). Todo byte fora de `details.nav-group` permanece igual à base `12db`, assim como os endereços, atributos e textos dos links, descontada somente a seta decorativa. Há 267 páginas com os dois menus e duas páginas que já possuíam apenas desktop. Nos dois documentos de Projetos prontos, a atualização foi restrita aos grupos; oferta, condições, formulários, CTAs e scripts da PR #837 permanecem intactos. Os seis pilares e a fonte do canário ainda não foram alterados.

A publicação dos estilos passa por minificação de espaços e comentários, após incorporar os tokens e antes de calcular o hash do arquivo. Nenhuma regra, seletor, identificador ou string é removida. O compositor de CSS fonte permanece byte a byte igual e avisos do parser bloqueiam a publicação. Dois módulos públicos, `showcase.mjs` e `tool-referral.mjs`, entram na minificação já usada pelos scripts das ferramentas; o escopo é explícito, as fontes continuam legíveis e a avaliação de constantes permanece desabilitada. Sobre os ativos realmente carregados em `12db`, a redução calculada é de 4.415 bytes comprimidos, antes do ganho adicional da compactação do HTML. Isso é uma estimativa por compressão dos ativos, não uma nova medição Lighthouse ou um aceite de LCP.

O pico de TBT foi localizado em uma tarefa tardia sem atribuição de função. Um resultado equivalente já havia ocorrido na tentativa 1 da publicação de `d59`, sem este menu, mas isso não autoriza descartar a reprovação. O coletor passa a preservar Trace e DevtoolsLog do mesmo resultado medido, vinculados ao LHR por tamanho e SHA256. A retenção ocorre após gravar a medição; falhas de retenção ficam explícitas e não mudam o resultado nem permitem nova navegação. As 17 contraprovas do coletor passaram em Node 22.

A prova de apresentação agora usa `12db` como base. Uma transformação independente admite somente a compactação exata do cabeçalho. Fora do módulo de navegação, o CSS é comparado por bytes, com compositor imutável. Seis testes locais incluem contraprovas que recusam mudanças em links, textos, controles, quantidades, regras externas e finais de linha. Os testes de publicação passaram em 18 cenários de CSS e 12 de JavaScript. A nova inspeção visual em navegador, a medição de primeira dobra, a recaptura derivada e os controles completos continuam necessários antes da integração.

## Aceite da compactação e registro da apresentação

A [QA de fonte 43334909007](https://github.com/tjsasakifln/web-cfg/actions/runs/43334909007/job/131588527340) aprovou `6822954b0b85be603c8c6a9af304f444f58d17ea`, árvore `bb09d1c60c63473deac23f1e9958c943fea16873`: 48 cenários de navegação, 67 verificações de eventos, 26 rotas de primeira dobra, geometria completa e 15 controles da prova de apresentação. Não houve erro de página, falha ou pendência nas medições da fonte.

O integrador e o revisor independente inspecionaram os cinco PNGs produzidos por `b62`; os cinco originais da execução `682` são byte a byte idênticos. Os painéis mantêm duas colunas no desktop e uma no celular, com títulos, descrições e acesso à visão geral legíveis. O botão Menu, o fechamento e a ação completa do diagnóstico permanecem visíveis nos tamanhos contratados. A execução anterior `b62` passou nessas verificações de interface, mas falhou ao importar o compositor CSS durante a prova. O único ajuste de `682` foi executar o helper como módulo Python; nenhum controle da prova foi removido.

O artefato original `13997261392` foi baixado: 1.075.578 bytes, SHA256 `eb007478b06375f9e42aa86c78d293aea2b91ab0a4adeb929415b49680db81b6`, conferido contra a API. Relatórios, proveniência, imagens, contrato, medição e prova originais estão em [compact-6822954b](2026-11-12-navigation-evidence/compact-6822954b/review.json). Os 60 hashes de entrada foram reconferidos no checkout; os dois JSON de primeira dobra foram copiados sem reescrever SHA, data ou resultados. A validação humana continua no estado anterior, sem sessões novas alegadas.

A recaptura alterou somente os cinco campos de apresentação do vínculo ativo e acrescentou um evento ao audit, preservando os 34 anteriores. A fonte do canário é cópia exata de `candidate/source.html`, hash `47f280a89e11084edc3c93a55618f98997f16a43371feaf24033d8635a130334`. O vínculo usa o hash público finalizado `2d9b4c35e386d0983be90e835a76a4ba19e0464714b1815a5349490b47f9e4b9`. A verificação local posterior reproduziu ambos os arquivos e confirmou `PUBLISHABLE_INDEX` e `RECAPTURED_PRESENTATION_VERIFIED`, com o mesmo hash material.

No registro congelado, somente o hash de `styles.css` mudou. Os 16 outros hashes e os seis pilares permanecem iguais. A fonte revisada `682` é o novo baseline; o predecessor continua sendo `01962972`, cujo checkpoint completo, inclusive a evidência anterior, foi acrescentado ao histórico. Nenhuma autoridade factual ou aprovação humana nova foi atribuída aos agentes.

A aprovação da fonte libera o candidato derivado para a compilação e os controles integrais. Os jobs de artefato e pSEO anteriores pararam na apresentação ainda não recapturada; essas execuções permanecem registradas como falhas. A nova medição de desempenho, o aceite da revisão final e a publicação Netcup no SHA integrado continuam obrigatórios. Este registro não declara a implantação concluída.

## Integração da atualização comercial e correção final de CSS

A main `ae72197e687a1a2b55d71834bc1435bb343691d6` atualizou cinco textos de Projetos prontos, seu documento de formatos de compra e o escopo do workflow de evidência comercial. A integração conserva o conteúdo de `<main>` exatamente como nessa revisão e mantém a navegação de `07fca460`. O registro anterior de primeira dobra foi preservado inteiro até a coleta da versão integrada; nenhum identificador de medição foi reescrito para fazê-lo representar outra árvore.

O site-ci `43336453140`, tentativa 1, mediu 83 vezes 67 rotas da árvore de `07fca460`. A única reprovação foi o terceiro LCP do diagnóstico de defesa de margem: 2.135,3697 ms para um limite de 2.000 ms. Os dois primeiros foram 1.983,5968 e 1.983,4700 ms. DOM, payload e TBT ficaram dentro dos limites. O artefato integral, incluindo os 83 LHRs e seus traces e DevtoolsLogs, foi preservado com SHA256 `d60431b3f44a12d18468e36a12ab688916c2f6ed788d7692e43d1cd55ef51712`. Não houve nova tentativa para descartar o resultado.

O elemento medido é o parágrafo estático `.content-lead`. A observação local dos traces não demonstra bloqueio de CPU que explique a diferença entre os resultados simulados. Os três relatórios apontam duas folhas bloqueantes e uma oportunidade de reduzir CSS antes da primeira apresentação. Por isso a correção atua sobre essa dependência, mantendo o texto, a fonte e o comportamento.

`assets/tool-bundles/diagnostico-base.css` é uma projeção conservadora do CSS global somente para essa ferramenta. A folha original tem 117.484 bytes; a projeção tem 46.066 bytes. O gerador remove uma regra inteira apenas quando todos os seletores começam por classes literais de componentes explicitamente ausentes. Regras ambíguas, importações, fontes, camadas CSS e declarações retidas permanecem intactas, na ordem original. A lista foi confrontada com HTML, scripts compartilhados, ferramentas, referências e importações condicionais. Os 14 arquivos de runtime têm hashes de revisão: qualquer mudança exige uma nova conferência antes de gerar a folha.

O controle de CSS valida a derivação exata antes de descontar declarações duplicadas. Testes negativos exercitam seletores agrupados, funções, atributos com vírgulas ou comentários literais, escapes, Unicode, camadas, fontes, arquivos ausentes, importações novas e componentes reintroduzidos. O teste de navegador compara estilos calculados e geometria da mesma página com a folha integral e a projeção em estados de uso. As medições e os controles normais de publicação continuam obrigatórios. A estimativa de economia de bytes não é uma aprovação de desempenho nem uma promessa de ganho em milissegundos.

Essa mudança não altera `styles.css`, `build_css.py`, os arquivos congelados, o canário editorial, sua aprovação ou os limites de desempenho. A atualização comercial concorrente não criou motivo para uma nova aprovação editorial ou recaptura do congelamento.

### Evidência integrada de `6f1cdfde` e ajustes das verificações

A execução `43346686446`, tentativa 1, confirmou 48 cenários de navegação, 67 verificações de eventos, a geometria contratada e 26 primeiras telas. As cinco imagens da navegação são byte a byte iguais às de `07fca460`. O ZIP fonte tem 3.352.500 bytes e SHA256 `c21fb4f9a85cc89f7b6a8f1334f46d6715220b9f9936a3694a3678ea024da4d7`.

A execução completa permaneceu reprovada: a comparação de CSS registrou 19 cenários divergentes entre 37, e o build compilado parou na verificação de identidade institucional que ainda exigia o href global do diagnóstico. A primeira dobra, porém, foi medida no checkout limpo de `6f1cdfde` e passou. Seus dois JSONs foram incorporados sem nenhuma alteração, mantendo SHA de origem e data de coleta. Todos os 60 insumos, incluindo os três controles de medição, coincidem com o candidato seguinte. O contrato local aprovou 2.010 verificações dessa vinculação. Essa evidência parcial não é apresentada como aprovação da paridade ou do build.

A verificação de identidade passou a exigir, exclusivamente para o diagnóstico, os dois hrefs correspondentes à projeção e ao bundle da ferramenta no manifesto de arquivos com hash. As duas folhas da home e a exigência de `styles.css` nas demais rotas permanecem. Não há dispensa de logotipos, navegação, scripts ou folha institucional.

A comparação antiga alterava o href do link ativo. Os cenários falhos mostraram o mesmo desvio ao restaurar a própria folha reduzida, enquanto os cenários seguintes passavam. Um grupo de falhas era composto por mudanças de rolagem e coordenadas verticais; outro, por métricas de texto. As quatro definições de fonte são idênticas e mantêm sua ordem nas duas folhas. O teste precisa conservar ambas as folhas carregadas, alternar sua ativação sem um intervalo sem estilos e comparar estados de fonte explícitos. A falha original fica preservada; o resultado corrigido e o Lighthouse ainda precisam ser aprovados.

O driver corrigido mantém os dois links carregados na posição original da cascata e alterna sua mídia de forma síncrona. O relatório verifica as fontes efetivamente usadas pelo navegador, compara os mesmos 107 valores de estilo e mantém a tolerância geométrica original de 0,25 px. Não há correção artificial de rolagem, descarte de propriedades ou normalização das diferenças. Além dos estados com fonte carregada, seis cenários em contextos isolados bloqueiam o download da fonte e exercitam o fallback real. Essa comparação controlada não mede primeira pintura; o Lighthouse continua responsável pelo aceite de desempenho.

### Preparo da fonte antes da comparação

A [execução 43348937718](https://github.com/tjsasakifln/web-cfg/actions/runs/43348937718), tentativa 1 de `ec1c88ef339d0b15e26d12a80dd7e87cbc31c71f`, passou nos 48 cenários de navegação, 67 controles de eventos e 26 primeiras telas, na fonte e no compilado. O compilado também passou nos 266 controles responsivos, nos 14 casos sem JavaScript, no hub de entregas, no canário comercial, no catálogo e nas 27 jornadas de contato, com 928 verificações e nenhum pedido de lead enviado. As cinco capturas de navegação permanecem idênticas às já revisadas.

As duas comparações de CSS pararam antes do primeiro cenário: o título usava Liberation Sans quando a preparação exigia Archivo carregada. O carregamento tardio não revertia a escolha inicial de fallback de `font-display: optional`. Não houve resultado de paridade nessa execução. Os ZIPs originais foram baixados e conferidos: fonte `2937b21072ad6c77b33018d346b412b373177fd3de1f205b3f767b9c6936fe1b`, 958.225 bytes; compilado `9da87b7e3f42f8e5d5235f60833a0f2a849d01eeee247809735907a89f8e450e`, 6.919.195 bytes.

O ajuste seguinte limita-se ao driver: uma página vazia, sem scripts de aplicação, carrega e decodifica a FontFace original antes da navegação à ferramenta. Somente a resposta de fonte do servidor de teste recebe cache. Nos cenários nativos, JavaScript volta a ser desabilitado antes de carregar a aplicação; o fallback permanece em contexto isolado, com cache desativado e fontes bloqueadas. As fontes efetivamente pintadas continuam verificadas, e nenhuma declaração pública, propriedade comparada, tolerância ou controle foi alterado. A revisão estática independente aprovou o ajuste; a nova execução de paridade, os controles integrais e a publicação continuam pendentes.
