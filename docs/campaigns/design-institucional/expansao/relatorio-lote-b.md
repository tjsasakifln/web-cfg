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
| HERANCA_VISUAL_VALIDADA (4) | `/diretoria-b2g/`, `/bid-room-licitacoes-obras/`, `/diagnostico-b2g-expansao/`, `/conflitos/` (reclassificadas na revisão: casca herdada com degradê e blocos escuros do CSS do integrador; ver §7) |
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

### 2.2 Hubs (`/servicos-obras-publicas/`, `/problemas-que-resolvemos/`; composição revista em §7.3)

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

### 2.4 Páginas de oferta e secundárias (COMPONENTES_ADEQUADOS na entrega; HERANCA_VISUAL_VALIDADA após a revisão, §7)

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
| `npm run test:design` | `HTML_INTEGRITY surface=source html_files=235 faq_pages=145 faq_questions=422 failures=0` (exit 0; `test_design_gates` 42 passed, inclusive o gate novo de âncoras do índice) |
| `npm run test:copy` | `OK test_shipped_check_still_fails_on_em_dash` (exit 0; vocabulário de controle: `PASS: every occurrence classified`) |
| `npm run test:brand` | `OK test_home_jsonld_matches_corporate_positioning_and_preserves_b2g_services` (exit 0) |
| `npm run test:authority` | `OK 8 correction checks` (exit 0, após `id="metodo"` nos exemplos) |
| `npm run test:integral-solution` | `PASS: the public surface presents an integral solution` (exit 0) |
| `npm run test:self-deprecation` | `PASS: no self-deprecating communication on the public surface` (exit 0) |
| `npm run organic:test` | `279 passed in 16.06s` (exit 0) |
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
| `npm run test:cta-form-next-state` | `CTA_FORM_NEXT_STATE_OK routes=31` (exit 0; censo 183, ver §4) |
| `npm run test:form-funnel` | `FORM_FUNNEL_OK {"events":[…],"submit_journey":"contrato","home_multistep":true}` (exit 0) |
| `npm run test:nav` | `15 passed in 2.98s` (exit 0; `render_nav_hubs --check`: `PASS nav hubs match data/site/brand.json`) |
| `npm run test:hub-truth` | exit 0 |
| `npm run test:bofu-audit` | `18 passed in 0.82s` (exit 0) |
| `npm run test:bofu-dominance` | exit 1: `11 failed, 106 passed in 2.31s` — todos em `frozen_specs/test_frozen_specs.py` (9), `frozen_specs/test_unlock_plan_291.py` (1) e `safe_execution::test_git_diff_is_exclusive_area` ("changed without frozen-spec recapture"): comparações de snapshot/hash dos pilares; esperado até `materialize.py` do integrador. `safe_execution` e `safe_strategy` estruturais: 24/25 (o 1 é o mesmo hash) |
| `node --test tests/intake/test_mv03_adaptive_intake.mjs` | `# pass 17 # fail 0` |
| `python3 -m pytest scripts/demonstrative/plates -q` | `16 passed in 0.41s` |
| `npm run test:first-fold-contract` | exit 1: `first-fold-contract: 14 check(s) failed` (`first_fold_input_changed:*` e `evidence_/<rota>/_html_bytes_match`: `input_hashes` das rotas do lote; recaptura do integrador, pedido 1) |
| `render_plates --check` / `inline --check` | `plates_ok: 18 files match assets/pranchas` / `OK plates inline` |
| `UI_TEST_PORT=8749 node scripts/site/test_ui_geometry.mjs` (árvore fonte, após a revisão) | `All UI geometry tests passed` (73 OK; inclui `offer_context_geometry`, `offer_cta_first_viewport_and_progressive_detail`, `editorial_cover_scope_geometry`) |

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
- `data/commercial/cta-form-next-state.v1.json` (`expected_declared_ctas` 167 → 182 → 183, com nota) e
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

## 7. Correções após revisão (2026-09-17)

Revisores independentes (visual e contratos) apontaram 15 achados. Cada um abaixo: achado →
ação → prova. Commits `37bcfb780`, `74f279fd2`, `a2053ec13` e seguintes (ver `git log` do ramo);
todas as rotas alteradas foram recapturadas com a mesma ferramenta no mesmo diretório e as
imagens foram vistas. A seção `#captura-pilar` das cinco rotas de pilar e os formulários das
ofertas foram conferidos byte a byte antes de cada gravação (assert no script de edição).

| # | Sev. | Achado | Ação | Prova |
| --- | --- | --- | --- | --- |
| 1 | ALTA | Índice "Nesta página" apontava para seções dentro do `details` fechado em `/diretoria-b2g/` (5 de 8), `/bid-room-licitacoes-obras/` (3 de 6) e `/diagnostico-b2g-expansao/` (4 de 6); o clique caía no formulário. | Índice só com âncoras visíveis: seções visíveis ganharam `id` (`entregaveis`, `como-conferir`, `perguntas`) e a entrada de condições aponta para o próprio `<details id="condicoes-contratacao">`, cujo `summary` ("Ver rotina, capacidade, responsabilidades e condições") renderiza. `offer_cta_first_viewport_and_progressive_detail` exige `details` presente e fechado, e `js/**` é do integrador, por isso não se abriu o accordion nem se tiraram seções dele. Gate novo em `scripts/site/test_design_gates.py` (`test_page_index_anchors_land_on_visible_targets`) reprova qualquer `nav.page-index` cujo href resolva para dentro de `details` fechado (mais autoteste com fixture). | Sonda estática (parser do gate) sobre `HEAD` antes/depois: diretoria `escondidas ['ritmo','quando-nao-contratar','capacidade','mensalidade','primeiros-90-dias']` → `[]` (7 entradas); bid-room `['preco','quando-nao-contratar','responsabilidades']` → `[]`; expansão `['pacote','dados','quando-nao-contratar','metodo-conferir']` → `[]` (4 entradas). Sonda puppeteer (Chrome do repositório, preview 8742), clique em `.page-index a[href="#condicoes-contratacao"]`: diretoria 390×844 `{summaryVisible:true, summaryText:"Ver rotina, capacidade, responsabilidades e condições"}`, 1440×1000 idem; bid-room e expansão idem (`summaryVisible:true` nos dois viewports). Captura não prova este achado (o `settle()` da ferramenta força `content-visibility`), por isso a prova é a sonda. `test_design_gates`: 42 passed. |
| 2 | ALTA | Hashes congelados e primeira dobra não recapturados; sem dono e prazo. | Pedido 1 reescrito com dono (integrador), prazo (antes do PR de publicação), ordem obrigatória (`materialize.py` → `measure_first_fold.mjs` na cadeia análise → frozen specs → primeira dobra → baselines, CSS congelado) e os comandos que devem voltar a exit 0. Consta como `blockers` na devolutiva do lote: bloqueia a publicação, não o aceite de design. | `pedidos-lote-b.md` §1; §3 acima lista as reprovações por hash com a última linha real. |
| 3 | MÉDIA | Hubs: cartão dominante em degradê navy; três momentos escuros e inventário duplicado em `/servicos-obras-publicas/`; h2 gerado em 4 linhas. | Gerador `render_nav_hubs.py`: a rota dominante virou a ação da abertura (`button-primary` em `.svc-open__actions`, mesmos `data-cta-id`/`data-*` exigidos por `single-commercial-route.v1.json` e `test_source_to_service`), com o resumo (nome, R$ 4.900 e 5 dias úteis, limite) num `aside.aside-note` claro na coluna direita do `svc-open__grid`; `.lead-inline` saiu dos dois hubs (escopo sitewide 138 → 136, piso 132). Preço e prazo dos dossiês passaram a ser publicados uma só vez, no bloco gerado (as linhas por situação e as "outras necessidades" nomeiam entrega e caminho; a lead da seção liga a "Registrar o evento"). Fecho: `contact-primary` com `button-primary` "Descrever o contrato pelo WhatsApp" (mesmo href); em `/problemas-que-resolvemos/` o fecho é o único `sec--dark`; em `/servicos-obras-publicas/` o fecho fica claro porque o bloco gerado que o segue já desenha a faixa navy. Degradê do `.lead-inline`, grade 3×3, `h2` 18ch e faixa de regras: pedidos 10 e 13 (integrador). | Capturas `servicos-obras-publicas-{390x844,1440x1000}-{fold,full}-lote-b.jpg`, `problemas-que-resolvemos-*` (botão dominante inteiro na dobra de 390; abertura em duas colunas a 1440; um bloco escuro em problemas). `render_nav_hubs --check`: `PASS nav hubs match data/site/brand.json`; `test:nav` 15 passed; `tests/attribution/test_source_to_service.mjs` pass 1 fail 0; `test_visitor_redesign` 33 passed. |
| 4 | MÉDIA | Ofertas B2G: hero em degradê, dois blocos navy, hero longo antes do índice, cinco rótulos para a ação, h2 com ponto, código interno na copy, `/conflitos/` com índice de 2 entradas. | Reclassificadas como HERANCA_VISUAL_VALIDADA na matriz (hero, `.operating-system`, `.final-cta-section` são `styles.css`: pedidos 10 e 11; `test_operating_flow_has_sitewide_fallback` exige o `ol.operating-flow`). H2 sem ponto final nas três ofertas (28 títulos; nenhum referenciado por teste, conferido por grep). Rótulos: "Falar sobre a operação" é o rótulo contratado (`public-offer-truth.v1.json`), "Diagnosticar encaixe da Diretoria…" é exigido por `test_copy_gates.py:403` e o botão do formulário é byte-idêntico; o que era livre foi alinhado: a alternativa da abertura passou a "Avaliar na sua empresa, nesta página" (mesmo texto do índice e do h2 do formulário). O índice **não** foi movido para dentro do hero: `styles-offers.css` dá `order` explícito a cada filho de `.offer-hero > .container` e um filho sem ordem sobe acima do eyebrow. `hero-proof`/`hero-micro` não foram consolidados: `authority.py:799` extrai credenciais de `ul.hero-proof` e `test_ui_geometry` mede `.hero-proof li` em `/diretoria-b2g/` (gate de autoridade, não de estética). `/conflitos/`: a página é gerada por `render_authority_pages.py` (a edição manual seria perdida na regeneração); a folha editorial e um índice de cinco seções (ids que `conflict_gate.py` já escreve) passaram para o gerador; o respiro de ~110 px é `padding-top` do `.article-layout` (pedido 12). | `git diff 37bcfb780~1 37bcfb780`; capturas `diretoria-b2g-*`, `bid-room-licitacoes-obras-*`, `diagnostico-b2g-expansao-*`, `conflitos-*`; `python3 scripts/site/render_authority_pages.py` regenera `/conflitos/` byte-idêntico ao commitado e as demais páginas sem diff; `test_ui_geometry` 73 OK. Refutação parcial: ver "Achados refutados". |
| 5 | MÉDIA | Tabelas dos exemplos transbordam em 390 (colunas de valor/pedido fora da tela); sem prancha. | Colunas reordenadas para que as duas primeiras carreguem o ponto: aditivo `Linha · Valor · % de V · Origem`; medição `Parcela · Valor · Pedido · Natureza · Prova`. Mesmos números. Prancha lateral na abertura (`figure.plate.plate--side` no `svc-open__grid`, como o exemplo do piloto): P5 `aditivo-limite` no caso de aditivo e P3 `medicao-parede` no caso de medição, slots `eager` materializados por `inline.py`; os textos que remetiam à "prancha da página de …" passaram a apontar para a prancha da abertura e à página completa. | Capturas `casos-aditivo-art125-demonstrativo-390x844-full-lote-b.jpg` (Linha e Valor inteiras; % parcialmente, origem por rolagem) e `casos-medicao-glosa-demonstrativo-390x844-full-lote-b.jpg` (Parcela, Valor e Pedido visíveis); `*-1440x1000-fold-*` com a prancha na dobra. `inline --check`: `OK plates inline`; `assets-lote-b.json` com `used_on` atualizado. Refutação parcial da composição de duas colunas: ver abaixo. |
| 6 | MÉDIA | `<style>` inline com identidade antiga; badge âmbar; ressalva 4× na dobra; meta colada ao lead. | `<style>` removido (as regras `.n-wrap/.n-card/.n-status` só existiam na própria declaração: `grep -c` = 5 nos dois arquivos, nenhuma classe usada no corpo); `p.case-badge` mantido com `data-permission-class="demonstrativo"` e texto original, herdando só `.t-kicker` (sitewide `.case-badge` só tem regra de quebra). Ressalvas na abertura: kicker + prefixo "Demonstrativo." do h1 (mesmo padrão do exemplo do piloto, `render.py:421`) + byline ("números hipotéticos", exigido por `test_hub_link_matrix.py:119`); a frase redundante do lead ("Números ilustrativos; não há cliente real." / "Não é case de cliente.") saiu; "Limitação" consolidada permanece. Byline sem `.t-caption` (mesmo markup do piloto). | Capturas `casos-*-1440x1000-fold-lote-b.jpg` (kicker verde plano, prancha ao lado); `test:authority` `OK 8 correction checks`; `test:self-deprecation` PASS; `test:real-proof-registry` `problems=0`. |
| 7 | MÉDIA | `/diagnostico-b2g-360/`: kicker "Entrada", listas com ponto e vírgula, rótulos divergentes, h2 com ponto. | Kicker "Frente pública sem mapa de prioridades"; listas com ponto final; h2 sem ponto final; índice "06 Solicitar diagnóstico" alinhado ao rótulo contratado "Solicitar diagnóstico da operação" (hero e próximo passo). O botão do formulário ("Descrever a operação") é byte-idêntico e nomeia o envio, não a oferta. | `git diff` do commit; `test_copy_gates` (rótulo exigido) OK; `#captura-pilar` byte-idêntico (assert). Captura `diagnostico-b2g-360-1440x1000-fold-lote-b.jpg`. |
| 8 | BAIXA | H1 de pré-licitação quebra no hífen em 390. | Não tratado no lote: não há primitivo `nowrap`, `br.hero-br-mobile` só tem regra na home e o h1 literal está em `frozen-specs/snapshots.json` e em `first-fold-measurements`; trocar o hífen por U+2011 mudaria o texto congelado. Pedido 14. | — |
| 9 | BAIXA | Reequilíbrio: seção Biblioteca inteira para um guia. | Seção removida; o `article.library-item` (mesmos `data-content-item`, `data-cluster`, `data-search`, href) entrou ao fim da "Resposta direta" com a legenda "Guia público neste tema, além dos três guias de apoio ligados acima"; índice renumerado (5 entradas). Nenhuma frase "N guias" restou (gate `pillar_guide_count_findings`). | Captura `reequilibrio-obras-publicas-1440x1000-full-lote-b.jpg`; `test:inbound-gates` 55 OK (única FAIL pré-existente); `test_visitor_redesign` 33 passed. |
| 10 | BAIXA | Ressalvas repetidas 6–8× nos quatro pilares. | Nas quatro rotas ficaram o "Limite" da abertura, "Dúvidas, condições e limites", o rodapé do formulário (protegido) e a linha de autoria; o parágrafo de fecho dos "Quatro recortes" (repetição literal do Limite em aditivos; "não redige impugnação nem recurso e não promete…" em auditoria e pré-licitação, cuja parte nova subiu para o Limite da abertura) e o tail de "O que você recebe" (aditivos, reequilíbrio) saíram. Ocorrências das frases de limite ("não redige…", "não promete…", "não é parecer jurídico", "substitui o jurídico", "Não inclui…", "não autoriza executar", fora do JSON-LD; `grep -o | wc -l` antes/depois): aditivos 9 → 6, auditoria 6 → 6 (a cláusula saiu de um bloco e entrou no Limite: mesma contagem, um lugar a menos), pré-licitação 7 → 6, reequilíbrio 8 → 7. As restantes estão no Limite da abertura, na FAQ de condições, no rodapé do formulário (protegido) e na linha de autoria (exigida). O piloto (`medicoes-glosas-obras-publicas`) é do integrador. | `test:copy`, `test:integral-solution`, `test:public-offer-truth` 132/132, `test:page-contract-*` (só hash). |
| 11 | BAIXA | Opção do select cortada em 390. | Formulário GENERATED protegido: pedido 13. | — |
| 12 | BAIXA | `/problemas-que-resolvemos/`: kicker repetido, legenda colada, fecho com botão secundário. | Kicker da seção do ciclo → "Ciclo do contrato" (a abertura mantém o `eyebrow` de `brand.json`); a legenda das ferramentas virou `svc-open__note` sob a ação da abertura; fecho em `sec--dark` com `contact-primary` e `button-primary`. | Capturas `problemas-que-resolvemos-*`. |
| 13 | BAIXA | Família dividida nas quatro rotas safe-execution. | Registrado na matriz (nota por rota) e mantido o pedido 2. | `matriz-lote-b.json`. |
| 14 | PREF. | P5: rótulo "2%" rotacionado e ilegível; P8: "Confirmar antes do preço" encostado na margem. | P5: a faixa do excesso tem 11 px nesta escala, então a cota vertical foi removida (a chamada 2 já traz "27 − 25 = 2%"); P8: coluna "Leitura" de x=1040 para x=985 (a coluna "A empresa tem" termina em ~965). Hashes atualizados em `assets-lote-b.json`. | `render_plates --check`: `plates_ok: 18 files match assets/pranchas`; `pytest scripts/demonstrative/plates`: 16 passed; pranchas vistas em 1200×560. |

### Achados refutados (com evidência)

- **"Um bloco escuro por página" como contagem literal nos hubs.** O piloto, padrão mínimo declarado, tem dois `dark-block` em `servicos/index.html` (linha 246, `corporate-service-row dark-block` de obras públicas; linha 293, o próximo passo). O que o lote aceitou e corrigiu foi o degradê e o cartão escuro na abertura; em `/servicos-obras-publicas/` o único momento escuro restante é a faixa de regras do bloco gerado (integrador, pedido 3/13).
- **`CFG-DIAG-EXP-v1` na copy pública de `/diagnostico-b2g-expansao/`.** A linha 226 nomeia o prazo contratual do catálogo ("Prazo contratual do catálogo CFG-DIAG-EXP-v1: vale o intervalo de entrega publicado no topo…"): condição material da oferta, protegida pelo §3 do caderno, e `tests/bofu_dominance/safe_strategy/test_jobs_parity_attrs.py::test_expansao_handraise_not_checkout_when_flags_false` exige `"CFG-DIAG-EXP-v1" in html`. Pré-existente na `main`; não removido.
- **"Alinhar os demais rótulos ao botão do formulário" em `/diagnostico-b2g-360/`.** `scripts/site/test_copy_gates.py:398` exige "Solicitar diagnóstico da operação" na página e `data/commercial/public-offer-truth.v1.json` o registra como rótulo da família de CTA; o formulário é byte-idêntico. O alinhamento possível foi feito no sentido inverso (índice → rótulo contratado).
- **Tabela dos exemplos "deve virar composição de duas colunas no 390".** `.table-scroll table{min-width:560px}` com `.table-hint` visível abaixo de 700 px é o comportamento móvel desenhado pelo sistema (`css/components.css`, integrador), usado também nas tabelas do piloto; sem CSS não há como alternar composições por breakpoint. O que era corrigível no markup foi corrigido (ordem das colunas: valor e pedido nas primeiras posições).
- **Mover `nav.page-index` para logo após `.hero-actions` e consolidar `hero-proof`/`hero-micro` num `div.conditions` nas ofertas.** O container do `offer-hero` é flex com `order` explícito por classe (`styles-offers.css` linhas 13–31, com o comentário do próprio arquivo: filho sem ordem sobe acima do eyebrow), então o índice dentro do hero ficaria no topo; `ul.hero-proof` alimenta `authority.py::extract_credential_claim_texts` e `test_ui_geometry` (`.hero-proof li` em `/diretoria-b2g/`). A parte livre do achado (h2 sem ponto, rótulo da alternativa, classificação honesta) foi aplicada.
- **Cinco rótulos para a mesma ação em `/diretoria-b2g/`.** São quatro destinos distintos: WhatsApp (hero e fecho, rótulo contratado "Falar sobre a operação"/"Diagnosticar encaixe…", este exigido por `test_copy_gates.py:403`), formulário da própria página (alternativa da abertura, agora "Avaliar na sua empresa, nesta página" = índice = h2 do formulário), `/#contato` para a oferta de diagnóstico da operação (rótulo contratado dessa oferta) e o botão de envio do formulário (byte-idêntico).

### Testes executados na rodada de correção (última linha real)

`test:html-integrity` `failures=0`; `test:design` exit 0 (42 passed em `test_design_gates`); `test:copy` `OK test_shipped_check_still_fails_on_em_dash`; `test:brand` OK; `test:authority` `OK 8 correction checks`; `test:integral-solution` PASS; `test:self-deprecation` PASS; `organic:test` `279 passed in 16.06s`; `test:inbound-gates` exit 1 (só `test_measurement_delay_canary_389…`, pré-existente; 55 OK); `test:deliverables-registry` `3650/3650`; `test:real-proof-registry` `problems=0`; `test:commercial-contract-consistency` `521/521`; `test:public-offer-truth` `132/132`; `test:page-contract-contratos` `494/498` (hash); `test:page-contract-eight` `735/735`; `test:page-contract-execucao` `702/702`; `test:page-contract-licitacao` `241/243` (hash); `test:page-contract-operacao` `638/638`; `test:cta-form-next-state` `CTA_FORM_NEXT_STATE_OK routes=31`; `test:form-funnel` `FORM_FUNNEL_OK`; `test:nav` `15 passed`; `test:hub-truth` `ALL hub truth checks passed`; `test:bofu-audit` `18 passed`; `test:bofu-dominance` `11 failed, 106 passed` (hash); `test:first-fold-contract` `14 check(s) failed` (`input_hashes`); `tests/intake/test_mv03_adaptive_intake.mjs` `# pass 17 # fail 0`; `test_ui_geometry.mjs` `All UI geometry tests passed` (73); `render_plates --check` `plates_ok: 18`; `inline --check` `OK plates inline`; `pytest scripts/demonstrative/plates` `16 passed`; `tests/attribution/test_source_to_service.mjs` `# pass 1`; `test_visitor_redesign` `33 passed`.
