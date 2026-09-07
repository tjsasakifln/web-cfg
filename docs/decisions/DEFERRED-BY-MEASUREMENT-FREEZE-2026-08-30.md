# Itens adiados pela janela de medição (overhaul value-first, 2026-08-30)

**Contexto.** O overhaul value-first tocou toda a superfície comercial pública.
Seis rotas BOFU e quatro artefatos compartilhados estão sob janela de medição
de primeira dobra (issues #529 e #533, donos de janela #128 e #387). Mutação
agora invalidaria a medição em curso. A data mais próxima de liberação é
**2026-09-13**; a maturidade completa vai até 2026-10-25. Passagem de data,
sozinha, não autoriza: o dono da janela precisa liberar explicitamente.

## Rotas congeladas, não tocadas neste trabalho

- `/diagnostico-pre-licitacao/`
- `/auditoria-orcamento-licitacao/`
- `/medicoes-glosas-obras-publicas/`
- `/aditivos-obras-publicas/`
- `/reequilibrio-obras-publicas/`
- `/diagnostico-b2g-360/`

## Artefatos compartilhados congelados

`script.js`, `styles.css`, `styles-tokens.css`, `styles-tools.css`,
`js/modules/analytics.js`, `robots.txt`, os sitemaps, `_redirects` e
`data/organic/content-service-map.json`.

## Itens prontos, aguardando a liberação da janela

1. **Fallback de jornada no cliente.** `js/modules/nav.js` → `stageToJourney()`
   devolve `operacao` para entrada não classificada. O servidor
   (`netlify/functions/lib/lead-core.cjs` → `normalizeJourney()`) já foi
   corrigido para devolver `outro`, justamente para não rebaixar em silêncio um
   contrato urgente para a jornada de menor urgência. O cliente ainda não tem a
   correção porque `nav.js` só chega ao visitante através de `script.js`, que
   está congelado.
   **Impacto atual: baixo.** O valor que é persistido e que chega ao CRM vem do
   servidor, que já está correto. A divergência afeta apenas o destino da
   página de confirmação e o rótulo do evento no cliente.
   **Ação em 2026-09-13:** reverter para `return 'outro'` em `stageToJourney()`
   e trocar a coercao `const j = JOURNEY_ACTIONS[journeyId] ? journeyId : 'operacao'`
   por `'outro'` em `applyJourneyToForm()`, rodar
   `node scripts/site/build_script_modules.mjs --write` e recapturar a baseline
   dos frozen specs.

   A opcao "Outro" do formulario ja foi corrigida na fonte para
   `data-journey="outro"`. Hoje o efeito e nulo, porque o bundle congelado
   coage qualquer jornada fora de JOURNEY_ACTIONS para `operacao`; a correcao
   passa a valer sozinha assim que o bundle for reconstruido.

2. **`data-journey` em `/diagnostico-pre-licitacao/`.** A página não tem o
   atributo. O conteúdo, o próprio `next_action` e a classificação de família
   do frozen spec apontam todos para `edital`. O mapa de IA
   (`data/site/public-ia-map.json`) já foi corrigido para o pai
   `/bid-room-licitacoes-obras/`, porque isso não toca a rota congelada.
   **Ação em 2026-09-13:** marcar `data-journey="edital"` no `<body>` e no CTA,
   e reconciliar o breadcrumb visível, que hoje aponta para `/conteudos/`.

3. **Copy value-first das seis rotas congeladas.** ~~Adiado até 2026-09-13~~ —
   **PARCIALMENTE EXECUTADO em 2026-09-06**, nas duas rotas que publicavam a
   desqualificação por porte.

   **Decisão que supera o adiamento.** Direção comercial do fundador,
   2026-09-06: a desqualificação por porte, orçamento desconhecido,
   documentação organizada e a comparação entre perda hipotética e honorário
   estão **revogadas**. A data de 2026-09-13 deste documento não é mais o
   critério: uma regra de janela de medição não pode manter publicada
   exatamente a recusa que a direção revoga. O critério revogado é a espera;
   a **sequência técnica** registrada no item 4 continua obrigatória e foi
   seguida à risca.

   **Executado:** `/diagnostico-pre-licitacao/` e `/reequilibrio-obras-publicas/`.
   A copy passou a dizer qual formato serve, em vez de afirmar que a CONFENGE
   não é economicamente indicada. Os limites técnicos de mérito foram
   preservados na íntegra — sem ruptura documentável da equação original o
   pleito não se sustenta, e divergência já esclarecida com o fiscal não pede
   dossiê. Isso é limite sobre o mérito de um pleito, não sobre o porte de um
   cliente.

   **Ainda adiado:** as outras quatro rotas congeladas não foram reescritas.
   Elas não publicavam a recusa revogada, então continuam sob a janela e sob a
   liberação do dono (#128 e #387).

4. **As três ilustrações de ordem de grandeza da seção de mercado da home.**
   Os parágrafos `.evidence-illustration` abrem com "Conta ilustrativa, não é
   economia observada" e um deles fecha com "a CONFENGE não é economicamente
   indicada neste porte". As duas construções são defensivas e a reescrita já
   estava pronta ("Cálculo ilustrativo sobre o valor contratado" e, no lugar da
   auto-recusa, a recomendação útil de usar a biblioteca pública e as
   ferramentas gratuitas abaixo do piso de diagnóstico).

   **Por que não entrou agora.** Esse texto não é escrito no HTML: ele vive em
   `data/commercial/offer-fit-matrix.v1.json`, é compilado para
   `js/modules/offer-fit.js` e daí para `script.js`, que está congelado.
   `tests/commercial/test_offer_fit_copy.mjs` exige que a home contenha o texto
   da matriz literalmente, e `test_offer_fit_matrix.mjs` exige que o módulo do
   navegador seja gerado a partir dela. Mudar a frase obriga a reconstruir
   `script.js` e quebra a baseline dos frozen specs.

   **EXECUTADO em 2026-09-06**, pela mesma decisão registrada no item 3. A
   sequência abaixo foi cumprida na ordem exata, e a recaptura da baseline
   acompanha o commit da edição, como em `cf33385d4` e `2f26ac0ba`. O painel
   `local` deixou de fechar com a auto-recusa e passou a indicar o formato que
   serve abaixo do piso de diagnóstico; a âncora "Limite:" foi preservada,
   porque `test_offer_fit_matrix.mjs` exige os quatro âncoras da ilustração e
   ela declara um limite real — o percentual não é economia observada.

   **Ação original, cumprida:** trocar `home_illustrations[].copy` na matriz,
   rodar `node scripts/commercial/render_offer_fit_browser.mjs` (ou o gerador
   equivalente apontado por `expectedBrowserModule`), rodar
   `node scripts/site/build_script_modules.mjs --write`, recapturar a baseline
   e propagar o texto novo para o HTML da home.

   Todo o resto da seção de mercado já foi reescrito: o H2 deixou de ser uma
   negação sobre a própria CONFENGE, e a honestidade passou a ser provada por
   procedência (fonte e data de corte) em vez de autodesqualificação.

5. **A mensagem de erro do formulário.** `js/modules/form.js` mostra, quando o
   registro falha, a frase:

   > "Não foi possível registrar no servidor. Use o WhatsApp para não perder o
   > contato — o protocolo só aparece após gravação confirmada."

   Dois problemas. Ela abre pelo que falhou em vez de pelo que o visitante faz
   agora, e usa travessão, que a regra editorial da casa proíbe. O
   `scrub_em_dashes.py` não pega porque varre HTML público, não JavaScript, o
   que também é uma lacuna do próprio gate.

   **Por que não entrou agora.** `form.js` é compilado para `script.js`, que
   está congelado pela janela de medição.

   **Ação em 2026-09-13:** trocar por "O registro não foi concluído agora. Fale
   pelo WhatsApp para garantir o atendimento: o protocolo é emitido assim que a
   gravação confirma.", rodar `node scripts/site/build_script_modules.mjs --write`,
   recapturar a baseline e estender `scrub_em_dashes.py` para varrer também
   `js/modules/*.js`, para que a próxima travessão em copy de interface reprove
   sozinha.

6. **Bloco "Inteligência relacionada" de `/diagnostico-pre-licitacao/`.**
   ~~Adiado~~ — **EXECUTADO em 2026-09-01.** Este item deixa de ser uma
   pendência e passa a ser o registro de auditoria da mutação.

   Duas pendências no mesmo `<ul class="pillar-docs">`, ambas criadas pelo
   incidente P0 de copy e governança do pSEO (issue #566):

   - `<li><a href="/radar/edificacoes-publicas-pr/">` apontava para uma rota
     retirada do ar. A página foi reprovada pelo gate editorial
     (`status: reject`, `zero_used_for_missing_value=1`) e o
     `scripts/pseo/build.py` deixou de escrevê-la no diretório público. O link
     permanecia no HTML e passou a resolver em 404.
   - `<li><a href="/radar/">Radar evergreen de oportunidades</a></li>` usava
     "evergreen", metalinguagem de CMS que não deve chegar ao visitante. Era a
     última ocorrência do termo em toda a superfície pública.

   **Por que a mutação passou a ser obrigatória.** A neutralização pelo lado do
   destino não é suficiente. A dimensão `information-architecture` do
   `site-excellence` reprova em `internal-link-reachability` com
   `broken_internal_link` para `/radar/edificacoes-publicas-pr/`, e essa
   verificação não tem caminho de exceção: `data/quality/site-excellence.v1.json`
   admite só `MEASURED_PASS`, `MEASURED_FAIL` e `BLOCKED_EXTERNAL`, com
   `measured_fail_blocks_ci: true`, e `_metric_result` reprova sempre que existe
   qualquer código. `BLOCKED_EXTERNAL` está reservado ao que nenhum PR de código
   consegue limpar, o que não é o caso aqui. Não existia forma de tirar a página
   reprovada do ar e manter o `site-ci` verde sem tirar o link.

   **Por que isso não fere o congelamento.** É a mesma operação já mergeada em
   `cf33385d4` (2026-08-28) e `2f26ac0ba` (2026-08-25): os dois editaram
   exatamente esta página congelada e recapturaram a baseline no mesmo commit,
   com `html_mutation_authorized: false` e `earliest_safe_action_at: 2026-09-16`
   em vigor. O que aquele campo governa é a aplicação do patch da campanha #291
   (`apply_frozen_patch` e o bloco gerado por `render_licitacao_products.mjs`),
   que continua recusada: `render_licitacao_products.mjs --check` imprime
   `LICITACAO_PRODUCTS_HELD` com o hash novo. `html_mutation` continua `false` e
   nenhuma precondição do `unlock-plan.v1.json` foi marcada `READY`.

   **O que mudou, exatamente.** Duas linhas, dentro do mesmo
   `<ul class="pillar-docs">` da seção `id="inteligencia-relacionada"`, que fica
   abaixo da FAQ:

   ```
   - <li><a href="/radar/edificacoes-publicas-pr/">Radar de edificações públicas no Paraná</a></li>
   - <li><a href="/radar/">Radar evergreen de oportunidades</a></li>
   + <li><a href="/radar/">Radar de oportunidades abertas</a></li>
   ```

   O `content-hero` e o bloco entre os marcadores
   `GENERATED:LICITACAO-PRODUCTS` estão byte-idênticos.
   `data/commercial/first-fold-measurements.v1.json` registra só a geometria dos
   papéis do herói (`eyebrow`, `h1`, `lead`, `cta`) nos três viewports, todos
   acima da seção alterada, então a medição em curso não foi invalidada.

   **Recaptura.** `b5828ec2…` → `fbfb0ee3…` em quatro arquivos, o mesmo conjunto
   de `cf33385d4`: `hashes.json` (`forbidden`, com `recapture_reason` escrito),
   `snapshots.json` (hash e `bytes`), `specs/diagnostico-pre-licitacao.json`
   (só o hash) e `patches/diagnostico-pre-licitacao.patch.txt` (só o hash).
   `pillars` não foi tocado, como nos precedentes: ele guarda a baseline
   anterior de propósito.

   **Limpeza que o próprio incidente exigia.** `FROZEN_COPY_EXCEPTIONS` em
   `scripts/pseo/tests/test_geo_locale_and_reject_withdrawal.py` está vazio, e
   `test_frozen_route_exceptions_are_still_the_only_ones_outstanding` foi quem
   cobrou a remoção. No lugar da exceção entrou
   `test_no_cms_metalanguage_anywhere_on_the_visitor_surface`, que varre toda a
   superfície visível — não só as páginas geradas — para que "evergreen" não
   volte por HTML escrito à mão, que foi exatamente como esta ocorrência
   sobreviveu.
