# DESIGN_AUDIT_ANTI_GENERIC_2026-08-29

**Campanha:** `WEB_CFG_HUMAN_CRAFTED_DESIGN_BACKLOG_20260829`  
**Auditoria live:** 2026-08-30, America/Sao_Paulo  
**Baseline Git contemporâneo:** `origin/main@b4cafc4fe0a005c3769a7b6acde882ff1f9d65d8`  
**Produção:** `build-info.commit=7500d7bdeb325f9f72e38b72e7fd6bb6db29f680`, artifact `5fb93787b0fde6e280e9ceb4d915ca0b48ccddbc364701b1dd499ce216d821bc`  
**Reconciliação:** o intervalo `7500d7b…b4cafc4` contém somente o quality gate mesclado pelo PR #483; nenhum HTML, CSS, JS ou asset público mudou, portanto as capturas live e contagens visuais permanecem aplicáveis.  
**Escopo:** auditoria, direção e backlog; nenhum HTML/CSS/JS/artefato público foi alterado.

## Método

- `git fetch --all --prune` antes da leitura;
- comparação de `origin/main`, produção, issues abertas e PRs recentes;
- leitura de `docs/DESIGN-SYSTEM.md`, `docs/UIUX-DECISIONS.md`, `data/site/design-system.json`, `styles-tokens.css` e folhas públicas;
- captura headless live de nove rotas em 390×844 e 1440×1000, full-page, total de 18 screenshots;
- inspeção de DOM e estilo computado em desktop;
- auditoria separada de header/nav e footer, totalizando 10 superfícies reportadas;
- leitura externa em fontes primárias, registrada em `docs/research/DESIGN_RESEARCH_HUMAN_CRAFTED_2026-08-29.md`;
- nenhum resultado é apresentado como percepção humana. Severidade é julgamento técnico/perceptual do auditor e deve ser validada por protótipo e, quando alegada, pesquisa humana real.

### Rotas live capturadas

`/`, `/entregas/`, `/reequilibrio-obras-publicas/`, `/conteudos/documentos-reequilibrio-obra-publica/`, `/ferramentas/limite-acrescimos-supressoes/`, `/diagnostico-b2g-360/`, `/radar/nacional-obras-publicas/`, `/especialista/tiago-jun-sasaki/`, `/confianca/`.

As capturas contemporâneas ficaram fora do artefato público, em `/tmp/confenge-design-audit-20260830/`, conforme a restrição desta campanha. Exemplos de hash: home mobile `46970e156a67d88775f4fcab0f01dedc4062c342c1c4a0b0837eb89dc641e24e`; home desktop `01b712e71ab20c1356e35e2364ecd11a5d8d5a9890760cdd58b7b35670891ba9`; entregas mobile `38741525e0a77d05a150010446d62fb5cd11947d670717bd28fb82caaf407b5b`; entregas desktop `6377b6efaea44c8dc40c852cfb576e85680931de21f5675736beb12081dbe31b`; artigo mobile `6d96104061c46f09e6bb55f0454461362d58eaabf192b26a4eeb532505b7eff6`; ferramenta desktop `2c2c36dbcc2b7f06604dd9846773acdf742e9ddfb3d1883d179e5e08b0e7bdad`; inteligência desktop `18c4008906204945945067d0ff300f8755c2d09809f81bc15b9ecf9f39541efc`.

### Contagens de implementação, não veredictos

Em todas as folhas CSS de `origin/main`: 183 declarações `border-radius`, 90 `box-shadow`, 47 `linear-gradient`, 14 `radial-gradient`, 4 `backdrop-filter`, 12 `translateY`, 0 `transition: all`. `styles.css` concentra 122 radii, 73 shadows, 31 linear gradients, 11 radial gradients e 10 `translateY`.

Isso inclui CSS legado ou não computado na rota e, portanto, não equivale a 183 defeitos. No render live, elementos arredondados variaram de 7 a 58 por rota desktop; sombras, de 1 a 13; gradients, de 0 a 5.

Tipografia computada: home usa system sans em 333/359 elementos visíveis, mono em 24 e serif em 2; `/entregas/` usa system sans em 763/982 e mono em 219; money page, artigo, ferramenta e trust usam system sans em todos os elementos visíveis. A decisão atual é majoritariamente a pilha segura, com contraste por peso/tamanho/uppercase.

Somente `index.html` e `entregas/index.html` estão no `archetype_gated_surfaces`. Money pages, artigo, ferramenta, inteligência e trust usam arquétipos implícitos e compartilham amplamente `.content-hero`.

## Matriz de auditoria

| Surface | AI/template tell | Severity | Evidence | Keep/Reduce/Replace/Remove | Proposed principle |
|---|---|---:|---|---|---|
| Home | Hero clássico `eyebrow → H1 → lead → CTA → secondary CTA → proof` | HIGH | `/`; `.hero`, `.hero-actions`, `.hero-proof`; 390×844 e 1440×1000 | **REDUCE** | Preservar 3-second clarity e CTA, mas fazer artefato/prova dominar a composição e não seguir uma landing genérica |
| Home | Tipografia quase toda system sans; serif aparece em apenas duas linhas | HIGH | 333 sans / 24 mono / 2 serif no desktop | **REPLACE** | Testar papéis tipográficos PT-BR, não trocar por fonte “da moda” |
| Home | 10 eyebrows e quatro sequências numeradas; microcopy editorial pode virar ornamento | MEDIUM | `.eyebrow`, `.journey-num`, `.macro-phase` | **REDUCE** | Eyebrow e numeração somente quando criam índice, status ou relação |
| Home | Gradients/shadows/rounded CTA ainda geram “acabamento premium” | MEDIUM | 3 gradients, 5 shadows, 43 rounded no desktop; `.home-deliverables`, `.authority-section`, primary buttons | **REDUCE** | Keylines, contraste e hierarquia antes de glow/elevation |
| Home | Proposta, prova sintética rotulada, PNCP e retrato real | HIGH positive | H1, relatório demonstrativo, market context, autor | **KEEP / AMPLIFY** | Evidência real ou sintética claramente rotulada como matéria visual |
| Header/nav | Shell horizontal limpo e task-first, com touch target e CTA | HIGH positive | header live; PRs #445/#485; #183 | **KEEP** | Não mudar semântica antes do tree test #183; preservar CTA e 44 px |
| Header/nav | Rounded CTA/menu e transitions genéricas; CSS ainda contém blur legado | MEDIUM | `.button:hover{translateY(-2px)}`, `.site-header{backdrop-filter:blur(18px)}`; computed backdrop 0 após override | **REMOVE / REDUCE** | Estado e foco, sem hover lift; remover regra morta e declarar chrome documental |
| Entregas | Hero próprio com hierarquia forte, status e taxonomia 8/54 | HIGH positive | `/entregas/`; `.deliverables-hero`, `.deliverables-status`; PRs #484/#492 | **KEEP** | Página é índice comercial, não landing SaaS; preservar comparação, estado e preço |
| Entregas | Oito `.vitrine-item` com geometria quase idêntica e shadow | HIGH | 8 unidades, 13 sombras, 58 rounded; 9.823 px desktop / 12.494 px mobile | **REPLACE** | Tabela/índice/ritmo editorial para comparação; caixa só onde há unidade de ação real |
| Entregas | 148 elementos uppercase e 219 mono; status/badge saturados | HIGH | `.offer-state`, `.vitrine-item__facts dt`, capability labels | **REDUCE** | Mono/uppercase como metadado técnico escaneável, não textura visual constante |
| Entregas | Background gradient/status panel/shadow no hero | MEDIUM | `.deliverables-hero`, `.deliverables-status` | **REDUCE** | Um painel de autoridade pode existir, mas deve parecer documento/status, não “premium card” |
| Money page | `.content-hero` compartilhado, gradient, capa retangular, H1, lead e CTA | HIGH | `/reequilibrio-obras-publicas/`; 4 gradients, 6 shadows, 25 rounded | **REPLACE** | Cada money page abre com a decisão, risco e artefato técnico próprios, mantendo #327 |
| Money page | Capa que parece thumbnail/OG, não evidência de engenharia | HIGH | `.article-cover img` `/assets/clusters/reequilibrio-obras-publicas.jpg` | **REPLACE** | Documento, timeline, cálculo ou matriz com propósito/proveniência |
| Money page | 9 eyebrows e repetição de duas colunas/section-soft | MEDIUM | `.pillar-overview`, `.two-column-content`, `.section-soft` | **REDUCE** | Variar ritmo pelo argumento; assimetria controlada e keylines |
| Money page | Conteúdo direto, limites, base documental e CTA próximo | HIGH positive | `#resposta`, `#quando-nao-contratar`, `.content-cta` | **KEEP** | Sofisticação não pode afastar decisão, prova e conversão |
| Article | Content hero e shell de content marketing compartilhado | HIGH | artigo capturado; `.content-hero.article-hero`; 5 gradients | **REPLACE** | Arquétipo editorial com medida, índice, fonte, figura, nota e autor |
| Article | Sete `.criterion-card`, listas em caixas e callouts arredondados | HIGH | 9 card-class, 39 rounded, 6 shadows desktop | **REPLACE** | Sequência numerada aberta, regra, tabela ou diagrama quando contenção não é necessária |
| Article | Sources, plano de ação, fragilidades, FAQ e author box | HIGH positive | headings, official sources, author/provenance | **KEEP / AMPLIFY** | Metadado e prova fazem parte da composição, não ficam em rodapé cosmético |
| Tool | Fluxo em três etapas, premissas, unidade monetária, método e print/download | HIGH positive | `/ferramentas/limite-acrescimos-supressoes/`; 0 gradients, 1 shadow | **KEEP / AMPLIFY** | Ferramenta já se aproxima de instrumento técnico; usar como referência produtiva |
| Tool | Form shell ainda é um grande painel cinza arredondado | MEDIUM | `.tool-form.tool-workflow`; 15 rounded desktop | **REDUCE** | Keylines, field grouping, cálculo e resultado; radius só em controle/estado |
| Form / offer | Longa landing com 11 seções, 13 eyebrows e hero gradient | HIGH | `/diagnostico-b2g-360/`; `.offer-hero`, 3 gradients, 35 uppercase | **REPLACE** | Separar narrativa expressiva do instrumento de qualificação produtivo |
| Form / offer | Conversão, fit, próximos passos e limites explícitos | HIGH positive | CTA, fit, FAQ, commercial bridge; contratos #267/#327 | **KEEP** | Nenhuma art direction pode reduzir CTA, captura, compreensão ou mobile reachability |
| Public intelligence | Metodologia, tabela, source/freshness, limitações e download dominam | HIGH positive | `/radar/nacional-obras-publicas/`; 1 shadow, 1 gradient, 12 rounded | **KEEP / AMPLIFY** | Melhor linguagem específica atual; usar dados e provenance como identidade |
| Public intelligence | H1/site shell ainda idêntico a content hero e typesetting é web genérico | MEDIUM | `.content-hero.container`; 245/253 elementos system sans | **REPLACE** | Publicação/dataset com título, versão, status, unidade, fonte e leitura em grid próprio |
| Trust / about | Retrato real e credenciais verificáveis | HIGH positive | `/especialista/tiago-jun-sasaki/`; imagem real | **KEEP / AMPLIFY** | Autoria factual e responsabilidade técnica, não retrato corporativo genérico |
| Trust / about | 6–7 related cards e hero gradient voltam ao template | HIGH | `.related-card`; 7 card-class, 2 gradients, 4 shadows | **REPLACE** | Trajetória, método, responsabilidades, fontes e limites em composição editorial factual |
| Footer | Contatos, CNPJ, políticas e links de confiança completos | HIGH positive | footer sitewide | **KEEP** | Trust/legal e navegação permanecem visíveis e acessíveis |
| Footer | Megafooter navy de três colunas, muito alto e intercambiável | MEDIUM | `.site-footer`, `.footer-top`, `.footer-links`; repetido em todas as rotas | **REDUCE** | Footer como colofão técnico: autoria, versão, contato, políticas e índice essencial |
| Global | `system-ui` é a decisão dominante e H1/H2 são quase sempre bold sans com tracking negativo | HIGH | `styles-tokens.css`; estilos computados nas nove rotas | **REPLACE** | Provar tipografia por papel, licença, WOFF2/subset, números, tabelas e mobile |
| Global | Same `.content-hero` e skeleton de seção fora de home/entregas | HIGH | archetype gate cobre só 2 superfícies | **REPLACE** | Arquétipos declarados A–G, tokens comuns sem clonagem estrutural |
| Global | Hover lift e reveal-on-scroll genéricos | MEDIUM | `.button:hover{translateY(-2px)}`; `.js .reveal`; full-page capture deixa regiões invisíveis sem scroll | **REMOVE** | Motion só por feedback/relação/estado; captura deve provar JS-on/JS-off/reduced motion |
| Global | Iconografia outline em listas e links, sobretudo home/money/article | MEDIUM | 19 SVG home, 16 money, 18 artigo; `.pillar-docs .icon` | **REDUCE** | Símbolo somente quando informa ação/conceito; usar nomenclatura, tabela e artefato |
| Global | Site ainda é majoritariamente UI-only | HIGH | entregas/tool/intelligence usam apenas logos; home tem retrato, mas pouca imagem documental | **REPLACE** | Sistema de imagery/artefato com purpose, provenance, freshness, license e alt |

## Classificação objetiva dos tells

O contador abaixo representa **findings materiais da matriz**, não declarações CSS nem todos os usos encontrados. Ocorrências `KEEP` funcionais foram excluídas.

| Tell | Findings materiais |
|---|---:|
| typography | 5 |
| cardification | 7 |
| rounded geometry | 8 |
| shadows | 6 |
| gradients / glows | 7 |
| generic hero | 6 |
| repeated grids / skeletons | 5 |
| generic motion | 2 |
| generic iconography | 4 |
| generic visuals / UI-only | 7 |

## What already feels human/crafted

- O H1 da home possui uma tese econômica específica e o contraste serif parcial quebra o sans genérico.
- A separação honesta entre 8 ofertas publicadas e 54 capacidades é incomum e editorialmente responsável.
- O Radar Nacional já trata metodologia, fonte, status, limitação e download como conteúdo central.
- A ferramenta do art. 125 parece uma tarefa técnica: premissas, etapas, unidade, cálculo local, print/download e limites.
- A presença de preço, escopo, SLA, limites e exemplos sintéticos rotulados demonstra rigor comercial.
- O retrato é real; não há stock de trabalhador com tablet, handshake ou skyline.
- Fontes oficiais, política editorial, correções, IA e conflitos tornam a confiança auditável.
- As recentes PRs #445, #462, #468, #471, #484, #485 e #492 corrigiram tipografia mínima, primeira dobra, responsive e densidade; o backlog não deve reabrir esses defeitos já resolvidos.

## What feels statistically generic

- A pilha system sans domina quase toda a interface; hierarquia depende de tamanho, bold e tracking negativo.
- O mesmo `.content-hero` com gradient, radial accent, H1, lead, CTA e capa reaparece em money, content, offer, intelligence e trust.
- Eyebrow uppercase, mono labels, badges e numeração são usados mais vezes que sua função editorial exige.
- Content pages transformam checklist, critérios, erros, prova e next action em retângulos com border/radius.
- Button lift, shadow expansion e reveal repetem o ritual “site moderno”.
- O footer e várias CTA bands são visualmente intercambiáveis com consultorias/SaaS.
- Grande parte da sofisticação vem de gradient, dark panel, shadow, radius e grid, não de imagem/artefato específico.

## What feels uniquely CONFENGE

- A conexão entre edital, contrato, margem, caixa, medição e obra.
- O vocabulário de fato, cálculo, inferência, lacuna, decisão, responsável e revalidação.
- O catálogo taxativo com maturidade e fronteiras explícitas.
- A prova sintética separada de prova de cliente.
- PNCP e outras fontes públicas com data de corte e limitações.
- Memória de cálculo, planilha, cronologia, matriz, relatório e documento como saídas.
- Responsável técnico nomeado, atuação nos dois lados da mesa e limites profissionais explícitos.

## What currently has no visual identity

- Money pages compartilham uma capa/hero e não derivam forma do tipo de risco ou artefato.
- Artigos parecem templates de conteúdo apesar da substância técnica.
- Trust/about alterna retrato com related cards, sem uma linguagem de dossier/colofão profissional.
- Formulários de captura são visualmente próximos de formulários SaaS, ainda que o contrato de dados seja rigoroso.
- Header/footer funcionam, mas não criam uma assinatura documental reconhecível.
- Não existe sistema versionado de fotografia documental, fragmento de relatório, mapa, planilha, diagrama e provenance.

## Gap analysis

1. **Direção declarada, ainda não ratificada.** `DESIGN-SYSTEM.md` e JSON já dizem “engenharia editorial premium”, mas não registram comparação de 2–3 direções em três jobs antes de congelar tokens.
2. **Tipografia sem decisão de marca comprovada.** A pilha segura é racional para performance, porém domina inclusive tese, leitura longa, números e metadados.
3. **Contrato de tokens não eliminou legado.** A maior parte de radii/shadows/gradients vive em `styles.css`; o próprio PR #445 registra teste de espelhamento que não compara valores.
4. **Arquétipos declarados em apenas duas superfícies.** O restante herda templates implícitos.
5. **Identidade de domínio aparece tarde.** A primeira dobra de várias páginas poderia pertencer a outra consultoria após troca de texto/logo.
6. **Imagery sem sistema.** Há logos, retrato e capas, mas não um contrato de propósito/proveniência/licença/freshness.
7. **Motion e visual diff são parciais.** Gates de geometria são fortes, mas não há ratchet acumulativo contra novos defaults genéricos nem screenshot matrix com drift rejection.

## Direção recomendada do backlog

- Foundation: ratificar Visual Constitution, tipografia e geometria/surfaces.
- High visibility: home/chrome, entregas e money pages por canário.
- Depth: conteúdo/trust, inteligência pública, ferramentas/formulários e imagery/artefatos.
- Ratchet: screenshot matrix, visual diff e deteção objetiva de drift com exceções justificadas.

## Invariantes

Preservar conversão, leitura em três segundos, SEO, semântica, WCAG 2.2 AA, 44 px, responsive, JS-off suportado, performance/Core Web Vitals, Turnstile/capture, analytics sem PII, privacy, runtime, URLs/canonicals, conteúdo técnico, truth/proof contracts e rollback por SHA.

## Conclusão

O site contemporâneo já contém decisões humanas e um design system coerente no papel; não é “AI slop” indiferenciado. O defeito material é a distância entre a direção declarada e a linguagem computada fora de alguns canários: system sans quase universal, template de hero compartilhado, cardification editorial, acabamento por gradients/shadows/radii e pouca matéria visual do domínio. O backlog deve fechar essa distância por protótipos, canários e gates, não por um redesign monolítico.
