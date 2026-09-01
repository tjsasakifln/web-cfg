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

3. **Copy value-first das seis rotas congeladas.** O inventário de linguagem
   defensiva foi levantado, mas nenhuma das seis foi reescrita.
   **Ação em 2026-09-13:** aplicar a mesma lei editorial já aplicada ao resto
   da superfície comercial.

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

   **Ação em 2026-09-13:** trocar `home_illustrations[].copy` na matriz,
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
   Duas pendências no mesmo `<ul class="pillar-docs">`, ambas criadas pelo
   incidente P0 de copy e governança do pSEO (issue #566):

   - `<li><a href="/radar/edificacoes-publicas-pr/">` aponta para uma rota que
     passou a ser retirada do ar. A página foi reprovada pelo gate editorial
     (`status: reject`) e o `scripts/pseo/build.py` deixou de escrevê-la no
     diretório público. O link permanece no HTML e passa a resolver em 404.
   - `<li><a href="/radar/">Radar evergreen de oportunidades</a></li>` usa
     "evergreen", metalinguagem de CMS que não deve chegar ao visitante. É a
     última ocorrência do termo em toda a superfície pública.

   **Por que não entrou agora.** A rota está entre as seis congeladas pela
   janela de medição de primeira dobra (#529 e #533). O incidente foi
   neutralizado pelo lado do destino — a página reprovada deixou de ser
   servida, que era o risco real — e não pela mutação da rota medida. O
   `_pseo_reject_pages_not_public` em `scripts/site/inbound_gates.py` reporta
   o link como `warn` enquanto o arquivo estiver em `FROZEN_HTML_REL`, e o
   `test_frozen_route_exceptions_are_still_the_only_ones_outstanding` falha
   quando a exceção deixar de ser necessária, para que ela não sobreviva à
   janela por esquecimento.

   **Ação em 2026-09-13:** remover o `<li>` do radar reprovado, trocar o rótulo
   do hub para "Radar de oportunidades abertas", rodar `npm run inbound:gates`
   (o achado `warn` deve desaparecer) e apagar
   `diagnostico-pre-licitacao/index.html` de `FROZEN_COPY_EXCEPTIONS` em
   `scripts/pseo/tests/test_geo_locale_and_reject_withdrawal.py`, que passa a
   exigir a limpeza sozinho.
