# Relatório do lote A — serviços privados, exemplo de infraestrutura, parcerias, estados de contato

Ramo `campaign/salto-02/lote-a`, worktree própria, porta 8741. Direção: A-prancha-e-percurso (piloto
`quantitativos-orcamento-obras/index.html` como padrão mínimo). Evidência em
`docs/campaigns/design-institucional/expansao/evidence/lote-a/` (390×844 e 1440×1000, dobra, página
inteira e menu; `manifest-lote-a.json` registra altura, fonte do h1 (`Archivo Var` em todas) e overflow
em 320 px = 0 em todas as rotas). Matriz em `matriz-lote-a.json`; pranchas em `assets-lote-a.json`;
pedidos ao integrador em `pedidos-lote-a.md`.

## Pranchas novas (família `scripts/demonstrative/plates/family_private.py`)

Seis pranchas, desktop e móvel como composições distintas, geradas de JSON, determinísticas
(`render_plates --check`: `plates_ok: 20 files match assets/pranchas`) e aprovadas pelo gate de
numerais (`python3 -m pytest scripts/demonstrative/plates -q`: `16 passed`). Nenhum número fora do
JSON de origem; `sheet.py` inalterado. Códigos PA–PF (o gate rejeita "P5" a "P10" como numerais
não rastreáveis).

| Id | Origem | Página |
| --- | --- | --- |
| `interferencia-verga-viga` (PA) | private-project-pilot source + consumption (CF-GEO-01, R00 × R01) | compatibilização |
| `revisao-conferencia` (PB) | idem (RF-01/RF-02 sobre a elevação e o poço HS-01) | revisão técnica |
| `drenagem-rede` (PC) | infrastructure-pilot source + consumption (MH/DR/IN/PV, cotas, DN, camadas) | projetos complementares |
| `inspecao-fachada` (PD) | novo `data/demonstrative/plates/inspecao-fachada.v1.json` (fachada sintética, 4 manifestações) | inspeção e diagnóstico |
| `pericia-fachada` (PE) | mesmo JSON (quesitos Q-01 a Q-03, evidência, conclusão delimitada) | assistência técnica em disputas |
| `sst-canteiro` (PF) | novo `data/demonstrative/plates/sst-canteiro.v1.json` (canteiro sintético, 4 proteções, checklist) | SST |

## Por rota

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
- Prancha PC dominante (rede de drenagem e pavimento); a matriz de interfaces e os dois esquemas
  SVG exigidos (`pacote-entrega.svg`, `interfaces-versoes.svg`) continuam no HTML como
  `<img src>`; `data-purchase` (4 itens), fases, método e limites preservados; o único bloco escuro
  `#escopo-projeto` fecha a página; ação contextual "Pedir a proposta agora" antes do método.
- Testes: `tests/inb-20260911/12/test_page_contract_projetos_complementares.mjs`
  (`page-contract-projetos-complementares-elaboracao 183/183 ok`; a linha
  `CONTRAPROVA_FAIL mutated_forbids_habilitação_irrestrita` já existia no commit base e é informativa).
- Teste ajustado (estética, rota exata): `landing_contact_before_method` passa a verificar
  `href="#escopo-projeto"` antes de `id="metodo-elaboracao"` (ação contextual), porque o esqueleto
  do caderno fecha a página com o bloco escuro único.

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
- Testes: `scripts/distribution/tests/test_partner_reference.mjs` (`OK partner_reference`; no commit
  base falhava `cta_imposes_meeting` por falta da frase "Descrever uma necessidade", agora presente),
  `tests/pos-inb-20260911/05/test_partner_kits_contract.mjs` (`OK pos-inb-20260911/05 partner kits`).

### `404.html` — COMPOSICAO_REDESENHADA
- `section.state` com código, título, ação única para `/triagem-tecnica/`, alternativas em texto e
  `ul.state__paths` com oito situações (cada uma com o que entrega); estilos inline do conteúdo
  removidos; `class="no-js"` mantida (página sem script de comportamento); prefill do WhatsApp
  flutuante inalterado.
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
- Sem alteração de arquivo; capturas confirmam tipografia herdada (`Archivo Var` no h1), sem overflow.

### `comercial/radar-decisorio/` — PRESERVADA_COM_JUSTIFICATIVA
- Oferta paga com formulário, preço e medição de primeira dobra; tipografia já herda Archivo. O heroi
  em degradê vem de `styles-offers.css` (integrador): pedido 4.

## Testes do §4 (última linha real de cada execução)

| Teste | Resultado |
| --- | --- |
| `python3 scripts/site/html_integrity.py --root . --surface source` | `HTML_INTEGRITY surface=source html_files=235 faq_pages=145 faq_questions=422 failures=0` |
| `npm run test:design` | exit 0 (última linha `HTML_INTEGRITY … failures=0`) |
| `npm run test:copy` | `OK test_shipped_check_still_fails_on_em_dash` (exit 0) |
| `npm run test:brand` | `OK test_home_jsonld_matches_corporate_positioning_and_preserves_b2g_services` |
| `npm run test:authority` | `OK 8 correction checks` |
| `npm run test:integral-solution` | `PASS: the public surface presents an integral solution` |
| `npm run test:self-deprecation` | `PASS: no self-deprecating communication on the public surface` |
| `npm run organic:test` | `279 passed in 23.38s` (após a correção do breadcrumb de SST) |
| `npm run test:inbound-gates` | 55 OK; `FAIL test_measurement_delay_canary_389_is_single_url_and_fail_closed medicoes-glosas-obras-publicas/index.html` (pré-existente no commit base 8860f5577; pedido 7) |
| `npm run test:deliverables-registry` | `deliverables-registry: 3650/3650 checks passed` |
| `npm run test:real-proof-registry` | `real-proof-registry: canonical_records=0 public_pages=268 problems=0` |
| `npm run test:commercial-contract-consistency` | `commercial-contract-consistency: 521/521 checks passed` |
| `npm run test:public-offer-truth` | `public-offer-truth: 132/132 checks passed` |
| `npm run test:page-contract-complementares` | `page-contract-complementares: 273/273 checks passed` |
| `npm run test:page-contract-projetos-complementares` | `PASS page-contract-projetos-complementares-elaboracao` |
| `npm run test:page-contract-eight` | `page-contract-eight: 735/735 checks passed` |
| `npm run test:cta-form-next-state` | `CTA_FORM_NEXT_STATE_OK routes=31` |
| `npm run test:form-funnel` | `FORM_FUNNEL_OK {…"submit_journey":"contrato","home_multistep":true}` |
| `node --test tests/intake/test_mv03_adaptive_intake.mjs` | `# pass 17 # fail 0` |
| `npm run test:inspecao-diagnostico` | `4 passed in 0.19s` |
| `npm run test:inb14-pericias-sst` | `PASS inb14 pericias sst` |
| `npm run test:private-readiness` | `ALL private_project_technical_readiness checks passed` |
| `npm run test:hub-links` | `15 passed` |
| `npm run test:infrastructure-demonstrative` | `23 passed in 0.36s` |
| `npm run test:private-project-demonstrative` | `15 passed in 0.45s` |
| `python3 -m pytest scripts/demonstrative/plates -q` | `16 passed in 0.35s` |
| `python3 -m scripts.demonstrative.plates.render_plates --check` | `plates_ok: 20 files match assets/pranchas` |
| `python3 -m scripts.demonstrative.plates.inline --check` | `OK plates inline` |
| `node --test tests/coordination/test_*.mjs` (por arquivo) | 4/2/2/8/8 pass, 0 fail |
| `node --test tests/intake/test_inb05_*.mjs` | `# pass 19 # fail 0` |
| `pytest tests/pos-inb-20260911/07/test_navigation.py` | `9 passed` |
| `node tests/pos-inb-20260911/05/test_partner_kits_contract.mjs` | `OK pos-inb-20260911/05 partner kits` |
| `node scripts/distribution/tests/test_partner_reference.mjs` | `OK partner_reference` |
| `node --test tests/pos-inb-20260911/02/test_purchase_proof.mjs` | `# pass 10 # fail 0` |
| `node --test tests/pos-inb-20260911/04/test_copy_and_static.mjs` | `# pass 1 # fail 0` |
| `pytest tests/pos-inb-20260911/06/test_url_checklist.py` | `6 passed` |
| `node --test tests/campaigns/orc-b2b-20260913/test_purchase_path.mjs` | `# pass 21 # fail 0` |
| `pytest scripts/site/test_document_intake_honesty.py` | `9 passed` |
| `node seo/scripts/test_event_dictionary.mjs` | `EVENT_DICTIONARY_OK` |
| `python3 scripts/site/test_skip_link_coverage.py` | `OK test:skip-link` |
| `npm run build:site` + `npm run test:html-integrity:site` (clone limpo do ramo, Node 22) | build exit 0; `CACHE_CONTRACT_OK …` |
| `node scripts/site/test_ui_geometry.mjs` (clone limpo do HEAD do lote, `_site` construído, `CHROME_PATH`) | `All UI geometry tests passed` (inclui os rótulos de CTA e o estado neutro das quatro páginas `obrigado*`) |
| `npm run test:contact-journeys` (clone limpo, `_site` construído, `CHROME_PATH` do Chromium local) | `CONTACT_JOURNEYS_FAIL [{"name":"journey_harness_runtime"…"home form step transition did not activate"…}]` — 423 verificações, 1 falha na etapa do formulário da home; as 154 verificações das 14 jornadas nas rotas do lote A passam. A mesma falha ocorre no clone limpo do commit base 8860f5577 (pedido 8). |

## Testes ajustados (estética, rota exata)

1. `tests/inb-20260911/12/test_page_contract_projetos_complementares.mjs::landing_contact_before_method`
   — verifica `href="#escopo-projeto"` (ação contextual) antes de `id="metodo-elaboracao"` em vez de
   exigir o bloco de contato antes do método; o esqueleto do caderno fecha a página com o bloco escuro único.
2. `tests/demonstrative_infrastructure/test_infrastructure_pilot.py::test_page_is_demonstrative_not_client_and_has_required_title`
   — aceita atributos no `<h1>` (classe `t-service`), texto exato de `PAGE_H1` mantido.

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
  para a abertura, a seção da amostra, "O que pedir", as condições e o bloco escuro; em
  `/inspecao-diagnostico-edificacoes/` o `compare_ladder` (inspeção/diagnóstico/reparo/perícia) passou a
  ser um `div.delivery` dentro da seção `journey_paths` "Situações". Os demais arquétipos foram levados
  para a seção que descreve a mesma função; `contextual_next_action` e `evidence_record` entraram como no piloto.

- Lighthouse por rota não foi medido neste lote (o caderno §4 não o exige por lote); cada página de
  serviço ganhou uma `<picture>` externa por prancha (≤ 10 KB por SVG) e a folha `assets/editorial.css`.
- Alturas em 390 px ficaram entre 11.661 (parcerias) e 15.571 px (compatibilização), abaixo do piloto
  (quantitativos 19.739 px); nenhuma rota tem overflow em 320 px.
- Os pedidos 1–8 (`pedidos-lote-a.md`) ficam com o integrador; nenhum bloqueia a publicação do lote.
