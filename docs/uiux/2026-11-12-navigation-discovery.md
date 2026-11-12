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

O [canário de envio](https://github.com/tjsasakifln/web-cfg/actions/runs/43299220417/job/131465593545) encontrou uma simulação que reduzia o prazo do formulário para um segundo em todos os cenários. O cenário de sucesso persistiu o pedido, mas a página de agradecimento não foi alcançada. O prazo artificial aplicado a todos os cenários introduzia uma corrida desnecessária. A resposta simulada também omitia o recibo exigido pelo transporte. O servidor de teste passa a servir os bytes originais; o prazo curto fica restrito ao envio que testa timeout e é restaurado antes do reenvio. A resposta inclui o recibo correspondente, e o sucesso exige estado DELIVERED e recibo persistido coerente. Permanecem as esperas de cinco e quinze segundos, o atraso intencional, os casos de duplicação e indisponibilidade e todas as verificações anteriores.

A revisão antecipada agora executa também o teste completo de entregas e o canário em passos separados. As correções alteram somente testes, workflow de revisão e este registro. Os 56 insumos da primeira dobra continuam idênticos aos da fonte medida `01962972`; não há mudança de código público, nova recaptura editorial ou alegação de publicação concluída.

## Compatibilização com a contratação de projetos

A integração paralela da PR #837 levou `main` a `d59f9166889b5eb49c9a718e21beabf402e932e2`. A navegação incorpora essa base preservando a oferta por disciplina, os preços, as condições, o checkout e os testes próprios da contratação. Nas duas páginas de projetos prontos, `head`, `main`, rodapé e scripts permanecem idênticos aos dessa base; somente os dois blocos de navegação e a barra de acessos recebem a estrutura compartilhada. O botão “Calcular meu projeto” é preservado, sem reintroduzir o antigo botão móvel de consulta.

O contrato e o inventário canônico de ações preservam as 42 rotas e as 294 ações da base integrada. O censo da primeira dobra agora inclui 26 rotas e 60 insumos. As medidas anteriores são históricas e não comprovam a versão combinada: os dois JSON de primeira dobra permanecem, provisoriamente, iguais aos de `d59f9166`, até serem substituídos pelos arquivos originais de uma medição em commit limpo. A integração e a publicação continuam condicionadas à nova medição, à inspeção da página de projetos prontos e à aprovação dos controles completos. Os 17 arquivos congelados e a autoridade editorial não são alterados por essa compatibilização.
