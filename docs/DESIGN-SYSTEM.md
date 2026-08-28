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
| Navy 950/900/800 | Superfícies de autoridade, CTA final, painéis de método |
| Ink / text / muted | Hierarquia tipográfica diária |
| White / soft | Fundo editorial e respiro; soft ≠ verde-claro |
| Green 700 | Decisão, proteção, ação primária — **sinal**, não decoração |
| Lime | Acento raro em superfície escura |
| Green-100 | **Restrito** — no máximo um bloco consecutivo por página |

### Tipografia

- **Sans de sistema** para UI e títulos (performance + privacidade; sem FOIT de webfont pesada).
- **Serif discreta** (`.type-serif`) para uma afirmação estratégica por seção.
- **Mono** (`.type-mono`) para IDs, datas, colunas de matriz, códigos de etapa.

Não depender só de “Inter em vários tamanhos”.

### Espaço

Alternar `section--tight` / `section--default` / `section--loose`.  
Proibido: todas as seções com o mesmo padding vertical.

### Sombra e raio

Sombra e radius generosos são exceção. Painéis editoriais preferem linha, peso tipográfico e contraste de superfície.

## Arquitetura da home (máx. 7 blocos)

Excluindo header/footer, a home pública deve ter **no máximo sete** seções narrativas:

1. `hero_split` — tese, um CTA primário, prova, visual estrutural (não dashboard)
2. `tension_sequence` — três momentos de erosão de margem
3. `offer_dominant` — Diretoria Fracionada + rotas situacionais
4. `journey_rail` — quatro macrofases + rastros (tabela desktop / cards mobile)
5. `authority_editorial` — credenciais verificáveis
6. `icp_contrast` — adequação + objeções (FAQ curto)
7. `cta_formal` — conversão (form)

**CTA primário:** `Analisar meu caso` (≤4 ocorrências `button-primary`).  
**CTA secundário:** WhatsApp com contexto, peso visual menor.

Gates falham se: >7 seções; três arquétipos idênticos consecutivos; >4 primários; linguagem interna; texto funcional &lt;14px; microcopy crítica &lt;12,8px; corpo &lt;16px.

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

## Como não voltar ao genérico

1. Antes de copiar uma seção, escolher um **arquétipo diferente** do anterior.
2. Dar peso visual à **afirmação dominante** — o resto é secundário.
3. Preferir artefatos de método (matriz, trilha, GO/REVIEW/NO-GO) a ícones.
4. Rodar `npm run test:design`, `test:visual-structure` e `test:copy` antes de merge.
5. Se a página “parece limpa demais”, falta contraste de superfície ou hierarquia — não adicione mais cards.

## Manutenção

- Cor, raio, sombra, escala tipográfica, ritmo de seção e tokens de leitura (`--page-max`, `--read-measure`, `--text-body-*`, `--text-micro`, `--focus-ring`, `--section-*`, famílias) vivem em `styles-tokens.css` e espelham este JSON.
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
