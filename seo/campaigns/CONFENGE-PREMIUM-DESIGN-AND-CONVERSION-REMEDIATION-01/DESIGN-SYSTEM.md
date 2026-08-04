# CONFENGE Design System, Engenharia editorial premium

Fonte de verdade: `data/site/design-system.json`.

## Por que este sistema existe

A campanha de posicionamento (Diretoria B2G fracionada) acertou a tese comercial, mas a interface ainda parecia **template de consultoria**: seções iguais, grades de cards, bordas verdes, ícones genéricos e pouco contraste compositivo.

Este sistema obriga forma, conteúdo e interação a comunicarem **competência técnica, responsabilidade e alto valor econômico**, não “página bonita”.

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
| Green 700 | Decisão, proteção, ação primária, **sinal**, não decoração |
| Lime | Acento raro em superfície escura |
| Green-100 | **Restrito**, no máximo um bloco consecutivo por página |

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

## Arquétipos de seção

Cada seção da home deve declarar um arquétipo (`data-section-archetype`):

1. `hero_split`
2. `tension_sequence`
3. `model_radial`
4. `offer_dominant`
5. `journey_rail`
6. `compare_split`
7. `authority_editorial`
8. `trace_matrix`
9. `content_editorial`
10. `icp_contrast`
11. `faq_compact`
12. `cta_formal`

Gates automatizados falham se três seções consecutivas reutilizam o mesmo arquétipo de **grid de cards**, ou se a página tem mais de duas grades de cards.

## Quando usar card

**Permitido** se houver ação independente, comparação real ou unidade reutilizável com fronteira clara.

**Proibido** como estrutura padrão de lista de benefícios, jornada, modelo operacional ou prova.

Perguntas obrigatórias antes de criar um card:

1. Precisa de contenção?
2. Tem ação própria?
3. É comparação?
4. Será reutilizado?

Se não, composição editorial aberta (linhas, números de seção, colunas desiguais, trilhos, matrizes).

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
2. Dar peso visual à **afirmação dominante**, o resto é secundário.
3. Preferir artefatos de método (matriz, trilha, GO/REVIEW/NO-GO) a ícones.
4. Rodar `npm run test:design`, `test:visual-structure` e `test:copy` antes de merge.
5. Se a página “parece limpa demais”, falta contraste de superfície ou hierarquia, não adicione mais cards.

## Manutenção

- Tokens em CSS (`:root` em `styles.css`) devem espelhar este JSON.
- Gates em `scripts/site/test_design_gates.py` leem HTML real e este JSON.
- Ofertas: profundidade mínima e ritmo de seções distintos entre as quatro páginas.
