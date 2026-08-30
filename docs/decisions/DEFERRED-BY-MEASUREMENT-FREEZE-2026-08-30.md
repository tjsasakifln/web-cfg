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
   e em `applyJourneyToForm()`, rodar `node scripts/site/build_script_modules.mjs --write`
   e recapturar a baseline dos frozen specs.

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
