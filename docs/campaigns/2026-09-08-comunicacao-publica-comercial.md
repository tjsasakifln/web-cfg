# Campanha: comunicação pública comercial (2026-09-08)

Registro de retomada. Issue guarda-chuva: #611. PR: #644.
Base: `234a061f1` (= `origin/main` = SHA servido em produção no início).
Branch: `campanha/comunicacao-publica-comercial`.

## Retomada autorizada em 2026-09-09

A decisão expressa EXECUTE_NOW de 09/09 substitui o encerramento e os limites
editoriais anteriores desta etapa. As seções anteriores de execução abaixo são
históricas, não aceite do universo atual. Frente executiva: INBOUND ENGINE;
alavancas: customer, trust, revenue e automation. Tempo para evidência: cada
lote tem validação e publicação imediatas após os checks obrigatórios. Cem
repetições devem melhorar os mesmos contratos, geradores e testes, sem criar
cem campanhas ou inventários paralelos.

Preflight confirmado nesta retomada:

- `origin/main` e os dois endpoints públicos de identidade:
  `54b51438a110767c88256c2e9e5272173066cc9c`.
- Artefato público observado:
  `7b6161067270a6ac7e0e30b51e7f710660180b0f95427ea5c67916b587d5c903`;
  bundle observado `84cce7ed93447966c458272d8609a2fc89612c173c66865548e8f67bd558feb2`.
- Build `2026-09-09T05:15:14Z`; produção `netcup-production`,
  `confenge-nginx-node/v2`, armazenamento `filesystem`.
- Publicação anterior: Actions `34314143158`; site-ci `34314142753`.
  Branch protection exige `site-ci` e `pSEO quality gates`, strict; nenhum
  revisor adicional requerido. Ambientes stage/production restringem branches
  protegidas e dispõem dos nomes de secrets SSH necessários. Valores secretos
  não foram consultados nem publicados. Autorizações não foram alteradas.
- Árvore original limpa; branch de retomada
  `campanha/revisao-comercial-20260909`, baseada em origin/main. PRs antigos
  permanecem preservados; #639 tem checks falhando e não é candidato de release.
- A observação inicial de 253 HTML-fonte, 549 HTML no `_site` local preexistente
  e 249 entradas do manifesto evidencia divergência de universos. O `_site`
  preexistente não certifica a nova revisão. O aceite usará build limpo e
  reconciliação independente do artefato final.
- Pacote efetivamente publicado recuperado de
  [Actions 34314143158](https://github.com/tjsasakifln/web-cfg/actions/runs/34314143158),
  artifact `10089970459`: checksum SHA-256 e atestação Sigstore conferidos.
  O pacote contém **255 HTML**, dos quais **249 index.html**. Inventário
  independente obtido por SSH somente leitura em
  `/opt/confenge-web/current/_site`: **551 HTML**. A diferença decorre da
  transformação autorizada de oportunidades no stage; os dois universos
  serão reconciliados com seus respectivos retratos, sem chamar o pacote
  anterior ou o manifesto-fonte de inventário completo do servidor.
- Acesso de leitura ao host e executável de rollback confirmado. `current`
  aponta para `54b51438…`; `rollback` aponta para
  `c173461ccbcf93878c6ab59482e4ec4bb537a418`. Nenhuma promoção, reversão,
  alteração de permissões ou edição manual em produção foi feita no preflight.

Revogações em execução (contraprovas e HTML final completados no artefato de CI):

| Regra anterior | Defeito imposto | Proteção mantida | Substituição e origem |
| --- | --- | --- | --- |
| Preço exige um formulário de captura persistida | Impede preço verdadeiro com contato direto; induz ocultação de preço | Autorização de valor, condições, privacidade, recibo verdadeiro | AGENTS, ADR-STRAT-004, contratos corporativos/comerciais, registro de famílias e `inbound_gates.py`: contato contextual verificável; formulários ativos mantêm todo o contrato |
| Home/chrome B2G até integração exclusiva MV-09 | Preserva categoria corporativa estreita e congela correção autorizada | Especialização pública, URLs úteis, autoridade operacional dos owners | ADR-STRAT-002/004, constituição, taxonomia e matriz: projetos/serviços públicos e privados por necessidade |
| Prova exige ausência explícita | Faz do inventário de ausências a apresentação pública | Toda alegação precisa de fundamento verdadeiro | Contrato público de serviço: competência, método e exemplos atribuídos corretamente |
| Scanner indexável, fonte e descarte de aria-hidden/inert | Certifica sem ler páginas públicas noindex e texto ainda visível | Separação de material interno, histórico e transcrição | Escopo do scanner e gate sobre pacote construído, com inventário independente e defeitos semeados |

Os hashes dos contratos locais modificados são recalculados a partir do JSON
canônico e fixados no consumer-pin desta campanha por esta decisão comercial;
isso não concede aprovação externa, não muda pins de Governance nem apaga
verificações de integridade. Dados, datas de consulta e autorizações financeiras
externas conservam sua autoridade original.

## Universo auditado

378 rotas no sitemap servido: 74 autorais + ~22 artigos editoriais + ~280
`/oportunidades/` (um único modelo parametrizado, amostrado). A auditoria C1–C6
cobriu **52 rotas autorais lidas no HTML renderizado de produção**, uma a uma,
em 2026-09-08 sobre o SHA `234a061f1`. Resultado agregado: 262 achados, 108 de
gravidade alta. Falhas por dimensão: C3 entrega 28, C6 continuidade 24,
C2 trabalho 22, C5 confiança 22, C4 utilidade 7, C1 reconhecimento 5.
Achados por categoria: autossabotagem 85, jargão 64, generalidade-sem-entrega
41, b2g-exclusivo 22, promessa-destino-divergente 16, conteúdo-insuficiente 14,
exclusão-porte 10, alegação-sem-fundamento 7, demonstrativo-como-real 2.

Evidência bruta: transcrições em
`.claude/projects/.../subagents/workflows/wf_5d98a824-cd0/journal.jsonl`.

## Concluído (commitado neste PR)

1. **Entrega deixa de ser hipotética** — home e `/servicos/`. Sai "pode
   resultar em", "possíveis entregas", "conforme o escopo" repetido; entra o
   documento que sai da mesa, com o que contém.
2. **Bloco PNCP para de induzir o descarte por porte** — a comparação 1% do
   contrato × honorário sai dos três cartões; preços publicados aparecem uma
   vez, fora da comparação, com "atendemos contratos de qualquer porte".
3. **Identidade** — descrição `Organization` no JSON-LD e frase de rodapé em
   ~200 rotas deixam de dizer que a CONFENGE é consultoria de licitações.
4. **Segundo revisor** — sai o anúncio "Sem revisão independente: não há
   segundo revisor nomeado" de 17 rotas; os tokens negativos saem de
   `authority-matrix.json`.
5. **`/entregas/`** — a vitrine para de publicar o estado comercial interno
   ("44 em validação", "2 bloqueadas"). Estados seguem íntegros no registro.
6. **Primeiro contato** — sai "se temos capacidade de atender" de 170 rotas.
7. **Rótulo público B2G** — removido do texto visível das rotas autorais.

## Travas que exigiam o defeito, substituídas por propriedades corretas

- `scripts/site/test_home_real_contract_case.py` — exigia "1% deste contrato é
  R$ X" + faixas de honorário por cartão. Agora reprova percentual pareado com
  honorário e a **classe da paráfrase** ("ferramenta pública gratuita",
  "entrega de entrada", "fica abaixo do custo", "contratos assim"), que a trava
  literal `"neste porte" not in html` deixava passar.
- `tests/commercial/test_offer_fit_matrix.mjs` — exigia que 1% do contrato
  local ficasse ABAIXO do piso do dossiê.
- `data/site/authority-matrix.json` + `test_authority_contract.py` +
  `test_margin_cluster_inventory.mjs` — o slot de revisor era cumprido pela
  negativa; agora só pelo nome do responsável técnico.
- `test_task_doors.mjs`, `test_deliverables_registry.mjs`,
  `test_design_gates.py`, `test_truthful_gates.py` — exigiam os contadores de
  capacidade não vendável.

## Fora de escopo, deliberadamente

`build:site` refresca dados do PNCP e recria ~300 rotas de `/oportunidades/`.
No repositório, `sitemap-oportunidades.xml` é um stub que o build preenche, e
`PUBLIC-ARTIFACT-MANIFEST.json` registra nomes de rota. Como esta campanha não
cria nem remove rota, esses artefatos ficam na versão da `main`.

## Pendente

- **Contato**: `adaptive-intake-authority.json` está `WITHHELD` e `loadPin()`
  exige `status: FINAL` com pin e hashes reais mais quatro variáveis de
  ambiente casadas com Governance. **Não forçar READY, não inventar pin.**
  `/triagem-tecnica/` opera com três canais diretos contextualizados, que é o
  caminho sancionado. **Destino do e-mail comprovado**: `confenge.com.br` tem
  MX vivo (`mx1/mx2.hostinger.com`) e SPF `include:_spf.mail.hostinger.com`.
  **Destino do WhatsApp comprovado como endereço válido**: carregado em
  navegador (Playwright, 2026-09-08), `wa.me/5548988344559` redireciona para
  `api.whatsapp.com/send/?phone=5548988344559` e renderiza "Chat on WhatsApp
  with +55 48 98834-4559" com os links de conversa ativos, **sem** a tela de
  número inválido que o WhatsApp exibe para número não registrado. Isso prova
  que o número é um destino de conversa válido, sem enviar mensagem. **Não
  prova recebimento nem leitura**: nenhuma mensagem foi enviada, e abrir o app
  nunca seria prova de entrega.
- Achados remanescentes da auditoria por rota (blocos genéricos sem entrega em
  `/aditivos-obras-publicas/` e `/auditoria-orcamento-licitacao/`,
  "remunera método e artefato, não resultado" em
  `render_contract_defense_products.mjs`, `/entregas/` C1–C6, hubs).
- **Pré-existente, não desta campanha**: `test_margin_cluster_inventory.mjs`
  já falhava em `origin/main` intocada com
  `/conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/ missing Método`
  (verificado com `git stash`). Não está encadeado em `npm test`.
- Dívida de vocabulário registrada: 487 ocorrências em 158 rotas
  (`enquadramento` 148, `acervo` 111, `enquadrar` 79, `gate` 56, `artefato` 44,
  `aderência` 41). **Não zerar em lote**: em artigos de Lei 14.133,
  "enquadramento" é a classificação jurídica do aditivo, vocabulário do
  comprador, e §7 manda preservar. Triagem por ocorrência, com fundamento
  nomeado, não anistia por pasta.

## Reversão

`/opt/confenge-web/bin/rollback 234a061f111a446e89935ae69fa8217efadbff0e`

## Segundo lote (2026-09-08, tarde)

Auditoria C1–C6 sobre 52 rotas autorais servidas: 262 achados, 108 de gravidade
alta. Dez frentes editoriais sem sobreposição de arquivo trataram 200 achados em
47 rotas. Exemplos: "Limitação: não é parecer jurídico **e não valida o aditivo
concreto**" (negava o resultado central do serviço anunciado); "Se o edital é
trivial... um checklist interno basta" (mandava o visitante embora);
"A primeira análise serve para definir o problema e o formato de apoio adequado"
(repetida como próximo passo em várias páginas-pilar); rótulos epistêmicos em
inglês (FACT, CALCULATION, INFERENCE, UNKNOWN) impressos para o comprador.

### Três correções do integrador sobre o trabalho das frentes

1. Um agente trocou o vínculo de hash do canário 389 por um teste de formato.
   Isso apaga a proteção em vez de substituí-la: o hash ali é procedência.
   Vínculo restaurado, hash recapturado com razão escrita.
2. "Prova de cliente é publicada em categoria própria, com autorização do
   contratante" foi removida de `/confianca/` como se fosse autossabotagem. É a
   regra que separa modelo demonstrativo de trabalho contratado. Restaurada.
3. Capacidade de atendimento saiu de `/diagnostico-b2g-expansao/`. É condição
   material de contratação. Reposta afirmativamente, sem inventar vagas.

### Desacoplamento de datas (correção estrutural)

O gate do cluster de medição exigia CINCO superfícies na mesma data, incluindo
"Fontes consultadas em". Qualquer revisão de redação passava a exigir que a
página declarasse ter reconsultado a Lei 14.133 e os acórdãos do TCU naquele
dia. **Cumprir a trava exigiria publicar procedência falsa.** As âncoras foram
separadas: `CLUSTER_REVISION` move com o corpo; `SOURCES_CONSULTED_AT` só move
quando as fontes são reconsultadas, e agora reprova por si. Feito isso, o
caminho honesto ficou disponível: as quatro superfícies de revisão e o lastmod
passaram para 2026-09-08 nas seis páginas, as fingerprints foram recapturadas
pelo `--recapture` do próprio gate, e "Fontes consultadas em 29 de agosto de
2026" ficou onde estava, porque é verdade.

### Travas revogadas em definitivo (autorização do fundador, 2026-09-08)

Cada uma com comentário datado dizendo o que exigia, por que era o defeito e o
que passa a ser verificado. Verificadas empiricamente, não só pelo comentário:

| trava | substituída por |
| --- | --- |
| `refund_due` literal na página de termos (identificador de variável de API) | a regra de reembolso completa, em qualquer redação — verificado: está publicada em prosa portuguesa, com os quatro componentes |
| `"UNKNOWN" in html` no recorte SELECT-only (passava só porque o token sobrevivia dentro do JavaScript) | seção de limites visível com as famílias de evento pendentes nomeadas |
| `"revisão crítica independente"` exigida na sala de proposta | a etapa de revisão continua nomeada, **e** a alegação de revisor independente fica proibida sem revisor nomeado — a empresa não tem segundo revisor |
| `"Resultados de clientes"` como manchete obrigatória | `data-proof-state`, a condição de autorização, e a ausência de prova de cliente que não existe |
| lista fixa de destinos das cinco situações da home | cinco destinos distintos, todos resolvendo em arquivo existente, âncoras da triagem verificadas |
| contadores "44 em validação / 2 bloqueadas" | "Oito têm oferta publicada" + o estado interno não pode vazar para a vitrine |

### Gate que NÃO foi afrouxado

O gate de conversão é fail-closed: rota que exibe preço tem de capturar o lead.
Publicar as faixas de honorário na home a colocou no censo de rotas com preço,
sem contrato de captura persistida. Em vez de relaxar o gate, o preço segue
publicado por inteiro na página de cada oferta e a home leva até lá em um
clique. Verificado: a home saiu do censo e o gate segue fail-closed.

## Publicação (2026-09-09)

PR #644 mergeada como `4075e91c6`. O `netcup-release` concluiu com sucesso e a
promoção atômica publicou o release.

**Identidade conferida em produção:**
`/.well-known/build-info.json` -> `commit 4075e91c6…`, `environment production`,
`build_time 2026-09-09T03:43:20Z`.
`/.well-known/runtime-info.json` -> `release_sha 4075e91c6…`,
`profile netcup-production`, `host confenge-nginx-node/v2`.

**Conteúdo conferido no HTML servido** (não só no manifesto), em `/`, `/servicos/`,
`/entregas/`, `/triagem-tecnica/`, `/aditivos-obras-publicas/` e `/confianca/`:
18 de 19 verificações passaram na primeira medição. Sumiram da superfície pública
"o que não conseguimos fazer", "fica abaixo do custo do dossiê", "ferramenta
pública gratuita", "sem catálogo infinito", "Possíveis entregas", "Sem revisão
independente", "em validação", "bloqueada", "se temos capacidade de atender" e o
rótulo "Obras públicas e B2G". Apareceram "O trabalho termina em um documento
assinado", "qualquer porte", "O que você recebe", "compatibilização", "Oito têm
oferta publicada", "sob consulta", "Prova de cliente" e "Responsável técnico".

**A verificação em produção encontrou um defeito remanescente**, corrigido em
seguida: `/triagem-tecnica/` ainda dizia "Não prometemos prazo em dias porque
nunca medimos um". A substância é honesta e fica; a explicação de bastidor sai.
Corrigido em `scripts/site/render_authority_pages.py` (fonte) e nas duas rotas
que publicavam a frase. É o tipo de achado que só a leitura do HTML servido
produz, e a razão pela qual §4 exige trechos efetivamente renderizados.

## Estado final (2026-09-09)

**Releases publicados e conferidos:** `4075e91c6` (PR #644) e `c173461cc` (PR #645).
Ambos com `netcup-release` bem-sucedido e promoção atômica. Identidade conferida
no release final: `build-info` e `runtime-info` em `c173461cc`,
`environment production`, `profile netcup-production`,
`build_time 2026-09-09T04:30:13Z`.

**Conteúdo servido conferido**, 28 verificações sobre `/`, `/servicos/`,
`/entregas/`, `/triagem-tecnica/`, `/aditivos-obras-publicas/`, `/confianca/`,
`/problemas-que-resolvemos/` e `/especialista/tiago-jun-sasaki/`. Nenhum defeito
remanescente. Duas divergências investigadas e explicadas:

- `"conforme o escopo"` sobrevive UMA vez em `/servicos/`, na seção de fronteira:
  "a definição de responsável técnico, ART e eventuais registros ou vistos é feita
  conforme o escopo contratado, as atribuições profissionais e a jurisdição
  aplicável". É condição material dita uma vez, no lugar pertinente, que §6
  permite. O defeito era repeti-la em cada linha de entrega, e esse sumiu.
- `/problemas-que-resolvemos/` diz "Conhecer os serviços para obras públicas"
  (-> `/servicos-obras-publicas/`) mais "Outra situação: projeto, imóvel, perícia
  ou segurança do trabalho" (-> `/servicos/`). É a correção feita no gerador, que
  preserva a especialização da página e abre o caminho da marca inteira.

**Contato em produção:** formulário da home presente (`id="formulario-contato"`);
`/contato/` redireciona 301 para `/#contato`; WhatsApp e e-mail presentes em `/`
e em `/triagem-tecnica/`.

## Não verificado, explicitamente

- **Recebimento humano.** E-mail tem MX vivo e SPF; WhatsApp resolve para conversa
  válida sem envio. Nenhum dos dois prova que uma pessoa leu.
- **Intake adaptativo.** Segue `WITHHELD` por decisão de Governance. Não forçado.
- **Dívida de vocabulário.** 487 ocorrências em 158 rotas seguem registradas e
  contadas. Exige triagem por ocorrência: em artigos da Lei 14.133,
  "enquadramento" é vocabulário do comprador e §7 manda preservar.
- **`test_margin_cluster_inventory.mjs`** falha em `origin/main` intocada
  (`missing Método`), verificado com `git stash`. Não encadeado em `npm test`.
- **Efeito comercial.** Nenhum. Texto aprovado não prova conversão.

## Reversão

`/opt/confenge-web/bin/rollback 4075e91c6686d966fb64ed68d980e1efa15b1eb4`
