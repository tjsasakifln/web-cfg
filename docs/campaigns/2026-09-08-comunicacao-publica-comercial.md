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

Correção do controle de publicação identificada no candidato `dab32b69`:
a montagem final atualizava os hashes CSP em `_site/_headers`, enquanto a
configuração canônica do Nginx consumia `_headers` da raiz, ainda anterior às
transformações finais. O build agora executa o comando existente `csp:refresh`
entre a montagem e a última geração do contrato do host. A contraprova falhou
antes da correção e passou depois; o teste exige essa ordem. Nenhuma diretiva
de segurança foi relaxada. No artefato de 217 HTML, o contrato e o navegador
passaram (sete rotas, zero violações, estilo inline não autorizado bloqueado).
Esse checkpoint não é declaração de publicação; o fluxo obrigatório repete
os controles no candidato integrado.

Revogações em execução (contraprovas locais; o candidato integrado e o artefato
final ainda precisam dos checks e da publicação):

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

### Fechamento da fonte e endurecimento de release (09/09, ainda não publicado)

Fechamento dos controles de 09/09: 45 testes do controlador de release,
15 do aceite HTTP e 31 contraprovas de cobertura passaram. A rodada integrada
de runner, workflow, aceite HTTP e mídia passou em 40 testes. Essas execuções
locais não substituem a execução no candidato integrado. O ledger
`metadata/files.sha256` deve ser byte-idêntico ao membro do tar validado;
o host também confere o digest recebido contra o digest verificado no runner.
Rollback compensador exige o candidato ainda ativo sob lock; uma repetição
do workflow preserva o predecessor real como destino de recuperação.

As quatro imagens corrigidas recebem referências `?v=<sha256 dos bytes>`
somente na finalização do artefato, antes do manifesto de integridade. Duas
execuções sobre a mesma cópia produziram bytes idênticos: 236 referências em
192 arquivos. Isso evita reutilizar imagens antigas do cache do navegador.
Os arquivos físicos legados são preservados e precisam de conferência/purga
de cache após a promoção; nenhuma URL nova foi requisitada em produção antes
de haver os bytes correspondentes. A credencial Cloudflare existente reconhece
a zona, mas a permissão de purga ainda não foi exercida nem presumida.

Checkpoint de fonte `3ec50a67ab77bb335567c2b497a6fbb7f81ef196`:
varredura ampliada encontrou inicialmente 198 defeitos em 154 rotas
(170 apresentações autorais de B2G, 27 de Hub e uma de SLA), incluindo
`jobTitle` e arrays de JSON-LD. Depois da correção na origem: 303 ocorrências
contextuais legítimas em 114 rotas e zero defeitos nesse detector. Os números
não são aditivos aos de outros scanners. Fontes e testes preservam siglas
definidas tecnicamente, chaves/URLs internas e nomes externos transcritos.

A primeira dobra foi medida novamente em um checkout isolado **limpo** desse
checkpoint: **25/25 rotas PASS, zero FAIL/PENDING**. A evidência registra 49
entradas de conteúdo, scripts, CSS/fontes e controles; o teste recusa árvore
suja, conteúdo divergente e evidência de commit não ancestral. A medição
equivalente no artefato final é um step separado e obrigatório no site-ci,
com upload obrigatório; remover o comando reprova o teste do workflow.
Isso substitui a medição intermediária de 23/25 abaixo, sem apagar seu histórico.

A revisão adversarial encontrou e orientou a correção destes controles:

| Regra/defeito anterior | Proteção preservada | Substituição e contraprova |
| --- | --- | --- |
| 410 não forçado cedia a arquivo existente | Retirada exata, sem redirect à home | Contrato/nginx tornam `gone` terminal; E2E semeia arquivo em cópia descartável, exige 410 e ausência do texto, sem alterar o artefato |
| Qualquer rota sob oportunidades era overlay autorizado | Snapshot aceito pelo owner, hashes e promoção atômica | Manifesto identifica IDs/caminhos/digests exatos; rota inventada sob o mesmo prefixo reprova; compatibilidade legada usa estado privado fora do release |
| Aprovação ativa declarava visibilidade de revisor inexistente | Autoria, fontes, limites e hashes materiais | Checklist 2.0 separa autor/método e consistência da representação do revisor; dez predicados são recalculados; false, chave antiga e schema ausente reprovam; 219 testes passaram |
| Controlador instalado uma vez não recebia correções do pacote | Conta de deploy e sudo restrito existentes | Workflow usa controlador do mesmo bundle verificado, igual ao checkout, com hash conferido antes de executar; drift local/remoto de um byte reprova; stage/verify/promote por streaming testados |
| Execução automática/manual tinha locks distintos | Proteções de branch e ambientes mantidas | Uma fila canônica e predecessor conferido sob lock do host; promoção superada reprova; rollback intencional continua disponível |

O host foi consultado somente para leitura: controlador root instalado com
SHA-256 `7f43f3d488dacf802c412d44093bc241d671b3a8cb540ccc7e01b5587962bd1c`;
snapshot oficial gerado em `2026-09-04T00:46:51+00:00`, fonte de
`2026-09-03T16:10:59+00:00`, vencido na data desta revisão. A indisponibilidade
retira detalhes e descoberta de oportunidades, mantendo hub informativo com
contato contextual; não renova a fonte nem inventa estado atual. O novo fluxo
concilia inventário independente do host, todos os HTML obtidos por URLs
normais, digests e scanner, além de Lighthouse ou retirada comprovada. Falha
material pós-promoção aciona rollback do predecessor pelo mesmo controlador,
sem substituir uma publicação concorrente ou tocar pedidos.

Evidência local: `/tmp/confenge-commercial-20260909.zaPcn3/`, arquivos
`source-3ec-first-fold.log`, `first-fold-source-bound-tests.log`,
`bundle-controller-tests.log`, `netcup-final-control-tests.log` e
`workflow-bound-full-release.log`; varreduras léxicas em
`/tmp/confenge-lexical-before.json` e `/tmp/confenge-lexical-after.json`.
São checkpoints reais, não aceite do SHA integrado/servido. Evidência final
será vinculada ao run de publicação sem novo merge apenas para declarar término.

Compatibilidade exercitada também contra cópias reais do current `54b51438…`
e rollback `c173461c…`: os quatro diretórios release/incoming coincidiram com
o host em contagem e hash agregado. Cada release manteve seus 1.091 arquivos
byte a byte; os envelopes e 300 rotas aceitas passaram na verificação nova,
com manifesto externo ao docroot. Evidência em
`/tmp/confenge-legacy-compat.I5hsNZ` e `/tmp/confenge-legacy-seal-fresh.EP7O1E`.
Nenhuma mutação no host foi feita nesse ensaio. O hash da home obtida por URL
normal também coincidiu com o arquivo do host. O edge respondeu `HIT`, idade
272 segundos, apesar do `no-cache` da origem; o aceite deve respeitar o TTL
de 300 segundos já documentado, registrar propagação e continuar reprovando
qualquer digest divergente, sem aceitar HTML antigo como versão nova.

### Evidências da retomada de 09/09 (candidato ainda não publicado)

O inventário anterior independente foi concluído: **551/551 HTML obtidos por
URLs públicas normais, 551 respostas 200, zero falhas e zero exclusões**. Frente
ao pacote atestado de 255 HTML, o stage autorizado adicionava 300 páginas de
oportunidades e retirava quatro; nenhuma diferença de rota sem autoridade foi
encontrada. Aplicados os novos controles ao retrato anterior, houve sete rotas
com defeitos de redação, quatro com falhas semânticas e 113 ocorrências de
vocabulário de controle em 32 rotas. Isso substitui os números históricos como
comparação desta execução; não soma contagens de detectores diferentes.

Arquivos de execução locais estão em
`/tmp/confenge-commercial-20260909.zaPcn3/`: `public-surface-before.json`,
`production-http-before-all-report.json`, `production-html-before.txt` e o
espelho `production-http-before-all/`. O aceite final deve vincular os mesmos
controles ao pacote e ao servidor novos. Estes arquivos preliminares não são
certificação do release final.

Complementos de fonte e contraprovas:

| Regra ou defeito anterior | Propriedade legítima preservada | Substituição, arquivos e contraprova |
| --- | --- | --- |
| Congelamento BOFU até 16/09 ou nova medição (#533) | Integridade de bytes, experimento histórico e verdade dos termos | `frozen_specs/hashing.py`, `materialize.py`, `unlock-plan.v1.json`: correção comercial autorizada exige leitura renderizada, recaptura real e gates; os patches experimentais históricos não são automaticamente autorizados. Divergência real continua reprovando. |
| Rol público de 54 capacidades, estados e contadores | Cadastro interno completo e nenhuma promoção de oferta pendente | `deliverables-registry.v1.json`, `task-doors.v1.json`, `render_public_catalog.mjs` e testes comerciais/UI: 54 registros internos, oito ofertas publicadas; projetos, revisão, compatibilização e orçamento têm explicação e destinos. Testes não exigem census no comprador. |
| Todo o hub, preço e crédito rotulados sintéticos | Exemplo não pode virar cliente nem resultado real | `real_proof_registry.mjs`, registro de prova, gerador do catálogo e testes: aviso ligado ao modelo e acesso correspondente, separado das condições verdadeiras. Mutação com cliente inventado ou preço rotulado sintético reprova. |
| Segundo revisor como presença obrigatória ou déficit anunciado | Autoria responsável, fontes, cálculos, limites e correção | Política editorial 1.3 e `authority.py`: revisor distinto só se existe. Versões 1.0–1.2 preservadas. Separação de blocos impede concatenar “avaliação” e item “04” como nota de cliente; contraprova mantém reprovação de nota real sem base. |
| Cinco fixtures publicadas em noindex | Aprovação técnica real e preservação do trabalho interno | `public-route-decisions.json`, gerador de análises e `_redirects`: cinco decisões exatas de retirada, aliases 410 e hashes internos; apenas uma análise aprovada mais hub são gerados. Rascunho reintroduzido reprova. |
| Família de análises ausente do build completo/sitemap | Mesma cadeia de aprovação no pacote efetivo | `build_site.py` chama o gerador offline com `official-live-01`; duas execuções isoladas com o mesmo relógio comparam todos os bytes. A aprovação existente não é nova revisão profissional. |
| Página de obrigado afirmava recebimento/pagamento por acesso direto | Recibo persistido não se confunde com clique ou leitura humana | Quatro `obrigado*.html` exigem referência coerente com a sessão criada após sucesso; retorno de pagamento continua pendente. Fixtures de browser distinguem acesso direto, query isolada, sessão divergente e sessão correspondente. |
| CTA da análise de mercado circulava entre duas âncoras | Dado útil sem formulário compulsório | `market_answers/render.py`: canal contextual real; teste rejeita ciclo e confere mensagem/canonical. Clique não é recebimento. Validade de 48 horas, expiração e fonte original conservadas; página vencida permanece noindex. |
| Inglês operacional nos downloads e quatro capas | Método, limitações, direitos de uso e identidade verdadeira | Geradores `data_desk`, textos e metadados do pacote são revisados sem mudar estatística/data; capas corrigidas com imagegen integrado, sem inventar credenciais. Fontes/prompts em `data/site/commercial-media/source.json`; encoding em `encode_commercial_media.mjs`. |
| Job agregado podia esconder teste pulado | Proteções existentes da branch e execução real | `site-ci.yml` + verificador de execução: `site-ci` depende de validação e evidência dos steps; skipped/neutral/missing/empty obrigatórios reprovam. Nenhuma proteção foi desabilitada. |
| “Atendimento nacional” como selo incondicional no shell | Alcance nacional continua condicionado à viabilidade técnica e profissional real | `public_ia.py`, `html_shell.py` e `test_public_ia.py`: o rodapé agora condiciona atendimento a escopo, local e modalidade/vistoria/campo. A contraprova focal executada em 09/09 passou (1 teste); registro profissional, ART, logística e atribuições continuam verificações materiais, não slogans. |
| Congelamento ou contagem histórica aprovava primeira dobra sem medir o candidato | Integridade do contrato visual e os mesmos papéis de conteúdo em 390×844 e 1366×768 | `first_fold_rules.mjs`, `measure_first_fold.mjs`, contrato e teste: EXECUTE_NOW revoga a espera editorial, mas exige medição nova. O checkpoint de fonte de 09/09 mediu 25 rotas: 23 PASS e 2 FAIL (`/` e `/aditivos-obras-publicas/`); `test:first-fold-contract` recusou aprovação. A medição final deve ser refeita no artefato integrado, com SHA e identidade, depois das correções. |
| `noindex`, `Disallow` ou catálogo `DEFER` tratados como autorização para publicar previews | Fontes, travas financeiras, revisão real e overlay oficial permanecem preservados | `public-preview-route-decisions.json`, `public_artifact.py`, `_redirects` e testes: 24 fontes piloto, cinco fixtures de oportunidade, dois panoramas, o review/TXT de `/ops/` e o pacote editorial de preview ficam fora de produção; piloto/panorama e aliases definidos respondem 410, enquanto o pacote `editorial-review-packet.json` é omitido apenas em produção e deve responder 404. Overlay `official_live`, shell `/ops/`, build-info e runtime-info permanecem. |
| Qualquer `acervo`/`enquadramento` fora de poucos padrões era legitimado por fallback; estado JS só era lido quando literal direto no sink | Termos técnicos verdadeiros e chaves internas de dados continuam permitidos | `test_public_control_vocabulary.py`, `test_self_deprecating_copy.py` e `public_surface_coverage.py`: legitimidade exige contexto técnico material na própria composição; 303 ocorrências em 114 rotas foram classificadas, com 303 legítimas e zero defeitos no retrato corrente. Declaração JS literal local usada em sink visível também entra no scanner. Seeds reprovam pendência, valorização fabricada, enquadramento comercial e `proof_state: DRAFT`; chave `as_of` em JSON interno e UI portuguesa legítima passam. O controle declara que não interpreta JavaScript arbitrário. |
| O Radar publicava metadados e uma tabela de seis recortes “em preparação”, e seu contrato/teste exigia esse inventário de pendências | Limites honestos, método reproduzível, números GSC reais, janela, denominador e nenhuma estimativa nacional inventada | `radar/`, `metodologia-inteligencia/`, `public-family-registry.json`, `pseo/build.py` e `test_public_sample.py`: a página agora explica como usar a demanda observada e como o recorte empresarial é configurado, sem promover série inexistente. O teste preserva fonte, datas, denominador, downloads e canonical, e reprova a volta de vitrine de maturidade; o scanner semeia a paráfrase conhecida. |
| A política de privacidade apresentava a ausência de cargo formal como mensagem institucional | Canal real, direitos, retenção e responsabilidades de privacidade permanecem explícitos | `test_self_deprecating_copy.py` reprova a paráfrase de ausência de cargo e aceita como contraprova a identificação direta do canal e dos pedidos atendidos, sem inventar encarregado. |
| Censo de logos congelado sobre coletor que incluía árvores internas | Hash, proporção e presença por elemento continuam exatos; ausência de master aprovada não é inventada | `logo-contract.v1.json` e `test_logo_contract.mjs`: recontagem real do universo-fonte público encontrou 216 HTML, 416 imagens de logo, 213 lockups de cabeçalho e 203 de rodapé; 3.926/3.926 checks passaram. O registro continua honesto: raster legado retido, master SVG ausente e entrega SVG de produção bloqueada à espera da arte do fundador. |

Checkpoint dos controles desta rodada em 09/09, ainda pré-publicação:

- `python3 -m pytest -q scripts/pseo/tests/test_public_preview_retirement.py`:
  3 testes passaram; fonte do pacote editorial continua presente e a omissão é
  estritamente `production`.
- `python3 scripts/site/public_surface_coverage.py --fixture matching`: 27
  contratos de mutação passaram no mesmo caminho do gate completo.
- `python3 scripts/site/test_self_deprecating_copy.py`: zero rotas e zero
  ocorrências no universo-fonte público corrente.
- `node tests/brand/test_logo_contract.mjs`: 3.926/3.926 checks passaram, com a
  observação medida acima.
- `node tests/commercial/test_first_fold_contract.mjs`: reprovou o checkpoint
  com duas falhas medidas e uma inconsistência de derivação já identificada;
  portanto esta evidência não aprova publicação. O aceite exige nova execução
  no artefato integrado e zero falhas.

Esses resultados não são SHA servido, não comprovam cache público e não
substituem os checks protegidos, a promoção Netcup nem a verificação HTTP final.

A leitura de imagens examinou por OCR 145/145 JPG/PNG/WebP, sem falha de
execução, e identificou quatro defeitos (imagem corporativa, especialista e
dois artigos). As demais capas tratam de situações técnicas específicas;
“obras públicas”, limites legais e siglas técnicas nesses contextos são
legítimos. Os três AVIF restantes são variantes do retrato, com origem no PNG
registrado, não peças com texto. OCR não é alegação de cobertura semântica
universal. Texto final das quatro capas foi inspecionado visualmente pelo
agente integrador; logo e pessoa não representam cliente nem nova credencial.

Pré-condições do probe de recebimento verificadas por consulta autenticada:
credenciais existentes, contrato READY, destino WARMBLY_PRODUCTION_V1,
auto_send_off=true e dispatch_attempted=false. Nenhum POST foi feito nessa
consulta. A prova sintética final deve testar persistência/idempotência e
destino sem disparos, não alegar leitura humana.

### Retrato histórico de 08/09

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
