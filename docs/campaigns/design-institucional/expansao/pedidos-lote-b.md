# Lote B — pedidos ao integrador

Campanha CONFENGE-SALTO-INSTITUCIONAL-02-EXPANSAO-PRODUCAO, ramo `campaign/salto-02/lote-b`.
Cada pedido diz o arquivo do integrador, o motivo e a página afetada. Nada aqui foi feito pelo lote.

## 1. Recaptura dos hashes congelados dos seis pilares B2G (materialize.py)

- **Arquivos**: `data/bofu-dominance/frozen-specs/{hashes,snapshots}.json`, `frozen-specs/specs/*.json`, `frozen-specs/patches/*.patch.txt`, `docs/seo/bofu-dominance/frozen-specs/*.md`.
- **Motivo**: os cinco pilares restantes (`aditivos-obras-publicas`, `auditoria-orcamento-licitacao`, `diagnostico-pre-licitacao`, `reequilibrio-obras-publicas`, `diagnostico-b2g-360`) foram recompostos no modelo do piloto; o formulário `#captura-pilar` é byte-idêntico, mas o HTML mudou. O `unlock-plan` autoriza a revisão comercial com recaptura honesta (motivo, `baseline_commit`). Enquanto a recaptura não acontece, reprovam por hash: `npm run test:bofu-dominance` (11 testes em `frozen_specs/` e `safe_execution/test_git_diff_is_exclusive_area`), `test:page-contract-contratos` (`held_hash_18/19/22`, `public_renderer_has_no_drift` em `render_contract_defense_products.mjs`), `test:page-contract-licitacao` (`dedicated_route_remains_frozen`, `LICITACAO_FROZEN_DRIFT` em `render_licitacao_products.mjs` para `diagnostico-pre-licitacao`) e `test:inbound-gates` (`test_measurement_delay_canary_389…`, já vermelho no ramo de integração por causa de `medicoes-glosas-obras-publicas`). Nenhuma dessas reprovações é de veracidade, preço, formulário ou responsabilidade: são comparações de hash/snapshot.
- **Também**: `data/commercial/first-fold-measurements.v1.json` (`test:first-fold-contract`) grava `input_hashes` de todas as rotas do lote; recapturar com `scripts/site/measure_first_fold.mjs` na cadeia obrigatória (análise aprovada → frozen specs → primeira dobra → baselines), só com o CSS congelado.

## 2. Folha editorial nas quatro rotas da área safe-execution

- **Arquivo**: `scripts/site/build_css.py` / nome público da folha (`assets/editorial.css`).
- **Motivo**: `tests/bofu_dominance/safe_execution/test_bofu_safe_execution.py::test_existing_css_js_only` só aceita folhas cujo `href` comece por `/styles`. Por isso `defesa-margem-contratos-publicos`, `atrasos-prorrogacao-obras-publicas`, `defesa-tecnica-contratos-publicos` e `acompanhamento-contratos-obras` ficaram sem a folha editorial e sem índice de página (`PRESERVADA_COM_JUSTIFICATIVA`). Opções: publicar a camada editorial também como `/styles-editorial.css` (mesmo conteúdo, nome dentro da regra) ou mover `.page-index`, `.conditions`, `.contact-primary/.contact-alt` e `.t-*` para `css/contracts.css`. Depois disso, aplicar a essas quatro rotas o mesmo tratamento das ofertas (`docs/…/expansao` do lote B: índice de página após a abertura, ids por seção).

## 3. Segundo momento escuro no hub de obras públicas

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

## 9. Margem da rota dominante no hub em 390 px

- **Arquivo**: `css/contracts.css` (linha `body[data-content-cluster="servicos"] main>.section:first-of-type .lead-inline{margin-top:16px}`).
- **Motivo**: a abertura dos hubs passou a ser `section.svc-open`, então o seletor deixou de casar e o `lead-inline` volta ao `margin-top:56px` de `styles.css`; em 390×844 o botão da rota dominante entrava na dobra só parcialmente. O lote contornou movendo a linha de prova para depois do cartão (botão inteiro na dobra nos dois hubs, recapturado); estender o seletor a `.svc-open .lead-inline` continua desejável para recuperar os 40 px de respiro entre o lead e o cartão. Não bloqueante.
