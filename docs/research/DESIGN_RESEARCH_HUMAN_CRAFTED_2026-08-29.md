# Pesquisa externa — direção visual humana e anti-genericidade

**Campanha:** `WEB_CFG_HUMAN_CRAFTED_DESIGN_BACKLOG_20260829`  
**Executado em:** 2026-08-30  
**Escopo deste artefato:** pesquisa externa e benchmark visual; não é auditoria do HTML/CSS atual, redesign, issue ou autorização de implementação.

## Conclusão executiva

A hipótese **Technical Editorial / Engineering Intelligence** é defensável, mas
somente como sistema de decisões ligado à tarefa e à evidência. Ela não deve ser
transformada em um pacote visual de “serif + mono + off-white + grid + números”.
Esse pacote já aparece repetidamente nas próprias skills que tentam combater a
estética genérica de IA e, portanto, pode produzir apenas uma nova média.

O achado mais consistente nas fontes não é um estilo. É um processo:

1. explicitar audiência, contexto, tarefa, percepção desejada e restrições antes
   de escolher tokens;
2. extrair e registrar o estado atual antes de prescrever;
3. separar qualidades transferíveis de elementos que não devem ser copiados;
4. comparar poucas direções em protótipos representativos;
5. implementar primeiro em uma superfície canário;
6. verificar com screenshots reproduzíveis, estados funcionais e viewports fixos;
7. rejeitar drift objetivo sem pretender automatizar gosto.

Para a CONFENGE, a direção externa mais promissora combina:

- **estrutura de relatório técnico:** keylines, colunas, hierarquia documental,
  legendas, fontes, notas, tabelas e artefatos;
- **clareza de consultoria executiva:** leitura inicial imediata, argumento
  escalonado, prova próxima à decisão e CTA dominante;
- **disciplina de instrumento:** ferramentas, formulários e resultados compactos,
  estáveis e operacionais, sem teatralidade de “mini-SaaS”;
- **expressão editorial seletiva:** composição e tipografia mais expressivas nas
  superfícies de leitura/exploração, sem contaminar controles e tarefas focadas;
- **especificidade brasileira e de obras públicas:** documentos, planilhas,
  cronogramas, mapas, medições, memórias de cálculo, matrizes, fontes públicas e
  nomenclatura real, nunca “technical-looking decoration”.

## Método e limite de evidência

Foram lidos arquivos oficiais dos repositórios pedidos em snapshots identificados
por commit, além de páginas oficiais dos sistemas e organizações incluídos no
benchmark. Observações sobre composição de websites estão marcadas como
**inferência visual**: são leitura crítica do que a superfície comunica, não
resultado de teste com usuários. Nenhuma skill foi instalada e nenhum arquivo de
terceiros foi copiado para este repositório.

As fontes de skills são inputs de processo. Seus presets estéticos não são
autoridade de marca, pesquisa de conversão nem evidência de percepção humana.

## Fontes de skills examinadas

| Fonte | Snapshot lido | Contribuição útil | Limite material |
|---|---|---|---|
| [Yu-369/VibeCurb — README](https://github.com/Yu-369/VibeCurb/blob/c324ba7695a3f23229cfe9068e4cbab98a3c38f3/README.md) e [visual-redesign](https://github.com/Yu-369/VibeCurb/blob/c324ba7695a3f23229cfe9068e4cbab98a3c38f3/skills/visual-redesign/SKILL.md) | `c324ba7`, 2026-08-05 | Design Read, extração em camadas, gates bloqueantes, diff, risco funcional e rollback | A skill converte preferências próprias em supostas verdades universais de design premium |
| [am-will/codex-skills — frontend-design](https://github.com/am-will/codex-skills/blob/9f954c3b63fda0d1875252009c196bf15072c1ca/skills/frontend-design/SKILL.md) | `9f954c3`, 2026-07-14 | propósito, tom, restrições, diferenciação, coerência e complexidade proporcional | favorece “bold/unexpected”, motion e atmosfera mesmo quando confiança pede contenção |
| [huyhoangnhh98/anti-ai-design](https://github.com/huyhoangnhh98/anti-ai-design/blob/87e3892159613ddadc4278ea055ef0797e6b502e/SKILL.md), [radius choreography](https://github.com/huyhoangnhh98/anti-ai-design/blob/87e3892159613ddadc4278ea055ef0797e6b502e/references/radius-choreography.md) e [motion choreography](https://github.com/huyhoangnhh98/anti-ai-design/blob/87e3892159613ddadc4278ea055ef0797e6b502e/references/motion-choreography.md) | `87e3892`, 2026-05-06 | contratos explícitos, token freeze, radius por papel, motion por finalidade, auditoria cross-screen | contém exigências contraditórias que recriam glow, efeitos “premium”, display font e surprise elements |
| [bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills/blob/f631a09b4fcc0166f2e2c1a8c81906ef680c57e8/README.md) e previews oficiais [Editorial](https://www.typeui.sh/design-skills/editorial), [Minimal](https://www.typeui.sh/design-skills/minimal), [Professional](https://www.typeui.sh/design-skills/professional) | `f631a09`, consultado em 2026-08-30 | tokens semânticos, estados explícitos, ritmo e acessibilidade testável | o catálogo empacota identidades completas; escolher um slug não constitui direção de arte |
| [nexu-io/open-design — Reference Design Contract](https://github.com/nexu-io/open-design/blob/df84ae5b9ebfb4d3cee43ed3037667503bcafe36/skills/reference-design-contract/SKILL.md), [Minimalist](https://github.com/nexu-io/open-design/blob/df84ae5b9ebfb4d3cee43ed3037667503bcafe36/skills/minimalist-skill/SKILL.md) e [Research Decision Room](https://github.com/nexu-io/open-design/blob/df84ae5b9ebfb4d3cee43ed3037667503bcafe36/skills/research-decision-room/SKILL.md) | `df84ae5`, 2026-08-29 | separar `Keep / Change / Do not copy`, rastrear observado/informado/inferido, manter evidência e decisão juntas | templates “minimal/editorial” também codificam bento, fades, ambient gradient e faux-OS como defaults |
| [IBM Carbon — 2x Grid](https://carbondesignsystem.com/elements/2x-grid/overview/), [typography strategies](https://carbondesignsystem.com/elements/typography/style-strategies/) e [data table](https://carbondesignsystem.com/components/data-table/usage/) | páginas oficiais atualizadas em agosto de 2026 | grid/keylines, tipografia produtiva versus expressiva, densidade e tratamento operacional de dados | é linguagem IBM; princípios são transferíveis, identidade e componentes não |
| [GOV.UK — layout](https://design-system.service.gov.uk/styles/layout/), [type scale](https://design-system.service.gov.uk/styles/type-scale/) e [table](https://design-system.service.gov.uk/components/table/) | páginas oficiais consultadas em 2026-08-30 | small-screen first, medida de leitura, escala testada, comparação sem decoração | é identidade pública britânica; não deve ser mimetizada pela CONFENGE |

## Leitura crítica das skills anti-genericidade

### VibeCurb: preservar o pipeline, não a estética embutida

O VibeCurb organiza o trabalho em Design Read, quality gate, build, visual diff e
drift rejection. A skill `visual-redesign` ainda classifica o risco funcional,
extrai o “antes” em sete camadas — tokens, tipografia, espaço, cor, componentes,
atmosfera e movimento — e bloqueia avanço quando a evidência de uma fase está
incompleta. Essa lógica é adequada para um backlog implementável porque torna o
diagnóstico reproduzível e preserva rollback.

O mesmo arquivo, entretanto, exige ou favorece display fonts, warmth, grain,
frosted navigation, hover lift, shadow expansion, scroll reveal e espaçamento
sempre maior. Também trata “Awwwards-tier” como qualidade geral. Isso é
incompatível com a missão desta campanha: vários desses elementos são justamente
os sinais a reduzir e um comprador B2B cético não precisa de espetáculo.

**Extrair:** baseline antes da prescrição; inventário por camada; risco por
superfície; gates bloqueantes; screenshots nos mesmos viewports; funcionalidade
antes da estética; mudança reversível.

**Rejeitar:** qualquer check que declare um font-family, temperatura de cor,
grain, blur, hover lift, animação de entrada ou radius como melhoria universal.

### am-will/frontend-design: intenção é melhor que intensidade

A contribuição forte é a sequência `purpose → tone → constraints →
differentiation` e a tese de que minimalismo refinado exige tanta precisão
quanto maximalismo. Para a CONFENGE, “bold direction” deve significar uma tese
visual nítida, não necessariamente composição ruidosa.

A contribuição fraca é a prescrição de escolhas “unexpected”, assimetria,
overlap, diagonal flow, meshes, textures, dramatic shadows e motion de impacto.
Essas técnicas podem ser válidas em outros contextos, mas não são evidência de
autoria. Aplicadas mecanicamente, viram exatamente a estética gerada por prompt.

**Extrair:** a página deve ter ponto de vista coerente e uma decisão memorável
derivada do conteúdo. **Rejeitar:** novidade formal como requisito e listas
categóricas de fontes “genéricas” sem teste de marca, idioma, licença e leitura.

### anti-ai-design: boa governança, prescrições internamente contraditórias

Os melhores trechos são específicos e funcionais:

- escolher plataformas e contexto explicitamente;
- congelar tokens depois de uma primeira tela aprovada;
- verificar consistência após regeneração parcial;
- usar radius por papel e hierarquia, não o mesmo valor em tudo;
- permitir motion somente para feedback, orientação, mudança de estado ou
  continuidade espacial;
- impedir `transition: all`;
- manter formulários, resultados e painéis em fluxo normal estável;
- tratar loading, empty, error e success como estados reais;
- usar uma única família de ícones e peso coerente.

Mas o contrato também exige três ou mais matizes, display font, gradiente sutil
em painéis, “premium effects” em containers, glow em botões e ao menos um
surprise element em marketing. Isso não elimina default; apenas troca o default.
Também afirma que toda imagem deve ter alt descritivo, ignorando que imagem
puramente decorativa deve ter `alt=""` para não gerar ruído assistivo. A saída de
um HTML separado por plataforma conflita com a necessidade de uma superfície
web responsiva canônica.

**Extrair:** semântica de radius/motion/estado e freeze com revalidação.
**Rejeitar:** quotas estéticas, scores de “gosto”, efeitos obrigatórios e
arquitetura de arquivos prescrita fora do runtime existente.

### awesome-design-skills/TypeUI: uma biblioteca de estilos não é uma marca

O catálogo mostra a utilidade de regras concretas: tokens semânticos, escala,
estados, responsive e critérios acessíveis. O preview Editorial, por exemplo,
prioriza hierarquia tipográfica, whitespace e interação explícita. Entretanto,
ele fixa Gelasio, Ubuntu Mono, paleta e 8pt; o preview Minimal fixa Open Sans +
Inter; e o slug Professional é, de fato, um sistema de varejo amarelo/preto.

Isso demonstra por que a CONFENGE não deve “usar o estilo editorial” nem “usar
o estilo professional”. O nome da categoria não garante adequação. Importar o
pacote inteiro só produziria consistência com outra identidade genérica.

**Extrair:** tokens por papel, estados e critérios verificáveis. **Rejeitar:**
fontes, paleta, componentes e estética pré-empacotada.

### Open Design: o contrato de referência é mais valioso que o preset minimal

O `Reference Design Contract` introduz uma separação útil para cada referência:

- **Keep:** qualidades transferíveis como densidade, composição, ritmo,
  materialidade e atitude de movimento;
- **Change:** assunto, copy, marcas, layout literal e adaptação ao job;
- **Do not copy:** logos, claims, preços, UI proprietária e assets protegidos.

Ele também pede confiança por evidência (`observed`, `provided`, `inferred`) e um
quality gate antes do handoff. O `Research Decision Room` complementa essa ideia
ao manter limitações, tensões e decisão reversível visíveis junto da evidência.

Já o preset `Minimalist` exige bento, pastéis, 1px border, fades em scroll,
ambient gradient, mock de janela macOS e macro-whitespace. Logo, até uma skill
que proclama “no decorative excess” acumula ornamentos padronizados.

**Extrair:** contrato de referência rastreável e decisão reversível. **Rejeitar:**
template completo, metáfora de sistema operacional e listas de efeitos.

## Princípios transferíveis para a CONFENGE

| Princípio | Evidência externa | Aplicação apropriada | Quality gate possível |
|---|---|---|---|
| Job antes do estilo | VibeCurb Design Read; Open Design contract | cada composição começa por visitante, decisão e evidência necessária | issue não passa para protótipo sem audience, context, job, desired perception e non-goals |
| Expressivo e produtivo por tarefa | Carbon typography strategies | conteúdo/comercial pode abrir espaço; ferramentas/formulários ficam compactos e operacionais | page archetype declara momento expressivo, produtivo ou híbrido e justifica transições |
| Grid como keylines, não coleção de cards | Carbon 2x Grid | alinhamentos persistentes entre títulos, fontes, tabelas, artefatos e CTA | screenshots mostram keylines; exceções de grid têm função de hierarquia |
| Escala tipográfica por papel | Carbon e GOV.UK type scales | display, leitura, interface, número e metadado são papéis, não “fonte da moda” | specimen PT-BR cobre headings, parágrafos, tabelas, moeda, percentuais, bold/italic e mobile |
| Medida de leitura controlada | GOV.UK layout limita linhas longas; Carbon separa leitura de tarefa | artigos e guias não esticam pelo container; dados usam largura necessária | corpo longo permanece em medida definida e tabelas não são espremidas para imitá-lo |
| Estrutura antes de elevação | Radius choreography e crítica comum às skills | regra, contraste, coluna e whitespace resolvem agrupamento antes de shadow/card | cada surface, radius e shadow declara papel; decoração sem papel é removida |
| Motion explica relação | anti-ai motion choreography | feedback, navegação, estado e continuidade apenas | nenhum reveal/lift automático; reduced-motion; hover só em elemento interativo |
| Evidência domina a imagem | Open Design evidence model; Carbon content/data | documento, tabela, mapa, cronograma e fonte pública substituem visual “técnico” abstrato | visual tem purpose, source/provenance, freshness quando aplicável, license e alt correto |
| Estado e densidade fazem parte da arte | Carbon productive; anti-ai state completeness | ferramenta deve parecer instrumento mesmo em empty/error/loading/result | quatro estados relevantes avaliados nos viewports do contrato |
| Consistência sem clonagem | Carbon mistura momentos por região; Open Design contract | arquétipos compartilham tokens e linguagem, não a mesma sequência de seções | pelo menos três arquétipos provam família de marca sem template idêntico |
| Mobile é composição, não pilha | GOV.UK small-screen first; anti-ai platform rules | prioridade, ordem, tabela e prova são reeditadas para espaço estreito | 390px tem hierarquia deliberada, CTA alcançável e artefato legível, sem depender de hover |
| Diff e rollback são parte do design | VibeCurb | comparar mesmas superfícies e estados antes de ampliar | before/after fixos, canário, critérios funcionais e reversão documentada |

## Hipótese externa de linguagem: Technical Editorial, com duas marchas

O Carbon oferece uma distinção especialmente adequada ao problema. Em momentos
**expressivos**, o visitante aprende, explora, lê e navega; tipografia e layout
podem criar maior contraste editorial. Em momentos **produtivos**, o visitante
preenche, calcula, filtra, compara ou decide; eficiência espacial e estabilidade
ganham prioridade. A própria documentação recomenda misturar os dois somente em
regiões discretas, mantendo consistência dentro de cada tarefa.

Traduzido para a CONFENGE:

| Superfície | Marcha dominante | Linguagem provável |
|---|---|---|
| Home e página comercial | expressiva com núcleo produtivo de conversão | tese forte, prova documental, composição editorial; CTA e formulário compactos e inequívocos |
| Artigo/guia técnico | expressiva | medida de leitura, índice, fontes, footnotes, figuras, tabelas e hierarquia de relatório |
| Entregável/produto | híbrida | decisão e resultado esperados em destaque; escopo, amostra de artefato, prova e contratação em estrutura comparável |
| Ferramenta/X-Ray/calculadora | produtiva | instrumento, variáveis, fórmula/limitação, estado, resultado, tabela e próximo passo |
| Inteligência pública | híbrida produtiva | fonte, freshness, metodologia, dado e incerteza antes de decoração |
| Trust/about | expressiva factual | método, autoria, revisão, responsabilidades e prova; sem retrato corporativo genérico |

Essa hipótese não decide serif, mono, paleta ou radius. Essas escolhas exigem
protótipos, licença, privacidade, performance, legibilidade PT-BR, numerais,
tabelas, mobile e comparação com o sistema atual.

## Quality gates derivados da pesquisa

### Gate 1 — Design Read antes de tokens

O artefato deve declarar:

- audiência e situação decisória;
- visitor job e terminal action;
- percepção desejada;
- o que não deve parecer;
- elementos de domínio disponíveis;
- requisitos de conversão, SEO, acessibilidade, runtime e performance;
- hipóteses versus fatos observados.

Sem isso, não se escolhe fonte, radius, palette, imagery ou motion.

### Gate 2 — Baseline contemporâneo reproduzível

Para cada superfície: URL, SHA, viewport, screenshot, estado, selectors relevantes,
font stack, containers, cards/panels, radii, shadows, gradients/glows, motion,
ícones e assets. O baseline distingue `KEEP | REDUCE | REPLACE | REMOVE`; não
declara automaticamente que um padrão conhecido é defeito.

### Gate 3 — Comparação de direções, não moodboard único

Antes de congelar tokens, 2–3 composições isoladas devem provar pelo menos três
jobs diferentes: uma superfície comercial, uma de leitura/evidência e uma
ferramenta/resultado. A comparação registra tradeoffs de compreensão em três
segundos, CTA, densidade, autoria, mobile, custo de asset, performance e
extensibilidade.

### Gate 4 — Counterfactual de especificidade

Remover logo/nome e trocar a copy por texto neutro. A estrutura restante precisa
conservar sinais funcionais de engenharia, contratos públicos e inteligência:
documento, matriz, fonte, medição, cronograma, anotação, tabela ou nomenclatura.
Se restarem somente hero, cards, ícones e CTA, registrar
`GENERIC_IDENTITY_RISK`.

### Gate 5 — Visual tem função e proveniência

Cada imagem, diagrama, gráfico, documento ou textura declara propósito. Assets
informativos exigem source/provenance/freshness quando aplicável, licença e alt
descritivo. Assets puramente decorativos exigem justificativa e `alt=""`.
Stock ou geração sem relação factual não substituem evidência.

### Gate 6 — Geometria e elevação sem inflação

Radius, border, shadow e surface são inventariados por papel. O gate reprova
novos valores arbitrários, mesma curvatura em todas as camadas, shadow sem estado
de elevação e container criado apenas para “cardificar” uma lista. Exceções são
permitidas com declaração de propósito.

### Gate 7 — Motion sem ritual moderno

Toda animação deve servir feedback, orientação, mudança de estado ou continuidade
espacial. Reprovar `transition: all`, reveal genérico replicado, lift em conteúdo
estático, loop decorativo competindo com o CTA e ausência de
`prefers-reduced-motion`.

### Gate 8 — Visual diff e integridade funcional

Comparar before/after nos mesmos viewports e estados. A tabela PASS/FAIL cobre:
composição, keylines, tipografia, cor, densidade, artefato/evidência, CTA, forms,
nav, motion, overflow, focus e states. SEO, semantics, captura, analytics, URL,
canonical, performance e JS-off suportado permanecem invariantes ou melhoram.

### Gate 9 — Revisão adversarial sem score fictício

Usar perguntas qualitativas rastreáveis: especificidade, necessidade do card,
função da imagem, decisão tipográfica, ritmo, reconhecimento sem logo e presença
de default de gerador. O gate registra respostas e divergências; não converte
“bom gosto” em nota numérica e não afirma percepção humana sem teste humano.

### Gate 10 — Ratchet objetivo, com exceções justificadas

O ratchet pode detectar novas famílias tipográficas, radius/shadow tokens,
gradients/glows, `transition: all`, reveals, geometrias duplicadas, card patterns,
archetype não declarado e asset sem purpose/provenance/license/alt. Ele não deve
proibir serif, gradient, radius ou animação em abstrato; exige declaração,
coerência e evidência.

## Benchmark visual externo

As observações abaixo são **inferências visuais** feitas nas superfícies oficiais
consultadas em 2026-08-30. O objetivo é identificar decisões, não recomendar
cópia de identidade.

| Grupo | Referência oficial | Decisões observáveis / inferência visual | Leitura transferível para a CONFENGE | Não copiar |
|---|---|---|---|---|
| Consultoria B2B | [McKinsey](https://www.mckinsey.com/) e [Our Insights](https://www.mckinsey.com/our-insights) | **Inferência visual:** home e hub operam como publicação: um assunto dominante, mistura de formatos, datas, autoria/editoria e hierarquia tipográfica em vez de uma grade única de serviços | tratar conhecimento técnico como produto editorial; variar peso por formato; usar metadado real como parte da composição | escala global, claims, estrutura do Quarterly, identidade preto/branco e assunto corrente |
| Consultoria B2B | [BCG](https://www.bcg.com/) e [Featured Insights](https://www.bcg.com/publications) | **Inferência visual:** alterna grande narrativa, client stories, coleções temáticas e feed com tipo/data; imagem e cor de marca mudam o ritmo entre blocos | criar campanhas/coleções com tese e prova, não apenas “cards de conteúdo”; aproximar insight de outcome | verde BCG, linguagem “applied AI”, campanhas e composição literal |
| Consultoria B2B | [Bain](https://www.bain.com/) | **Inferência visual:** a home liga entrada por problema a uma interação de duas perguntas; métricas aparecem vinculadas a client stories nomeadas, não como números soltos | organizar descoberta por situação/necessidade; prova quantitativa precisa permanecer colada ao caso e ao contexto | vermelho Bain, slogans, métricas, cases e questionário literal |
| Consultoria B2B | [Oliver Wyman](https://www.oliverwyman.com/) | **Inferência visual:** hero muito curto seguido de uma história principal e três perspectivas numeradas por tipo (`Analysis`, `Trends`, `Insight`); composição reduzida favorece seleção editorial | numeração só quando cria índice/taxonomia; menos itens com pesos distintos podem comunicar mais competência que uma grade extensa | laranja/branding, numeração ornamental e recortes fotográficos específicos |
| Engenharia / arquitetura / infraestrutura | [Arup](https://www.arup.com/) e [Projects](https://www.arup.com/projects/) | **Inferência visual:** fotografia de projeto real, nomes e contexto carregam a identidade; projetos, issues e o *Arup Journal* formam uma linguagem contínua entre prática e publicação técnica | usar obra, documento e problema técnico como imagem; aproximar portfólio, método e publicação sem transformar tudo em UI | escala fotográfica, projetos, Journal e linguagem institucional da Arup |
| Engenharia / arquitetura / infraestrutura | [AECOM Projects](https://aecom.com/projects/) e [AECOM Insights](https://insights.aecom.com/) | **Inferência visual:** catálogo filtrável parte de mercados e projetos reais; o hub editorial usa coleções por tema e reportagens de infraestrutura, separando portfólio de pensamento | art direction pode nascer do tipo de obra e do artefato; taxonomia de mercado é navegação, não decoração | imagery, projetos, taxonomia e estética monumental da AECOM |
| Engenharia / arquitetura / infraestrutura | [WSP](https://www.wsp.com/) e [Insights](https://www.wsp.com/en-us/insights) | **Inferência visual:** combina números institucionais, temas de atuação e artigos com localização, assunto, formato e tempo de leitura | metadados técnicos ajudam scanning; estatística institucional deve ter definição e contexto; temas podem organizar descoberta | métricas corporativas, iconografia e estrutura de conglomerado global |
| Engenharia / arquitetura / infraestrutura | [Mott MacDonald](https://www.mottmac.com/) | **Inferência visual:** seis mercados numerados recebem texto substantivo; a navegação profunda separa markets, services, insights e reports, sustentada por fotografia do domínio | numeração pode funcionar como índice real; densidade e texto técnico podem superar tiles de benefício quando o comprador precisa delimitar competência | numeração, mega-menu, fotografia e arquitetura informacional literal |
| Editorial / institucional | [OECD Data](https://www.oecd.org/en/data.html) e [Publications](https://www.oecd.org/en/publications.html) | **Inferência visual:** busca e tabs por tipo (`Indicators`, `Dashboards`, `Insights`, `Methods`, `Datasets`) antecedem o feed; data, tipo, páginas e release dates são primeira classe | fonte, método, freshness e tipo de artefato devem ser parte visível da identidade de inteligência pública | amarelo/azul OECD, taxonomia e shell institucional |
| Editorial / institucional | [World Bank Research](https://www.worldbank.org/en/research) e [Open Data](https://data.worldbank.org/) | **Inferência visual:** separa featured research, papers, catálogos e filtros; documentos preservam data, autor, tipo, número e coleção; busca é central | desenhar proveniência e descoberta para um acervo, não uma vitrine de cards; metadado confiável é composição | marca, taxonomias, volume e interface legada do catálogo |
| Editorial / institucional | [Reuters Graphics](https://www.reuters.com/graphics/) | **Inferência visual:** cada narrativa visual tende a adotar a forma adequada ao assunto — mapa, timeline, scrollytelling, diagrama ou gráfico — com crédito e fontes, em vez de um dashboard ornamental repetido | gráfico/diagrama deve responder uma pergunta específica e citar fonte; art direction pode variar por conteúdo sob regras editoriais comuns | narrativa, datasets, ilustrações, newsroom style e interações específicas |
| Editorial / institucional | [Our World in Data](https://ourworldindata.org/) | **Inferência visual:** missão, escala do acervo, artigos, Data Insights e exploradores formam níveis editoriais distintos; as amostras de dados exibem pergunta, fonte e contexto, e a própria licença aparece publicamente | ligar cada visualização a uma pergunta; manter fonte, atualização, método, limitação e licença próximos ao dado; diferenciar insight curto, artigo e explorer | paleta, chart style, taxonomia global, datasets e narrativa específica |

### Síntese por dimensão

| Dimensão | Decisão recorrente que parece art-directed | Tradução prudente para a CONFENGE |
|---|---|---|
| Composição | um item lidera; os demais assumem pesos, larguras e formatos diferentes conforme importância | abandonar igualdade automática; declarar a tese, a prova e o próximo passo dominantes em cada página |
| Grid | colunas e keylines permanecem, mas a ocupação muda; grids iguais são reservados a itens realmente comparáveis | criar uma grade estrutural comum e permitir assimetria controlada por conteúdo, não “grid-breaking” ornamental |
| Hierarquia | tipo, largura, posição, imagem e metadado trabalham juntos; não depende apenas de H1 bold | definir papéis para tese, leitura, interface, número, legenda, fonte e nota |
| Evidência | casos, métricas, projeto, data, autor, tipo, fonte e método ficam próximos da afirmação | transformar proof/provenance em material de layout, sem chips de confiança soltos |
| Ritmo e densidade | grandes pausas editoriais alternam com índices, filtros, tabelas e feeds densos | densidade acompanha o job; ferramenta e comparação não herdam o whitespace da campanha |
| Imagem | fotografia e gráfico possuem assunto verificável; crops e sequências têm intenção | priorizar obra/infraestrutura e artefatos CONFENGE com licença, contexto e purpose; texto é preferível a stock fraco |
| Whitespace | espaço separa capítulos e estabelece dominância, não é aplicado uniformemente | usar whitespace para argumento e leitura, mantendo prova e CTA suficientemente próximos |
| Tabelas e dados | busca, filtros, tipo, data, unidade e fonte antecedem ou acompanham o dado | tratar tabelas/matrizes como mídia principal quando a decisão é comparar, com mobile e semântica próprios |
| Navegação | hubs extensos organizam por problema, setor, formato ou coleção; a estrutura editorial sustenta profundidade | alinhar navegação a visitor job e arquétipo, evitando reproduzir mega-menu de empresa global |
| Transições | não verificadas de forma consistente nesta coleta; markup e páginas oficiais não sustentam afirmar comportamento de motion | não importar motion do benchmark; validar separadamente em captura real e só conservar o que explica estado/relação |
| Art direction | a assinatura vem da seleção de assunto, taxonomia, crop, escala e sequência — não de uma lista de efeitos | derivar assinatura de engenharia, contratos públicos, cálculo, documento e fonte brasileira |

## O que parece decisão de direção de arte, não default de gerador

- Uma regra composicional que permanece reconhecível em páginas diferentes sem
  forçar a mesma seção ou o mesmo card.
- Tipografia que muda de marcha conforme leitura, dado, interface e evidência,
  em vez de apenas aumentar peso/tamanho de uma sans única.
- Imagem com assunto, enquadramento, sequência e relação editorial com o texto,
  não apenas ocupação do hero.
- Keylines, colunas, tabelas, captions, fontes e anotações que criam estrutura
  antes de surface, radius e shadow.
- Densidade variada de acordo com a tarefa: pausa na tese; compactação na
  comparação; abertura novamente na conclusão/CTA.
- Assimetria que hierarquiza uma informação específica, não assimetria usada
  como sinal abstrato de criatividade.
- Prova e metodologia tratadas como parte central da composição, não logos ou
  métricas soltos em chips.
- Movimento raro e ligado a estado, relação ou navegação.
- Mobile reeditado: ordem, escala e evidência mudam para preservar o job.

## Riscos de importar as referências

1. **Trocar o template SaaS pelo template editorial-AI.** Serif, mono, off-white,
   thin rules, números `01/02/03` e grid assimétrico também já são defaults.
2. **Confundir whitespace com premium.** Ferramentas, tabelas e escopos precisam
   de densidade; espaço demais pode esconder comparação e CTA.
3. **Confundir engenharia com ornamento CAD.** Coordenadas, crosshairs, blueprint
   e wireframes sem informação são fantasia técnica.
4. **Confundir consultoria premium com consultorias globais.** A CONFENGE precisa
   de obras públicas brasileiras, fontes locais, documentos e linguagem própria.
5. **Confundir consistência com clonagem de páginas.** Tokens podem ser comuns;
   estrutura deve seguir o job.
6. **Confundir originalidade com performance visual.** Parallax, reveal, glow e
   transição não demonstram competência técnica.
7. **Confundir gate com gosto automatizado.** Contagens e diffs detectam drift;
   julgamento perceptual continua exigindo revisão explícita e, quando alegada,
   teste humano real.

## Hipóteses para autores do backlog

Estas frentes são consequências possíveis da pesquisa externa e ainda precisam
ser confirmadas pela auditoria contemporânea da CONFENGE antes de virar issues:

1. constituição visual baseada em jobs, keylines, tipografia por papel, geometria,
   imagery, evidence e anti-patterns;
2. protótipo comparativo de tipografia PT-BR com numerais/tabelas e contrato de
   licenciamento/carregamento;
3. grid e ritmo editorial que substituam cardification onde hierarquia, regra,
   lista ou tabela resolvem melhor;
4. sistema de artefatos técnicos com purpose/provenance/freshness;
5. arquétipos comercial, editorial, entregável, ferramenta, inteligência e trust;
6. linguagem produtiva específica para formulários, matrizes, X-Ray e resultados;
7. canário em superfície de alta visibilidade antes de expansão;
8. screenshot matrix e ratchet anti-drift objetivo.

Nenhuma dessas hipóteses autoriza mudança de produção nesta campanha.
