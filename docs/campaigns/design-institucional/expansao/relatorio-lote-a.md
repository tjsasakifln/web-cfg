# Relatório do lote A — serviços privados, exemplo de infraestrutura, parcerias, estados de contato

Ramo `campaign/salto-02/lote-a`, worktree própria, porta 8741. Direção: A-prancha-e-percurso (piloto
`quantitativos-orcamento-obras/index.html` como padrão mínimo). Evidência em
`docs/campaigns/design-institucional/expansao/evidence/lote-a/` (390×844 e 1440×1000, dobra, página
inteira e menu; `manifest-lote-a.json` registra altura, fonte do h1 (`Archivo Var` em todas) e overflow
em 320 px = 0 em todas as rotas). Matriz em `matriz-lote-a.json`; pranchas em `assets-lote-a.json`;
pedidos ao integrador em `pedidos-lote-a.md`.

## Pranchas novas (família `scripts/demonstrative/plates/family_private.py`)

Oito pranchas, desktop e móvel como composições distintas, geradas de JSON, determinísticas
(`render_plates --check`: `plates_ok: 24 files match assets/pranchas`) e aprovadas pelo gate de
numerais (`python3 -m pytest scripts/demonstrative/plates -q`: `16 passed`). Nenhum número fora do
JSON de origem; `sheet.py` inalterado. Códigos PA–PH (o gate rejeita "P5" a "P10" como numerais
não rastreáveis). PG e PH entraram na rodada de correção (achado MEDIA sobre os esquemas antigos).

| Id | Origem | Página |
| --- | --- | --- |
| `interferencia-verga-viga` (PA) | private-project-pilot source + consumption (CF-GEO-01, R00 × R01) | compatibilização |
| `revisao-conferencia` (PB) | idem (RF-01/RF-02 sobre a elevação e o poço HS-01) | revisão técnica |
| `drenagem-rede` (PC) | infrastructure-pilot source + consumption (MH/DR/IN/PV, cotas, DN, camadas) | projetos complementares |
| `inspecao-fachada` (PD) | novo `data/demonstrative/plates/inspecao-fachada.v1.json` (fachada sintética, 4 manifestações) | inspeção e diagnóstico |
| `pericia-fachada` (PE) | mesmo JSON (quesitos Q-01 a Q-03, evidência, conclusão delimitada) | assistência técnica em disputas |
| `sst-canteiro` (PF) | novo `data/demonstrative/plates/sst-canteiro.v1.json` (canteiro sintético, 4 proteções, checklist) | SST |
| `pacote-entrega` (PG) | novo `data/demonstrative/plates/elaboracao-complementar.v1.json` (quatro peças da entrega; diagrama de estrutura, sem número) | projetos complementares (`#entregaveis`); a composição desktop é copiada byte a byte para `assets/projetos-complementares-engenharia/pacote-entrega.svg`, caminho exigido pelo contrato da rota e pelo kit de parceiros |
| `interfaces-versoes` (PH) | mesmo JSON (insumos → disciplina → interfaces → versão devolvida; diagrama de fluxo) | projetos complementares (`#escopo-interfaces`); idem, copiada para `assets/projetos-complementares-engenharia/interfaces-versoes.svg` |

## Por rota

Rodada de correção (2026-09-17, após revisores independentes): ver "Correções após revisão" no fim.

Esqueleto aplicado em todos os seis serviços: breadcrumbs → `section.svc-open` (kicker, `h1.t-service`,
lead = necessidade, `.measure` = trabalho, `.hero-deliverable` = documento, uma ação dominante +
alternativa em texto, nota com e-mail/telefone; `aside.aside-note` "Em 30 segundos") → `nav.page-index`
→ `sec--soft` com `figure.plate.plate--dominant` e `dl.keys` → "O que pedir" (`list-ruled`) → ação
contextual → método → condições consolidadas uma vez em `div.conditions` "Condições e limites" → um
único `sec--dark` de próximo passo com `.contact-primary` + `.contact-alt` + `ol.after` (três passos,
sem prazo). Todas as páginas passaram a carregar `assets/editorial.css` depois de `styles.css`.

### `/compatibilizacao-projetos-engenharia/` — COMPOSICAO_REDESENHADA
- Prancha PA dominante (R00 × R01); o bloco injetado `pos-inb-02:coord-register` foi movido inteiro;
  `dl.keys`, os três tipos de apontamento (`data-finding-type`), fases (Antes/Durante/Entrega) e as
  etapas combinadas preservados; a ilustração de infraestrutura passou a usar a prancha `drenagem-perfil`
  do piloto em `div.delivery`. Condições e limites consolidadas (formatos, autoria, ART, amostras, quem
  responde). Bloco escuro único com WhatsApp dominante, e-mail e telefone (`data-fallback-channel` = 3).
- Testes: `tests/coordination/*` (4+2+2+8+8 pass), `html_integrity failures=0`.
- Não feito: nada pendente.

### `/revisao-tecnica-projetos-engenharia/` — COMPOSICAO_REDESENHADA
- Prancha PB dominante; bloco injetado `pos-inb-02:review-extract` movido inteiro dentro de
  `#extrato-demonstrativo`; três profundidades como "O que pedir"; `#escopo-revisao` como método;
  condições consolidadas; bloco `author_identity` mantido (leituras e quem responde); bloco escuro
  `#contato-revisao` com triagem `#projetos` em `contact-alt`.
- Testes: `tests/intake/test_inb05_revisao_projetos.mjs` + `test_inb05_project_review_extract.mjs`
  (`# pass 19 # fail 0`), `tests/campaigns/orc-b2b-20260913/test_purchase_path.mjs` (`# pass 21`).
- Ajuste de redação exigido pelo gate de recusas: "Não oferecemos assinatura de projeto de terceiro…"
  (a forma "O que não oferecemos. Assinatura…" era lida como oferta).

### `/projetos-complementares-engenharia/` — COMPOSICAO_REDESENHADA
- Prancha PC dominante (rede de drenagem e pavimento); os dois esquemas exigidos pelo contrato
  (`pacote-entrega.svg`, `interfaces-versoes.svg`) passaram a ser as pranchas PG e PH (rodada de
  correção): `<picture>` com a composição móvel de `assets/pranchas/` e `<img src>` no caminho legado,
  que recebe a composição desktop byte a byte; `data-purchase` (4 itens), fases, método e limites
  preservados; o único bloco escuro `#escopo-projeto` fecha a página; ação contextual "Pedir a
  proposta agora" antes do método.
- Testes: `tests/inb-20260911/12/test_page_contract_projetos_complementares.mjs`
  (`page-contract-projetos-complementares-elaboracao 183/183 ok`; a linha
  `CONTRAPROVA_FAIL mutated_forbids_habilitação_irrestrita` já existia no commit base e é informativa).
- Teste ajustado (estética, rota exata): `landing_contact_before_method` passa a verificar
  `href="#escopo-projeto"` antes de `id="metodo-elaboracao"` (ação contextual), porque o esqueleto
  do caderno fecha a página com o bloco escuro único. Na rodada de correção o mesmo teste ganhou duas
  verificações novas (`legacy_asset_is_desktop_plate_*`, `mobile_plate_in_picture_*`): o arquivo no
  caminho legado tem de ser idêntico à prancha desktop e a `<picture>` tem de apontar a móvel.

### `/inspecao-diagnostico-edificacoes/` — COMPOSICAO_REDESENHADA
- Prancha PD dominante (mapa de manifestações e registro por item); relatório como "O que pedir";
  situações (`phases`) + etapas encadeadas em `div.delivery`; método; "Como decidir" com o aviso de
  risco imediato; condições consolidadas com todas as frases de honestidade local (município como
  contexto, sem lista de cidades, DDD 48 como canal, fotografia não diagnostica).
- Testes: `node --test tests/intake/test_inspecao_diagnostico.mjs` (`# pass 4`),
  `pytest tests/inspecao tests/pos-inb-20260911/07/test_navigation.py` (`13 passed`).

### `/assistencia-tecnica-pericial-engenharia/` — COMPOSICAO_REDESENHADA
- Prancha PE dominante (mesmo mapa com quesito, evidência e conclusão delimitada) + tabela de
  evidência preservada em largura total; papéis que não se misturam; método; como contratar;
  condições consolidadas ("o resultado pertence ao juízo"); bloco escuro com `/conflitos/`.
- Testes: `node tests/commercial/test_inb14_pericias_sst.mjs` (`114 passed, 0 failed`).

### `/seguranca-trabalho-apoio-tecnico/` — COMPOSICAO_REDESENHADA
- Prancha PF dominante (canteiro com proteções conferidas) + tabela de diagnóstico preservada;
  documentos distintos (PGR/LTCAT/AET/laudo); método; como delimitar; condições consolidadas
  (nenhum ato médico, nenhum pacote); bloco escuro com triagem `#sst`.
- Correção após o gate `index_surface`: o breadcrumb visível voltou a "Apoio técnico de SST" para
  coincidir com o `BreadcrumbList`.
- Testes: `test_inb14_pericias_sst.mjs` (`114 passed, 0 failed`), `test_inbound_gates.py`
  (55 OK; único FAIL é o canary 389 do pilar de medições, pré-existente no commit base).

### `/casos/demonstrativo-infraestrutura/` — COMPOSICAO_REDESENHADA (via gerador)
- Rodada de correção: `_plan_svg`, `_profile_svg` e `_section_svg` redesenhados em viewBox compacto
  (360 de largura; fonte 12,5 e 13), com o rótulo PV-01 fora da faixa (abaixo dela), as camadas da
  seção rotuladas por leader à direita (a capa de 0,04 m deixou de conter texto) e o perfil com linha
  mais forte; na coluna de 470 px os desenhos escalam para cima e no 390 rendem 1:1. Nenhum número
  novo: tudo vem dos extratos derivados do JSON (`consumption.v1.json` inalterado).
- `scripts/demonstrative/infrastructure_pilot/render.py` reescrito no modelo de
  `private_project/render.py`: `svc-open` com cadeia necessidade/trabalho/documento, perfil R00 como
  `plate--side`, `page-index`, seções `sec` com `t-editorial`, achados em `coord-finding`/`rv-extract`,
  bloco escuro único; `<style>` inline removido (agora `assets/editorial.css`). Os cinco SVG antigos
  (laranja/vermelho/azul) foram recoloridos no vocabulário da prancha (INK/MUTED/RULE/SOFT/GREEN/LIME/
  GREEN_100, hachura 45°) — pendência P5 do estado. Regenerado com
  `python3 -m scripts.demonstrative.infrastructure_pilot.generate`; `consumption.v1.json` inalterado.
- Testes: `npm run test:infrastructure-demonstrative` (`23 passed`),
  `scripts/pseo/tests/test_demonstrative_csv_packaging.py` (`2 passed`), `test:private-readiness`.
- Teste ajustado (estética, rota exata): `test_page_is_demonstrative_not_client_and_has_required_title`
  aceita `<h1 class="t-service" …>` com o texto exato de `PAGE_H1`.

### `/parcerias-engenharia/` — COMPOSICAO_REDESENHADA
- Abertura no esqueleto (percurso de quem encaminha: escritórios, construtoras, advogados), três passos,
  os quatro conjuntos `partner-kit` com blocos `partner-share` preservados byte a byte, condições
  consolidadas e bloco escuro único com os três canais medidos; sem promessa comercial nova.
- Rodada de correção: `parcerias-engenharia/styles.css` reescrita (folha da rota, já existente):
  kits como linhas regradas em coluna única (texto à esquerda, compartilhamento à direita no desktop),
  ações em linha, `textarea` e botões na tipografia e nas réguas do site, botões `[hidden]` continuam
  ocultos; regras órfãs da identidade antiga podadas; zero raio, sombra ou degradê (auditoria de
  decoração da folha: 0/0/0). O `style="min-height:44px;min-width:44px"` dos botões é anterior ao lote
  e ficou intacto (DOM byte a byte). O `!important` do bloco `@media print` anterior foi removido
  (seletores com especificidade suficiente).
- Testes: `scripts/distribution/tests/test_partner_reference.mjs` (`OK partner_reference`; no commit
  base falhava `cta_imposes_meeting` por falta da frase "Descrever uma necessidade", agora presente),
  `tests/pos-inb-20260911/05/test_partner_kits_contract.mjs` (`OK pos-inb-20260911/05 partner kits`).

### `404.html` — COMPOSICAO_REDESENHADA
- `section.state` com código, título, ação única para `/triagem-tecnica/`, alternativas em texto e
  `ul.state__paths` com oito situações (cada uma com o que entrega); estilos inline do conteúdo
  removidos; prefill do WhatsApp flutuante inalterado.
- Correção da frase do relatório anterior ("`class=\"no-js\"` mantida"): a fonte **não** trazia a
  classe; ela entrava só no build (`scripts/pseo/build_site.py:520-545` acrescenta `no-js` a toda
  página e só troca por `js` quando há `/script.js`). Na rodada de correção a fonte passou a trazer
  `class="no-js"`, como as demais páginas-fonte, e o rodapé inferior ficou igual ao das outras rotas
  (`nav.footer-authority`). Sem script de comportamento, o `.menu-toggle` fica oculto e a navegação
  móvel é estática (`.no-js .mobile-nav{display:flex;position:static}`): não há menu a abrir, por isso
  não existe captura de menu para esta rota.
- Testes: `scripts/site/test_integral_solution_copy.py` (`6 passed`), `html_integrity failures=0`,
  `test_skip_link_coverage` (`OK test:skip-link`).

### `obrigado.html`, `obrigado-contrato.html`, `obrigado-edital.html`, `obrigado-operacao.html` — COMPOSICAO_REDESENHADA
- `section.state` (código, `h1#confirmation-title`, `p#confirmation-summary`, `#receipt-id`, ação
  dominante e alternativas), os dois blocos `data-confirmed-only hidden` com o texto já publicado
  (inclusive o prazo existente; nenhum prazo novo), `ol.after.after--light` "o que acontece depois" e
  `ul.state__paths` com caminhos alternativos. Script do recibo e `data-event-name` preservados.
  Evidência adicional: `obrigado.html-1440x1000-confirmed-lote-a.jpg` (estado confirmado com recibo
  de sessão).
- Testes: `scripts/site/test_document_intake_honesty.py` (`9 passed`), `seo/scripts/test_form_funnel.mjs`
  (`FORM_FUNNEL_OK`), `test_copy_gates`/`test_design_gates` via `test:copy`/`test:design` (OK).

### `comercial/privacidade-leads/`, `comercial/termos-diagnostico-b2g/` — HERANCA_VISUAL_VALIDADA
- Capturas confirmam tipografia herdada (`Archivo Var` no h1), sem overflow. Única edição (rodada de
  correção): o hífen solto do h1 virou dois-pontos ("Termos para pessoa jurídica: Diagnóstico…",
  "Aviso de privacidade: leads e contratação"); `scripts/revops/test_privacy.mjs` e
  `test_interface_coverage` passam. O cabeçalho reduzido (só logotipo, sem nav, CTA ou `menu-toggle`)
  é intencional e idêntico a `origin/main`: instrumento contratual/aviso lido a partir do fluxo de
  contratação; por isso não há captura de menu (anotado em `matriz-lote-a.json`).

### `comercial/radar-decisorio/` — PRESERVADA_COM_JUSTIFICATIVA
- Oferta paga com formulário, preço e medição de primeira dobra; tipografia já herda Archivo. O heroi
  em degradê vem de `styles-offers.css` (integrador): pedido 4.

## Testes do §4 (última linha real de cada execução, rodada de correção, HEAD do lote)

| Teste | Resultado |
| --- | --- |
| `python3 scripts/site/html_integrity.py --root . --surface source` | `HTML_INTEGRITY surface=source html_files=235 faq_pages=145 faq_questions=422 failures=0` |
| `npm run test:design` | exit 0 (últimas linhas `HTML_INTEGRITY_TESTS_OK` / `HTML_INTEGRITY … failures=0`) |
| `npm run test:copy` | `OK test_shipped_check_still_fails_on_em_dash` (exit 0) |
| `npm run test:brand` | `OK test_home_jsonld_matches_corporate_positioning_and_preserves_b2g_services` |
| `npm run test:authority` | `OK 8 correction checks` |
| `npm run test:integral-solution` | `PASS: the public surface presents an integral solution` |
| `npm run test:self-deprecation` | `PASS: no self-deprecating communication on the public surface` |
| `npm run organic:test` | `279 passed in 15.72s` |
| `npm run test:inbound-gates` | exit 1; único FAIL: `FAIL test_measurement_delay_canary_389_is_single_url_and_fail_closed medicoes-glosas-obras-publicas/index.html` (herdado do commit base 8860f5577; pedido 7); demais OK |
| `npm run test:deliverables-registry` | `deliverables-registry: 3650/3650 checks passed` |
| `npm run test:real-proof-registry` | `real-proof-registry: canonical_records=0 public_pages=268 problems=0` |
| `npm run test:commercial-contract-consistency` | `commercial-contract-consistency: 521/521 checks passed` |
| `npm run test:public-offer-truth` | `public-offer-truth: 132/132 checks passed` |
| `npm run test:page-contract-complementares` | `page-contract-complementares: 273/273 checks passed` |
| `npm run test:page-contract-projetos-complementares` | `PASS page-contract-projetos-complementares-elaboracao` (187/187 ok; a linha `CONTRAPROVA_FAIL mutated_forbids_habilitação_irrestrita` é informativa e já existia no commit base) |
| `npm run test:page-contract-eight` | `page-contract-eight: 735/735 checks passed` |
| `npm run test:cta-form-next-state` | `CTA_FORM_NEXT_STATE_OK routes=31` |
| `npm run test:form-funnel` | `FORM_FUNNEL_OK {…"submit_journey":"contrato","home_multistep":true}` |
| `node --test tests/intake/test_mv03_adaptive_intake.mjs` | `# fail 0` |
| `npm run test:inspecao-diagnostico` | `4 passed in 0.23s` |
| `npm run test:inb14-pericias-sst` | `PASS inb14 pericias sst` (`114 passed, 0 failed`) |
| `npm run test:private-readiness` | `ALL private_project_technical_readiness checks passed` |
| `npm run test:hub-links` | `15 passed` |
| `npm run test:infrastructure-demonstrative` | `23 passed in 0.37s` |
| `npm run test:private-project-demonstrative` | `15 passed in 0.39s` |
| `python3 -m pytest scripts/demonstrative/plates -q` | `16 passed in 0.36s` |
| `python3 -m scripts.demonstrative.plates.render_plates --check` | `plates_ok: 24 files match assets/pranchas` |
| `python3 -m scripts.demonstrative.plates.inline --check` | `OK plates inline` |
| `node --test tests/coordination/test_*.mjs` (por arquivo) | 4/2/2/8/8 pass, 0 fail |
| `node --test tests/intake/test_inb05_revisao_projetos.mjs tests/intake/test_inb05_project_review_extract.mjs` | `# fail 0` |
| `python3 -m pytest tests/inspecao tests/pos-inb-20260911/07/test_navigation.py -q` | `13 passed in 0.37s` |
| `node tests/pos-inb-20260911/05/test_partner_kits_contract.mjs` | `OK pos-inb-20260911/05 partner kits` |
| `node scripts/distribution/tests/test_partner_reference.mjs` | `OK partner_reference` |
| `node --test tests/pos-inb-20260911/02/test_purchase_proof.mjs` | `# fail 0` |
| `node --test tests/pos-inb-20260911/04/test_copy_and_static.mjs` | `# fail 0` |
| `python3 -m pytest tests/pos-inb-20260911/06/test_url_checklist.py -q` | `6 passed in 5.31s` |
| `node --test tests/campaigns/orc-b2b-20260913/test_purchase_path.mjs` | `# fail 0` |
| `node --test tests/campaigns/pos_inb_20260911/10/test_composition.mjs` | `# fail 0` |
| `python3 -m pytest scripts/site/test_document_intake_honesty.py -q` | `9 passed in 0.36s` |
| `python3 -m pytest scripts/pseo/tests/test_responsive_public_html.py -q` | `6 passed in 0.23s` |
| `node seo/scripts/test_event_dictionary.mjs` | `EVENT_DICTIONARY_OK …` |
| `python3 scripts/site/test_skip_link_coverage.py` | `OK test:skip-link` |
| `node scripts/revops/test_privacy.mjs` | `ALL privacy checks passed` |
| `node scripts/site/test_interface_coverage.mjs` | `INTERFACE_COVERAGE_OK routes=234 axe=51x2 lighthouse_families=45 pages=47` |
| `npm run audit:css-usage` (suíte da revisão) | exit 1: `FAIL new_unused_class styles.css .is-dark` / `.proof-figure--pair` / `.sla-box` / `.split--even` / `FAIL decoration_regression border_radius 162>158` (o último já falha no commit base). **Bloqueia `site-ci` até a recaptura do baseline pelo integrador: pedido 3.** |
| `npm run test:page-contract-contratos` (suíte da revisão) | `CONTRACT_DEFENSE_FROZEN_DRIFT: medicoes-glosas-obras-publicas/index.html expected=124e31f2… actual=7288c195…` (idêntico no commit base 8860f5577, reproduzido em worktree isolada; pedido 7) |
| `npm run test:bofu-dominance` (suíte da revisão) | `9 failed, 108 passed` (idêntico no commit base; pedido 7) |
| `npm run test:first-fold-contract` (suíte da revisão) | `first-fold-contract: 3 check(s) failed` (1929/1932; idêntico no commit base; pedido 7) |
| `npm run build:site` + `npm run test:html-integrity:site` (clone limpo de c312cf4e8, Node 22) | build exit 0; `CACHE_CONTRACT_OK fallback_max_age=3600 immutable_assets=3 …` |
| `node scripts/site/test_ui_geometry.mjs` (clone limpo de c312cf4e8, `_site` construído, `CHROME_PATH` do Chromium local) | `All UI geometry tests passed` |
| `npm run test:contact-journeys` (clone limpo de c312cf4e8, `_site` construído, `CHROME_PATH`) | `CONTACT_JOURNEYS_FAIL [{"name":"journey_harness_runtime"…"home form step transition did not activate"…}]`: 447 verificações, 446 passam; a única falha é a etapa do formulário da home (integrador, idêntica no commit base, pedido 8). As 14 jornadas rodaram; as quatro que terminam em rotas do lote A (`condominio_anomalia` e `pequena_reforma` → inspeção, `pericia_assistencia` → assistência, `seguranca_trabalho` → SST) somam 104 verificações de rota + 16 na home, todas OK, inclusive com o link da triagem movido para `p.contact-note` (`build/reports/contact-journeys/report.json`). |

## Testes ajustados (estética, rota exata)

1. `tests/inb-20260911/12/test_page_contract_projetos_complementares.mjs::landing_contact_before_method`
   — verifica `href="#escopo-projeto"` (ação contextual) antes de `id="metodo-elaboracao"` em vez de
   exigir o bloco de contato antes do método; o esqueleto do caderno fecha a página com o bloco escuro único.
2. `tests/demonstrative_infrastructure/test_infrastructure_pilot.py::test_page_is_demonstrative_not_client_and_has_required_title`
   — aceita atributos no `<h1>` (classe `t-service`), texto exato de `PAGE_H1` mantido.

3. `tests/inb-20260911/12/test_page_contract_projetos_complementares.mjs::runShipped` (rodada de correção)
   — duas verificações **acrescentadas**: `legacy_asset_is_desktop_plate_{pacote-entrega,interfaces-versoes}`
   (o arquivo no caminho legado é byte a byte a prancha desktop) e `mobile_plate_in_picture_*` (a
   `<picture>` aponta a composição móvel). Nada foi afrouxado; `requiredSrc` e `asset_exists` continuam.

Nenhum teste de veracidade, preço, responsabilidade, privacidade, formulário ou persistência foi alterado.

## Jornadas de aceite

- **A** (visitante privado): `/` → situações → `/servicos/#servico-projeto` → `/compatibilizacao-projetos-engenharia/`
  (prancha PA na primeira seção depois da abertura; o registro entregue logo abaixo) → `#pedido-compatibilizacao`
  com WhatsApp pré-preenchido com o contexto de interfaces, e-mail e telefone. `test:hub-links` e
  `tests/coordination/test_page_contract.mjs` confirmam os links e os canais; capturas 390/1440 conferidas.
- **E** (não sabe o nome do serviço): `404.html` e cada abertura de serviço dizem "você não precisa saber o
  nome do serviço / descreva a situação; a resposta nomeia o trabalho"; ação para `/triagem-tecnica/`; nas seis
  páginas o bloco "O que pedir" abre com a orientação de descrever a decisão. Sem rejeição em nenhuma rota.

## Pendências e o que não foi feito

- Dois valores de `data-section-archetype` deixaram de existir como seção própria, porque o conteúdo foi
  redistribuído (nenhuma das rotas está em `archetype_gated_surfaces`, mas o integrador refaz o
  inventário `archetype-gate-rollout.json` a partir das anotações): em `/projetos-complementares-engenharia/`
  o `analysis_abstract` (`#resposta-em-cinco-pontos`) foi dissolvido, e os cinco ids
  (`situacao-atendida`, `entrega`, `amostra-disponivel`, `limites-materiais`, `pedido-proposta`) passaram
  para a abertura, a seção da amostra, "O que pedir", as condições e o bloco escuro. Em
  `/inspecao-diagnostico-edificacoes/` o `compare_ladder` (inspeção/diagnóstico/reparo/perícia) tinha
  virado um `div.delivery` dentro de `journey_paths`; na rodada de correção voltou a ser seção própria
  (`#etapas-encadeadas`, `data-section-archetype="compare_ladder"`), então só o `analysis_abstract` de
  projetos complementares continua dissolvido. Os demais arquétipos foram levados para a seção que
  descreve a mesma função; `contextual_next_action` e `evidence_record` entraram como no piloto.

- Lighthouse por rota não foi medido neste lote (o caderno §4 não o exige por lote); cada página de
  serviço ganhou uma `<picture>` externa por prancha (≤ 10 KB por SVG) e a folha `assets/editorial.css`.
- Alturas em 390 px ficaram entre 11.661 (parcerias) e 15.571 px (compatibilização), abaixo do piloto
  (quantitativos 19.739 px); nenhuma rota tem overflow em 320 px.
- Os pedidos 1–10 (`pedidos-lote-a.md`) ficam com o integrador. **O pedido 3 (baseline de uso de CSS)
  bloqueia o `site-ci` do ramo de integração** até a recaptura; o pedido 7 (quatro suítes do pilar de
  medições) já reprovava no commit base. Nenhum dos dois é resolvível dentro dos arquivos do lote.
- Desenhos do exemplo de infraestrutura: corrigidos no gerador (legíveis no 390, rótulos fora dos
  elementos finos), mas continuam uma composição por figura (SVG inline, sem variante móvel própria),
  como no caso demonstrativo privado do piloto. A migração para o módulo de pranchas (JSON →
  desktop/móvel, `family_private.py`, fontes `infra`/`infra_consumption` já registradas) fica como
  pendência do lote; a prancha PC (`drenagem-rede`) e a P2 (`drenagem-perfil`) já cobrem planta e
  perfil nas páginas de serviço.
- Tabelas de 3 colunas no 390 (evidência, matriz de interfaces, diagnóstico de SST) continuam com
  rolagem lateral e dica; o empilhamento pede CSS compartilhado (pedido 9).
- `seo/PUBLIC-ARTIFACT-MANIFEST.json` foi alterado pelo `generate` do exemplo de infraestrutura e
  revertido (`git checkout --`) pela regra do lote (relatório gerado por build); o `build:site` do
  clone limpo o regenera (exit 0, `CACHE_CONTRACT_OK`), e `organic:test`/`test:html-integrity:site`
  passam com a árvore tal como commitada.

## Correções após revisão (achado → ação → prova)

Revisores independentes (visual e contratos), 2026-09-17. Sem ALTA aberto dentro do lote; os dois
ALTA apontam para arquivos do integrador e estão registrados com evidência (pedidos 3 e 7).

| # | Sev. | Achado | Ação | Prova |
| --- | --- | --- | --- | --- |
| 1 | ALTA | `audit:css-usage` reprova com quatro classes de `styles.css` sem uso (`.is-dark`, `.proof-figure--pair`, `.sla-box`, `.split--even`), ausentes da tabela de testes. | Não corrigível no lote: o baseline (`data/design/css-usage-baseline.json`) é a última etapa da cadeia de recaptura de CSS e as classes não foram reinseridas no HTML só para satisfazer o contador. Pedido 3 reescrito com o comando, a linha de CI e os FAIL finais; a suíte entrou na tabela de testes. | tabela acima (`npm run audit:css-usage`); `pedidos-lote-a.md` item 3. |
| 2 | ALTA | Pilar de medições reprova quatro suítes (canary 389, page-contract-contratos, bofu-dominance, first-fold-contract); o pedido 7 citava só uma. | Pedido 7 reescrito com as quatro suítes, os hashes e a prova de que reprovam identicamente no commit base 8860f5577 (worktree isolada) e que o lote não toca nos arquivos (`git diff 8860f5577..HEAD --name-only -- medicoes-glosas-obras-publicas/ tests/bofu_dominance/ data/bofu-dominance/ scripts/commercial/ tests/commercial/` vazio). | tabela acima; `pedidos-lote-a.md` item 7. |
| 3 | MEDIA | `.text-link` em parágrafo corrido quebra a leitura (6 rotas). | Refutação parcial: o piloto usa `.text-link` em prosa (`quantitativos-orcamento-obras/index.html` L136, L303, L321, L349, L357), logo "reservar para ações isoladas" colocaria o lote fora do piloto; o defeito real é `display:inline-flex;min-height:48px;font-size:.91rem` (`styles.css` L2) num link com texto irmão. Regra aplicada: link com texto irmão no mesmo parágrafo → `<a>` simples (herda `.sec p a`/`.svc-open p a` de `styles.css:1317`: sublinhado, peso 700); link sozinho no parágrafo → mantém `.text-link` (o inline-flex é o correto para alinhar o ícone). Trocas: compat L246; revisão L178, L257; assistência L185; complementares L138, L206, L237, L261; inspeção L164. Mantidos: compat L175/L208, revisão L203/L258, complementares L177/L263/L264, inspeção L142, SST L165. | capturas `*-1440x1000-full-lote-a.jpg` (compat "Dois guias", revisão "Duas leituras", assistência "Discussão trabalhista"). |
| 4 | MEDIA | Ressalvas repetidas 3–6× por tela em "Prova antes do método". | Deduplicadas fora dos blocos injetados (o kicker de cada `article.coord-finding` é gerado por `scripts/coordination/interference_register.mjs:317` e reescrito por `compose:purchase-proof`; é rótulo de veracidade com o link de procedência, mantido uma vez por bloco). Removidas: frase final da legenda da prancha (compat, complementares, SST, revisão, inspeção), subfrase da ficha "Cliente" (agora descritiva: recorte/fachada/canteiro sintéticos), legenda da tabela ("Não é caso real nem validação assinada") em SST. O carimbo da prancha (dentro do SVG) e "Amostras desta página" nas condições permanecem. `grep -c 'obra de cliente'`: compat 6 → 3 (dois kickers + condições), complementares 4 → 1, revisão 3 → 2. | diff dos commits `80f02498a`, `9b0076739`. |
| 5 | MEDIA | Revisão: mesmo texto publicado duas vezes (intro e `div.panel.measure`). | Painel removido; a intro ganhou a ponte "Abaixo, o extrato completo, na forma em que o relatório separa…". `grep -c 'entra 0,10 m no volume'` → 1. | `revisao…-1440x1000-full-lote-a.jpg`. |
| 6 | MEDIA | Complementares: dois esquemas antigos (1200×640, fonte 14–16) em coluna de 470 px, mesma composição escalada. | Pranchas PG e PH geradas de `data/demonstrative/plates/elaboracao-complementar.v1.json` (`family_private.py`, desktop 1200×400/460 e móvel 360×420, fonte mínima 12,5), em `figure.plate--dominant` de largura total: PG em `#entregaveis` (o kit de parceiros aponta para lá), PH em `#escopo-interfaces`. O contrato (`requiredSrc`) e o kit (`partner-reference-kits.v1.json:149`) exigem os caminhos legados: eles recebem a composição desktop byte a byte e a `<picture>` escrita à mão traz a móvel por `<source media="(max-width:699px)">`; o teste da família prova a igualdade. Gates de numerais/paleta/recomposição: `16 passed`. | `projetos-complementares…-1440x1000-full` (y≈3660–4130 e 5250–5730) e `-390x844-full` (col. PG legível); `assets-lote-a.json`. |
| 7 | MEDIA | Parcerias: kits em cartões 2×2 com widgets nativos, três links empilhados. | Só CSS na folha da rota (`parcerias-engenharia/styles.css`): coluna única regrada, texto à esquerda e compartilhamento à direita no desktop, ações em linha, `textarea`/botões na tipografia e nas réguas do site (altura suficiente para URL e resumo, inclusive no 390), `[hidden]` respeitado; DOM dos kits intacto (`test_partner_kits_contract` OK). Rota continua COMPOSICAO_REDESENHADA. | `parcerias…-1440x1000-full` (y≈2300–2900), `-390x844-full`. |
| 8 | MEDIA | 404: menu inerte no 390; relatório afirmava `class="no-js"` mantida. | Refutação parcial com correção: o artefato construído já recebe `no-js` (`build_site.py:520-545`) e só troca por `js` quando há `/script.js`, logo o 404 publicado nunca teve controle inerte (o toggle fica oculto e a navegação móvel é estática); a fonte, porém, divergia e a frase do relatório era falsa. Fonte passou a trazer `class="no-js"` (como as demais páginas-fonte e como `tests/coordination/test_page_contract.mjs:140` espera), rodapé igualado ao padrão e frase corrigida aqui. A captura de menu foi retirada da evidência (não existe menu a abrir). | `404.html-390x844-fold-lote-a.jpg` (nav estática sob o cabeçalho); `scripts/pseo/tests/test_responsive_public_html.py` `6 passed`. |
| 9 | MEDIA | Botão dominante fora da dobra no 390 (assistência, complementares) e entre 700–815 nas demais. | Copy da abertura encurtada (frases movidas para blocos onde já existiam: aside "Em 30 segundos", "O que pedir", condições); contratos preservados (`landing_hero_*`, needle da contraprova, `foldText` do inb05). Medido no Chromium a 390×844 (`getBoundingClientRect().top` do `main .button-primary`): compat 697, revisão 671, complementares 673, inspeção 688, assistência 690, SST 664 (piloto quantitativos: 738). | `*-390x844-fold-lote-a.jpg` das seis rotas (botão visível). |
| 10 | MEDIA | Infraestrutura: rótulo PV-01 atravessado por DR-01, "capa" cortada, fontes 7–9 px no 1440 e ~4 px no 390, perfil lateral fraco. | `render.py`: planta, perfil e seção em viewBox de 360 de largura (fonte 12,5/13), PV-01 abaixo da faixa, camadas rotuladas por leader fora da capa, perfil com linha 2,4 e rótulos empilhados; na coluna de 470 px o desenho escala para cima, no 390 rende 1:1. Regenerado com `generate`; `consumption.v1.json` inalterado; `test:infrastructure-demonstrative` `23 passed`. Migração ao módulo de pranchas registrada como pendência (acima). | `casos…-1440x1000-full` (y≈0–1000 e 2100–3400), `-390x844-full`. |
| 11 | MEDIA | Inspeção: colisão entre "Situações" e "Etapas" (`div.delivery` dentro de `journey_paths`). | "Etapas que se encadeiam" virou `section.sec` própria (`#etapas-encadeadas`, `data-section-archetype="compare_ladder"`, h2 `.t-editorial`) e entrou no índice de página; resolve também a pendência do arquétipo `compare_ladder` dissolvido. | `inspecao…-1440x1000-full` (y≈3700–5000). |
| 12 | BAIXA | Inspeção: aside de risco esticado. | `div.grid-2` → `div.split` (`.split>.aside-note{align-self:start}` já existe em `css/components.css`). | `inspecao…-1440x1000-full` (y≈6000–7000). |
| 13 | BAIXA | "Três canais diretos" com quatro itens (6 rotas). | O link da triagem saiu de `ul.contact-alt` para `p.contact-note` ("Se preferir escrever com calma…", como já era na compatibilização); em parcerias o título virou "Canais diretos com o Engº Tiago Sasaki" (a frase "Descrever uma necessidade" exigida por `test_partner_reference` permanece). `data-fallback-channel` continua = 3 por rota. | `test:cta-form-next-state` `routes=31`; `test_partner_reference` OK. |
| 14 | BAIXA | Complementares: eyebrow embutido em parágrafo corrido com negrito solto. | Tabela em `figure.proof-figure` de largura total com `figcaption` curta (tag + uma frase) e o parágrafo de uso separado, sem negrito. | `projetos-complementares…-1440x1000-full` (y≈1900–3000). |
| 15 | BAIXA | Tabelas de 3 colunas rolam no 390 e escondem a coluna-chave. | Pede CSS compartilhado (empilhamento ≤ 620 px): pedido 9. Não feito no lote. | — |
| 16 | BAIXA | Pedido 4 tratava `styles-offers.css` como rota exata. | Reescrito com as 11 rotas e a cadeia de recaptura; rota segue PRESERVADA_COM_JUSTIFICATIVA. | `pedidos-lote-a.md` item 4. |
| 17 | BAIXA | Termos/privacidade: cabeçalho reduzido sem registro de intenção; hífen no h1. | Intenção anotada na matriz (`review_round_1`: instrumento contratual, idêntico a `origin/main`); h1 com dois-pontos nas duas rotas; `test_privacy` e `test_interface_coverage` OK. | `matriz-lote-a.json`; commit `c312cf4e8`. |
| 18 | BAIXA | 404 com rodapé diferente. | `nav.footer-authority` padrão. | `404.html-1440x1000-full-lote-a.jpg`. |
| 19 | PREF. | Complementares: rótulo do CTA do cabeçalho ≠ herói. | Refutado como fora do lote: o rótulo vem de `data/organic/public-family-registry.json:1148` (`value_first_header_cta.label`) e é normalizado no build por `scripts/site/shell_nav.py:340-375` (`declared_value_first_cta`), ambos do integrador; editar à mão seria sobrescrito. | caminhos citados. |
| 20 | PREF. | Pranchas PA/PB/PF com branco entre desenho e carimbo; ficha em ~9–10 px. | Não feito nesta rodada (coerente com o piloto: P1–P4 têm a mesma altura de folha); anotado como melhoria para a campanha de fechamento. | — |
| 21 | PREF. | Tabela de evidência: primeira coluna larga. | Pede CSS compartilhado: pedido 9 (c). | — |

Ferramenta de captura: `/404.html` não pôde ser capturada com `capture.mjs` porque o passo do menu
clica num `.menu-toggle` oculto e aborta (`Node is either not clickable`); a rota foi capturada com uma
cópia temporária da ferramenta cuja única diferença é `if (toggle && toggleVisible)` (diff no pedido 6b).
As outras rotas usaram a ferramenta original; `manifest-lote-a.json` regravado.

## Correções após o aceite (síntese de 2026-09-17, integração a7068f671)

Frente de correção do aceite do lote A sobre o ramo de integração (três lotes, duas ondas e as correções de
CSS do integrador já aplicadas em `a7068f671`). Escopo: serviços privados, parcerias, caso de infraestrutura,
404/obrigado*, contato. Evidência nova com tag `aceite-fix` em `evidence/lote-a/` (`manifest-aceite-fix.json`:
nove rotas, overflow 320 = 0 em todas, `Archivo Var` no h1). Porta 8811 sobre a árvore fonte.

### Achado → ação → prova

| Id | Sev. | Rota(s) | Ação | Prova |
| --- | --- | --- | --- | --- |
| M-02 | MEDIA | `/parcerias-engenharia/` | Kicker "Encaminhamento de engenharia em nome do seu cliente" e h1 "Encaminhe a parte de engenharia que falta no seu pacote e siga com o seu cliente." (nomeiam a oferta de encaminhamento, distinta do h1 da home; `<title>`, description e JSON-LD intactos). Prancha PH (`interfaces-versoes`, já gerada por `family_private` e registrada em `assets-lote-a.json`) entra em "Como funciona" como `figure.plate.plate--dominant` pelo slot `<!-- plate:interfaces-versoes -->` (`inline.py`, sem `<picture>` à mão); legenda com `span.tag` "Exemplo demonstrativo" e os quatro blocos IV-A a IV-D. `usage` da prancha atualizado. | `parcerias-engenharia-1440x1000-full-aceite-fix.jpg` (prancha a y≈1.400–2.500), `-390x844-fold-aceite-fix.jpg` (kicker em duas linhas curtas); `python3 -m scripts.demonstrative.plates.inline --check` → `OK plates inline`; `node --test tests/pos-inb-20260911/05/test_partner_kits_contract.mjs` → pass 1. |
| M-06 | MEDIA | 7 rotas do lote (compatibilização, revisão, complementares, inspeção, assistência, SST, parcerias) | Ordem do bloco escuro refeita sem CSS: na primeira coluna do `.capture-grid` ficam `t-kicker`, `h2`, `h3` dos canais e `div.contact-primary` (ação dominante + `ul.contact-alt`); a segunda coluna vira `<aside aria-label="O que informar e o que acontece depois">` com a prosa, `ol.after` e os `p.contact-note`. Nenhum `id`, `href`, `data-*`, texto de canal ou `data-form-value/-boundary` mudou (`cta_form_next_state_audit` lê por marcador, não por ordem). Quantitativos (integrador): pedido 28 com a mesma estrutura. | Sonda `probe-anchors.mjs` (scratchpad) a 390×844, topo da ação dominante após o salto (scroll-margin 6 rem): compatibilização 282, revisão 311, complementares 282, inspeção 311, assistência 339, SST 338, parcerias 339 px (antes: 929/958/737/660/635/688/609; quantitativos 1.037 continua no integrador). Capturas `*-390x844-full-aceite-fix.jpg` (bloco escuro) e `compatibilizacao-…-1440x1000-full-aceite-fix.jpg` (y≈8.300: título e ação à esquerda, prosa e passos à direita). |
| M-07 | MEDIA | `/projetos-complementares-engenharia/` | CTA do meio "Pedir a proposta agora" → "Conversar sobre o projeto" (mesmo rótulo do cabeçalho, fixado em `data/organic/public-family-registry.json:1148`); o herói mantém "Solicitar proposta de elaboração" porque `landing_cta_elaboration`, `landing_js_not_required` e `landing_single_primary_label` (exatamente uma ocorrência em `main`) e `partner-reference-kits.v1.json:137` o exigem. Resultado: dois rótulos em vez de três, sem "agora"; um só rótulo depende de mudar o registro (integrador). | `grep -c 'Conversar sobre o projeto' projetos-complementares-engenharia/index.html` = 3, `grep -c agora` no CTA = 0; `npm run test:page-contract-projetos-complementares` → `187/187 ok`; `test:value-first-copy` 65/65. |
| M-04 | MEDIA (parte do lote) | `/projetos-complementares-engenharia/` (+ assistência e SST) | `div.table-scroll` da matriz ganha `role="region"` (já tinha `tabindex=0` e `aria-label`); nas três rotas a `<table>` recebe `aria-labelledby` apontando para a `figcaption` (que ganhou `id`), em vez de `<caption>` dentro do wrapper rolável (a caption ficaria cortada, como o B-13 aponta nos casos B2G). A dica "Deslize a tabela…" já existia abaixo de 700 px. Quantitativos: pedido 27. | `grep -n 'role="region"' projetos-complementares-engenharia/index.html` L131; `audit:axe` sobre a árvore fonte: 0 critical/serious/moderate/minor nas 7 rotas do lote auditadas (mobile e desktop). |
| B-07 | BAIXA | compatibilização, revisão, complementares, assistência (+ inspeção e SST, mesmo padrão) | Na dica da abertura o link de telefone passa a "telefone" (o `href="tel:…"` e a mensagem do WhatsApp não mudam); o número aparece uma vez, no `hero-secondary` "WhatsApp (48) 98834-4559". | `compatibilizacao-…-390x844-full-aceite-fix.jpg` (abertura: "Também por e-mail ou telefone."); `test:page-contract-projetos-complementares::landing_hero_channel_line` (wa.me + mailto + tel na primeira seção) → ok. |
| B-06 | BAIXA | `/404.html` | `404.html` carrega `/script.js?v=fortune02` e o bootstrap `no-js→js` (o mesmo `_NO_JS_BOOTSTRAP` que `build_site.py:404` injeta quando há script; cabeçalho idêntico ao de `obrigado.html`, que já funciona com o script). Cabeçalho fixo de 61 px, menu móvel com ciclo de teclado, `capture.mjs` volta a capturar a rota sem cópia local. | `404.html-390x844-fold-aceite-fix.jpg` (cabeçalho compacto), `404.html-390x844-menu-aceite-fix.jpg` (menu aberto com "Fechar"); `html_integrity` failures=0; layout audit 7 larguras ok. |
| B-09 | BAIXA | `/inspecao-diagnostico-edificacoes/` (PD-M) | O contrato das pranchas limita a composição móvel a duas chamadas (`test_mobile_is_a_recomposition_not_a_scale`: `circle r=11 ≤ 2`; `callouts=4` reprovou). PD-M mantém 1 e 2 como chamadas e numera as outras duas no rótulo do desenho ("3 M-03", "4 M-04", M-04 dentro da fachada) e na legenda, agora com quatro linhas e os números do JSON (0,90 × 0,40 m; 3,20 m · 0,20 mm). Título da rota inalterado. | `scratchpad/fix/pd-m-after.png`; `inspecao-…-390x844-full-aceite-fix.jpg` (y≈1.500); `python3 -m pytest scripts/demonstrative/plates -q` → 16 passed; `render_plates --check` → `plates_ok: 40 files`. |
| B-03 | BAIXA | `/assistencia-tecnica-pericial-engenharia/` (PE-M) | Fachada 6 px acima (Y0 256) e notas em 308/323/338/353/370 (antes 316…382, atravessando o topo do carimbo em 384 = MOBILE_H − FRAME_PAD − TITLE_BLOCK_H); itens 3 e 4 numerados como em PD-M. | `scratchpad/fix/pe-m-after.png`; `assistencia-…-390x844-full-aceite-fix.jpg`; mesmos gates de pranchas. |
| B-02 | BAIXA | `/casos/demonstrativo-infraestrutura/` | `infrastructure_pilot/render.py::_section_svg`: nota em duas linhas ("Espessuras declaradas; volume geométrico," / "não dimensionamento."), folha 17 px mais alta (viewBox 360×296); caso regenerado (`generate`), SVG e HTML inline atualizados, hash em `assets-lote-a.json`. | `scratchpad/fix/secao-after.png` (nada cortado); `casos-demonstrativo-infraestrutura-390x844-full-aceite-fix.jpg`; `npm run test:infrastructure-demonstrative` → 23 passed. |
| P-04 | PREF. | `/parcerias-engenharia/` | Os doze `style="min-height:44px;min-width:44px"` saem dos botões de copiar/compartilhar; a folha da rota já dava `min-height:44px` e ganha `min-width:44px`. Mantido o estilo da folha (borda fina, fundo branco, 44 px) em vez de `.button-secondary`: é o vocabulário regrado da rota decidido na rodada anterior. `_headers` perde o hash sozinho no próximo `csp:refresh` (pedido 32). | `grep -c 'style="min-height' parcerias-engenharia/index.html` = 0; `parcerias-…-1440x1000-full-aceite-fix.jpg` (y≈2.900–3.700). |
| P-06 (mesmo padrão) | PREF. | 7 rotas do lote | O `contact-alt` de telefone do bloco escuro passa a `<span>Ligar…: <span class="nowrap">(48) 98834-4559</span></span>` (span externo único porque o `<a>` é `inline-flex`; sem ele o número virava um item de flex à direita). Triagem é do integrador: pedido 29. | `compatibilizacao-…-390x844-full-aceite-fix.jpg` (y≈12.460: "Ligar sobre a compatibilização:" / "(48) 98834-4559" sem quebra no número). |

### Conferido nas capturas (correções do integrador em a7068f671)

- A-01: `mark_visible_opaque_tokens` sobre `parcerias-engenharia/index.html` → 0 `<textarea>` com `<span data-opaque-token>` (1 span na página, fora das textareas).
- A-02 (compatibilização): `#registro-interferencias` usa `plate__picture--narrow` (variante 360×420 no slot de 456 px a 1440: escala 1,27, texto ≥ 12,5 px; a prancha dominante segue a folha 1200 a 1.166 px).
- M-03/M-16/M-28/B-04/B-05/B-08: tabelas dos serviços e do caso de infraestrutura com layout automático a 390, `.svc-open__note` e carimbos `dl.keys` conforme as capturas `aceite-fix`; nada reaberto.

### Refutados ou fora do contrato do lote (com evidência)

- **M-04 em assistência e SST**: o achado diz "sem role=region"; as duas rotas já tinham `role="region" tabindex="0" aria-label` (grep nas linhas 126). Faltava só o nome acessível da `<table>`, adicionado.
- **M-07 "um rótulo por página"**: parcialmente refutado — o rótulo do cabeçalho é dado de contrato (`public-family-registry.json:1148`) e o do herói é exigido por três testes e pelo kit de parceiros; o lote só podia mudar o CTA do meio. Feito.
- **B-09 "numerar as quatro chamadas"**: o gate `test_mobile_is_a_recomposition_not_a_scale` proíbe mais de duas chamadas na composição móvel; numeração feita por rótulo + legenda, não por chamada.

### Decisões do proprietário (PRESERVADA_COM_JUSTIFICATIVA / pendente)

- **A-04 (prazo de resposta)**: `obrigado.html` continua publicando "retorno em até 2 dias úteis…"; a home (`#descrever-situacao`) e a caixa do formulário são do integrador; a triagem também. O lote não alinha as três rotas sem a decisão (a) restaurar os dois prazos ou (b) retirá-los; nenhum prazo foi alterado.
- **M-25** (faixas do formulário da home), **M-26** (URL própria de avaliações), **M-27** (formulário on-page nas rotas privadas / link "Prefere escrever?" para `/?jornada=<x>#contato`), **M-19** (modelo precificado): sem alteração de preço, formulário, robots, canonical ou oferta; registrados aqui como pendentes.
- **P-01** (vocabulário antigo das pranchas do caso de infraestrutura; explicação Q-/ORC- em quantitativos): não feito nesta rodada — as pranchas do caso são geradas por `infrastructure_pilot/render.py` com testes próprios e o custo de regenerar planta/perfil no vocabulário `sheet.py` excede o aceite; PG/PH já levam carimbo "Sem escala · diagrama de fluxo". **P-02/P-03**: decisão de design (dobra, blocos escuros, `estado.json#design_contract.limits`), não do lote.

### Fora do escopo desta frente (família B / integrador)

B-01 (pedido 30), B-10 (26), B-11, B-13, B-15, M-24, B-28 (24), B-34 (25), B-35 (já no pedido 21), B-36 (23), P-06 na triagem (29), M-04/M-06 em quantitativos (27/28).

### Testes (última linha real, HEAD desta frente)

| Suíte | Resultado |
| --- | --- |
| `python3 scripts/site/html_integrity.py --root . --surface source` | `failures=0` |
| `test:design`, `test:copy`, `test:brand`, `test:authority`, `test:integral-solution`, `test:self-deprecation` | exit 0 |
| `organic:test` | `279 passed` |
| `test:inbound-gates` | `9 passed` |
| `test:deliverables-registry` / `real-proof-registry` / `commercial-contract-consistency` / `public-offer-truth` | 3650/3650 · problems=0 · 521/521 · 132/132 |
| `test:cta-form-next-state` | `CTA_FORM_NEXT_STATE_OK routes=31` |
| `test:form-funnel` | `FORM_FUNNEL_OK` |
| `test:page-contract-projetos-complementares` | `187/187 ok` |
| `test:page-contract-complementares` / `-disputas` / `-contratos` / `-eight` | 273/273 · 273/273 · 498/498 · 735/735 |
| `test:inb14-pericias-sst`, `test:attribution`, `test:lead-function`, `test:value-first-copy`, `test:task-doors`, `test:pos-inb-20260911-10` | PASS / ATTRIBUTION_OK / ALL checks passed / 65/65 / 240/240 / CHECK_OK |
| `tests/coordination/*`, `tests/intake/test_inb05_revisao_projetos.mjs`, `tests/pos-inb-20260911/05/…`, `tests/intake/test_mv03_adaptive_intake.mjs` | pass 23 fail 0 · pass 17 fail 0 |
| `test:infrastructure-demonstrative` | `23 passed` |
| `python3 -m pytest scripts/demonstrative/plates -q`; `render_plates --check`; `inline --check` | `16 passed`; `plates_ok: 40 files`; `OK plates inline` |
| `audit:layout-sitewide` (9 rotas tocadas × 7 larguras, base 8811) | `63/63; failures=0` |
| `audit:axe` (base 8811) | `zero critical/serious`; as 7 rotas do lote auditadas com 0 em todos os níveis |

Nenhum teste foi ajustado nesta rodada. `seo/PUBLIC-ARTIFACT-MANIFEST.json`, regravado por uma suíte,
foi devolvido com `git checkout --`.

### Mudanças que tocam hashes protegidos (para a recaptura do integrador)

Nenhum pilar B2G, canário, primeira dobra da home ou de `/entregas/` foi tocado. Mudam de propósito:
`assets/pranchas/inspecao-fachada-mobile.svg`, `assets/pranchas/pericia-fachada-mobile.svg`,
`casos/demonstrativo-infraestrutura/assets/secao-pavimento.svg` (+ `index.html` do caso) — hashes já
refeitos em `assets-lote-a.json`; rótulos de CTA/links (censo de CTAs) em `projetos-complementares-engenharia`
("Conversar sobre o projeto" no CTA do meio) e nas dicas das seis rotas de serviço ("telefone"); `_headers`
perde um hash de estilo inline no próximo `csp:refresh`.

## Onda 2 — escopo residual A: `/entregas/` (hub de entregas, rota crítica do gate de Lighthouse)

Ramo `campaign/salto-02/lote-a` avançado para a integração `2da310422` (três lotes da onda 1 e folha
editorial completa). Porta 8751. Evidência em `evidence/lote-a/entregas-*-onda2.jpg` e
`manifest-onda2.json` (390×844 e 1440×1000, dobra, página inteira e menu; h1 em `Archivo Var`;
overflow 320 = 0). Matriz: entrada `/entregas/` COMPOSICAO_REDESENHADA.

### O que mudou (uma rota)

`/entregas/` — COMPOSICAO_REDESENHADA, no esqueleto de hub do piloto, com o gerador
`scripts/commercial/render_public_catalog.mjs` emitindo a composição nova (`--check` limpo; o HTML
gerado não foi editado à mão):

- **Cabeça**: `+ /assets/editorial.css`, `− /styles-offers.css` (a página usava só `.offer-proof-line`,
  que agora é `t-caption` como no pilar de medições). `entregas/styles.css` continua ligada (é
  `implementation.stylesheet` em `task-doors.v1.json`, piso do gate de foco e do `css_type_floor`), mas
  foi reduzida de 19.094 para 7.159 bytes brutos (49 → 30 classes, todas em uso: `audit:css-usage`
  `CSS_USAGE_OK`; 9 raios, 3 sombras e 2 degradês a menos nos totais de decoração).
- **Abertura** (`header.deliverables-hero.svc-open`, `hero_split`): `p.eyebrow` bare (o gate de jargão
  lê o primeiro eyebrow), `h1.t-service` com o mesmo texto, `p.deliverables-lead.svc-open__lead`
  (necessidade), `p.hero-deliverable` (o que chega às mãos), `p.offer-proof-line.t-caption` (prova
  conferível, texto idêntico), `svc-open__actions` com **uma** ação dominante `button-primary
  button-lg` "Ver entregas e exemplos" → `#servicos-e-entregas` e "Solicitar proposta" →
  `#captura-entregas` como alternativa em texto, `svc-open__note` com o e-mail contextual (como no
  piloto; após a revisão — antes carregava uma segunda ressalva de dados sintéticos), `aside.aside-note`
  "Em 30 segundos" (Serviços · Análises com preço · Antes do aceite técnico · Quem assina) e
  `nav.page-index` com quatro âncoras. A ressalva de dados sintéticos fica uma vez na dobra, na
  `offer-proof-line`, que carrega também o gancho `hero-h1-note` do live audit. O antigo bloco navy
  "Comece pelo que você precisa" saiu (o índice o substitui). Botão dominante medido no Chromium:
  669 px no 390×844, 670 px no 1366×768.
- **Serviços de engenharia** (`section.capability-roll.sec#servicos-e-entregas`, `reading_method`):
  `sec-head--split` (kicker, h2 `t-editorial` com o texto exigido pelo gate, parágrafo) e
  prancha PG `figure.plate.plate--dominant` (`pacote-entrega`, já registrada em `assets-lote-a.json`;
  slot `<!-- plate:pacote-entrega -->` e `<picture>` emitidos pelo gerador exatamente como
  `plates/inline.py` os materializa, `inline --check` limpo; legenda com `span.tag` "Exemplo
  demonstrativo"), e `ol.list-ruled` com cinco linhas `01–05` (`article.capability-group` preservado
  com h3, parágrafo e `<a href="/…">`), esquema ilustrativo em `details` regrado na segunda coluna a
  partir de 900 px, link de saída com seta. Sem grade de cartões.
- **Ofertas com preço publicado** (`section.deliverables-vitrine.sec.sec--soft#enquadrar`,
  `catalog_index`): `sec-head--split`, índice pela decisão `nav.offer-decision-nav.page-index`
  ("Escolha pela decisão que está na mesa", 01–08 → `#entrega-NN`, sem caixa navy), e
  `div.vitrine-items > ol.list-ruled.list-ruled--offers` com as oito linhas: índice, kicker "Oferta
  publicada", h2 (ids `first-deliverable-title` … preservados) e preço à direita (`strong` bare, lido
  por `test_brand_contract`), `dl.vitrine-item__facts` como lista de definição regrada (rótulo | valor;
  12 linhas, entrega antes do preço, "Pacote e crédito" como última linha com a copy byte-idêntica em
  `p.vitrine-item__credit` dentro do `dd`; abaixo de 480 px cada linha empilha rótulo sobre valor na
  largura toda, valor no corpo de 16 px; a partir de 900 px as linhas formam pares em duas colunas da
  mesma lista), ações com `button-secondary` (demonstrativo) e `text-link` (pedir). `data-*`,
  `aria-label`, `data-cta-id`/`position` e `id` iguais.
- **Escada de valor** (`section.offer-value-ladder[data-offer-ladder]`, dentro da seção das ofertas):
  `sec-head`, `ol.steps` (três passos numerados; o passo 02 traz a condição integral do pacote que
  o `aside.deliverables-next` retirado publicava: "por R$ 8.000, pagamento único, e abate o valor de
  qualquer unidade contratada nos 60 dias anteriores, sem acúmulo"), `dl.compare-ladder-figures`
  (classe literal preservada; três números em coluna regrada) e `p.compare-note.t-caption`. Sem caixa
  escura.
- **Condições e limites** (nova `section.sec.sec--tight#condicoes-e-limites`, `limitation_notice`):
  `div.published-offers__common > div.conditions` com kicker, h2 e quatro itens: informações comuns,
  preço/condições/exemplos (frase exigida pelos gates, idêntica), limites comuns (com "Cobertura, data
  de corte, método e o rótulo NÃO INFORMADO…") e serviços por proposta (escopo, responsável técnico,
  local, campo e ART confirmados antes do aceite técnico). Quinto bloco narrativo do gate de
  arquétipos.
- **Bloco escuro único** (`section.sec.sec--dark.pillar-capture#captura-entregas`, `cta_formal`):
  o antigo `aside.deliverables-next` (segundo bloco navy) foi retirado; seu link
  `deliverables-final-bundle` (mesmos `data-*`, `page_close`) passou para a lista `ul.contact-alt` do
  bloco escuro, ao lado do e-mail contextual. Coluna de texto com kicker, h2 `t-editorial` e os dois
  parágrafos (`data-form-value`/`data-form-boundary`) que `render_cta_form_next_state` reescreve;
  `form.pillar-capture-form` **byte-idêntico** (diff vazio, incluindo o `select` gerado e o script
  local); `div.pillar-capture-after` com `ol.after` (três passos escritos a partir do próprio texto do
  formulário, sem prazo de resposta) e `ul.contact-alt`. Formulário em cartão branco sobre navy, como
  em `index.html#contato`.
- Ordem **serviços → ofertas** mantida (`test_services_precede…`), e ação dominante da abertura
  mantida em "Ver entregas e exemplos" (`task-doors.v1.json#first_fold`, `first-fold-contract` e o UI
  gate a exigem); o formulário é a ação dominante do bloco escuro. O índice pela decisão é o primeiro
  bloco da seção das ofertas (pedido 17 registra a decisão de conversão; o gate mede a posição em
  relação à seção e à entrada do índice da página).

Conteúdo protegido conferido: `<title>`/description/OG, canonical, robots, JSON-LD (só
`dateModified` sincronizado pelo gerador, sem mudança), preços, prazos, condições, créditos, textos de
CTA, `data-cta-id`/`data-cta-position`/`data-asset-id`/`data-offer-*`, ids `entrega-01..08` e dos h2,
`#servicos-e-entregas`, `#enquadrar`, `#captura-entregas`, rótulos de veracidade ("exemplo sintético",
"não representam cliente", "Dados identificados como sintéticos"). `main a` = 53, `button-primary`
= 4 (dois no cabeçalho, um na abertura, um no formulário), um `<form>` depois de `#entrega-08`,
5 `details` = 5 `summary`, 1 `figure.plate`.

### Desempenho (gate do repositório, `run_lighthouse.mjs --only=/,/entregas/ --runs=3`, Chromium 1234, árvore fonte servida com gzip, mesma máquina)

| Estado | perf | LCP (ms) | FCP (ms) | DOM | conteúdo (B, teto 153.600) | pedidos |
| --- | --- | --- | --- | --- | --- | --- |
| antes (`2da310422`, worktree isolada, `--label=onda2-entregas-base`) | 99 | 1.803–1.805 | 1.354–1.358 | 769 | 144.989 | html 13.938 · fonte 60.064 · styles 21.017 · styles-offers 2.502 · entregas/styles 4.417 · script 24.308 · logo 10.605 · tokens 1.247 · ícones 6.891 |
| depois (`--label=onda2-entregas`) | 99 | 1.953–1.957 | 1.504–1.510 | 826 | 148.743 | html 14.699 · fonte 60.064 · styles 21.017 · editorial 7.667 · entregas/styles 2.245 · script 24.308 · logo 10.605 · tokens 1.247 · ícones 6.891 |
| após a revisão (`--label=onda2-entregas-fix`, `CHROME_PATH` = Chromium 1234 do Playwright) | 99 | 1.953–1.967 | 1.356–1.504 | 854 | 150.487 | html 15.437 · fonte 60.257 · styles 21.232 · editorial 7.882 · entregas/styles 2.660 · script 24.537 · logo 10.797 · tokens 1.461 · prancha PG móvel 1.255 · ícones 6.871 |

`MEASURED_PASS` nas três medições (tetos: LCP 2.000 ms, 153.600 B, DOM 1.100, perf ≥ 95), mas o LCP
passou a 45 ms do teto (após a revisão, `maximum_lcp_ms` = 1.966,5 no resumo do gate: 33,5 ms de folga) e o conteúdo a 3.113 B do teto: a prancha
PG entra na carga medida mesmo com `loading="lazy"` (1.255 B gzip, o SVG móvel), e a vitrine
empilhada custa +738 B de HTML gzip. O `summary-onda2-entregas-fix.json` foi apagado (não commitado). Diagnóstico com Lighthouse direto (mesma emulação do runner, árvore fonte com
gzip, 1 run por variante, valores estáveis entre repetições):

| Variante | FCP (ms) | LCP (ms) | Elemento LCP |
| --- | --- | --- | --- |
| base `2da310422` (HTML e folhas antigos) | 1.365 | 1.810 | `p.deliverables-lead` |
| base + `editorial.css` acrescentada | 1.367 | 1.961 | — |
| onda 2 (HTML novo, `editorial.css` + folha da rota) | 1.516 | 1.960 | `h1.t-service` (render delay 136 ms, TTFB 10 ms) |
| onda 2 sem `editorial.css` | 1.216 | 1.961 | — |
| onda 2 com `styles-offers.css` no lugar de `editorial.css` | 1.518 | 1.962 | — |
| onda 2 com `editorial-tool.css` (9,4 KB brutos) no lugar de `editorial.css` | 1.366 | 1.960 | — |
| onda 2 com a folha da rota vazia | 1.510 | 1.956 | — |
| onda 2 sem a folha da rota (3 CSS) | 1.213 | 1.959 | — |
| onda 2 sem o preload da fonte | 1.968 | 1.968 | — |
| onda 2 com o h1 sem `t-service` | 1.517 | 1.961 | — |
| onda 2 com o h1 sem o eixo largo (`font-stretch:normal`, `--sans`) | 1.367 | 1.961 | — |

Leitura: o LCP simulado **não responde** a bytes de CSS em nenhuma das dez variantes; o elemento LCP
passou de `p.deliverables-lead` para `h1.t-service` e a pintura simulada desse elemento cai em
~1.960 ms em qualquer configuração, inclusive no HTML antigo com `editorial.css` (1.961) e no HTML novo
sem folha editorial alguma (1.961). Trabalho de thread principal é igual nos dois estados (style/layout
139 vs 153 ms). O FCP, sim, responde: a folha editorial completa (42 KB brutos / 7,7 KB gzip) custa
+145 ms sobre um subconjunto de 9,4 KB, e o eixo largo do h1 sozinho responde pelos mesmos 145 ms.
Os subconjuntos são gerados por `scripts/site/build_css.py` (integrador; `test:design` roda
`build_css.py --check`), então não há alavanca de LCP dentro do lote; a folga residual de 45 ms
precisa ser medida sobre `_site` no CI antes da promoção (a nota `aceite-runtime-lighthouse-borda`
registra que a borda mediu ~300 ms acima do laboratório e que três releases foram revertidos por
diferenças laboratório→borda). Os artefatos de `docs/lighthouse-runs/` foram apagados (não
commitados). Pedido 11.

### Testes executados (resultado real)

| Comando | Resultado |
| --- | --- |
| `node scripts/commercial/render_public_catalog.mjs --check` | `PUBLIC_CATALOG_OK internal=54 public=8` |
| `python3 scripts/site/html_integrity.py --root . --surface source` | `failures=0` |
| `npm run test:design` | exit 0 (arquétipos: hero_split, reading_method, catalog_index, limitation_notice, cta_formal; `CACHE_CONTRACT_OK`) |
| `npm run test:copy` | exit 0 |
| `npm run test:brand` | exit 0 (após devolver o `<strong>` bare ao preço: `test_llms_positioning` lê `<strong>(R\$…)</strong>`) |
| `npm run test:authority`, `test:integral-solution`, `test:self-deprecation` | exit 0 / `PASS` / `PASS` |
| `npm run organic:test` | exit 0 |
| `npm run test:inbound-gates` | FAIL `test_measurement_delay_canary_389…` no pilar de medições — idêntico na base `2da310422` (pedido 7 da onda 1); nada de `/entregas/` |
| `npm run test:deliverables-registry` | `3650/3650` |
| `npm run test:real-proof-registry`, `test:commercial-contract-consistency`, `test:public-offer-truth` | exit 0 |
| `npm run test:page-contract-eight` | `735/735` |
| `npm run test:task-doors` | **`239/240` no HEAD `de1984156`** (`FAIL style_uses_stacked_mobile_comparison`; o relatório anterior declarava 240/240 — falso) → `240/240` após a correção `7fecede3a` |
| `npm run test:deliverables-hub` | `27 passed` |
| `node scripts/site/test_deliverables_hub_ui.mjs` (árvore fonte, 11 larguras) | `DELIVERABLES_HUB_UI {"ok":true}`; a 390: altura 24.037 px, índice pela decisão a 346 px do topo de `#enquadrar`, entrada 02 do índice da página a 1.439 px, 53 links, 2 primários, sem estouro; a 1440: 13.591 px |
| `npm run test:cta-form-next-state` | `CTA_FORM_NEXT_STATE_OK routes=31` (censo regerado: 185) |
| `npm run test:form-funnel` | `FORM_FUNNEL_OK` |
| `npm run test:report-model`, `test:deliverable-models`, `test:deliverables-live-audit` | exit 0 |
| `npm run test:value-first-copy`, `test:offer-naming`, `test:page-contract-operacao/execucao/ciclo/pre-edital`, `test:pricing-policy`, `test:market-fit-protocol`, `test:query-ownership` | exit 0 |
| `node --test tests/intake/test_mv03_adaptive_intake.mjs` | `pass 17, fail 0` |
| `node tests/inb-20260911/12/…`, `tests/attribution/test_source_to_service.mjs`, `scripts/site/test_lead_function.mjs` | `PASS` / `ATTRIBUTION_OK` / `LEAD_FUNCTION_OK tests=94` |
| `python3 scripts/site/audit_css_usage.py` | `CSS_USAGE_OK` (`--json`: `entregas/styles.css` 7.569 B, 32 seletores de classe, 32 em uso, 0 sem uso; decoração global 144/60/14) |
| `python3 -m scripts.demonstrative.plates.inline --check` | `OK plates inline` (slot da prancha PG em `/entregas/` emitido pelo gerador) |
| `npm run test:lighthouse-gates` | exit 0 (contrato/rehearsal; a primeira execução da rodada terminou em exit 1 sem `FAIL` nomeado, com o rehearsal de infra em `/tmp`, e a segunda, na mesma árvore, passou: `25 cases OK`) |
| `npm run test:visible-parity` | exit 0 |
| `node scripts/site/test_ui_geometry.mjs` (árvore fonte) | `All UI geometry tests passed` (`entregas_deliverable_option_drives_journey` OK) |
| `npm run test:copy-contract` | FAIL `forbidden_language:/diagnostico-b2g-360/:FL-08` — idêntico na base (fora do lote) |
| `npm run test:page-contract-licitacao` | FAIL `dedicated_route_remains_frozen`, `public_renderer_has_no_drift` — idênticos na base (rota congelada do integrador) |
| `npm run test:bofu-dominance` | 11 failed / 106 passed — conjunto **idêntico** ao da base (diff vazio entre as listas) |
| `npm run test:first-fold-contract` | FAIL `evidence_/entregas/_html_bytes_match` (esperado: hash `a97308da…` de `entregas/index.html` e `entregas/styles.css` nos `input_hashes`) + as falhas já presentes na base (home, pilares, `styles.css`, `editorial.css`) |
| `node scripts/site/run_lighthouse.mjs --only=/,/entregas/ --runs=3 --label=onda2-entregas` (e `--label=onda2-entregas-fix` após a revisão) | `MEASURED_PASS`; números na tabela acima |
| `npm run build:site` | **exit 2 na worktree e na base `2da310422`**: `FAIL-CLOSED contract-analysis build: contract_analysis_build_missing` (`approval_rendered_hash_mismatch` em `docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS`), cadeia de fechamento do integrador (`approvals.json` antes do build). Saídas rastreadas revertidas por caminho nomeado; `_site` apagado. Por isso `test:deliverables-hub-ui`, `test:ui` e Lighthouse rodaram sobre a árvore fonte, e `test:responsive-matrix`/`test:html-integrity:site` (exigem `_site`) não rodaram. |

### Testes ajustados (estéticos, por rota exata, com motivo no commit `eeca0e814`)

| Teste | O que mudou | Motivo |
| --- | --- | --- |
| `scripts/site/test_deliverables_hub.py::test_progressive_catalog_controls_keep_a_mobile_touch_target` e `::test_progressive_catalog_css_does_not_block_first_paint` | `.capability-group>summary` (64 px; seletor morto desde que os grupos viraram `article`) → `.capability-group__schema-details>summary` (44 px); `.offer-decision-nav a` 52 px mantido | os alvos de toque continuam declarados na folha da rota, nos seletores que a composição usa |
| `::test_services_precede_the_eight_decidable_offers_without_internal_roll` | `class="offer-decision-nav"` literal → prefixo (`offer-decision-nav page-index`) | o índice pela decisão carrega também a classe do componente do piloto; ordem serviços → índice → ofertas continua verificada |
| `scripts/site/test_deliverables_hub_ui.mjs` | índice pela decisão medido como lista regrada (alvos ≥ 44 px, sem estouro, sem palavra quebrada, largura ≥ 110 px a 320, fonte ≥ 12,8) em vez de grade de duas colunas; altura do documento 18.600 → 21.700 → **24.300 após a revisão** (medido 24.037); o guarda absoluto da posição do índice (1.800, afrouxado para 4.600 na onda 2) foi **substituído** por dois invariantes relativos (índice a ≤ 500 px do topo de `#enquadrar`, medido 346; entrada 02 do índice da página a ≤ 1.800 px, medido 1.439); altura do índice ≤ 560 a ≤ 360; `main a` 50 → 54 (medido 53) | composição regrada com filete por critério e índice de página; nenhum campo acrescentado ou escondido; a geometria de conversão passa a ser medida em relação à seção, não por um número solto |
| `tests/commercial/test_task_doors.mjs` | `hero_explains_engineering_value`: `<header class="deliverables-hero"` → `class="deliverables-hero[^"]*"`; `style_uses_stacked_mobile_comparison`: da grade `78px` antiga para a regra nova (`minmax(7rem,11rem) minmax(0,1fr)` na base + `grid-template-columns:minmax(0,1fr)` literal abaixo de 480 px) | mesmas propriedades (texto do herói ≥ 160 chars com entreg/engenharia/serv; comparação empilhada por critério no celular). **A onda 2 ajustou a asserção mas não implementou o CSS que ela exige** (a folha mantinha `6rem minmax(0,1fr)`): 239/240 no HEAD `de1984156`; corrigido no CSS, não na regex, em `7fecede3a` |
| `tests/commercial/test_page_contract_eight.mjs` | `hub_css_local`: `.capability-roll` na folha da rota → `.capability-group`, e exige `/assets/editorial.css` ligada | a folha da rota deixou de estilizar a seção (é `.sec`) e ficou com as linhas |

Não ajustados: nenhum teste de veracidade, preço, responsabilidade, privacidade, formulário,
persistência ou revisão obrigatória. `data/commercial/cta-form-next-state.v1.json` (183 → 184) e
`docs/commercial/cta-form-next-state-inventory.json` regerados com motivo, como os lotes anteriores.

### Arquivos protegidos por hash alterados de propósito (recaptura do integrador)

- `entregas/index.html` e `entregas/styles.css` → `data/commercial/first-fold-measurements.v1.json`
  (`routes[/entregas/].html_sha256` e `input_hashes`; `test:first-fold-contract`
  `evidence_/entregas/_html_bytes_match`). Os cinco papéis da dobra continuam com os seletores das
  regras: `header .eyebrow`, `h1`, `.deliverables-lead`, `.offer-proof-line`, `a.button-primary`
  (uma só na dobra), ação dominante a 669 px (390) e 670 px (1366).

### O que ficou de fora e por quê

- `styles-offers.css` não foi tocada: `/entregas/` deixou de carregá-la, mas os outros 10 usuários
  continuam (pedido 4 da onda 1 permanece com o integrador).
- Subconjunto de folha editorial para hubs (alavanca de FCP medida): arquivo do integrador; pedido 11.
- `test:responsive-matrix` e `test:html-integrity:site`: exigem `_site`, que não constrói nesta
  árvore nem na base (cadeia de fechamento do integrador).

### Correções após revisão — onda 2 (`/entregas/`)

Dois revisores independentes (R1 e R2) sobre o HEAD `de1984156`. Veredito de R1: "NÃO ACEITAR como
está". Commits da rodada: `7fecede3a` (rota, gerador, censo), `ecefa5664` (gate do hub) e este
relatório. Recaptura 390/1440 com a tag `onda2` (imagens abertas e conferidas; manifesto
`manifest-onda2.json`: 24.037 / 13.591 px, overflow 320 = 0).

| # | Achado (severidade, fonte) | Ação | Prova |
| --- | --- | --- | --- |
| 1 | **ALTA** (R1, R2): `test:task-doors` reprovava no HEAD (239/240, `style_uses_stacked_mobile_comparison`) e o relatório declarava 240/240; a asserção ajustada exigia empilhar rótulo sobre valor abaixo de 480 px e o CSS mantinha duas colunas (`6rem minmax(0,1fr)`). | Procedente. Corrigido **no CSS**, não na regex: `@media (max-width:480px){.vitrine-item__facts>div{grid-template-columns:minmax(0,1fr)}}` (regra literal que o gate lê), `gap`/`padding` em regra separada, `dd` no corpo (16 px; o override de legenda saiu). Comentários do CSS e do teste passaram a descrever o que existe. Tabela de testes corrigida com o resultado real do HEAD anterior. | `node tests/commercial/test_task_doors.mjs` → `240/240`; medição Chromium a 390: `ddFont=16px`, `ddW=301` (largura toda da coluna de conteúdo); `entregas-390x844-full-onda2.jpg`. |
| 2 | **MÉDIA** (R1): catálogo ilegível a 390 (rótulo 96 px, valor 196 px a 14 px, rótulos em 3 linhas). | Mesma correção do #1; nenhum rótulo quebra, valor a 16 px na largura toda. | Idem; `m390` fatias 3–4 da captura. |
| 3 | **MÉDIA** (R1, R2): LCP a 45 ms do teto na rota crítica do gate de Lighthouse; bloqueia a promoção, alavanca (subconjunto de `editorial.css`) do integrador. | Fora do alcance do lote (ambos os revisores escopam à promoção). Remedido após a rodada: LCP 1.953–1.967 ms, FCP 1.356–1.504, conteúdo 150.487 B (prancha PG móvel entra na carga medida mesmo `lazy`: +1.255 B; HTML +738 B). Pedido 11 reescrito com os números novos; se a borda medir > 2.000 ms, a reversão do eixo largo do `h1` (ganho de FCP de 145 ms demonstrado) é a alavanca de rota que sobra. | `run_lighthouse.mjs --only=/,/entregas/ --runs=3 --label=onda2-entregas-fix` → `MEASURED_PASS` (tabela de desempenho). |
| 4 | **MÉDIA** (R1): página mais longa que a produção e o hub piloto (números da revisão: 21.485 / 18.159 / 15.959 a 390; 14.909 / 12.007 / 9.931 a 1440); tetos do gate movidos. | Parcialmente procedente. A 1440 os critérios formam **pares em duas colunas** da mesma lista (`@media (min-width:900px)`, todos os campos visíveis): oferta 735–753 px (era 1.166; cartão antigo ~850), página **14.909 → 13.591**. A 390 a página **cresceu** para 24.037: é o custo de 8 ofertas × 12 critérios empilhados na largura toda com o valor no corpo (#1 e #2, exigidos pela mesma revisão) mais a prancha PG (#7); paddings reduzidos (`.4rem`), primeiro esquema mantido fechado para não somar ~600 px. A alternativa de voltar o valor a 14 px (como a produção, `--text-small`) foi descartada porque contraria a legibilidade das condições materiais pedida no #2. Teto do gate recalibrado com o medido + 1,1 % (24.300) e `main a` com o medido (53), não deixados folgados. | `measure.mjs` (Chromium): `vitrines` 390 = [1986, 1517, 1563, 1517, 1563, 1517, 1494, 1446]; 1440 = [1050, 735, 753, 735, 735, 735, 735, 753]; `#enquadrar` 15.135 / 8.313 px. |
| 5 | **MÉDIA** (R1, R2): condição "pagamento único" do pacote de R$ 8.000 sumiu da rota com o `aside.deliverables-next`. | Procedente. A condição integral do aside entrou no passo 02 da escada, via gerador, com a copy da base: "reúne … por R$ 8.000, **pagamento único, e abate o valor de qualquer unidade contratada nos 60 dias anteriores, sem acúmulo**" (`pkg.credit_window_days`, `pkg.credit_stacking_note`). Não é derivável do contrato (`page-contract-eight.v1.json#package` não tem campo de forma de pagamento) — registrado no pedido 18 para o dono do dado. | `grep -c 'pagamento único' entregas/index.html` = 1; `test:public-offer-truth 132/132`, `test:commercial-contract-consistency 521/521`, `test:page-contract-eight 735/735`. |
| 6 | **MÉDIA** (R1): ressalva de dados sintéticos repetida na dobra (`offer-proof-line` + `svc-open__note`). | Procedente. Uma frase de veracidade na abertura (`offer-proof-line`, que passou a carregar também o gancho `hero-h1-note` lido por `audit_deliverables_live.mjs:339`); o slot `svc-open__note` recebeu o e-mail contextual, como no piloto ("O primeiro contato é em texto, sem anexo; a resposta nomeia a entrega…", derivado do próprio texto do formulário). A ressalva completa segue só em Condições e limites e na nota da escada (esta última é copy protegida do gerador). Censo de CTAs 184 → 185 com motivo. | `grep -c 'sempre identificados'` = 0; `hero_synthetic_disclosure` OK; `test:cta-form-next-state` OK. |
| 7 | **MÉDIA** (R1): ação dominante leva a esquemas fechados, coluna direita vazia em ≥ 900 px, nenhuma prancha na rota. | Procedente na parte da prancha: a prancha PG `pacote-entrega` (registrada no lote A, mesma família de conteúdo do esquema 01) entra como `figure.plate.plate--dominant` logo após a cabeça da seção de serviços, onde o botão "Ver entregas e exemplos" aterrissa, com `span.tag` "Exemplo demonstrativo" e legenda derivada da própria prancha. Emitida pelo gerador com o slot e o `<picture>` byte-idênticos aos de `plates/inline.py` (ambos os `--check` passam). Os cinco `details` continuam fechados pelo orçamento de altura e pela divulgação progressiva decidida em 2026-09-10 (os gates exigem o `summary`): abrir o primeiro foi medido (`groups[0]` 904 px aberto vs 411 fechado a 390: +493 px) e descartado. A coluna direita em ≥ 900 px segue com o `summary` de uma linha: o conteúdo de um `details` fechado não se mostra por CSS, e trocar a grade por bloco corrido deixaria a linha inteira só com texto. | `git grep -c 'figure class="plate' entregas/index.html` = 1; `inline --check` OK; `d-plate` na captura 1440. |
| 8 | **MÉDIA** (R2): índice pela decisão movido para depois dos serviços (1.017 → 4.361 px) com o guarda afrouxado 1.800 → 4.600; justificativa pela decisão do fundador não cobre a mudança. | Procedente quanto à justificativa e ao limiar: a frase sobre o fundador saiu do gate, da matriz e do relatório. A posição foi **mantida** com decisão explícita registrada (pedido 17, para o integrador/fundador confirmar): o índice pela decisão é o primeiro bloco da seção das ofertas, e a entrada "02 Análises com preço publicado" do índice da página, na abertura, leva até ele em um toque. O gate deixou de usar um número solto e passou a cobrir a posição **relativa**: índice a ≤ 500 px do topo de `#enquadrar` (medido 346) e entrada do índice da página a ≤ 1.800 px (medido 1.439), reprovando se o índice se afastar da cabeça da seção ou a entrada sair da abertura. Não restaurei a emissão antecipada: dois índices em sequência na abertura (página + decisão) repetiria a caixa navy que a campanha retira. | `ecefa5664`; `DELIVERABLES_HUB_UI ok:true`; métricas `offersSectionTop`/`pageIndexOffersLinkTop` no relatório do gate. |
| 9 | **BAIXA** (R1): índice pela decisão com quebra irregular a 390. | Procedente. `.offer-decision-nav li{flex-basis:100%}` abaixo de 480 px: um item por linha. | `navLis` 390 = [18 × 8]. |
| 10 | **BAIXA** (R1): "Pacote e crédito" órfão fora do ritmo da lista. | Procedente com **refutação parcial** da forma proposta: `<dd class="vitrine-item__credit">` quebraria `test_deliverables_hub.py:373` (veracidade: sem "sintético" no crédito) e `:502`, que leem `class="vitrine-item__credit">…</p>`. Forma adotada: `<div><dt>Pacote e crédito</dt><dd><p class="vitrine-item__credit">…</p></dd></div>`, copy idêntica sem o `<strong>` inicial (nenhum gate o referencia). | `test:deliverables-hub 27 passed`; `d1440-3` na captura. |
| 11 | **BAIXA** (R1): sem WhatsApp em `contact-alt`. | Decisão registrada, sem alteração: a base também não tinha `wa.me` (não é regressão); o formulário é a ação dominante e o e-mail a alternativa subordinada; um `wa.me` novo com texto pré-preenchido seria link de contato novo (§3) e mais um salto no censo de CTAs. Fica no pedido 19 para o dono da rota decidir. | `grep -c wa.me entregas/index.html` = 0 (base e HEAD). |
| 12 | **BAIXA** (R2): copy nova de condição hard-coded no gerador ("Serviços de engenharia por proposta…") e título do bloco alterado. | Mantida e registrada como copy autorizada: a frase deriva do AGENTS.md ("before technical acceptance confirm scope, location, field/logistics, proven professional attribution … and ART when applicable") e o `aside-note` da abertura aponta para "Condições e limites" justamente por ela. Pedido 20 propõe levá-la ao contrato de copy do hub. | — |
| 13 | **PREFERÊNCIA** (R1): valores em minúscula e par PRAZO / QUANDO A CONTAGEM COMEÇA repetido nas ofertas 01 e 08. | Herdado da base, copy protegida do contrato de dados; pedido 18 ao dono do dado. | `grep -c '<dd>uma empresa'` = 1 na base e no HEAD. |
| 14 | **PREFERÊNCIA** (R1): menu móvel com dois controles de fechar. | Casca do integrador (`scripts/site/shell_nav.py`); pedido 21. | `entregas-390x844-menu-onda2.jpg`. |
| 15 | R2, último achado (BAIXA) truncado na entrega da revisão ("ramo campaign/salto-02/lote-a (HEAD de1984156, merge-base 2da3104…"). | Sem texto para agir; registrado (pedido 22) para que o integrador o recupere da revisão original. | — |

Refutações com evidência: nenhuma total. Parciais: #10 (forma proposta quebra gate de veracidade;
adotada forma equivalente) e #4 (a 390 a página não encurta sem contrariar #1/#2; encurtou a 1440).
Notas de R1 por dimensão que esta rodada ataca: densidade/legibilidade móvel (#1, #2, #9),
composição (#4, #7, #10), hierarquia (#6, #8).
