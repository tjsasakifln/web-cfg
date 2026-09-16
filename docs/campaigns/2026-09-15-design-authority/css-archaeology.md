# Arqueologia de CSS — por que "engenharia editorial premium" nunca virou percepção consistente

Repositório: `.`, ramo `campaign/design-authority-20260915`, HEAD `dce15f9e6`. Somente leitura. Linhas de `styles.css` citadas pelo número físico do arquivo (o arquivo é minificado: a linha 10 tem 15,6 KB e a linha 3 tem 5,8 KB, então "linha 10" localiza um bloco, não uma regra). O TSV `styles.rules.tsv` ao lado deste relatório tem as 1.008 regras expandidas com a linha de origem (1.293 linhas físicas; 285 são continuações do trecho formatado em multilinha, 48-416).

## Tese (o que os dados sustentam)

1. **A identidade tipográfica existe em uma página.** O `@font-face` de Archivo Var, o eixo `wdth`, a escala do hero e o rótulo estreito vivem só em `assets/home-10x.css`, carregado apenas por `index.html`. As outras 260 rotas renderizam em `ui-sans-serif, system-ui, Segoe UI, Inter` (`styles.css` linha 2), com `.type-serif` em Georgia/Palatino e `.type-mono` em Menlo/Consolas — o default de qualquer navegador. `styles.css` tem exatamente uma declaração de família sans e nenhuma referência a Archivo.
2. **Nunca foi escrita uma camada de componentes compartilhada.** `grep '\.card\b|\.grid\b|\.card-|\.grid-'` em `styles.css` devolve zero. Não há cartão genérico, grade genérica, nem superfície genérica. Os tokens de decoração existem mas não são usados: `--shadow` tem 0 usos em qualquer folha; `--text-display` 0 usos; `--radius*` 7 usos contra 80 literais de raio em 18 valores distintos (10px×13, 12px×10, 8px×8, 16px×7, 14px×5, 999px×5, 9px×4, 18px×4, 15, 7, 4, 32, 30, 24, 22, 20, 0, 50%). `--soft` é `#f3f4f5`, mas `styles.css` embarca 16 fundos claros distintos, dos quais 3 são estados semânticos (aviso `#fff8d8`, erro `#fdecec`) ou hover esverdeado (`#f5faf5`, `#f4faf4`, `#f3f8f3`); sobram ~10 neutros para um token (`#f7f9f8`×7, `#f7f8f9`, `#fafbfa`, `#f8fafc`, `#f8faf9`, `#f7faf7`, `#f5f7f6`, `#f4f7f5`, `#f0f5f0`, `#fbfcfc`) e as páginas inline acrescentam `#f3f6f8`, `#eef3ef`, `#f2f5f3`.
3. **Sem componente global, cada página reinventou o mesmo kit com prefixo próprio.** Histograma de prefixos nos `<style>` inline dos 7 pilares de serviço: `coord` 9, `n` 8, `qty` 8, `rv` 8, `insp` 7, `pce` 7, `atp` 6, `sst` 6 — oito namespaces derivando à mão as mesmas seis formas (hero+aside, amostra numerada com fio verde à esquerda, painel "sinal" com fio verde no topo, passo numerado com fio verde no topo, grade 3-up de cartões, split de triagem). É isso que as capturas mostram, e quase nada disso está em `styles.css`.
4. **`styles.css` cresceu por sobreposição, não por substituição.** 1.008 regras em 1.059 linhas físicas; camadas datadas 2026-07-30 (lançamento SEO, `.hero-copy h1` a 4,85rem), 08-01 (rebuild "engenharia editorial", `.section--tight`), 08-04 ("visitor-centered visual system", que corrigiu a camada anterior com `!important`), 08-20/21/23 (offer-context, operating-system, n-grid), 09-04 (article-hero). Cada camada re-declara o seletor em vez de editar o anterior: `.hero-proof` ×4 no nível raiz (+3 em media), `.answer-box` ×3, `.aside-card` ×3, `.article-layout` ×3, `.sources-section li a` ×3, `.contact-form` ×3, `.site-header` ×3, `.hero-copy h1` ×2 (+3 media), `body` ×3, `html` ×3. Há 31 `!important`: 8 em `@media print`/reduced-motion (linhas 8-9), 2 no honeypot (5), 3 em `[hidden]{display:none}` (10, 612, 613) e **18 em correções de camada** — 12 em botões (301-315 `.editorial-cta-secondary`, 317 `.lead-inline .button-secondary`, 362-364 `.aside-actions .button-secondary`), 6 em editorial (linha 10 `.article-intro` ×2 e `.technical-note` ×2; 531 `.article-hero h1` ×2).
5. **`assets/home-10x.css` está textualmente corrompido** por uma poda regex (dbf931d7b, 2026-09-06 e 605fd194f, 2026-08-30): comentários sem fechamento engoliram regras reais e um parágrafo de prosa virou seletor. Detalhe na seção 4.

## 1. Mapa de camadas: quem carrega o quê

Contagem sobre os 268 HTML rastreados pelo git fora de `_site/`, `scripts/`, `tests/`, `docs/`, `.claude/` (lista em `html.list`).

| Folha | Bytes | Linhas | Carregada por | Como |
|---|---|---|---|---|
| `styles-tokens.css` | 1.599 | 56 | ninguém diretamente | `@import url("/styles-tokens.css")` na linha 1 de `styles.css` e `styles-tools.css` (linha 18). `fingerprint_css.py` tem regex pinada nesse import específico. |
| `styles.css` | 90.222 | 1.059 | 261 páginas | `<link>` único do shell (`scripts/pseo/html_shell.py:356`). Não carregam: 2 embeds de data-desk, `ops/`, `diagnostico-b2g-expansao/{cancelado,expirado}`. |
| `css/contracts.css` + `css/type-floor.css` | 6.283 + 807 | 86 + 4 | via `styles.css` | `build_css.py` concatena os módulos de `css/manifest.json` **por último**, entre `/* BEGIN css-modules:cfg10x-12 */` (linha 973) e `END` (1059), sem comentários. Ou seja, o módulo é a última palavra da cascata de `styles.css`. |
| `assets/home-10x.css` | 40.987 | 638 | **1 página** (`index.html`) | `<link>` depois de `styles.css`. Única folha com `@font-face`. |
| `styles-offers.css` | 11.174 | 191 | 11 páginas B2G (ofertas/pilares) | `<link>` depois de `styles.css`. |
| `styles-hubs.css` | 2.674 | 80 | 2 hubs (`problemas-que-resolvemos`, `servicos-obras-publicas`) | idem. O próprio cabeçalho diz "These rules belong in styles.css… fold them in when the freeze lifts (2026-09-16)". |
| `styles-tools.css` | 18.758 | 906 | 18 páginas (`ferramentas/*`, radar, diagnóstico) | idem; define tokens próprios `--tool-*` e `--tool-radius:4px`, sistema paralelo. |
| `triagem-tecnica/styles.css` | 4.482 | 200 | 8 páginas (triagem + 7 pilares de serviço privado) | idem; raio `1rem`, sombra, cores próprias (`#31556f`, `#7aa6c2`, `#1e71a6` — azuis fora da paleta). |
| `entregas/styles.css` | 18.936 | 227 | 1 página | idem; hero com H1 `clamp(3.1rem,5.5vw,5.6rem)` (89,6 px). |
| `<style>` inline | 1,4–6,6 KB cada | — | 38 páginas | Ver ordem abaixo. |

Ordem de cascata efetiva (mesma especificidade vence o que vem depois):

- **Rotas geradas / maioria**: tokens → `styles.css` corpo (linhas 2-972) → módulos (973-1059). Nada depois. Header/footer vêm de `html_shell.py` (`_build_header`/`_build_footer`) e são re-sincronizados em ~200 arquivos por `shell_nav.py` (`sync_text`), que só reescreve o miolo dos `<nav>`/footer; os links de nav carregam `style="min-height:44px"` inline (`shell_nav.py:221`).
- **Pilares de serviço (`quantitativos-orcamento-obras`, `compatibilizacao-…`, +5)**: `styles.css` → `triagem-tecnica/styles.css` → `<style>` inline **depois dos links** (linha 28). O bloco inline ganha de tudo.
- **`servicos/`**: `styles.css` → `<style>` inline depois (linha 16). Ganha de tudo. Body `data-content-cluster="corporate-services"` recebe Archivo só se `home-10x.css` estivesse carregado (linha 519 de home-10x declara a família para esse cluster) — não está, então `servicos/` renderiza em system-ui apesar da regra existir.
- **Home (`index.html`)**: `<style data-home-deliverables-critical>` **antes** dos links (linha 22) → `styles.css` → `home-10x.css`. O comentário do HTML diz "a folha é a fonte única", mas a cascata só resolve propriedades que ambos declaram: o bloco crítico ainda é dono de `letter-spacing:-.04em` no `.hero h1` (home-10x só declara `-.032em` em `body[home] h1`, especificidade menor) e de `line-height:.99` até a regra da linha 568 (`line-height:1.05`) chegar. O `font-size` do bloco crítico (`clamp(2.25rem,4.6vw,4rem)`) é sobrescrito por `home-10x.css:191` (`3.3rem`) e de novo por `:568` (`clamp(1.9rem,3vw,2.75rem)`). O bloco crítico é uma terceira versão do hero, não um subconjunto.

Onde a home diverge do resto:

| Dimensão | Resto do site (`styles.css`) | Home (`home-10x.css`) |
|---|---|---|
| Família | system-ui/Segoe/Inter | Archivo Var (wdth 66-110) + fallback métrico |
| H1 | `--text-h1` = `clamp(2.65rem,4.6vw,4.5rem)` → **66 px @1440, 72 px teto** | `clamp(1.9rem,3vw,2.75rem)` → **43 px @1440, 44 px teto** (a home e os artigos, 42 px, são os menores H1 do site) |
| Eyebrow | `.875rem`, peso 800, `letter-spacing:.1em`, verde | idem mas `font-stretch:78%`, peso 750 — e a regra de margem/cor (linha 158) está morta dentro de comentário não fechado |
| Rítmo de seção | `.section{padding:112px 0}` (linha 2) depois `var(--section-default)`=80px (linha 14) | `clamp(3.5rem,7vw,6rem)`; `.section--tight{padding:0}` |
| Superfície | gradientes (`#fff→#f5f8f6`), radial blobs `::before/::after`, sombra 0 20px 50px | `--rule` 1px `#dfe4e6`, sem gradiente, sombra só em botão |
| Botão secundário | pílula branca `border:#d5dde5` (linha 10) e outra versão linha 37 | contorno `1px --rule-strong`, hover invertido |
| Formulário | cartão branco raio 22px→12px, sombra 0 32px 78px | `border:0;border-radius:0;box-shadow:none` |
| Rodapé | `--navy-950`, grade 1.3fr .65fr 1fr para **4** blocos | mesma cor; 4 colunas ≥1000px |

## 2. Inventário dos primitivos globais em `styles.css`

Regras contadas no TSV expandido; "def." = quantas vezes o mesmo seletor raiz é redeclarado; "!imp" = ocorrências de `!important` no grupo.

| Primitivo | Seletores | Linhas | Regras | !imp | Observação |
|---|---|---|---|---|---|
| Reset/base | `*`, `html`, `body`, `img`, `a`, `button…`, `::selection` | 2, 14, 420-421, 822, 988-1016 | 14 | 0 | `body` definido 3× (fonte system-ui na linha 2; `font-size:1rem` linha 14; `var(--text-body-mobile)` linha 420 + 1.125rem ≥768px). `html` 3× (scroll-padding 88→96→96). |
| H1/H2/H3 | `h1,h2,h3`, `h1`, `h2`, `h3` | 2 | 6 | 0 | `h1{var(--text-h1)}` = 72 px teto; `h2{var(--text-h2)}` = `clamp(1.85rem,3.2vw,3.15rem)` = 50 px teto; `h3{1.05rem}`. Todos com `line-height:1.08;letter-spacing:-.035em`. **18 declarações extra de `font-size` em h1** e 14 em h2 espalhadas (ver seção 3). |
| `.container` | + media 900/620/360 | 2, 6, 7, 17 | 4 | 0 | `min(calc(100% - 48px),1200px)`. |
| `.section*` | `.section`, `.section--tight/default/loose`, `.section-head`, `.section-heading`, `.section-lead`, `.section-soft`, `.section-num` | 2, 3, 10, 14-16 | 16 | 0 | `.section` 2× (112px → `var(--section-default)` 80px). `.section-heading` (grade 1.1fr/.72fr, gap 80) e `.section-head` (max 52rem) coexistem como dois padrões de cabeçalho. |
| Eyebrow/kicker | `.eyebrow`, `.eyebrow-light`, `.eyebrow-dot`, `.hero-eyebrow`, `.answer-box span`, `.aside-kicker`, `.editorial-cta-kicker`, `.featured-kicker`, `.lead-inline-copy span`, `.author-box span`, `.criterion-card>span`, `.action-list>li>span`, `.breakout-meta dt`, `.offer-context dt`, `.contact-channels small`, `.stage-meta dt`, `.content-feature .type-mono`… | 2, 3, 10, 12, 15, 80, 272, 346, 455, 543, 638, 733 | ~22 | 0 | **Nenhuma classe de kicker compartilhada**: o mesmo desenho (`.8rem`, peso 800-850, `letter-spacing:.1-.12em`, uppercase, verde) é re-escrito ≥14 vezes com valores ligeiramente diferentes (.06/.07/.08/.1/.12em; 750/800/850). |
| Cartões/grades | `.criterion-card`, `.document-list li`, `.error-list li`, `.author-box`, `.aside-card`, `.related-card`, `.n-card`/`.n-grid`, `.ca-list>li`, `.content-trails>a`, `.content-reads`, `.dm-node`, `.profile-list li`, `.sources-section li a`, `.checklist`, `.checklist-toolbar`, `.editorial-cta-inner`, `.breakout-chassis`, `.article-decision`, `.answer-box`, `.commercial-bridge`, `.lead-inline`, `.simple-card` | 3, 5, 10-12, 71, 123-170, 260, 333, 588-602, 634, 891-948 | ~60 | 0 | Não existe `.card`/`.grid`. `.aside-card` 3× (raio 15 → 16 → `--radius-sm`), `.answer-box` 3× (raio 14 → 16 → 0 e `border-left` 5px → 4px → 3px), `.related-card` definido só como "cartão desfeito" (linha 588: `border:0;box-shadow:none;border-radius:0`) sem a definição original — camada 08-04 apagando a camada 07-30. Grades 3 colunas iguais: `.hero-proof` (linha 3), `.related-grid-six` (10), `.offer-context` (745), `.decision-map-rail` (893); 2 colunas: `.document-list`, `.profile-list`, `.two-column-content`, `.form-row`, `.n-grid`, `.breakout-meta`. |
| Botões | `.button`, `.button-primary`, `.button-light`, `.button-lg`, `.button-secondary` (×2 raiz: linhas 10 e 37), `.text-link`, `.header-cta`, `.editorial-cta-secondary`, `.aside-actions .button-secondary`, `.lead-inline .button-secondary` | 2, 10, 12, 15, 37-38, 305-317, 365, 424-425, 999 | 22 | **12** | `.button-secondary` tem duas definições raiz incompatíveis (linha 10: branco `#d5dde5`; linha 37: transparente `rgba(6,26,51,.18)`, `font:600 .95rem`) e três correções contextuais com `!important` (305, 317, 365) para forçar de volta o branco. `.button-primary` sombra 0 14px 30px (linha 2) → 0 8px 20px (linha 15). `min-height` 50 → 44 (`--touch-min`, linha 999) — motivo do hero da home precisar re-elevar a 56px. |
| Header/nav | `.site-header`, `.header-inner`, `.brand`, `.desktop-nav a`, `.header-cta`, `.menu-toggle`, `.mobile-nav`, `.site-header .logo/.nav-desktop` | 2-3, 5-7, 15, 424, 756-772, 956-958, 967-968, 1012, 1019 | ~45 | 0 | `.site-header` 3× (rgba .92 + blur → rgba .97 sem blur → `#fff` no módulo). Brand 224 → 205 → 210 → 190 → 162 → 176 → 160 px em 6 breakpoints. Faixa 901-999px trata como mobile. Um segundo header (`.logo`/`.nav-desktop`, linha 956) só para páginas legadas. |
| Footer | `.site-footer`, `.footer-top`, `.footer-brand`, `.footer-links`, `.footer-bottom`, `.footer-authority` | 5-7, 621-625 | 14 | 0 | Grade `1.3fr .65fr 1fr` para 4 blocos → o 4º cai sozinho na 2ª linha (home corrige só na home, `home-10x.css:392`). |
| Formulários | `.contact-form*`, `.field*`, `.consent`, `.form-row/-submit/-note/-hint/-status/-progress*/-step*`, `.honeypot`, `.offer-request-form`, `.directory-search input`, `.hub-search-priority input`, `.breakout-tool select`, `.pillar-capture-form` (offers) | 3-5, 15, 22-43, 432, 440-445, 643, 911-924, 993-995 | ~55 | 2 (honeypot) | Cinco kits de input com bordas `#cbd4dc`, `#cfd8de`, `#c5cfd7`, `#a9b6c0`, `#a9b6b0` (offers), `#8799a8` (triagem) e raios 9/8/7/.55rem. `.contact-form` 3× (raio 22 → 12 → `--radius-md`; sombra 0 32px 78px → 0 20px 48px → 0 16px 40px). `.form-status.is-error` 2×, `.is-invalid` 2×. |
| Tabelas | `.table-wrap`, `.compare-table*`, `.table-note`, `.data-table*`, `main .pilot-table/.radar-table/.ma-table` | 11, 942-946, 960, 971, 996-998 | 16 | 0 | Dois sistemas (`.compare-table` .86rem com thead `#f0f5f0`; `.data-table` .9rem com th `#f7f9f8`). |
| Hero (interno) | `.hero*` (×2 camadas), `.content-hero*`, `.article-hero*`, `.hub-hero--problem`, `.offer-hero*`, `.final-cta-section`, `.content-cta`, `.lead-inline` | 3, 6-7, 10, 12, 15-17, 48-55, 412-413, 435-437, 530-531, 667-753, 927-931, 1023-1052 | ~110 | 2 | Cinco heróis distintos. `.hero` completo é definido duas vezes (linha 3 com gradiente+blobs; linha 15 `background:#fff;::before/::after{display:none}`), ou seja a camada "editorial" cancela a camada "SEO" sem apagá-la. |
| Editorial/artigo | `.article-*`, `.editorial-*`, `.answer-box`, `.checklist*`, `.sources-*`, `.related-*`, `.aside-*` | 10, 48-416, 530-605 | 115 (+~60 na linha 10) | 6 (+3 `[hidden]`, +8 print/motion fora deste grupo) | Camada 08-04 (linhas 48-416, formatada multilinha) e camada 08-04b (530-605) corrigindo a anterior com `!important` e `border:0;border-radius:0;box-shadow:none` — o padrão "desfazer cartão" repetido para `.answer-box`, `.sources-section li a`, `.related-card`, `.aside-card`, `.criterion-card`, `.document-list li`, `.error-list li` (linha 601). |
| Utilidades de layout (módulo) | `css/contracts.css` | 973-1052 | 75 | 0 | `min-width:0`, `overflow-wrap`, touch-min, `scroll-padding-top`, e **ajustes por rota** (`body[data-offer-id="diagnostico-b2g-360"]` ×9, `body[data-route-family="aditivos"]` ×4, `body[data-asset-family="oportunidade-publica"]`) — um módulo "contrato" que virou depósito de correções de dobra. |
| Piso tipográfico (módulo) | `css/type-floor.css` | 1056-1058 | 3 | 0 | `max(var(--text-micro),12.8px)` em 20 seletores de microcopy. |

Totais: 1.008 regras; 31 `!important` (8 print/motion, 2 honeypot, 3 `[hidden]`, 18 correções de camada); 25 sombras bespoke; 23 `linear-gradient` + 9 `radial-gradient`; 80 literais de raio em 18 valores.

## 3. Regras que produzem os padrões ruins das capturas

Importante: **a maior parte dos padrões vistos nas capturas dos pilares de serviço não vem de `styles.css`**, vem dos `<style>` inline (que ganham por virem depois). Cito as duas camadas por padrão.

### 3a. Cartão com borda verde no topo (3-4px `--green-700`)

- `styles.css` linha 15: `.tension-stage{border-top:3px solid var(--line)}` + `.tension-stage-end{border-top-color:var(--green-700)}` (home antiga; `.tension-*` não é mais usado pela home).
- `styles.css` linha 873/875: `.compare-side{border-top:3px solid var(--line)}`, `.compare-human{border-top-color:var(--lime)}`.
- **Inline, 18 ocorrências em 7 páginas**: `quantitativos-orcamento-obras/index.html` `.qty-signal{border:1px solid var(--line);border-top:4px solid var(--green-700);background:var(--soft)}`, `.qty-choice{border-top:4px solid var(--green-700)}`, `.qty-proof-entrance{…border-top:4px…}`, `.qty-step{padding-top:1rem;border-top:3px solid var(--green-700)}`, `.qty-depth{border-top:3px solid var(--green-700)}`; `compatibilizacao-projetos-engenharia/index.html` `.coord-signal{…border-top:4px solid var(--green-700);background:var(--soft)}`, `.coord-step{border-top:3px…}`; mesmo desenho em `rv-`, `insp-`, `pce-`, `atp-`, `sst-`.
- Fio verde à esquerda (variante): `styles.css` linha 10 `.answer-box{border-left:5px solid var(--green-700)}`, linha 12 `.commercial-bridge{border-left:5px solid var(--green-700)}`, linha 71 `.answer-box{border-left:4px}`, linha 539 `.answer-box{border-left:3px solid var(--ink)}`; `home-10x.css:571` `.hero-sample{border-left:3px solid var(--green-700)}`; `entregas/styles.css:71` `.published-offers__common{border-left:4px solid var(--green-700)}`; inline `.qty-sample`, `.coord-sample`, `.qty-trail-disclaimer`, `.qty-proof-disclaimer`, `.coord-finding-stale` (11 ocorrências em 7 páginas). `data/site/design-system.json` lista `green_border_on_all_elements` em `forbidden_patterns` — não há gate que o meça.

### 3b. Caixas cinza

- `styles.css`: `.document-list li`, `.sources-section li a`, `.profile-list li`, `.content-trails>a`, `.ca-list>li`, `.offer-request-form`, `.pillar-capture` (offers) — todos `background:#f7f9f8;border:1px solid var(--line)` (7 usos de `#f7f9f8`); `.faq-section`, `.simple-page`, `.tension-section` `var(--soft)`; `.section-soft{background:#f5f7f6}`; `.icp-no{#f7f8f9}`; `.breakout-chassis{#f7faf7}`; `.authority-method{#f8fafc}`; `.offer-context{rgba(245,247,246,.45)}`; `.compare-tool{#f7f8f9}`.
- Inline: `background:var(--soft)` em `.qty-sample/.qty-signal/.qty-proof-chain/.qty-trail-disclaimer/.coord-sample/.coord-signal/.coord-finding-stale`; `#f3f6f8` em `.qty-return/.qty-triage/.coord-triage` (26 ocorrências em 7 páginas). `home-10x.css:513/592` `#eef3ef` (`.corporate-triage`, `.corporate-contact-band`). `styles-offers.css:8` `#f2f5f3` (`.contract-product`), `:54/:105` `#f7f9f8`.

### 3c. Sombras

- `styles.css` (25 bespoke): `.button-primary` 0 14px 30px (linha 2) e 0 8px 20px (15); `.button-light` 0 14px 32px; `.contact-form` 0 32px 78px (3) → 0 20px 48px (15) → 0 16px 40px (432); `.mobile-nav` 0 26px 60px (6, 967); `.whatsapp-float` 0 16px 34px; `.simple-card` 0 20px 55px; `.article-cover img` 0 22px 60px; `.author-box` 0 16px 45px; `.aside-card` 0 18px 48px (10) → 0 14px 36px (333) → `none` (593); `.profile-mark` 0 28px 70px; `.answer-box` 0 10px 30px (71); `.checklist-toolbar` 0 8px 24px; `.checklist` 0 10px 28px; `.editorial-cta-inner` 0 16px 40px; `.editorial-cta-secondary` 0 1px 0.
- `triagem-tecnica/styles.css`: `.next-state,.technical-intake-form,.receipt-card,.channel-card{border-radius:1rem;box-shadow:0 .5rem 1.5rem rgb(25 48 65/7%)}` — o formulário de triagem dos 7 pilares é um cartão arredondado com sombra, ao lado de blocos inline sem raio.
- `entregas/styles.css`: `.deliverables-status` 0 28px 68px; `.vitrine-item` 0 12px 30px. `styles-offers.css:125` `.pillar-capture-form` 0 18px 45px.

### 3d. Raio 16 (e o zoológico de raios)

- Token `--radius:var(--radius-lg)`=16px usado 1× (`.simple-card`, linha 5). Literais `16px`: `.mobile-nav` (6, 967), `.author-box` (10), `.lead-inline` (10), `.contact-form` mobile (7), `.answer-box` (71), `.aside-card` (333). `18px`: `.article-cover img`, `.article-decision`, `.author-photo`, `.editorial-cta-inner`; `22px` `.contact-form`; `32px` `.profile-mark`; `1rem` em triagem; `4px` em entregas e tools (`--tool-radius`). `design-system.json` diz "Large radius is rare; editorial panels prefer 0–12px" e "shadows none_default:true" — o CSS não obedece.

### 3e. H1 70 px

- `styles.css` linha 2: `h1{font-size:var(--text-h1)}` = `clamp(2.65rem,4.6vw,4.5rem)` → 62,8 px @1366, **66 px @1440, 70,6 px @1536, 72 px teto**. Qualquer H1 que não caia em `.content-hero h1`/`.article-hero h1`/`.hero-copy h1` renderiza assim: hubs (`.section-head h1` — `styles-hubs.css` corrige só nos 2 hubs; o comentário lá cita "75px at 1366px and 325px tall", referindo uma clamp que já não existe), `.n-wrap>h1`, `.pilot-wrap>h1`, casos, especialista.
- `styles.css` linha 10: `.content-hero h1{font-size:clamp(2.85rem,4.5vw,5rem)}` → 61 px @1366, **80 px teto** — pilares B2G e ofertas.
- `styles.css` linha 3: `.hero-copy h1{clamp(3.25rem,4.45vw,4.85rem)}` (77,6 px) — morta, sobrescrita na linha 15 por `clamp(2.15rem,3.8vw,3.35rem)`.
- `servicos/index.html` inline: `.corporate-services-hero h1{clamp(2.35rem,5vw,4.4rem)}` → **70,4 px** a partir de 1408 px.
- `entregas/styles.css:9`: `clamp(3.1rem,5.5vw,5.6rem)` → 89,6 px teto.
- Contraste: home = 44 px teto (`home-10x.css:568`), pilares privados = 43 px (`.qty-hero h1 clamp(1.9rem,3.3vw,2.7rem)`), artigo = 42 px (`.article-hero h1 … !important`, linha 531). O site tem H1 de 42 a 90 px conforme a rota; a home (44) e o artigo (42) são os menores, os pilares B2G (80) e entregas (90) os maiores. 18 declarações de `font-size` em `h1` só em `styles.css` (+3 em `@media (max-width:430px)` do módulo), 11 nos blocos inline.

### 3f. Grades de 3 colunas iguais

- `styles.css`: `.hero-proof{repeat(3,minmax(0,1fr))}` (linha 3; redefinida para 2 col na linha 12 e `1fr 1fr` na 15), `.related-grid-six{repeat(3,1fr)}` (10), `.offer-context` ≥761px (745), `.decision-map-rail` (893).
- Inline, **13 ocorrências em 7 páginas**: `.qty-grid`, `.qty-flow`, `.coord-grid`, `.coord-flow` (e equivalentes rv/insp/pce/atp/sst) — sempre `repeat(3,minmax(0,1fr));gap:1rem` com `.qty-card{padding:1.35rem;border:1px solid var(--line);background:#fff}`; `quantitativos-orcamento-obras` tem 13 `.qty-card`, 3 `.qty-grid`, contra `max_identical_cards_in_row:3` e `max_card_grids_per_page:2` do design-system.json (não medidos por gate).
- `home-10x.css:290` `.market-context .service-grid{repeat(3,minmax(0,1fr))}` com `.service-card{border:1px solid var(--rule);border-radius:var(--radius-md)}` — exatamente a "caixa com fio" que o cabeçalho do próprio arquivo (linhas 39-41) diz ter removido. `styles-offers.css:8` `.contract-product__lockup`, `.contract-products-hub__grid` (3 col). `entregas/styles.css` `.compare-ladder-figures`, `.vitrine-item__facts`, `.offer-value-ladder>ol` (3 col).

## 4. `assets/home-10x.css`: identidade vs. composição da home

### 4a. O arquivo está corrompido (parse com tinycss2, `parse_home.py`)

Uma poda por regex removeu regras e junto o `*/` dos comentários acima delas. Resultado, com `tinycss2.parse_stylesheet`:

- Linha 155-159: comentário aberto em `/* O grupo inteiro fica em --text-small…` engole `body[home] .icp-label{…}` (157) e **`body[home] .eyebrow{margin:0 0 .85rem;color:var(--accent)}` (158)**. A cor/margem do eyebrow da home é regra morta; o eyebrow cai no `styles.css` (.875rem, margin 14px).
- Linha 265: `/* ── 4. Tres portas: linha editorial{border-bottom:0}` sem fechamento — engole `#contrato-canal-seguro` (266) e o grid de ofertas da seção 5 (268-271) até o `*/` da linha 276. Introduzido em dbf931d7b (2026-09-06, "[MV-09]…"), quando `.journey-kind` foi removido da linha seguinte.
- Linha 326: `cinza-azulado claro e lime pensados para esse fundo escuro.` está **fora** de comentário (o `/* ` que o abria foi apagado em 605fd194f, 2026-08-30). O parser lê a prosa até `*/` como prelude do seletor e descarta `.evidence-kicker{color:var(--muted)}` (330).
- Linha 331-334: `/* Uma acao dominante… em contorno{color:…}` e `/* Sem o "01/02/03"{grid-template-columns:1fr…}` sem fechamento — engolem duas regras até o `*/` da 334.
- Linha 337-347: `/* ── 9. Autoridade e adequacao: sai o card{ … }` e `/* O recorte precisa de chao… regua da home{ … }` — mais duas regras mortas.

Nenhuma dessas regras mortas é referenciada por `index.html` hoje (a poda de 515bc6403 removeu os blocos), então o dano visível é só o eyebrow; mas o arquivo não é mais uma fonte confiável, e qualquer `grep`-gate que procure texto nele (há três: `test_mobile_matrix_composition`, `test_css_visitor_tokens`, `test_font_fallback_metrics.mjs`) passa por acidente.

### 4b. Código morto pós-poda

Mesmo após "só com regras que a home usa" (515bc6403), estes seletores têm **0 ocorrências** em `index.html`: `.journey-kind`, `#contrato-canal-seguro`, `.evidence-kicker`, `.evidence-heading`, `.hero-verdict`, `.hero-verdict-set`, `.hero-verdict-foot`, `.home-proof-strip*`, `.home-method-strip`, `.market-advantages`, `.icp-label`, `.type-mono`, `.corporate-service-row--b2g` (linha 523, pertence a `servicos/`), `body[data-content-cluster="corporate-services"]` (519, nunca carregado nessa rota), `.anchor-alias` (446, usado 2×). `.market-context`/`.service-card` são usados (2-3×).

### 4c. O que é identidade (candidato a global)

| Linhas | Conteúdo | Por quê é identidade |
|---|---|---|
| 53-77 | `@font-face "Archivo Var"` (wght 100-900, wdth 66-110, `font-display:swap`) + `"Archivo Fallback"` com `size-adjust:98.56%`, ascent/descent override | Única fonte da marca; fallback métrico medido (`test_font_fallback_metrics.mjs`). |
| 124-129 | `--page-gutter`, `--wide:96%`, `--narrow:78%`, `font-family` Archivo, `font-weight:400`, `font-variant-numeric:tabular-nums slashed-zero` | Régua tipográfica: uma família, três larguras. |
| 112-123 | `--field/--field-soft/--field-ink/--field-muted/--accent/--accent-live/--dark/--dark-ink/--dark-muted/--dark-accent/--rule/--rule-strong` | Hoje todos resolvem para tokens globais existentes (`--field:#fff`, `--accent:var(--green-700)`, `--dark:#071a31`) exceto `--rule:#dfe4e6` e `--rule-strong:#0d1b12`. São aliases semânticos, não paleta nova; o único valor novo é `--rule`. |
| 139-147 | `.type-serif/.type-mono` → Archivo; `h1,h2{font-stretch:96%;font-weight:760;letter-spacing:-.032em;line-height:1.04}`; `h3{…720}` | A escala de títulos "premium" que o resto do site não recebe. |
| 151-154 | rótulo estreito: `.eyebrow{font-stretch:78%;font-weight:750;letter-spacing:.11em;uppercase;--text-small}` | Assinatura tipográfica. |
| 162-164, 169-172 | `.section-lead` 58ch/1.05rem; `.section{padding:clamp(3.5rem,7vw,6rem)}`; `.section-head h2{max-width:20ch}` | Ritmo. |
| 176-184 | `.section-head:has(.section-lead)` em duas colunas | Composição de cabeçalho — global se adotada. |
| 348-351 | `.button-secondary` contorno | Sistema de botão (resolve a dupla definição de `styles.css`). |
| 361-363 | `.contact-form{border:0;border-radius:0;box-shadow:none}` | Decisão "régua no lugar de caixa". |
| 474-500 | `.situation-list/.situation-row/.process-list` (linha com índice, `border-top:1px --rule-strong`, `border-bottom:1px --rule`) | É o componente "lista regrada" que os pilares reinventam como `.qty-trail-steps`, `.qty-flow`, `.coord-flow`. |
| 505-511 | `.b2g-proof` (dl 2 col, número grande `clamp(1.6rem,3vw,2.35rem)` peso 780) | Componente "figura com procedência" = `.compare-ladder-figures` de entregas, `.offer-context` de styles.css, `.qty-proof-chain` inline. |
| 571-576 | `.hero-sample` (amostra com fio à esquerda, `--field-soft`) | Mesmo componente que `.qty-sample`/`.coord-sample` inline. |

### 4d. O que é composição da home (fica na home)

Linhas 187-237 e 402-440, 568-581, 610-630 (sete redefinições de `.hero h1`, seis de `.hero-lead`, medidas de dobra em 940/700/400 px), 234-237 `.home-hero-grid`, 243 `.hero-verdict`, 263 `.home-proof-strip`, 277-280 `.home-method-strip`, 283-324 `.market-context` (e o `.service-card` que contradiz a tese), 354-381 captura (`.form-legal`, `.form-nojs-note`, `.turnstile-slot`), 387-396 rodapé 4 col, 442-470 `.corporate-hero-note`, 513-517 `.corporate-triage`, 592-601 `.corporate-contact-band`, 632-638 `contain-intrinsic-size` por faixa. O bloco `@font-face` + tokens ocupa ~3,5 KB; a composição ~30 KB; corpo morto/comentado ~7 KB.

## 5. Proposta de consolidação segura

### 5a. Direção da cascata decide o desenho

Três fatos, juntos:

- `build_css.py` concatena os módulos de `css/manifest.json` **por último** em `styles.css` (marcadores 973/1059). Um módulo novo cai depois das 972 linhas de regras de página e vence, por ordem, qualquer regra legada de **mesma** especificidade.
- Ordem não vence especificidade: `h1{…}` em `identity.css` **não** sobrescreve `.content-hero h1`, `.article-hero h1`, `.hero-copy h1`, `.simple-card h1`, `body[data-surface-type=…] .article-hero h1`. As 18 clamps locais de `styles.css` (+3 no módulo) e as 11 dos blocos inline têm de ser apagadas; não há como "vencer" por posição.
- Tudo o que está em `styles.css` (corpo ou módulo) continua perdendo para `styles-hubs/offers/tools.css`, `triagem-tecnica/styles.css`, `entregas/styles.css` e os 38 `<style>` inline, porque essas folhas são carregadas depois. **Adicionar um componente global não muda nada numa página até o bloco inline dela ser apagado no mesmo commit.** A migração é atômica por página, não "cria global agora, migra depois".

Desenho: dois módulos na manifest, `css/components.css` antes de `css/identity.css`. `identity.css` = `@font-face` + custom properties (`:root`/`body`) + regras de elemento base (`body`, `h1-h3`, `.eyebrow`, `.type-serif/.type-mono`), nada de componente. `components.css` = os primitivos da seção 5d. Módulo na manifest, não um segundo `@import`: a regex de `fingerprint_css.py:31` está pinada em `/styles-tokens.css`; outro import sairia sem hash no artefato.

### 5b. Mover para `css/identity.css`

1. `@font-face` Archivo Var + Archivo Fallback (home-10x 53-77). Preload do woff2 passa a ir no shell (`html_shell.py:page_shell`) — hoje só `index.html` tem `<link rel=preload as=font>`; 260 rotas passariam a baixar a fonte (60.064 bytes; baseline mede `font_gzip_kb_total: 58.69` e registra `routes_with_font_files: ['/']` em `docs/performance/PERFORMANCE-BUDGET-BASELINE.json`); o budget `font_total_gzip_kb_max:60` está a 1,3 KB do limite — `audit_performance.py` tem `FONT_GZIP_CAP_KB=120` hard, 60 no baseline. Um segundo arquivo (itálico, outro subset) estoura `font_files_max:1`. Os campos `routes_with_font_files`/`routes_with_font_face_rules` do baseline são informativos: `audit_performance.py:430-449` só reprova por rota (fonte > 60 KB gzip, > 1 arquivo, `@font-face` sem arquivo resolvível), então levar a fonte a 261 rotas não cria uma terceira baseline a recapturar.
2. Tokens: `--rule:#dfe4e6`, `--rule-strong:#0d1b12`, `--wide:96%`, `--narrow:78%`, `--page-gutter` → `styles-tokens.css` (é a "single source of truth" declarada); `--field*`/`--dark*` como aliases semânticos em `:root`. Retirar da home-10x.
3. `body{font-family:"Archivo Var","Archivo Fallback",…;font-variant-numeric:tabular-nums slashed-zero}` — substitui a linha 2 de `styles.css` e resolve a diferença entre home e resto.
4. `h1,h2{font-stretch:var(--wide);font-weight:760;letter-spacing:-.032em;line-height:1.04}`, `h3{…}`; `.type-serif{font-stretch:var(--wide);…}`; `.type-mono` e `.eyebrow{font-stretch:var(--narrow);font-weight:750;letter-spacing:.11em}`. Redefinir `--serif` e `--mono` em tokens para a família Archivo (design-system.json `serif_display` também precisa mudar; `test_css_tokens_mirror_system` só exige que `--serif`/`--mono` existam).
5. Escala: hoje `--text-h1` (72 px) e `--text-h2` (50 px) são o teto do site e a home usa 44/~36 px. Decidir **uma** escala em tokens (sugestão: `--text-h1:clamp(2rem,3vw,2.75rem)` da home, `--text-h2:clamp(1.6rem,2.6vw,2.15rem)` de styles-hubs) e apagar as 18+11 clamps locais de h1. Isso é a mudança de maior impacto perceptivo e a de maior risco de gate (ver 5e).
6. `.section{padding:clamp(3.5rem,7vw,6rem) 0}` ou os tokens `--section-*` existentes; `.section-head:has(.section-lead)` duas colunas.

### 5c. Apagar de `home-10x.css`

- Todo o corpo morto e corrompido: 149-160 (recompor o comentário e restaurar `.eyebrow` margin/cor se ainda desejada), 265-276, 326-347, 519-523 (`corporate-services` e `.corporate-service-row--b2g` pertencem a `servicos/`), `.anchor-alias` se o HTML deixar de usar.
- Tudo o que sobe para identity/tokens (53-77, 112-131, 139-164, 169-172, 176-184, 348-351, 361-363).
- Sete definições de `.hero h1` → uma por breakpoint (191-194, 405-406, 415, 432, 532, 568, 613, 628 colapsam em 3).
- `.market-context .service-card` (294-310): ou vira `.card--ruled` global ou some — não pode existir ao lado do cabeçalho que o proíbe.
- O bloco crítico inline de `index.html` (linhas 22-31) passa a ser um subconjunto literal da folha (mesmos valores) ou some; hoje é uma terceira versão.

### 5d. Seletores das páginas internas que precisam de regra global (para os 7 pilares + servicos + entregas deixarem de reinventar)

| Forma reinventada | Instâncias | Regra global proposta (nome) |
|---|---|---|
| Hero com aside (`.qty-hero-grid`, `.coord-hero-grid`, `.home-hero-grid`, `.content-hero-grid`, `.deliverables-hero-grid`, `.corporate-services-hero`) | 8 | `.hero-grid` única (já existe em styles.css linha 15 com `minmax(0,1.05fr) minmax(280px,.85fr)`) |
| Amostra com fio (`.qty-sample`, `.coord-sample`, `.hero-sample`, `.qty-trail-disclaimer`, `.qty-proof-disclaimer`, `.coord-finding-stale`, `.answer-box`, `.commercial-bridge`) | 15+ | `.sample` / `.aside-note` com **um** fio (decidir: esquerda 3px ou nenhum) |
| Painel "sinal"/"escolha" com fio verde no topo (`.qty-signal`, `.qty-choice`, `.qty-proof-entrance`, `.qty-depth`, `.coord-signal`, `.tension-stage-end`, `.compare-human`) | 18 | `.panel` sem fio de acento; hierarquia por tipografia, conforme design-system.json |
| Passo numerado (`.qty-step::before "0N"`, `.coord-step`, `.qty-sample-steps li::before`, `.action-list>li::before`, `.error-list li::before`, `.process-list li>span`, `.situation-index`, `.editorial-heading-num`, `.operating-marker`) | 9 desenhos | `.steps` (ol regrada, índice mono à esquerda) — o `.process-list` da home é o melhor candidato |
| Grade 3-up de cartões (`.qty-grid/.qty-card`, `.coord-grid/.coord-card`, `.related-grid-six`, `.contract-products-hub__grid`, `.service-grid`) | 13 | `.grid-3` + `.card` (única definição de raio/borda/sem sombra) |
| Figuras com procedência (`.b2g-proof`, `.compare-ladder-figures`, `.offer-context`, `.qty-proof-chain`, `.vitrine-item__facts`, `.breakout-meta`) | 6 | `.figures` (dl regrada) |
| Kicker/eyebrow (≥14 cópias em styles.css, `.qty-sample-label`, `.coord-sample-label`, `.qty-use strong`, `.service-kicker`, `.situation-kicker`, `.tool-kicker`, `.triage-eyebrow`) | 20+ | `.eyebrow` + variante `.eyebrow--muted` |
| Split de triagem (`.qty-triage-grid`, `.coord-triage-grid`, `.pillar-capture-grid`, `.contact-grid`, `.contact-band-grid`, `.contract-product__capture`) | 6 | `.capture-grid` |
| Input (6 kits de borda/raio) | 6 | `.field input/select/textarea` única |
| Botão secundário (2 raízes + 3 `!important` + home + servicos `.corporate-service-row--b2g .button-secondary` + `.editorial-cta-secondary`) | 7 | `.button-secondary` única; apagar linhas 37-38 e os `!important` 305-317, 365 |

Sequência segura: (1) identity.css + tokens; (2) components.css com os 8 primitivos acima **sem** alterar valores medidos pela dobra; (3) migrar os 7 pilares inline um a um (substituir prefixos pelas classes globais, apagar o `<style>`); (4) `styles-hubs.css` inteiro para styles.css (o próprio arquivo pede); (5) só então colapsar as camadas duplicadas de `styles.css` (linhas 3 vs 15 hero, 10 vs 71 vs 539 answer-box, etc.).

### 5e. Riscos: testes que congelam seletores/valores

**Baselines de hash (falham no commit 1 de qualquer mudança):**

- `data/commercial/first-fold-measurements.v1.json` → `input_hashes` (49 entradas) cobre **todas as 20 folhas CSS** (`styles.css`, `styles-tokens.css`, `assets/home-10x.css`, `styles-offers/hubs/tools`, `entregas/styles.css`, 8 `casos/*/styles.css`, report-*.css) e o woff2. `scripts/site/first_fold_identity.mjs:firstFoldIdentityProblems` reprova com `first_fold_input_changed:<arquivo>` em qualquer byte; `tests/commercial/test_first_fold_contract.mjs` consome isso e exige `tree_dirty===false` quando `surface:"source"`. Cura: `npm run measure:first-fold` em clone limpo (memória: Node 22, produtor contratado) e commit dos JSONs; merge por merge-commit, não squash.
- `data/bofu-dominance/frozen-specs/hashes.json` via `FORBIDDEN_RELATIVE_PATHS` (`scripts/bofu_dominance/frozen_specs/constants.py:66`) congela **`styles.css`, `styles-tokens.css`, `styles-tools.css`** (não home-10x). `tests/bofu_dominance/frozen_specs/test_frozen_specs.py::test_forbidden_paths_unchanged_list` exige `forbidden_drift()=={}`; política `recapture_required` → `commit_reviewed_hash_recapture`; `__main__.py` recusa `--mutate`.
- `data/design/css-usage-baseline.json` → `audit_css_usage.py` pina `decoration_totals` (radius 137, shadow 67, gradient 51) e bytes por bundle, e falha em **alta**. `AUDITED_BUNDLES` = só `styles.css` + `entregas/styles.css`. **Armadilha**: mover decoração de `home-10x.css` (não auditada) para `styles.css` sobe o total contado e reprova, mesmo com o visitante vendo menos. Também `css_type_floor.public_css_paths` **não inclui `home-10x.css` nem os `<style>` inline** — o piso tipográfico nunca foi aplicado às duas camadas que mais divergiram.
- `FOCUS_CSS_FLOOR` (`test_design_gates.py:1281`) exige que `styles.css, styles-tokens.css, styles-tools.css, styles-offers.css, css/contracts.css, css/type-floor.css, assets/report-capture.css, assets/eight-offer-contract.css, entregas/styles.css` continuem **existindo**. Esvaziar é seguro; apagar reprova a descoberta.

**`scripts/site/test_design_gates.py` (strings/valores lidos de CSS):**

| Teste (linha) | Lê | Congela |
|---|---|---|
| `test_css_tokens_mirror_system` (81) | tokens + styles.css | presença de `--navy-950 --green-700 --ink --serif --mono section--tight section--loose`; `--text-micro:.8rem`, `--text-body-mobile:1rem`, `--navy-950:#031020`, `--green-700:#2d6f2d` |
| `test_prefers_reduced_motion_declared` (579) | styles.css | `prefers-reduced-motion`, `prefers-reduced-data`, literal `font-size:.875rem` |
| `test_operating_flow_has_sitewide_fallback` (588) | styles.css, styles-offers.css | string exata `.operating-flow{display:grid;gap:0;margin:0;padding:0;list-style:none}`, `#operating-system-title{scroll-margin-top:`; `.operating-flow` ausente de offers |
| `test_mobile_matrix_composition` (599) | styles.css, **home-10x.css** | `display:none` em styles; `.situation-list{`, `.situation-row{`, `@media (max-width:700px)`, `.situation-row{grid-template-columns:2rem minmax(0,1fr)`, `.situation-row .situation-action{grid-column:2` em home-10x — se `.situation-*` virar global, mudar o alvo do teste |
| `test_css_modules_are_concatenated_without_a_framework` (613) | styles.css, manifest | marcadores BEGIN/END; `assemble()==styles.css` (qualquer edição sem `build:css` reprova) |
| `test_shipped_css_respects_type_floor` (641) | `public_css_paths` | nenhum `font-size` < 12.8px em seletores críticos |
| `test_layout_contracts_ship_on_cascade` (649) | styles.css | `module:css/` ausente; corpo de cada módulo presente literalmente entre marcadores; needles `.hero-proof li`, `.table-wrap,.report-table-wrap{display:block;width:100%;max-width:100%;min-width:0;overflow-x:auto`, `.report-disclaimer .case-badge{flex:1 1 100%}`, `min-height:var(--touch-min)`, `overflow-wrap:anywhere` |
| `test_functional_type_floor_in_css` (673) | styles.css | 13 regex negativas (`.field label`, `.consent`, `.offer-label`, `.footer-links`, `.footer-links strong`, `.footer-bottom`, `.breadcrumbs ol`, `.profile-list li`, `.related-card span/small`, `.service-number`, `.deliverables-list span` não podem ter `.0–.86rem`) e 6 positivas exigindo literalmente `font-size:.875rem` em `.field label`, `.consent`, `.footer-links`, `.breadcrumbs ol`, `.profile-list li`, `.related-card span` — **trocar por `var(--text-small)` reprova** |
| `test_img_rules_declare_height_auto` (714) | styles.css | `img{…height:auto}` e `.article-cover img{…height:auto}` |
| `test_brand_logo_assets_fit_their_render_box` (954) | styles.css | regex `.brand img{width:Npx}` / `.brand{width:Npx}`; max ≤ 236 |
| `test_home_defers_below_fold_layout_work` (1111) | styles.css | seletor compactado `body[data-content-cluster="home"]main>section:not(.hero)` com `content-visibility:auto` e `contain-intrinsic-size:auto900px` |
| `test_pillar_evidence_contrast_on_navy` (1172) | styles.css | `.pillar-evidence .pillar-evidence-count/-note` com `color:#hex` ≥4.5:1 sobre `#071a31` |
| `test_offer_context_component_css` (1216) | styles.css | `.offer-context{`, `.offer-context-item{`, `.offer-contextdt{`, `.offer-contextdd{`, `repeat(3,minmax(0,1fr))`, `.offer-context dt{…font-size:.875rem`, `dd{…font-size:1rem`, `margin-inline-start:0`, `decimal-leading-zero`, `counter-reset:offer-ctx`, ausência de `repeat(2,` no `:has(…nth-child(4))` |
| focus-ring (1300-1490) | todas as folhas descobertas | `:focus-visible{outline:2pxsolidtransparent;outline-offset:2px;box-shadow:var(--focus-ring)}` compactado; nenhuma regra de foco sob `html.js`/`.no-js` ou motion query; anel com contraste ≥3 sobre `--white --soft --green-100 --line --green-700…` |

**`scripts/site/test_visitor_redesign.py`:**

| Teste (linha) | Congela |
|---|---|
| `test_home_form_anchor_reveals_fields` (1055) | `#formulario-contato{…scroll-margin-top` em styles.css; regra mobile com `#formulario-contato{order:-1}` ou `.contact-form{order:-1}` |
| `test_css_visitor_tokens` (1237) | `--read-measure` em styles/tokens; `.situation-row` **em home-10x.css** e no HTML da home; `.problem-stages`, `.problem-stage-head`, `.featured-lead` em styles.css e em `conteudos/index.html`; `tool-workflow`, `tool-req-option`, `tool-sticky-bar`, `tool-situation`, `tool-result-*` em styles-tools.css |
| `test_non_interactive_containers_carry_no_click_affordance` (1279) | `.problem-stage-head` tem ≥1 regra em styles.css, sem `cursor:pointer` nem `:hover` |

**`tests/commercial/test_first_fold_contract.mjs`:** não lê CSS diretamente; lê `data/commercial/first-fold-measurements.v1.json` (hashes acima + caixas medidas de H1/prova/ação por rota em 1366×768 e 390×844) e `ROLE_SELECTORS` de `scripts/site/first_fold_rules.mjs:24` (`.hero-eyebrow`, `header .eyebrow`, `.eyebrow`; `h1`; `.hero-lead .content-lead .section-lead .deliverables-lead .report-lead .lead`; `.hero-proof-line .offer-proof-line .section-proof .authority-byline .hero-proof .deliverables-status …`; `a.button-primary button.button-primary a.button-lg form button[type=submit]`). Renomear qualquer dessas classes ou mudar a altura da dobra invalida as medições (`pass_<rota>_head_within_fold_at_1366x768`, `action_within_fold`).

**`scripts/site/test_home_first_fold.mjs`:** runtime em `/` (Puppeteer). Seletores `.hero-eyebrow`, `#hero-title`, `.hero-lead`, `.hero-proof`, `.hero-secondary`, `.hero .button-primary`, `.site-header .brand img` visíveis na dobra com folga 8px; `.button-primary` altura ≥44 e contraste ≥ mínimo; hierarquia `h1_px > lead_px >= eyebrow_px` e **`#hero-title` deve ser o maior texto da dobra** (varre `body *`) — bloqueia subir qualquer outro tamanho no hero sem subir o H1; destino do CTA (`/servicos/`) precisa de ≥4 `.corporate-service-row` e ≥4 `.service-output`.

**`scripts/site/test_ui_geometry.mjs`:** runtime. `heroCap 1.25` da viewport em 390×844 (hero ≤1055px); `#hero-title/.hero-lead/.hero .button-primary/.hero-proof` na 1ª viewport; sem `img/picture/figure/video/canvas` no hero; piso 14 px em `.hero-lead .hero-proof li .hero-proof-line .hero-micro .button .hero-secondary .macro-phase p/h3 .tension-stage p .offer-path p/strong .offer-label .fit-faq summary .contact-copy p .form-hint .form-note .field label .consent .desktop-nav a .header-cta` em `/`, `/diretoria-b2g/`, `/especialista/…`; `styles.css` contém `:focus-visible` e `prefers-reduced-motion`; `dl.hero-proof` proibido; `.offer-context dt/dd` tamanhos; 7 famílias × 4 viewports com `CRITICAL_TYPE_SELECTORS` (`.hero-proof li/strong .hero-micro .form-hint .form-note .field label .consent figcaption thead th .table-note .article-meta …`) ≥12.8 px e corpo (`body .hero-lead .section-lead .editorial-lead .editorial-body .content-lead .article-intro`) ≥16 px; sem overflow horizontal; `h1/.button-primary/.hero-lead/.hero-proof` dentro da largura.

**Outros acoplados a `home-10x.css`:** `scripts/site/test_font_fallback_metrics.mjs:25-42` lê `assets/home-10x.css` para o `@font-face` de fallback e ≥3 pilhas Archivo — ao mover o `@font-face` para identity.css, apontar o teste para `styles.css`. `scripts/site/affected_graph.mjs` mapeia folhas → suítes. `docs/performance/PERFORMANCE-BUDGET-BASELINE.json` `css_gzip_kb_max:80`, `css_raw_kb_max:250`, `font_files_max:1`, `font_total_gzip_kb_max:60`.

## Arquivos de apoio (scratchpad)

- `styles.rules.tsv` — 1.293 regras de `styles.css` com linha de origem (`expand.py`).
- `parse_home.py` — parse tinycss2 de `home-10x.css` (mostra as regras que sobrevivem).
- `html.list` — 268 páginas rastreadas usadas nas contagens.
