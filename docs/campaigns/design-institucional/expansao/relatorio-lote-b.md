# Lote B — obras públicas: hubs, pilares, páginas B2G secundárias e exemplos

Campanha CONFENGE-SALTO-INSTITUCIONAL-02-EXPANSAO-PRODUCAO · ramo `campaign/salto-02/lote-b` ·
worktree `.worktrees/salto-02-lote-b` · porta de pré-visualização 8742 · direção: a do piloto
(`estado.json#design_contract`, referência `medicoes-glosas-obras-publicas/index.html`).

Entregas: `matriz-lote-b.json`, `assets-lote-b.json`, `pedidos-lote-b.md`, este relatório e
`evidence/lote-b/*.jpg` (390×844 e 1440×1000, dobra e página inteira, menu em 390; 320 px sem
rolagem horizontal em todas as rotas, `manifest-lote-b.json`).

## 1. Resumo

| Tratamento | Rotas |
| --- | --- |
| COMPOSICAO_REDESENHADA (9) | `/aditivos-obras-publicas/`, `/auditoria-orcamento-licitacao/`, `/diagnostico-pre-licitacao/`, `/reequilibrio-obras-publicas/`, `/diagnostico-b2g-360/`, `/servicos-obras-publicas/`, `/problemas-que-resolvemos/`, `/casos/aditivo-art125-demonstrativo/`, `/casos/medicao-glosa-demonstrativo/` |
| COMPONENTES_ADEQUADOS (4) | `/diretoria-b2g/`, `/bid-room-licitacoes-obras/`, `/diagnostico-b2g-expansao/`, `/conflitos/` |
| PRESERVADA_COM_JUSTIFICATIVA (7) | `/defesa-margem-contratos-publicos/` (só o estilo inline saiu), `/defesa-tecnica-contratos-publicos/`, `/acompanhamento-contratos-obras/`, `/atrasos-prorrogacao-obras-publicas/`, `/diagnostico-b2g-expansao/{obrigado,expirado,cancelado}/` |

Pranchas novas (família `scripts/demonstrative/plates/family_b2g.py`, JSON em
`data/demonstrative/plates/`): P5 `aditivo-limite`, P6 `orcamento-comparativo`, P7
`carteira-eventos`, P8 `edital-checklist`, P9 `reequilibrio-curva` (desktop 1200×560 e móvel
360×420, composições distintas; todo numeral vem do JSON; ≤ 8,4 KB cada). P3 `medicao-parede`
reutilizada como abertura do hub de obras públicas. Registro e hashes em `assets-lote-b.json`.

Protegido e conferido contra a base `47da03b64` nas cinco rotas de pilar: `<section id="captura-pilar">`
byte-idêntica (formulário `pillar-capture-form` incluído), JSON-LD idêntico, `<head>` idêntico salvo
a linha `assets/editorial.css`; nenhum par `data-*` perdido em 12 das 13 rotas editadas (a exceção
é `data-commercial-bridge="1"` em `/diagnostico-b2g-360/`, substituição deliberada descrita em §2.5).

## 2. O que mudou, por rota

### 2.1 Cinco pilares B2G (modelo `medicoes-glosas-obras-publicas/index.html`)

Esqueleto aplicado nos cinco: breadcrumbs → `section.svc-open` (kicker, `h1.t-service`, lead =
necessidade, ação dominante `button-primary` → `#captura-pilar`, WhatsApp como alternativa,
linha de prova, `dl.svc-chain` Trabalho / Entrega nomeada / Limite com "empresa contratada" e
"órgão público contratante") → `nav.page-index` (seis entradas; a quinta é "Biblioteca", não
"NN Guias", porque `inbound_gates.pillar_guide_count_findings` lê "05 Guias" como contagem) →
`sec--soft` "Exemplo demonstrativo" com `figure.plate.plate--dominant` (slot `<!-- plate:<id> -->`
materializado por `inline.py`, `loading="lazy"`) e legenda com o rótulo → entrega nomeada (com
"sem o conjunto completo") → chamada inline de próximo passo (`contact-primary` + `contact-alt`) →
"Quando pedir" com `p#quando-nao-contratar[data-when-not-hire]` → quatro recortes em `ol.steps` →
"Entradas e erros" em `grid-2` (+ `aside.lead-inline` original quando a página o tinha: único
bloco escuro) → guias como índice regrado (`library-item` com `data-content-item`, `data-cluster`,
`data-search` e os mesmos hrefs) + leitura de mercado nomeada como dado público → `div.conditions`
"Dúvidas, condições e limites" (as três perguntas do FAQPage, visíveis com o mesmo texto, mais a
ponte `data-cta-position="pillar_bridge"` para a oferta recorrente) → `#captura-pilar` intacto →
`authority-method` (P3: `Encontrou um erro?</a>.` → sem o ponto; rodapé completo com
`footer-authority`, como as demais rotas; `shell_nav --check` passa).

- `/aditivos-obras-publicas/`: H1 mantido; prancha P5; frases exigidas por `test_inb08_owned_routes`
  preservadas (alteração, quantificação, não previsto, contemporâneo, "não é reajuste",
  reequilíbrio, "direito automático", "Dossiê de Aditivo e Serviço Extra", guia de jogo de planilha,
  "esta página não inventa percentual"); `lead-inline[data-organic-tool]` com os dois verificadores.
- `/auditoria-orcamento-licitacao/`: prancha P6; pergunta do FAQ mantida com o texto exato do
  JSON-LD ("orçamento e bdi?", `html_integrity` compara à letra); `data-organic-taya` preservado no
  parágrafo de limite; conteúdo "O que perguntam antes de contratar" consolidado em condições.
- `/diagnostico-pre-licitacao/`: prancha P8; "acervo" passou a "acervo técnico" no h2 e no passo
  (gate de vocabulário de controle); `data-offer-fit` mantido no parágrafo de limite; sem bloco
  escuro (a página não tinha `lead-inline` e o diagnóstico de contrato não pertence a edital).
- `/reequilibrio-obras-publicas/`: prancha P9; "Resposta direta" (`#resposta`) mantida como
  segunda seção com os três guias de apoio em `ol.steps`; `lead-inline` original preservado.
- `/diagnostico-b2g-360/` (pilar em forma de oferta): prancha P7; `header.offer-hero` virou
  `section.svc-open` mantendo `authority-byline`, `hero-proof`, "30 a 45 min", "Plano executivo de
  90 dias", atributos `data-offer-id/cta-position/event-name/journey`, `data-offer-section` em seis
  seções (`example, scope, docs, maturity, deliverables, raci, fit`), "Responsabilidades",
  "Solicitar diagnóstico da operação", sem `R$ <dígito>` (o exemplo escreve "12,5 milhões de reais")
  e sem travessão; a legenda declara "nenhum deles é contrato de cliente" (gate de prova real);
  cartões relacionados e `commercial-bridge` viraram a linha `pillar_bridge` em condições.

### 2.2 Hubs (`/servicos-obras-publicas/`, `/problemas-que-resolvemos/`)

Os dois hubs são gerados por `scripts/site/render_nav_hubs.py` ("never hand-edited"; `test:nav`
reprova qualquer edição manual, verificado com uma linha). A composição do piloto foi portada para
o gerador: `svc-open` em uma coluna com a rota dominante original (`lead-inline` com o mesmo
botão `data-cta-id="hub-servicos-medicoes-glosas"` / `hub-problemas-defesa-margem`, exigidos por
`single-commercial-route.v1.json` e `test_inbound_gates`; a linha de prova `section-proof` vem logo
depois do cartão, para o botão caber na dobra de 390), `page-index`, prancha de abertura
(P3 no hub de serviços, P5 no de problemas), `ol.list-ruled.list-ruled--areas` por evento
contratual (grupo = situação + trabalho; linha = título/preço publicado/caminho), `ol.hub-list` para
"Outras necessidades", `fit-economico` mantido (`data-offer-fit`), próximo passo único
(`contact-primary` com o WhatsApp `hub_*_next` e as alternativas em texto). `_document` inclui
`assets/editorial.css` e materializa os slots de prancha via `scripts.demonstrative.plates.inline.render`,
para que `render_nav_hubs --check` e `inline --check` concordem. `brand.json`, `shell_nav.py`,
`html_shell.py` e o bloco `GENERATED:CONTRACT-DEFENSE-HUB` (formulário `#captura-contrato`)
não foram tocados. Números de mercado (PNCP) não entram nestes hubs; o conteúdo de mercado das
páginas de pilar fica confinado numa linha `t-caption` nomeada "dados públicos, sem caso de cliente".

### 2.3 Exemplos (`/casos/aditivo-art125-demonstrativo/`, `/casos/medicao-glosa-demonstrativo/`)

Modelo do exemplo do piloto: `svc-open` com `p.case-badge[data-permission-class="demonstrativo"]`
(texto original), `h1.t-service`, `authority-byline` original, `svc-chain` Necessidade / Trabalho /
Documento, `page-index`; Entrada → Raciocínio (`ol.steps`, `id="metodo"`, contrato `caso_proof`) →
tabela nova em `div.table-scroll` + `table.data-table` (caption, `th.num`, linha em foco) +
`p.table-hint`, com os mesmos números hipotéticos já publicados → Utilidade com `div.conditions`
"Limitação" → `sec--dark` "Onde a CONFENGE entra" com o mesmo `button-primary` (`/#contato`,
`data-journey="contrato"`) e as alternativas originais. O `style="padding:…"` do `<main>` saiu.

### 2.4 Páginas de oferta e secundárias (COMPONENTES_ADEQUADOS)

`/diretoria-b2g/`, `/bid-room-licitacoes-obras/`, `/diagnostico-b2g-expansao/`, `/conflitos/`:
`assets/editorial.css`, `nav.page-index` logo após o `header.content-hero` (ids adicionados só
onde a seção não tinha), `style="max-width:…"` → `.measure`/`.narrow`, `style="margin-top"` da
grade relacionada removido. Nada de oferta, preço, condição, `offer-context`, `offer-detail-disclosure`,
`<details>`, formulário ou atributo mudou (`test_jobs_parity_attrs::test_hash153_attributes_preserved`
passa). `/defesa-margem-contratos-publicos/` só perdeu o estilo inline: as quatro rotas da área
safe-execution não aceitam folha fora de `/styles*.css` (§4, pedido 2).

`/diretoria-b2g/` (gate de Lighthouse): folha editorial = 7.247 B transferidos (38.261 B brutos).
Medição de laboratório com o runner do repositório (`run_lighthouse.mjs --runs=1 --label=lote-b-diag`,
diagnóstico, Chromium 1234, `LH_PORT=8768`, árvore fonte): performance 100, LCP 1.805 ms
(teto 2.000), CLS 0, DOM 497 (teto 800), `content_byte_weight` 145.243 B (teto 153.600 B),
11 pedidos (html 10.271, fonte 60.257, styles.css 22.769, editorial.css 7.247, styles-offers.css
2.716, script.js 24.537, logo 10.797, tokens 1.461, manifest/ícones 7.481). `styles-offers.css`
continua necessária (ordena o `offer-hero` com `offer-context`); nenhuma folha pôde sair.
O resumo do runner deu `MEASURED_PASS` para as 51 rotas (mínimo 99, LCP máximo 1.957 ms). Os
artefatos de `docs/lighthouse-runs/` foram revertidos (`git checkout`), não commitados.

### 2.5 Substituição deliberada

`/diagnostico-b2g-360/` perdeu `div.commercial-bridge[data-commercial-bridge="1"]` (que ficava
depois do `authority-method`); seu conteúdo virou o último item de "Dúvidas, condições e limites"
com quatro destinos `data-cta-position="pillar_bridge"`. `data-commercial-bridge` é exigido por
`test_inbound_gates`, `test_semantic_coherence` e `test_acquisition_delta` apenas nas pontes de
`/conteudos/` (todas passam); um atributo solto sem `data-cluster`/`data-bridge-mode` tropeçaria
em `test_inbound_gates.py:189`, por isso não foi restaurado.

## 3. Testes executados (última linha real de cada saída, árvore final, `source build_env.sh`)

Baseline no ramo antes de qualquer edição do lote: já reprovavam `test:inbound-gates`
(`test_measurement_delay_canary_389…` em `medicoes-glosas-obras-publicas`) e
`test:page-contract-contratos` (`held_hash_18`, `public_renderer_has_no_drift`): hash do pilar do
piloto ainda sem recaptura no ramo de integração.

| Suite | Resultado (última linha) |
| --- | --- |
| `npm run test:html-integrity` | `HTML_INTEGRITY surface=source html_files=235 faq_pages=145 faq_questions=422 failures=0` (exit 0) |
| `npm run test:design` | `HTML_INTEGRITY … failures=0` (exit 0; `build_css --check`, `font_preload --check`, `test_design_gates`, `test_visitor_redesign` etc. OK) |
| `npm run test:copy` | `OK test_shipped_check_still_fails_on_em_dash` (exit 0; vocabulário de controle: `PASS: every occurrence classified`) |
| `npm run test:brand` | `OK test_home_jsonld_matches_corporate_positioning_and_preserves_b2g_services` (exit 0) |
| `npm run test:authority` | `OK 8 correction checks` (exit 0, após `id="metodo"` nos exemplos) |
| `npm run test:integral-solution` | `PASS: the public surface presents an integral solution` (exit 0) |
| `npm run test:self-deprecation` | `PASS: no self-deprecating communication on the public surface` (exit 0) |
| `npm run organic:test` | `279 passed in 15.98s` (exit 0) |
| `npm run test:inbound-gates` | exit 1: `FAIL test_measurement_delay_canary_389_is_single_url_and_fail_closed medicoes-glosas-obras-publicas/index.html` (pré-existente, hash do piloto); os demais 55 `OK` |
| `npm run test:deliverables-registry` | `deliverables-registry: 3650/3650 checks passed` (exit 0) |
| `npm run test:real-proof-registry` | `real-proof-registry: canonical_records=0 public_pages=268 problems=0` (exit 0) |
| `npm run test:commercial-contract-consistency` | `commercial-contract-consistency: 521/521 checks passed` (exit 0) |
| `npm run test:public-offer-truth` | `public-offer-truth: 132/132 checks passed` (exit 0) |
| `npm run test:page-contract-contratos` | exit 1: `page-contract-contratos: 494/498` — `held_hash_18` (pré-existente), `held_hash_19` (aditivos), `held_hash_22` (reequilíbrio), `public_renderer_has_no_drift` (`CONTRACT_DEFENSE_FROZEN_DRIFT`, mesmo hash); só hash |
| `npm run test:page-contract-eight` | `page-contract-eight: 735/735 checks passed` (exit 0) |
| `npm run test:page-contract-execucao` | `page-contract-execucao: 702/702 checks passed` (exit 0) |
| `npm run test:page-contract-licitacao` | exit 1: `dedicated_route_remains_frozen` e `public_renderer_has_no_drift` (`LICITACAO_FROZEN_DRIFT: diagnostico-pre-licitacao/index.html`); só hash; 241/243 |
| `npm run test:page-contract-operacao` | `page-contract-operacao: 638/638 checks passed` (exit 0) |
| `npm run test:cta-form-next-state` | `CTA_FORM_NEXT_STATE_OK routes=31` (exit 0; censo 182, ver §4) |
| `npm run test:form-funnel` | `FORM_FUNNEL_OK {"events":[…],"submit_journey":"contrato","home_multistep":true}` (exit 0) |
| `npm run test:nav` | `15 passed in 3.16s` (exit 0; `render_nav_hubs --check`: `PASS nav hubs match data/site/brand.json`) |
| `npm run test:hub-truth` | exit 0 |
| `npm run test:bofu-audit` | `18 passed in 0.82s` (exit 0) |
| `npm run test:bofu-dominance` | exit 1: `11 failed, 106 passed in 2.75s` — todos em `frozen_specs/test_frozen_specs.py` (9), `frozen_specs/test_unlock_plan_291.py` (1) e `safe_execution::test_git_diff_is_exclusive_area` ("changed without frozen-spec recapture"): comparações de snapshot/hash dos pilares; esperado até `materialize.py` do integrador. `safe_execution` e `safe_strategy` estruturais: 24/25 (o 1 é o mesmo hash) |
| `node --test tests/intake/test_mv03_adaptive_intake.mjs` | `# pass 17 # fail 0` |
| `python3 -m pytest scripts/demonstrative/plates -q` | `16 passed in 0.35s` |
| `render_plates --check` / `inline --check` | `plates_ok: 18 files match assets/pranchas` / `OK plates inline` |
| `UI_TEST_PORT=8749 node scripts/site/test_ui_geometry.mjs` (árvore fonte) | `All UI geometry tests passed` (73 OK; inclui `offer_context_geometry`, `offer_cta_first_viewport_and_progressive_detail`, `editorial_cover_scope_geometry`) |

Declaração explícita: `test:bofu-dominance`, `test:page-contract-contratos`,
`test:page-contract-licitacao` e a reprovação pré-existente de `test:inbound-gates` reprovam por
hash/snapshot dos seis pilares e ficarão vermelhos neste ramo até a recaptura do integrador
(`scripts/bofu_dominance/frozen_specs/materialize.py`, `baseline_commit` e motivo). Não são
reprovações de veracidade, preço, formulário, privacidade ou responsabilidade: a seção de captura,
o JSON-LD e o `<head>` foram conferidos byte a byte contra `47da03b64`. `test:first-fold-contract`
(fora da lista do §4) também reprovará por `input_hashes` até a recaptura da primeira dobra.

## 4. Testes ajustados e motivo

- `scripts/site/test_design_gates.py`: `EDITORIAL_RECOMPOSED_ROUTES` += as cinco rotas de pilar
  (isenção por rota exata da capa OG-only e do cartão `pillar-evidence`; mesma regra do piloto).
- `scripts/site/test_ui_geometry.mjs`: a sonda `editorial_cover_scope_geometry` passa de
  `/reequilibrio-obras-publicas/` (recomposto, sem `content-hero-grid`) para
  `/atrasos-prorrogacao-obras-publicas/`, que mantém a abertura de artigo em uma coluna. Regra inalterada.
- `data/commercial/cta-form-next-state.v1.json` (`expected_declared_ctas` 167 → 182, com nota) e
  `docs/commercial/cta-form-next-state-inventory.json` regerado por `npm run report:cta-form-next-state`.
  Os quinze a mais: botão da abertura e do próximo passo inline → `#captura-pilar` e WhatsApp
  subordinado nos cinco pilares, índice de página → formulário nos hubs e ofertas, pontes
  `pillar_bridge` em condições. Nenhum href novo, nenhum controle oculto.
- Nenhum teste de veracidade, preço, responsabilidade, privacidade, formulário ou persistência foi
  alterado. `tests/bofu_dominance/**` não foi tocado.

## 5. Pendências e o que NÃO foi feito

- Recaptura dos hashes congelados (integrador; pedido 1). `assets-manifest.json` da campanha (pedido 4).
- Quatro rotas safe-execution sem folha editorial nem índice (`test_existing_css_js_only`): pedido 2.
  Sem essa folha, `page-index`, `conditions` e `contact-primary` não renderizam; por isso o lote não
  as recompôs. Elas mantêm `content-cta` escuro + `commercial-bridge` + `pillar-capture` + `final-cta`
  (dois próximos passos), fora do contrato "um bloco escuro / uma ação dominante".
- Hub de obras públicas: o aside de regras do bloco gerado `CONTRACT-DEFENSE-HUB` é um segundo
  momento escuro (pedido 3).
- Hubs em 390: na primeira captura o botão da rota dominante de `/servicos-obras-publicas/`
  entrava na dobra só parcialmente (topo a ~795 px de 844). Corrigido no gerador: a linha de prova
  (`section-proof`) passou para depois do cartão da rota dominante nos dois hubs; recapturado e
  conferido em 390 (botão inteiro dentro da dobra em `/servicos-obras-publicas/` e em
  `/problemas-que-resolvemos/`). O pedido 9 (seletor de `margin-top` do `lead-inline` em
  `css/contracts.css`) deixa de ser bloqueante e fica como refinamento.
- Estados `/diagnostico-b2g-expansao/{obrigado,expirado,cancelado}/`: páginas mínimas sem casca,
  não tratadas.
- P4 (menu móvel com dois "fechar") e o `None` nos slots de prancha do piloto: pedidos 5 e 6.
- Índice de página do `diagnostico-b2g-360` e dos pilares aponta para `#captura-pilar`, cujo
  título de seção continua "Formulário desta página" (dentro do bloco byte-idêntico); a chamada
  inline de "Próximo passo" logo após a entrega faz a ponte, como no piloto.
- Não foram alterados: preços, prazos, ofertas, formulários, JSON-LD, canonical, robots, títulos,
  descrições, `document_intent`, `data-offer-*`, `data-cta-id`, `data-asset-id`, links de contato e
  seus textos, rótulos de veracidade, `brand.json`, CSS, tokens, shell, `js/**`, `tests/bofu_dominance/**`.

## 6. Jornada de aceite C (empresa com problema de contrato público)

`/problemas-que-resolvemos/` (reconhece o evento no índice regrado) → página do evento (p. ex.
`/aditivos-obras-publicas/`: necessidade na abertura, prancha P5 e exemplo, dossiê nomeado,
"quando pedir", condições) → `#captura-pilar` (mesmo markup, `action="/.netlify/functions/lead"`,
mesmos `data-*`, consentimento obrigatório, `data-receipt-required="true"`): `test:form-funnel`,
`test:cta-form-next-state` e `inbound_gates` (`pillar_primary_cta_bypasses_capture`: o primeiro
`href="#captura-pilar"` precede o formulário) passam nas cinco rotas.
