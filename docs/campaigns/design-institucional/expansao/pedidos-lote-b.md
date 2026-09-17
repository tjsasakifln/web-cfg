# Lote B — pedidos ao integrador

Campanha CONFENGE-SALTO-INSTITUCIONAL-02-EXPANSAO-PRODUCAO, ramo `campaign/salto-02/lote-b`.
Cada pedido diz o arquivo do integrador, o motivo e a página afetada. Nada aqui foi feito pelo lote.

## 1. Recaptura dos hashes congelados dos seis pilares B2G (materialize.py)

- **Arquivos**: `data/bofu-dominance/frozen-specs/{hashes,snapshots}.json`, `frozen-specs/specs/*.json`, `frozen-specs/patches/*.patch.txt`, `docs/seo/bofu-dominance/frozen-specs/*.md`.
- **Motivo**: os cinco pilares restantes (`aditivos-obras-publicas`, `auditoria-orcamento-licitacao`, `diagnostico-pre-licitacao`, `reequilibrio-obras-publicas`, `diagnostico-b2g-360`) foram recompostos no modelo do piloto; o formulário `#captura-pilar` é byte-idêntico, mas o HTML mudou. O `unlock-plan` autoriza a revisão comercial com recaptura honesta (motivo, `baseline_commit`). Enquanto a recaptura não acontece, reprovam por hash: `npm run test:bofu-dominance` (11 testes em `frozen_specs/` e `safe_execution/test_git_diff_is_exclusive_area`), `test:page-contract-contratos` (`held_hash_18/19/22`, `public_renderer_has_no_drift` em `render_contract_defense_products.mjs`), `test:page-contract-licitacao` (`dedicated_route_remains_frozen`, `LICITACAO_FROZEN_DRIFT` em `render_licitacao_products.mjs` para `diagnostico-pre-licitacao`) e `test:inbound-gates` (`test_measurement_delay_canary_389…`, já vermelho no ramo de integração por causa de `medicoes-glosas-obras-publicas`). Nenhuma dessas reprovações é de veracidade, preço, formulário ou responsabilidade: são comparações de hash/snapshot.
- **Também**: `data/commercial/first-fold-measurements.v1.json` (`test:first-fold-contract`) grava `input_hashes` de todas as rotas do lote; recapturar com `scripts/site/measure_first_fold.mjs` na cadeia obrigatória (análise aprovada → frozen specs → primeira dobra → baselines), só com o CSS congelado.
- **Dono e prazo** (revisão 2026-09-17): integrador, **antes do PR de publicação** do ramo de integração. Sem dono e prazo a reprovação não pode ser lida como "esperada". Ordem obrigatória: (1) `python3 scripts/bofu_dominance/frozen_specs/materialize.py` com motivo e `baseline_commit` para os seis pilares (`aditivos-obras-publicas`, `auditoria-orcamento-licitacao`, `diagnostico-pre-licitacao`, `reequilibrio-obras-publicas`, `diagnostico-b2g-360`, `medicoes-glosas-obras-publicas`); (2) `node scripts/site/measure_first_fold.mjs` na cadeia análise aprovada → frozen specs → primeira dobra → baselines, só com o CSS congelado; (3) os quatro comandos voltam a `exit 0`: `npm run test:bofu-dominance`, `npm run test:page-contract-contratos`, `npm run test:page-contract-licitacao`, `npm run test:inbound-gates` (mais `npm run test:first-fold-contract`). Registrar o SHA no relatório do integrador. Bloqueia a publicação; não bloqueia o aceite de design do lote.

## 2. Folha editorial nas quatro rotas da área safe-execution — RESOLVIDO (integrador, 2026-09-17)

- `test_existing_css_js_only` passou a aceitar `/assets/editorial*.css`; a onda 2 do lote recompôs as quatro rotas (ver relatório §8).

- **Arquivo**: `scripts/site/build_css.py` / nome público da folha (`assets/editorial.css`).
- **Motivo**: `tests/bofu_dominance/safe_execution/test_bofu_safe_execution.py::test_existing_css_js_only` só aceita folhas cujo `href` comece por `/styles`. Por isso `defesa-margem-contratos-publicos`, `atrasos-prorrogacao-obras-publicas`, `defesa-tecnica-contratos-publicos` e `acompanhamento-contratos-obras` ficaram sem a folha editorial e sem índice de página (`PRESERVADA_COM_JUSTIFICATIVA`). Opções: publicar a camada editorial também como `/styles-editorial.css` (mesmo conteúdo, nome dentro da regra) ou mover `.page-index`, `.conditions`, `.contact-primary/.contact-alt` e `.t-*` para `css/contracts.css`. Depois disso, aplicar a essas quatro rotas o mesmo tratamento das ofertas (`docs/…/expansao` do lote B: índice de página após a abertura, ids por seção).

## 3. Segundo momento escuro no hub de obras públicas — RESOLVIDO (lote B, onda 2)

- O aside de regras e os cartões do bloco gerado passaram a superfície clara em `styles-offers.css` (regras exclusivas do hub); ver relatório §8.

- **Arquivo**: `scripts/commercial/render_contract_defense_products.mjs` (bloco `GENERATED:CONTRACT-DEFENSE-HUB`) e `styles-offers.css` (`.contract-products-hub__rules`).
- **Motivo**: o hub `/servicos-obras-publicas/` recomposto tem um único bloco escuro editorial (a rota dominante do dossiê de medição, `lead-inline`), mas o bloco gerado de produtos no fim da página desenha o aside de regras em navy. A regra "um bloco escuro por página" só fecha se o aside gerado passar a superfície clara (`sec--soft`) ou se a rota dominante deixar de ser escura. Decisão do integrador; o lote não toca no bloco gerado.

## 4. `assets-manifest.json` da campanha

- **Arquivo**: `docs/campaigns/design-institucional/assets-manifest.json` (`python3 -m scripts.demonstrative.plates.build_manifest`).
- **Motivo**: cinco pranchas novas (P5 a P9) estão registradas em `assets-lote-b.json`; o manifesto da campanha é do integrador e precisa ser regerado depois da integração.

## 5. Glitch do slot de prancha no piloto

- **Arquivo**: `medicoes-glosas-obras-publicas/index.html` e `servicos/index.html` (páginas do integrador).
- **Motivo**: os slots estão gravados como `<!-- plate:medicao-paredeNone -->` e `<!-- plate:avaliacao-estruturaNone -->` (o `None` veio de uma versão anterior de `inline.py`). O `SLOT` atual não casa com esse texto, então `inline --check` passa sem conferir essas duas pranchas. Basta corrigir os dois comentários para `<!-- plate:medicao-parede -->` / `<!-- plate:avaliacao-estrutura -->`.

## 6. Menu móvel com dois controles de fechar (P4)

- Não tocado (é `js/modules/nav.js`, do integrador); segue como pendência do estado.

## 7. Registro de decisão de escopo: gerador dos hubs

- **Arquivo**: `scripts/site/render_nav_hubs.py`.
- **O que o lote fez**: os dois hubs são gerados ("never hand-edited", `test:nav --check`). A composição do piloto foi portada para `_services_body`, `_problems_body`, `_need_rows` e `_situation_block`; `_document` passou a incluir `assets/editorial.css` e a materializar os slots de prancha via `scripts.demonstrative.plates.inline.render` (assim `render_nav_hubs --check` e `inline --check` concordam nos mesmos bytes). `brand.json`, `shell_nav.py`, `html_shell.py` e os blocos `MANAGED_EXTENSIONS` não foram tocados. O gerador não está na lista explícita de escritas exclusivas do integrador, mas está em `scripts/site`; se o integrador preferir outra divisão, os dois corpos são funções isoladas e podem ser revertidas sem afetar o resto.

## 8. Teste ajustado fora da família (registro)

- `scripts/site/test_design_gates.py`: `EDITORIAL_RECOMPOSED_ROUTES` recebe as cinco rotas dos pilares (isenção por rota exata, mesma regra do piloto).
- `scripts/site/test_ui_geometry.mjs`: a sonda de capa OG-only (`editorial_cover_scope_geometry`) passa de `/reequilibrio-obras-publicas/` (recomposto, sem `content-hero-grid`) para `/atrasos-prorrogacao-obras-publicas/`, que mantém a abertura de artigo em uma coluna. Regra inalterada.
- `data/commercial/cta-form-next-state.v1.json` + `docs/commercial/cta-form-next-state-inventory.json`: censo 167 → 182 com motivo, regerado pelo escritor canônico.
- Revisão 2026-09-17: `scripts/site/test_design_gates.py` ganha `test_page_index_anchors_land_on_visible_targets` (toda âncora de `nav.page-index` precisa resolver para um id que renderiza sem abrir `<details>`; o próprio disclosure e seu `summary` contam como visíveis) e o autoteste `test_page_index_guard_catches_a_hidden_anchor`. É um aperto, não um afrouxamento. Censo de CTAs 182 → 183 com motivo (link "Registrar o evento" em `/servicos-obras-publicas/`).
- Revisão 2026-09-17: `scripts/site/render_authority_pages.py` (gerador de `/conflitos/`, `/politica-editorial/`, `/uso-de-ia/`) recebe o parâmetro opcional `page_index` em `_page` (folha editorial + `nav.page-index`), usado só na página de conflitos. Mesma lógica do registro 7: a página é gerada, a edição manual seria perdida; as demais páginas geradas saem byte-idênticas.

## 9. Margem da rota dominante no hub em 390 px

- **Arquivo**: `css/contracts.css` (linha `body[data-content-cluster="servicos"] main>.section:first-of-type .lead-inline{margin-top:16px}`).
- **Motivo**: a abertura dos hubs passou a ser `section.svc-open`, então o seletor deixou de casar e o `lead-inline` volta ao `margin-top:56px` de `styles.css`; em 390×844 o botão da rota dominante entrava na dobra só parcialmente. O lote contornou movendo a linha de prova para depois do cartão (botão inteiro na dobra nos dois hubs, recapturado); estender o seletor a `.svc-open .lead-inline` continua desejável para recuperar os 40 px de respiro entre o lead e o cartão. Não bloqueante.

## 10. Degradês e brilho radial nas cascas herdadas (styles.css)

- **Arquivo**: `styles.css` (fonte em `css/**`).
- **Seletores**: `.content-hero{background:linear-gradient(180deg,#fff 0%,#f4f7f5 100%)}` e `.content-hero::after{radial-gradient(...)}` (afetam `header.offer-hero` em `/diretoria-b2g/`, `/bid-room-licitacoes-obras/`, `/diagnostico-b2g-expansao/`, `/conflitos/` e as quatro rotas safe-execution); `.lead-inline{background:linear-gradient(135deg,#071a31,#0a294b)}` (ainda usado nos `aside.lead-inline` dos pilares e em ~136 páginas); `.final-cta-section{background:linear-gradient(135deg,#031020,#0a294b)}`; `.article-callout`, `.answer-box`, `.article-decision`, `.lead-inline-soft` (degradês claros).
- **Motivo**: o caderno (§2) proíbe degradê; a revisão apontou o brilho radial visível no canto superior direito das quatro páginas de oferta e o cartão navy em degradê. Pedido: fundo sólido (`var(--white)`/`var(--soft)` no hero, sem `::after`; `var(--navy-900)` nos blocos escuros). Os hubs deixaram de usar `.lead-inline`; as demais rotas dependem deste pedido.

## 11. Dois blocos escuros nas ofertas B2G (styles.css)

- **Arquivo**: `styles.css` (`.operating-system` navy com ícones em círculo A–D em `/diretoria-b2g/`; painel escuro G1–G6 "Etapas da proposta" em `/bid-room-licitacoes-obras/`; `.final-cta-section` em ambas).
- **Motivo**: um bloco escuro por página. `test_design_gates::test_operating_flow_has_sitewide_fallback` exige `<ol class="operating-flow">` e o CSS correspondente em `styles.css`, então a troca por `ol.steps` claro não cabe no lote. Enquanto o CSS ficar, as quatro rotas estão classificadas como HERANCA_VISUAL_VALIDADA na matriz.

## 12. Respiro entre o índice de página e o artigo em `/conflitos/`

- **Arquivo**: `styles.css` (`.article-layout{padding-top:72px}` somado ao `margin-bottom` do `.page-index`).
- **Motivo**: ~110 px vazios entre o índice e o cartão do artigo nas páginas de política que carregam `nav.page-index` (só `/conflitos/` hoje). Sugestão: `.page-index + .section .article-layout{padding-top:var(--space-6)}` ou equivalente.

## 13. Bloco GENERATED:CONTRACT-DEFENSE-HUB (`render_contract_defense_products.mjs`, `styles-offers.css`) — RESOLVIDO (lote B, onda 2)

- Lista regrada, regras claras, `h2` sem `18ch` e sem ponto, opção vazia do select "Ainda não sei: quero orientação" (rótulo visível; `name`, `value`, `required` e consentimento intactos). O bloco continua gerado pelo gerador.

- Complementa o pedido 3: além da faixa de regras navy, a revisão apontou a grade 3×3 de cartões de preço (`.contract-products-hub__grid`), o `h2` com `max-width:18ch` (quebra em quatro linhas a 1440: "Sete eventos contratuais, cada um com um documento para agir.") e a opção padrão do select "Ainda não sei qual entrega, quero orientação", cortada no select nativo em 390 px. Sugestão: lista `list-ruled` com preço/prazo em `.t-data`, `h2` sem `18ch`, regras como `div.conditions` claro, opção "Ainda não sei · quero orientação". O lote retirou preço e prazo das linhas por situação, então o bloco gerado é o único lugar da página que os publica; o formulário `#captura-contrato` é protegido.

## 14. Quebra do h1 no hífen em 390 px (`/diagnostico-pre-licitacao/`) — RESOLVIDO (utilitário `.nowrap` do integrador + onda 2 do lote)

- **Arquivo**: `css/components.css` (primitivo) ou `styles.css`.
- **Motivo**: "Diagnóstico pré- / licitação para / obras públicas". Não há primitivo `nowrap` no sistema e `br.hero-br-mobile` só tem regra em `assets/home-10x.css`; o h1 literal está gravado em `data/bofu-dominance/frozen-specs/snapshots.json` e em `first-fold-measurements`, então o lote não trocou o hífen por U+2011. Pedido: um utilitário `.nowrap{white-space:nowrap}` (ou a regra de `hero-br-mobile` no sitewide) para envolver "pré-licitação".

## 15. Cópia de encaixe de `/reequilibrio-obras-publicas/` (`test:offer-fit`)

- **Arquivo**: `reequilibrio-obras-publicas/index.html` (rota da onda 1, fora dos arquivos permitidos da frente residual).
- **Motivo**: `tests/commercial/test_offer_fit_copy.mjs` exige o título e o corpo exatos de `data/commercial/offer-fit-matrix.v1.json#route_copy.reequilibrio-obras-publicas` ("Quando o dossiê de reequilíbrio cabe, e quando não" + corpo); a recomposição da onda 1 parafraseou o corpo. Reprova desde a onda 1 (`offer-fit-copy: 81/83`; no HEAD da integração `2da310422` o título não existe na rota: `git show 2da310422:reequilibrio-obras-publicas/index.html | grep -c "Quando o dossiê de reequilíbrio cabe"` = 0). Em `/diagnostico-pre-licitacao/` a onda 2 restaurou o texto exato; fazer o mesmo em reequilíbrio (h3 + `p[data-offer-fit="1"]` com o corpo do JSON) e recapturar o hash.

## 16. Tamanho do h1 de serviço dentro da casca `content-hero`

- **Arquivo**: `assets/editorial.css` (integrador).
- **Motivo**: nas quatro rotas de execução segura o `h1.t-service` fica dentro de `header.content-hero` (pinado pelo contrato safe-execution) e `.content-hero h1{font-size:var(--text-h1)}` (0,1,1) vence `.t-service` (0,1,0): 44 px a 1440 em vez de 48 px, e `line-height:1.08` no móvel. Sugestão: `.content-hero h1.t-service{font-size:var(--text-service);line-height:1.04;max-width:none}` ou equivalente na folha editorial.

## 17. Recaptura de hashes após a onda 2 (complementa o pedido 1)

- Além dos seis pilares: `styles-offers.css` mudou (lockup, hub) e entra em `data/commercial/first-fold-measurements.v1.json`; `diagnostico-pre-licitacao/index.html` mudou de novo (nowrap + cópia de encaixe); as quatro rotas de execução segura, as ofertas (diretoria, bid-room), o hub e os estados mudaram (`input_hashes` da primeira dobra). `test:first-fold-contract` reprova 17 checks só por isso. O `rendered_content_hash` da análise aprovada não depende de `styles-offers.css` (conferido antes e depois, mesmo valor).

## 18. `stash@{0}` no worktree do lote B

- O worktree `.worktrees/salto-02-lote-b` carrega `stash@{0}` ("WIP on campaign/salto-institucional-02-expansao: 2da310422", 288 arquivos, drift de `_site`/saídas rastreadas da base), anterior à onda 2 e não pertencente ao lote. Foi aplicado por engano por um `git stash`/`pop` de conferência e revertido com `git reset --hard HEAD` (trabalho já commitado); a entrada foi mantida. Decisão de descartar ou não é do integrador.
