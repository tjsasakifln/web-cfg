# CONFENGE Design System — Engenharia editorial premium

Fonte de verdade: `data/site/design-system.json`.

## Por que este sistema existe

A campanha de posicionamento (Diretoria Fracionada para o Mercado Público) acertou a tese comercial, mas a interface ainda parecia **template de consultoria**: seções iguais, grades de cards, bordas verdes, ícones genéricos e pouco contraste compositivo.

Este sistema obriga forma, conteúdo e interação a comunicarem **competência técnica, responsabilidade e alto valor econômico** — não “página bonita”.

## Conceito

**Engenharia editorial premium** = precisão técnica + sobriedade institucional + tensão econômica + composição editorial contemporânea + materialidade de documentação.

Não é SaaS. Não é escritório de advocacia genérico. Não é landing de infoproduto. Não é dashboard de startup.

## Tokens

### Cor

| Token | Uso |
| --- | --- |
| Navy 950/900/800 | Um bloco escuro por página (contato) e a linha da vertical de obras públicas |
| Ink / text / muted | Hierarquia tipográfica diária |
| White / soft | Fundo editorial e respiro; soft para a superfície de prova e da vertical B2G |
| Green 700 | Sinal: ação primária, rótulo de categoria, "você passa a ter", total de uma conta |
| Lime | Acento raro sobre navy (índice, kicker, ícone) e a faixa de sobreposição num desenho |
| Green-100 | Restrito: linha destacada de tabela; nunca fundo de seção |
| `--rule` / `--rule-strong` | As duas réguas de 1 px (#dfe4e6 entre linhas; navy no topo de listas e no botão secundário). Substituem borda verde no topo, caixa cinza e sombra difusa |

### Tipografia

- **Uma família em todas as rotas: Archivo Var** (`assets/archivo-var-latin-bf6e041e.woff2`, SIL OFL 1.1, subconjunto latino pt-BR, eixos wght 100-900 e wdth 66-110). O `@font-face` vive em `css/identity.css` e chega a todas as rotas por `styles.css`. Até 2026-09-16 só a home carregava a fonte (`assets/home-10x.css`); as outras 260 rotas renderizavam em sans do sistema com H1 de até 80 px, e o visitante mudava de "site" ao clicar. Essa era a causa raiz de o conceito não virar percepção.
- **Três larguras no lugar de três famílias.** Títulos e botões em `--wide` (96%), rótulos/eyebrow/códigos em `--narrow` (78%), texto em 100%. `--serif` e `--mono` resolvem para a própria Archivo: serifa de sistema e monoespaçada saíram (eram o default de qualquer navegador, não identidade).
- **`font-display: optional` + preload em todas as rotas** (`scripts/site/font_preload.py --check`): a fonte pinta na primeira pintura quando o preload chegou (visitas rápidas e repetidas) e nunca troca tarde, então nenhum título desloca depois de pintar (o CI mediu CLS 0,088 com `swap` em `/acompanhamento-contratos-obras/`). **Fallback com métricas casadas** (`Archivo Fallback`, mais `Wide` e `Narrow` a partir da face Bold local, calibradas por peso com fontTools) mantém o layout idêntico na rara primeira visita que renderiza sem a fonte: `scripts/site/test_font_fallback_metrics.mjs` mede deriva zero do hero com a woff2 bloqueada.
- **Uma escala, em tokens, sem clamp local.** `--text-h1: clamp(2rem, 1.35rem + 2.2vw, 2.75rem)` (32 px em 390, 44 px em 1440), `--text-h2` 24-34 px, `--text-h3` 18-20 px, `--text-lead`, corpo 16 px móvel / 18 px desktop, `--text-small` 14 px, `--text-micro` 12,8 px. As 18 clamps locais de H1 de `styles.css` e as 11 dos blocos inline foram removidas; `h1`/`h2` só consomem os tokens. Largura de título em `rem`, não em `ch` (o `ch` muda com a fonte de reserva e quebrava linhas no swap).

### Espaço

Alternar `section--tight` / `section--default` / `section--loose`.  
Proibido: todas as seções com o mesmo padding vertical.

### Sombra e raio

Sem sombra difusa (`--shadow` é 0 1px 2px). Raio: 4 px (`--radius-sm`, amostras, cartões, tabelas), 8 px (`--radius-md`, botões, campos, painel de captura), 12 px só onde já existia contrato. Hierarquia por régua, peso tipográfico e contraste de superfície.

## Direção vigente (2026-09-16): engenharia em contexto, prova editada

Registro em `data/site/design-system.json#direction` e na campanha `docs/campaigns/2026-09-15-design-authority.md` (referências inspecionadas, três estudos de composição, painel de revisão e evidências). Regras de composição que saíram do estudo vencedor:

1. **Abertura** nomeia a atuação (eyebrow "Engenharia, Perícias e Inteligência Técnica"), a tese, o que se entrega e para que serve, dois caminhos (serviços por situação / descrever a situação) e a credencial; ao lado, **um desenho técnico demonstrativo legível** com legenda que explica a utilidade e o rótulo "Exemplo demonstrativo" visível. O desenho fica depois das ações no DOM, para não empurrar o CTA no celular.
2. **Situações** em lista regrada com número, rótulo de categoria, situação em h3, "você passa a ter" e um link por linha; a vertical de obras públicas é a linha escura. Nenhum cartão, nenhum botão por linha.
3. **Páginas de serviço**: breadcrumb, H1, frase de utilidade, lead, uma ação primária e a caixa **"Em 30 segundos"** (escopo, entrega, o que confirmamos antes do aceite) na coluna direita; **prova antes do método** (figura, conta refazível em `.calc`, tabela real em `.table-scroll`, faixa `.keys` com Cliente: exemplo demonstrativo / Revisão / Entregáveis / Responsável técnico); método em `.steps` ou `.phases`; um único bloco escuro de contato no fim.
4. **Um contato principal por página**, alternativas em texto; nada de chamadas repetidas.

## Componentes compartilhados (`css/components.css`)

| Classe | Unidade de conteúdo |
| --- | --- |
| `.hero-grid`, `.split`, `.split--even`, `.grid-2`, `.capture-grid` | Grades de abertura, duas colunas e captura |
| `.proof-figure` (+ `__sheet`, `figcaption`, `--pair`) e `.tag` | Desenho técnico como evidência, sempre rotulado |
| `.aside-note` | "Em 30 segundos", "Quem assina": uma caixa, sem sombra |
| `.list-ruled` (+ `__index`, `__kicker`, `__use`, `__action`, `li.is-dark`) | Situações e serviços em linhas regradas |
| `.steps`, `.phases` (+ `__when`) | Sequência numerada; antes / durante / entrega |
| `.keys` | Faixa de metadados da prova |
| `.table-scroll` + `.data-table` + `.table-hint`, `.calc` | Tabela real com rolagem própria; memória de cálculo |
| `.card`, `.panel`, `.dark-block`, `.section--soft` | Só onde há unidade de conteúdo real; um bloco escuro por página |
| `.button-primary`, `.button-secondary`, `.button-lg`, `.text-link` | Uma definição de botão (raio 8 px, sem sombra) |

Página que reinventa um destes com prefixo próprio (`qty-`, `coord-`, `rv-`...) está errada: migre para a classe global e apague o `<style>` inline no mesmo commit — ordem de cascata não vence especificidade, e o inline carregado depois vence tudo.

## Arquitetura da home (máx. 7 blocos)

Excluindo header/footer, a home pública tem hoje **seis** seções narrativas (gate: 5 a 8, ≥5 arquétipos distintos):

1. `hero_split` — eyebrow, tese, entrega ligada a um uso, dois caminhos, credencial e o desenho demonstrativo com legenda
2. `journey_paths` — sete situações em lista regrada (rótulo de categoria, h3, "você passa a ter", um link), obras públicas em linha escura, e a linha "não se reconheceu?" com WhatsApp/e-mail
3. `authority_editorial` — quem assina, método aberto, amostra conferível; como o trabalho passa para cá
4. `market_context` — vertical de obras públicas com atalhos e números de mercado (PNCP), mais os três contratos de portes diferentes
5. `cta_formal` (próximo passo) — proposta por e-mail / WhatsApp, no topo do bloco escuro
6. `cta_formal` (contato) — formulário de captura revisado (hash congelado) e canais

**CTA primário:** um no hero (`Ver serviços por situação`), um no próximo passo (≤4 `button-primary` na página).  
**CTA secundário:** WhatsApp com contexto, peso visual menor; a bolha flutuante da home permanece como canal medido (`data-cta-position="float"`), sem competir com a dobra.

Gates falham se: >8 seções; três arquétipos idênticos consecutivos; >4 primários; linguagem interna; texto funcional &lt;14px; microcopy crítica &lt;12,8px; corpo &lt;16px; hero móvel acima de 1,4 viewport ou painel acima do CTA.

## Quando usar card

**Permitido** se houver ação independente, comparação real ou unidade reutilizável com fronteira clara.

**Proibido** como estrutura padrão de lista de benefícios, jornada, modelo operacional ou prova.

Perguntas obrigatórias antes de criar um card:

1. Precisa de contenção?
2. Tem ação própria?
3. É comparação?
4. Será reutilizado?

Se não — composição editorial aberta (linhas, números de seção, colunas desiguais, trilhos, matrizes).

## Padrões proibidos (gates)

Ver `forbidden_patterns` em `design-system.json`. Resumo operacional:

- >2 seções consecutivas de grid de cards
- ≥4 cards idênticos sem hierarquia
- Ícone em círculo/quadrado em toda seção
- Padding uniforme em cascata
- Eyebrow + H2 + parágrafo lateral em **todas** as seções
- Borda verde / fundo verde-claro / sombra em tudo
- CTA primário em excesso
- Linguagem de governança editorial no HTML público
- Dashboard SaaS fictício, stock genérico, métricas inventadas
- Mais de duas seções consecutivas com o mesmo arquétipo **ou com o mesmo esqueleto**
- Deslocamento vertical em `:hover` (hover lift) — ver [Movimento](#movimento)

## Arquétipos fora da home

O gate de arquétipo não é exclusivo da home. `archetype_gated_surfaces` em
`design-system.json` lista as superfícies em que **toda** seção narrativa no primeiro nível de
`<main>` precisa declarar `data-section-archetype`, com o valor presente em
`section_archetypes`.
Nessas páginas o gate reprova:

- seção narrativa sem arquétipo declarado;
- arquétipo que não existe no design system;
- mais de duas seções consecutivas com o mesmo arquétipo;
- mais de duas seções consecutivas com o mesmo **esqueleto** (tag e classes dos dois primeiros
  níveis), para que renomear o rótulo não sirva de escape;
- mais de quatro `button-primary`.

Rotular é declaração, não disfarce: se duas seções são estruturalmente iguais, a terceira precisa
mudar de composição, não de nome. Para incluir uma página nova, acrescente o caminho relativo a
`archetype_gated_surfaces`.

### Rollout escalonado da cobertura

`data/site/archetype-gate-rollout.json` é o inventário das 260 rotas públicas com `<main>`: o
estado de cada rota, o motivo medido de quem ainda não entra no gate, o plano por família, os
bloqueios de composição e as exceções datadas. Regras do rollout (issue #509):

1. uma família por PR, começando pela menor;
2. a anotação `data-section-archetype` entra na fonte que gera a página, nunca no artefato;
3. o caminho entra em `archetype_gated_surfaces` no mesmo PR da anotação;
4. o que não couber no ciclo vira exceção route-exact, datada, com dono, motivo e `expires_at`
   — nunca um glob, nunca um diretório.

A maior cohorte fora do gate hoje não é falta de anotação: nas rotas com
`<div class="container article-layout">` o corpo editorial é neto de `<main>`, então o scanner
enxerga um único bloco narrativo e a rota reprova por contagem antes de qualquer arquétipo.
Resolver isso é decisão de composição, registrada como bloqueio no arquivo de rollout.

## Copy pública

O comprador não vê processo editorial. Remover do HTML público: “Arquitetura de ofertas”, “Sem cases fabricados”, “owners”, “red team” sem tradução, “post-mortem”, “pipeline editorial”, etc.

Microcopy preferida:

| Evitar | Preferir |
| --- | --- |
| owners | responsáveis |
| red team | revisão crítica independente |
| post-mortem | análise posterior do resultado |
| pipeline qualificado (solto) | oportunidades priorizadas com critérios |

## jobTitle

Proibido: `Engenheiro Civil e Diretoria Fracionada para o Mercado Público`.  
Permitido: `Engenheiro Civil e consultor B2G` ou `Engenheiro Civil e diretor da CONFENGE`.

## Movimento

Entrada sutil, foco de etapa, revelação de linha. Sem parallax exagerado, contadores falsos ou animação contínua. Sempre `prefers-reduced-motion`.

### Sem hover lift (regra, não convenção)

Nenhum elemento se desloca na vertical sob o ponteiro. `hover` não é evento de
elevação: é mudança de estado. O feedback vem de cor, borda, sublinhado ou
sombra — nunca de `translateY`, `translate3d`, `margin` negativa ou `top`
deslocado em `:hover`.

- Padrão proibido: `hover_lift_translate_on_pointer` em `forbidden_patterns`.
- Deslocamento **horizontal** curto de uma seta que aponta para o destino
  (`.text-link:hover .icon`, `.contact-channels>a:hover`) continua permitido:
  é direção, não elevação. Segue neutralizado em `prefers-reduced-motion`.
- O elemento de contato (`.whatsapp-float`) mantém affordance de hover por
  fundo e borda, foco visível pelo anel global, e alvo de 56 px.

**Como o gate decide.** Regex em `styles.css` não serve: o arquivo já carregou
lifts que uma declaração posterior cancelava (o regex reprovaria regras que o
visitante nunca viu) e carregou um lift cujo `transform:none` só existia dentro
de `@media (prefers-reduced-motion:reduce)` (o regex aprovaria). A regra é
medida no render, em `hoverLiftFindings` de
`scripts/site/rendered_layout_truth.mjs`: `page.hover()` e diff de
`getBoundingClientRect()` em espaço de documento, emitindo
`hover_lift <seletor> <dy>px`. Roda em `npm run test:ui`, com fixture negativa
`scripts/site/fixtures/truthful_gates/hover-lift.html` provando que morde.

## Como não voltar ao genérico

1. Antes de copiar uma seção, escolher um **arquétipo diferente** do anterior.
2. Dar peso visual à **afirmação dominante** — o resto é secundário.
3. Preferir artefatos de método (matriz, trilha, GO/REVIEW/NO-GO) a ícones.
4. Rodar `npm run test:design`, `test:visual-structure` e `test:copy` antes de merge.
5. Se a página “parece limpa demais”, falta contraste de superfície ou hierarquia — não adicione mais cards.

## Manutenção

- Cor, raio, sombra, escala tipográfica, ritmo de seção e tokens de leitura (`--page-max`, `--read-measure`, `--text-body-*`, `--text-micro`, `--focus-ring`, `--section-*`, `--sans`/`--sans-wide`/`--sans-narrow`, `--wide`/`--narrow`, `--rule`/`--rule-strong`, `--page-gutter`) vivem em `styles-tokens.css` e espelham este JSON.
- Módulos concatenados por `build_css.py`, nesta ordem: `css/identity.css` (font-face, papéis base), `css/components.css` (primitivos), `css/contracts.css`, `css/type-floor.css`. `assets/home-10x.css` só compõe a home.
- Contratos de layout e o piso tipográfico (corpo ≥16px, microcopy crítica ≥12.8px) saem de `css/contracts.css` e `css/type-floor.css`, concatenados no fim de `styles.css` por `python3 scripts/site/build_css.py`.
- Escala tipográfica: `--text-display`, `--text-h1` e `--text-h2` são a fonte única. O `h1` e o `h2` globais consomem os tokens; não recriar um segundo par de clamps em media query.
- A escala de espaçamento é em rem. Ela esteve declarada em px no JSON e em rem no CSS, com o mesmo token valendo coisas diferentes conforme a folha carregada; o JSON passou a registrar a escala real.
- Gates em `scripts/site/test_design_gates.py` leem HTML/CSS reais e este JSON. A geometria renderizada (`npm run test:ui`) mede o `font-size` computado; um regex no CSS-fonte não basta.
- Ofertas: profundidade mínima e ritmo de seções distintos entre as quatro páginas.


## Gates are law (Story 1.3)

`npm run test:design` (includes visitor redesign) and `npm run test:copy` are **required quality bars** for any change to public HTML/CSS/copy. They run in CI via `site-ci` and must not be bypassed, skipped, or weakened without an ADR.

- Design/forbidden patterns: `scripts/site/test_design_gates.py`, `scripts/site/test_visitor_redesign.py`
- Copy: `scripts/site/test_copy_gates.py`
- Tokens single source: `styles-tokens.css` (imported by `styles.css` / `styles-tools.css`)

If a PR changes visitor UX and these are green, it still needs human visual review for aesthetic approval — gates prevent regression to card-soup/dashboard patterns; they do not replace brand owner sign-off.
