# Lote C — relatório (biblioteca, hubs, responsável, ferramentas, secundárias)

Ramo `campaign/salto-02/lote-c` sobre `8860f5577` (integração `campaign/salto-institucional-02-expansao`). Direção do piloto (A-prancha-e-percurso), sem reabrir estética. Matriz: `matriz-lote-c.json` (187 rotas: 3 COMPOSICAO_REDESENHADA, 161 COMPONENTES_ADEQUADOS, 9 HERANCA_VISUAL_VALIDADA, 14 PRESERVADA_COM_JUSTIFICATIVA). Pranchas novas: nenhuma (`assets-lote-c.json`). Evidência: `evidence/lote-c/*.jpg` + `manifest-lote-c.json` (390×844 e 1440×1000, dobra e inteira, menu em 390, overflow em 320 = 0 px em todas as rotas capturadas).

## Jornada de aceite D

O visitante da biblioteca lê sem converter: o artigo abre com kicker, título editorial, resumo e meta de autoria; o índice "Nesta página" mostra onde está; tabelas rolam em região acessível; fontes e autor ficam em blocos regrados; o apoio técnico pertinente permanece na lateral e no fim (CTAs existentes, não alterados). Hubs (`/conteudos/`, `/casos/`, lei/guias/jurisprudência, inteligência) listam em `hub-list` com o que é, para quem e o serviço ligado. O responsável técnico (`/especialista/…`) abre com retrato oficial, credenciais do registro canônico e como conferir.

## O que mudou, por rota

### Artigos `/conteudos/*` (128) — COMPONENTES_ADEQUADOS (117), folha-somente (4), intactos (7)
- Novo `scripts/site/editorial_recompose.py` (determinístico, idempotente, `--check`, `--parity`, `--report`): insere `<link href="/assets/editorial.css">` após `/styles.css`; normaliza `nav.article-toc` existente para `<strong>Nesta página</strong><ol><li>…` preservando as entradas curadas; gera índice quando faltava e há ≥3 h2 de leitura (ids estáveis por slug, sem duplicar; rótulos curtos curados para os cinco artigos fora do modelo); envolve tabela nua em `div.table-scroll[role=group][tabindex][aria-label]` + dica (1 caso: chuva-prorrogacao… que acabou intacto por aprovação); `.table-wrap` existente fica como está (a dica vem por CSS); figura: remove `style` inline e preenche `alt` vazio pela legenda (0 casos de alt vazio; 1 figura com estilo removido); author-box/sources verificados (todos conformes, texto intacto); os cinco artigos fora do modelo (`article.container[style]` / `section.section--default > div.container[style]`) ganham `header.content-hero.article-hero` + `div.container.article-layout > article.article-main`, sem estilo inline.
- Prova de paridade: `python3 scripts/site/editorial_recompose.py --parity` → `parity: 128/128 páginas com texto visível idêntico a HEAD` (texto visível de `<main>` sem espaços, ignorando `nav.article-toc` e `p.table-hint`). `--check` → `check: 0 de 128 páginas mudariam`.
- Protegidos por hash e pulados pelo próprio script (registrados em `--report`): intactos `atraso-na-medicao-obra-publica` (canário 389), `glosa-de-medicao-obra-publica`, `medicao-de-obra-publica-rejeitada`, `fiscal-nao-assina-medicao-obra-publica` (siblings congelados do canário), `custos-indiretos-atraso-administracao-obra`, `jogo-de-planilha-aditivo-obra-publica` (CLICK_ORIGIN: bytes de origin/main), `chuva-prorrogacao-prazo-obra-publica` (aprovação humana vinculada ao hash do HTML); só a folha no head: `atraso-pagamento-contrato-publico-suspender`, `glosa-por-qualidade-obra-publica`, `medicao-por-evento-obra-publica`, `pagamento-parcial-etapa-empreitada-global` (impressão digital do corpo fixada à revisão datada em `cluster_medicao_originality`).
- Amostras vistas em 390 e 1440 (evidência): mais longo `sinapi-desonerado-nao-desonerado`; tabela mais larga `comparar-propostas-execucao-obra` (forma B recomposta); com figura `como-contratar-projetos-complementares`; sem figura e com FAQ `matriz-de-riscos-obra-publica`; curto `como-contratar-revisao-tecnica-projeto` (forma A); `limite-aditivo-25-50-obra-publica`; folha-somente `glosa-por-qualidade-obra-publica`; hub `/conteudos/`.
- Não feito: CTAs dos artigos (quatro por página: lead-inline, article-decision, aside, bolha) ficaram como estavam — contrato de recomposição proíbe tocar; densidade registrada como fora do contrato.

### `/conteudos/` — COMPOSICAO_REDESENHADA
Abertura `svc-open` (kicker, `h1.t-service` com o texto exigido, lead, busca `data-hub-search` intacta, nota com triagem, `aside-note` "Responsabilidade técnica" com o byline); `nav.page-index` (5 entradas); "Por necessidade" em `ol.hub-list` com os 10 marcadores `data-hub-link` e hrefs; destaque (`featured-decision/featured-lead`), estágios (`problem-stages`) e diretório (busca/filtros/contagem/vazio/script) preservados; um bloco escuro (`section.content-cta`, literal exigido pelo teste) com ação dominante + alternativas; ferramentas/radar/nurture como links. `hub-inline-contact` (três CTAs no meio) removido em favor do bloco de contato único. Aviso: `inbound:remediate` sobrescreveria (pedido 9).

### `lei-14133-obras/**`, `guias-contratos-obras/**`, `jurisprudencia-contratos-obras/**` — COMPONENTES_ADEQUADOS (regenerados)
`scripts/editorial/render.py`: folha editorial via `extra_head`; toda `## seção` recebe id estável (slug único) e o índice `nav.article-toc` entra após a resposta direta quando há ≥3 h2 (+ "Fontes"), rótulo = primeira oração do h2 com teto de 32 caracteres; hubs em `ol.hub-list` (tag do arquétipo, título, resumo, ação) e `article-hero`. Sem author-box novo: as páginas não declaram `author_is_tiago`, então nenhuma autoria foi acrescentada. Regenerado com `npm run editorial:build` (`{"ok": true, "indexable": 2, …}`); relatórios/registries revertidos.

### `inteligencia/**`, `radar/**` — COMPONENTES_ADEQUADOS (regenerados de `data/pseo/snapshot.json`, sem página nova)
`scripts/pseo/render.py`: folha em todos os `page_shell`; `inject_page_index` pós-processa `article-main` (uma entrada por `section[id]` com h2, rótulo = kicker da seção); hubs em `ol.hub-list` com nota inline entre parênteses (o gate de vocabulário lê o trecho inteiro); seção `id="guias"` → `id="guias-relacionados"` (a heurística `href=#guias` sem `library-item` do teste global reprovava). `npm run pseo:build` sem diff além dos HTML do lote.

### `/casos/` — COMPOSICAO_REDESENHADA
Abertura `svc-open` com o rótulo `p.case-badge.tag[data-permission-class=demonstrativo]`, `<h1>` literal exigido por `test_permissioned_proof`, lead, ação dominante "Solicitar proposta" (/triagem-tecnica/), alternativa "Conferir os exemplos", nota com WhatsApp/E-mail, `aside-note` "Como o trabalho é organizado"; `page-index`; exemplos em `hub-groups` (obra e projeto / contrato público) com `ol.hub-list`, rótulo "Demonstrativo:" em todo link a `/casos/modelo-*` (exigido por `real-proof-registry`), marcadores `data-hub-link` e `data-proof-kind`; "Outras situações" + bloco `section.conditions[data-proof-state=none]` (autorização de trabalho de cliente); ferramentas em links; captura `#captura-casos` com o formulário byte-idêntico (md5 conferido no script de composição). Folha inline legada (`.n-card`, fundo âmbar em `[data-proof-kind]`) removida. Censo de CTAs mantido igual ao inventário (4 ações).

### `/casos/modelo-*/` (8) — COMPONENTES_ADEQUADOS
Folha editorial + `nav.page-index` após o hero (10 entradas por página, rótulos = kicker de cada seção). Tabelas já estavam em `report-table-wrap`/`vinc-table-wrap` acessíveis; preços, rótulos e contratos intactos (`test:report-model` 129 passed, `test:deliverable-models` 16 passed, `test:report-model-ui` `REPORT_MODEL_UI {"ok":true…}`). Não feito: os dois `report-section-dark` por página (sistema `report-model.css`, do integrador).

### `/especialista/tiago-jun-sasaki/` — COMPOSICAO_REDESENHADA (bloco Trust)
`header.content-hero.profile-hero` com `.split`: cópia (kicker, `h1.t-service`, lead, frase de atuação nacional, ação principal "Descrever a situação para o Engº Tiago" + WhatsApp) e `figure.portrait > .portrait__frame` com o `<picture>` oficial byte-idêntico (`SPECIALIST_PICTURE`); `page-index`; credenciais (região `credential-registry` intacta) em `sec--soft`; atuação (`split` + `ul.profile-list`); condução com "Limites do que é afirmado" em `.conditions` (frases existentes); "Como conferir" (parágrafos existentes, `#entity-as-of`); guias em `hub-list`. `aside-card` "Atuação em todo o Brasil" (segundo CTA) dissolvida: a frase foi para a abertura. Sem currículo novo, sem credencial nova. Retrato 485 px no desktop e abaixo da ação no celular (pedido 6 se quiser à esquerda).

### `/confianca/` — COMPONENTES_ADEQUADOS
Folha, `article-hero`, `nav.article-toc` (6 seções existentes), classes `simple-card privacy-card` removidas do `article-main`; credenciais e políticas intactas.

### `/ferramentas/**` — COMPONENTES_ADEQUADOS (hub, limite, matriz, prontidão)
Só o `<link>` da folha (bloco Tool já era o vocabulário das páginas: `tool-page-hero`, `tool-form`, `tool-method`, `tool-layers`, `tool-cta-contextual`); cálculo, campos, ids, `data-*`, resultados e limites intactos. Excluídos com motivo: `diagnostico-defesa-margem` (orçamento de carga, medido) e `checklist-reequilibrio` (checkboxes 100% de largura pela folha). `test:tools-uiux-e2e`: `failed 1 / overflows 1` = `overflow aditivo 320x568 sw=330` (pré-existente, igual à base sem o lote); `test:money-asset-canary-e2e`: `MONEY_ASSET_CANARY_E2E_OK`.

### `/entregas/` — PRESERVADA_COM_JUSTIFICATIVA (não tratada)
Vitrine/capability-roll gerados por `scripts/commercial/render_public_catalog.mjs` (fora do lote, drift fail-closed), hero pinado por testes de contrato comercial, `entregas/styles.css` exigido. Bytes gzip registrados: `entregas/styles.css` 4.450, `styles-offers.css` 2.515, `assets/editorial.css` 7.061, HTML 13.964. Pedido 7.

### Secundárias
HERANCA_VISUAL_VALIDADA (captura 390/1440 conferida): imprensa, metodologia-inteligencia (corrigido: faltava o script `no-js→js`, o menu móvel abria expandido), politica-editorial, uso-de-ia, nurture, analise-cnpj, oportunidades, analises-contratos-publicos, radar/nacional-obras-publicas. PRESERVADA_COM_JUSTIFICATIVA: privacidade, termos-de-uso (legais estáveis), piloto/**, ops/** (noindex operacionais).

## Desempenho (gate do repositório, `run_lighthouse.mjs`, 1 run, servidor da árvore fonte com gzip)
`/` perf 99, 148.756 bytes, LCP 1.961 ms · `/casos/` perf 98, 136.999 bytes, DOM 353, LCP 1.808 · `/especialista/…` perf 100, 145.688 bytes, DOM 330, LCP 1.805 · `/conteudos/documentos-reequilibrio-obra-publica/` perf 100, 141.063 bytes, LCP 1.804 · `/ferramentas/diagnostico-defesa-margem/` com folha 158.965 (FAIL > 153.600) → sem folha 151.921 (MEASURED_PASS). `/entregas/` não tocada. Arquivos de execução (`docs/lighthouse-runs/*-lote-c*.json`) removidos, não commitados.

## Testes executados (última linha real de cada saída, ramo final)

| Comando | Resultado |
| --- | --- |
| `npm run test:html-integrity` | `HTML_INTEGRITY surface=source html_files=235 faq_pages=145 faq_questions=422 failures=0` (exit 0) |
| `npm run test:design` | exit 0 (última linha: `HTML_INTEGRITY … failures=0`) |
| `npm run test:copy` | exit 0 (`OK test_shipped_check_still_fails_on_em_dash`) |
| `npm run test:brand` | exit 0 (`OK test_home_jsonld_matches_corporate_positioning_and_preserves_b2g_services`) |
| `npm run test:authority` | exit 0 (`OK 8 correction checks`) |
| `npm run test:integral-solution` | `PASS: the public surface presents an integral solution` |
| `npm run test:self-deprecation` | `PASS: no self-deprecating communication on the public surface` |
| `npm run organic:test` | `279 passed in 17.92s` |
| `npm run test:inbound-gates` | **exit 1**: `FAIL test_measurement_delay_canary_389_is_single_url_and_fail_closed medicoes-glosas-obras-publicas/index.html` — pré-existente na base do ramo (pilar do piloto recomposto após a recaptura do canário; `git diff 8860f5577 HEAD -- medicoes-glosas-obras-publicas/index.html` vazio). Pedido 10. |
| `npm run test:deliverables-registry` | `deliverables-registry: 3650/3650 checks passed` |
| `npm run test:real-proof-registry` | `real-proof-registry: canonical_records=0 public_pages=268 problems=0` |
| `npm run test:commercial-contract-consistency` | `commercial-contract-consistency: 521/521 checks passed` |
| `npm run test:public-offer-truth` | `public-offer-truth: 132/132 checks passed` |
| `npm run test:cta-form-next-state` | `CTA_FORM_NEXT_STATE_OK routes=31` |
| `npm run test:form-funnel` | `FORM_FUNNEL_OK {"events":[…],"submit_journey":"contrato","home_multistep":true}` |
| `npm run test:page-contract-eight` | `page-contract-eight: 735/735 checks passed` |
| `npm run test:page-contract-contratos` | **exit 1**: `FAIL held_hash_18` / `CONTRACT_DEFENSE_FROZEN_DRIFT: medicoes-glosas-obras-publicas/index.html` — mesmo pilar, pré-existente, não tocado pelo lote. |
| `npm run test:page-contract-execucao` | `page-contract-execucao: 702/702 checks passed` |
| `npm run test:deliverable-models` | `16 passed in 0.32s` |
| `npm run test:report-model` | `129 passed in 0.50s` |
| `npm run test:report-model-ui` | `REPORT_MODEL_UI {"ok":true,…,"axe":[],"hardAxe":[]}` |
| `npm run test:deliverables-hub` | `27 passed in 0.53s` |
| `npm run test:hub-links` | `15 passed` |
| `npm run test:nav` | `15 passed in 2.60s` |
| `node --test tests/intake/test_mv03_adaptive_intake.mjs` | `# pass 17 # fail 0` |
| `npm run test:tools-uiux-e2e` | `failed 1 / overflows 1 / axe critical/serious 0 0` (`overflow aditivo 320x568 sw=330 cw=320`, pré-existente; igual na base) |
| `npm run test:money-asset-canary-e2e` | `MONEY_ASSET_CANARY_E2E_OK` |
| `python3 -m pytest scripts/editorial scripts/pseo/tests -q` | `358 passed, 1 skipped in 59.68s` |
| `python3 scripts/site/editorial_recompose.py --check` / `--parity` | `check: 0 de 128 páginas mudariam` / `parity: 128/128 páginas com texto visível idêntico a HEAD` |

## Testes ajustados
Nenhum. Testes de veracidade/preço/responsabilidade/privacidade/formulário/persistência e de estética foram respeitados como estão; onde discordavam, a composição cedeu (h1 literal em `/casos/`, censo de CTAs, `#guias`, hint de tabela, rótulos "Demonstrativo:").

## Pendências e o que NÃO foi feito
- `/entregas/` não recomposta (pedido 7); `/ferramentas/diagnostico-defesa-margem/` e `/ferramentas/checklist-reequilibrio/` sem a folha (pedidos 2 e 8).
- 11 artigos protegidos por hash (7 intactos, 4 folha-somente) esperam recaptura pelos donos dos contratos (pedido 11).
- CSS: `.article-toc` flex/nowrap, `.content-hero::after`, `.credential-list>div`, `.content-cta` degradê (pedidos 1, 3, 4, 5).
- Ordem "método antes da ferramenta" nas páginas de ferramenta mantida (o `data-tool-job` e o e2e medem a dobra atual); recompor a ordem é decisão para o integrador com o e2e.
- Menu móvel com dois controles de fechar (P4 do estado) permanece (nav.js, integrador).
- `inbound:remediate` desincroniza o hub `/conteudos/` (pedido 9).
