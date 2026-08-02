# CONFENGE Design System — Engenharia editorial premium

Fonte de verdade: `data/site/design-system.json`.

## Por que este sistema existe

A campanha de posicionamento (Diretoria B2G fracionada) acertou a tese comercial, mas a interface ainda parecia **template de consultoria**: seções iguais, grades de cards, bordas verdes, ícones genéricos e pouco contraste compositivo.

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
3. `offer_dominant` — Diretoria B2G + rotas situacionais
4. `journey_rail` — quatro macrofases + rastros (tabela desktop / cards mobile)
5. `authority_editorial` — credenciais verificáveis
6. `icp_contrast` — adequação + objeções (FAQ curto)
7. `cta_formal` — conversão (form)

**CTA primário:** `Diagnosticar operação B2G` (≤4 ocorrências `button-primary`).  
**CTA secundário:** `Enviar decisão crítica` (WhatsApp, peso visual menor).

Gates falham se: >7 seções; três arquétipos idênticos consecutivos; >4 primários; linguagem interna; texto funcional &lt;14px.

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

Proibido: `Engenheiro Civil e Diretoria B2G fracionada`.  
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

- Tokens em CSS (`:root` em `styles.css`) devem espelhar este JSON.
- Gates em `scripts/site/test_design_gates.py` leem HTML real e este JSON.
- Ofertas: profundidade mínima e ritmo de seções distintos entre as quatro páginas.
