# Revisão de copy e SEO da CONFENGE

## Objetivo e decisão

Pedido do fundador em 13/11/2026: reunir vinte perspectivas em uma reunião
simulada, selecionar cinquenta fragilidades de copy e cinquenta de SEO, corrigir
o site e publicar uma PR revisada. Estado da decisão: `EXECUTE_NOW`.

A frente é `INBOUND ENGINE`, com efeito pretendido em distribuição, confiança
e oportunidades comerciais. A primeira evidência é a correspondência entre
problema, alteração e comportamento publicado. Aumento de contratação,
recebimento, tráfego ou posição de busca depende de observação posterior;
esta auditoria não registra esses resultados como obtidos.

Base de trabalho: `1bf90c9cc55fa898b31a7beaea6537bd5049a457`, incluindo a
recuperação de contratação e cache da PR #840. A implementação usa uma branch
isolada e mantém os preços, as condições comerciais e o processamento dos
pedidos vigentes.

## Composição da reunião simulada

Os nomes abaixo representam referências metodológicas para a simulação. Não
houve participação, contratação, endosso ou votação real dessas pessoas.
Não se afirma uma classificação objetiva dos dez maiores profissionais.
As conclusões e decisões são responsabilidade desta revisão do repositório.

### Mesa de copy

| Referência | Pergunta usada na revisão |
| --- | --- |
| David Ogilvy | O texto explica a oferta com informação específica e verificável? |
| Claude Hopkins | O argumento apresenta uma razão concreta para escolher e agir? |
| Eugene Schwartz | A explicação atende ao que o visitante já sabe e precisa decidir? |
| John Caples | Título e ação permitem entender imediatamente a relevância? |
| Gary Halbert | A mensagem corresponde a uma necessidade reconhecível do comprador? |
| Joseph Sugarman | A leitura conduz ao próximo passo sem lacunas ou esforço desnecessário? |
| Robert Collier | A página responde às dúvidas que o visitante traz consigo? |
| Rosser Reeves | O benefício e o conteúdo da contratação são específicos? |
| Leo Burnett | A oferta preserva credibilidade, coerência e identidade? |
| Joanna Wiebe | A mensagem é clara, reduz objeções e explica a ação do formulário? |

### Mesa de SEO

| Referência | Pergunta usada na revisão |
| --- | --- |
| Aleyda Solis | A página atende a uma intenção e pode ser encontrada no site? |
| Barry Schwartz | A decisão distingue orientação comprovada de especulação? |
| Lily Ray | As informações e os sinais de confiança são coerentes e verdadeiros? |
| Marie Haynes | O conteúdo ajuda o visitante e respeita as políticas de busca? |
| Glenn Gabe | A alteração preserva rastreamento, indexação e qualidade técnica? |
| Cindy Krum | A experiência e os metadados funcionam também no celular? |
| Mike King | O HTML final expõe corretamente conteúdo, relações e significado? |
| Bill Slawski | Entidades e relações estruturadas descrevem o conteúdo real? |
| Rand Fishkin | A busca se conecta a uma necessidade e a uma ação útil? |
| Kevin Indig | A correção é sustentável, mensurável e se aplica às fontes corretas? |

## Como o consenso foi construído

1. Inspeção das fontes, dos geradores e da versão publicada.
2. Formulação de achados com localização, evidência anterior e consequência
   para a escolha do visitante ou a representação da página na busca.
3. Contestação por dez critérios em cada mesa: clareza, benefício,
   especificidade, prova, adequação ao público, objeções, ação, confiança,
   leitura e coerência para copy; intenção, rastreamento, indexação, URL
   canônica, arquitetura, conteúdo, metadados, dados estruturados,
   experiência e mensuração para SEO.
4. Descarte de problemas não demonstrados, promessas não sustentadas e
   repetições usadas apenas para aumentar a contagem.
5. Implementação, revisão independente e verificação do resultado final.

Consenso significa convergência interna desta simulação depois dessas
contestações. Uma preferência editorial continua identificada como hipótese
de melhoria; não se transforma em defeito técnico ou efeito comercial medido.
Ausências de imagem social e outros recursos são oportunidades de melhor
representação, não alegações de penalidade no Google.

## Registros e critérios de aceite

- `copy-findings.json`: C01 a C50, evidência e solução de copy.
- `seo-findings.json`: S01 a S50, evidência e solução de SEO.
- A PR registra os testes efetivamente executados e a revisão independente.
- A publicação é comprovada pela execução Netcup e pelo identificador servido
  em `https://confenge.com.br/.well-known/build-info.json`.

Os registros precisam corresponder a alterações efetivas. Cabeçalhos,
formulários, metadados e dados estruturados serão conferidos na saída
renderizada, com integridade dos contratos, links e jornadas existentes.
Uma aprovação de preview não é publicação em produção.

### Resultado da seleção

A mesa de copy selecionou 9 inconsistências verificáveis e 41 oportunidades
editoriais. Foram corrigidas mensagens, ações e encaminhamentos e incluídas
25 respostas sobre decisões específicas de contratação nas 13 páginas de
projetos. Duas respostas inicialmente propostas repetiam informações já
claras; a revisão as substituiu pela ausência de inteligência de mercado na
triagem e pelo encaminhamento da avaliação a um resumo, embora houvesse uma
página completa para o serviço.

A mesa de SEO selecionou 34 ajustes de título ou descrição por rota e 16
ajustes de semântica, compartilhamento e prevenção de regressões. Os 50
registros não equivalem a 50 causas técnicas independentes. O campo `group`
declara mecanismos comuns e cada rota registra seu contexto e texto. A
projeção comum de metadados cobre 59 rotas, preservando títulos e descrições
nas fontes que já são responsáveis por eles.

As decisões da revisão preservaram a gratuidade de uso das ferramentas,
explicitaram as condições de exportação e mantiveram o caráter público dos
serviços especializados em contratos de obras públicas. Foram rejeitadas
afirmações não comprovadas sobre rotina operacional e ausência de conteúdo.

Os novos controles verificam duplicações, JSON inválido, divergência de URL
canônica, imagem inexistente e alterações indevidas em corpo, scripts,
preços, autoria ou datas. Os testes de formulários mantêm controles,
consentimento e confirmação de recebimento. A mudança do texto de envio e
do rótulo de prazo foi comparada byte a byte com o formulário anterior antes
da atualização de seu registro de integridade.

A montagem integral também revelou uma incompatibilidade entre a verificação
nova e o versionamento das imagens comerciais. A correção aceita o parâmetro
de versão apenas quando seu SHA-256 coincide com o conteúdo do arquivo e
continua rejeitando imagens ausentes, parâmetros extras e caminhos externos.
A descrição de imprensa foi ajustada ao conteúdo visível, preservando o
controle existente de paridade. As duas correções passaram por revisão
independente e contraprovas antes da publicação.

### Evidência de interface

O workflow de apresentação da [PR #842](https://github.com/tjsasakifln/web-cfg/pull/842)
capturou as 19 rotas declaradas em 1366 × 768 e 390 × 844, usando
Chrome 152.0.7977.42 e a fonte limpa
`221d1b72e99ee5ac1da34e1c2115170197062153`.
As 26 rotas previstas na medição da primeira dobra foram aprovadas, sem
rotas pendentes. Os dois contratos foram importados sem reescrita dos
arquivos do workflow; 60 hashes de entrada e 2.010 verificações passaram.

Execução: [43472203148](https://github.com/tjsasakifln/web-cfg/actions/runs/43472203148).
SHA-256 do pacote de evidência:
`3c377b2654593d74d44c75b7ac8dff10e2868f3e1707fc304fa43056239c9601`.
Os resultados do CI da versão final, o parecer visual e a confirmação da
publicação ficam registrados na PR. Sessões com compradores reais não
foram realizadas nesta auditoria.

## Fontes de critérios

- [Google Search Essentials](https://developers.google.com/search/docs/essentials).
- [Títulos nos resultados de busca](https://developers.google.com/search/docs/appearance/title-link).
- [Descrições e trechos nos resultados](https://developers.google.com/search/docs/appearance/snippet).
- [Regras de dados estruturados](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).
- [Links rastreáveis e textos de links](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).
- [Copyhackers: revisão de clareza](https://copyhackers.com/how-to-edit-for-clarity/).
- [Copyhackers: validação de copy](https://copyhackers.com/how-to-validate-your-copy/).

As referências fundamentam critérios gerais. Os achados sobre a CONFENGE
dependem dos arquivos e resultados associados a cada registro, não de uma
suposta avaliação externa dos especialistas.

## Governança e reversão

O trabalho aplica ADR-STRAT-002 e ADR-STRAT-004 sem mudar a arquitetura pública.
`web-cfg` continua responsável pela superfície e pela captura; `extra-cli`,
pelos dados de origem; Warmbly, pela ação comercial e resultados. Não há nova
taxonomia, marca, preço ou integração de pagamento nesta campanha.

A medição comercial continua usando os eventos vigentes de intenção,
solicitação e compra. Envio de formulário, proposta, contrato e recebimento
não são equivalentes. Não são adicionados dados pessoais aos eventos.

Reversão pelo fluxo Netcup documentado em `deploy/netcup/README.md`, com o
pacote verificado e a versão anterior aceita. Os dados persistentes dos
pedidos permanecem no armazenamento do runtime. A reversão editorial pode
ser feita revertendo a PR, reconstruindo e qualificando o artefato resultante.
