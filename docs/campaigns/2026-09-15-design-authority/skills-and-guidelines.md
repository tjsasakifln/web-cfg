# Inventário de skills e diretrizes para o redesign CONFENGE

Data da consulta: 2026-09-15. Nada foi instalado. Fontes brutas salvas em `raw/` ao lado deste arquivo.

## 0. Proveniência

| Fonte | URL | Versão / commit visto | Licença | Observação |
|---|---|---|---|---|
| frontend-design (Anthropic, plugin oficial) | `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md` | install hash `b5439c41ae98` (installed_plugins.json, lastUpdated 2026-09-16T02:08Z UTC = 2026-09-15 23:08 local UTC-3); marketplace `anthropics/claude-plugins-official` | Apache 2.0 (LICENSE e LICENSE.txt) | Já disponível via `Skill frontend-design:frontend-design`. Cópia do marketplace idêntica à do cache instalado (diff vazio). |
| Impeccable (Paul Bakaus) | https://github.com/pbakaus/impeccable | último commit main `0a4e72a` (2026-09-15T00:46Z); `package.json` 4.1.0 e `SKILL.md` 4.3.1 (divergem no mesmo main; registrar ambos) | Apache 2.0 | 1 skill, 24 comandos, 61 regras determinísticas. Instalação NÃO é só texto: ver 1.1. |
| Vercel Web Interface Guidelines | https://github.com/vercel-labs/web-interface-guidelines (AGENTS.md, README.md, command.md) | último commit `e3d624b` (2026-08-18) | MIT (Vercel Labs, 2025) | AGENTS.md é a forma MUST/SHOULD/NEVER; README é a prosa; command.md é o prompt de revisão `file:line`. |
| Vercel agent-skills / web-design-guidelines | https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines | SKILL.md v1.0.0; último commit no diretório `ba46938` (2026-01-16) | Nenhuma declarada (LICENSE e LICENSE.md 404; API `license: null`) | Skill de 39 linhas: só faz WebFetch de `.../web-interface-guidelines/main/command.md` e aplica ao arquivo. Sem licença: usar como referência, não vendorizar. |

Skills locais nesta sessão: `~/.claude/skills` não existe; `~/.claude/plugins` tem `mattpocock-skills` 1.2.3 (commit 0ab1b63) e `frontend-design`. Skills carregadas na sessão (31): mattpocock-skills: diagnosing-bugs, tdd, prototype, research, domain-modeling, codebase-design, code-review, resolving-merge-conflicts, wizard, grilling, writing-for-agents; frontend-design:frontend-design; built-in: design, dataviz, artifact-design, artifact-diagramming, artifact-capabilities, update-config, keybindings-help, code-review, simplify, fewer-permission-prompts, loop, schedule, claude-api, workflow-authoring, run, init, security-review. Ferramentas de navegador: Playwright MCP (screenshot, snapshot, resize, evaluate) disponível para inspeção renderizada. Skills built-in relevantes ao redesign: `frontend-design:frontend-design`, `artifact-design`, `design` (canvas), `dataviz`, `mattpocock-skills:prototype`, `code-review`, `simplify`, `run`. Nenhum outro skill de design instalado.

## 1. Impeccable: metodologia em etapas, aplicável sem instalar

### 1.1 Fato de instalação (input de decisão, não rodapé)
- `npx impeccable install` grava hook em `.claude/settings.local.json` que roda `.claude/skills/impeccable/scripts/impeccable hook`; o launcher baixa um binário auto-contido em `~/.impeccable/bin/` no primeiro uso.
- README: "In Claude Code, installed command hooks run independently of model-tool approval. The first edit or Stop event can therefore download and cache the engine even if the session denies the model's launcher command."
- Consequência: instalar Impeccable = aceitar binário remoto + hook em PostToolUse/Stop. Compatível com "NÃO instale nada" apenas como método textual (abaixo). O detector (`npx impeccable detect _site/`) também exige o binário.
- `craft` é alias **depreciado** ("adds nothing"); o fluxo real é `init` -> `shape` -> `new-work` -> `craft-floor` -> inspeção -> `polish`. Nomes confirmados: shape, typeset, layout, critique, distill, adapt, harden, polish, optimize existem; `craft` só como alias.

### 1.2 Modos de visitante (a chave para a sobriedade CONFENGE)
SKILL.md define 4 modos por superfície, não por produto: **Persuade** (visitante decide e age), **Operate** (completa tarefa), **Read** (entende algo), **Experience** (está dentro da obra). Regras citadas: "Operate + Read: stability, scanability, and measure come first. A single well-tuned family and fixed role scale are often right" (typeset) e "predictable structure, stable density, and navigable linearity are affordances" (layout). Estratégia de cor "Restrained (neutrals plus one accent)" é "the default when the visitor came to operate or read" (new-work §4).
Mapeamento CONFENGE: páginas de situação/serviço e contato = Persuade (abertura deve "make the offer intelligible and desirable, expose a clear action, and demonstrate something only this product can prove"); conteúdo de prova técnica, normas, laudos-exemplo, datasets = Read. Nenhuma rota é Experience. A sobriedade vem do modo, não de gosto.

### 1.3 Etapas e perguntas/critérios

**shape** (planejar sem código; produz brief confirmado)
- Rodada 1: para que serve a superfície e que problema resolve; quem chega, em que situação e estado de espírito; qual a única coisa que precisa entender/fazer e como é o sucesso; o que é unicamente verdadeiro aqui que um template não poderia afirmar.
- Rodada 2 (só se material): conteúdo/evidência/dados reais e faixas mín/típ/máx; estados que importam (vazio, erro, sucesso, overflow); fidelidade e escopo; o que não pode mudar; restrições de plataforma, performance, acessibilidade, localização.
- Brief: job e audiência (+modo); resultado e prova; direção escolhida; escopo e anti-metas; estados e faixas; interação e layout (intenção, não CSS); restrições e decisões abertas. Nunca pede valores CSS.
- CONFENGE: o brief já existe em parte: visitor job por família (`data/organic/public-family-registry.json`), matriz de intenção, constituição comercial. O shape deve consumi-los, não reinventar.

**craft (= new-work + craft-floor)**
- new-work §1: decidir o que já é verdade: *Redesign* preserva verdade do produto, conteúdo, função, restrições e compromissos de marca e substitui o mundo visual; *Established world* herda; *Incomplete brand* preserva ativos confirmados e expande. "Never split the difference into polish on the discarded look."
- new-work §3: nomear o mecanismo único do produto, a cena real da audiência, sua casa cultural; listar 7 sistemas visuais/artefatos/publicações que a audiência conhece de cor (inclui "notation, publications, identity programs, data graphics, and interfaces it reads daily"); a página que a categoria sempre entrega e seu oposto previsível são "the rut". Toda direção deve ser viável e verdadeira: "A candidate that fails on truth is replaced before the roll".
- new-work §4: escolher estratégia de cor antes das cores; claro/escuro decidido por cena física de uso, nunca por categoria; fontes "like objects from the subject's world"; lista de fontes-default a evitar sem razão específica (Fraunces, Playfair, Cormorant, Lora, Crimson, Newsreader, Syne, Space Grotesk, Space Mono, IBM Plex, Inter-as-display, DM Sans, DM Serif, Outfit, Plus Jakarta Sans, Instrument Sans).
- craft-floor (verificar no resultado renderizado, em uma rodada em lote desktop+mobile): contraste corpo >=4.5:1 e texto grande >=3:1, texto secundário em superfície colorida tingido, nunca cinza; sombras com offset e blur; espaçamento com mais espaço acima do título que abaixo; medida 65-75ch, display <=6rem, tracking >= -0.04em, headings balanceados; um único momento de motion; estados hover/disabled/loading/error/empty; superfícies do navegador tematizadas (seleção, caret, scrollbar, foco, underline offset, numerais tabulares); copy no idioma do produto; cobertura do brief.
- craft-floor "Refuse" (defaults, não bans, exceto o kicker): cards iguais ícone+título+texto como estrutura; hero-métrica; **kicker/eyebrow acima do título (ban absoluto)**; numeração 01/02/03 sem sequência real; modal sem necessidade; texto em gradiente; glass/blur decorativo; `border-left` colorida >1px em cards/alertas; sombra dura offset; sparklines/anéis como enfeite; monospace como fantasia de "técnico"; fonte de sistema como display; emoji/unicode como ícone; máscaras geométricas em vez de recorte real; claro/escuro por categoria.

**typeset**
- Perguntas com evidência (arquivo/seletor/valor computado): autoridade e adequação das famílias; hierarquia distinguível de relance (título, corpo, label, metadado, dado); escala de papéis deliberada e consistente entre telas; medida 45-75ch, entrelinha, tracking ajustados à face e idioma; stress (títulos longos, expansão de localização, zoom, containers estreitos, fallback); entrega (só pesos usados, fallback métrico, sem texto invisível/reflow).
- Aplicar: corpo >=1rem/16px; entrelinha inversa à medida; texto claro em fundo escuro compensado em entrelinha, tracking e peso; `tabular-nums` onde há números; preservar zoom e font settings do usuário; parágrafo por espaçamento OU recuo, não ambos.
- Verificar: papéis reconhecíveis sem ler; texto longo confortável em todas as larguras; carregamento sem reflow; zoom/contraste/foco usáveis.

**layout**
- Perguntas: teste do squint (primário, secundário, grupos ainda identificáveis?); agrupamento por proximidade ou containers compensando; ritmo (intervalos apertados e generosos) ou um valor repetido; topologia condiz com conteúdo (cards/colunas repetidos são mesmo equivalentes?); densidade por frequência de uso; adaptação em estreito/intermediário/largo/zoom/localizado e ordem DOM = ordem visual; extremos (texto longo, vazio, sticky, safe areas, alvos pequenos).
- Aplicar: escala de espaçamento documentada (base 4); `gap` para ritmo entre irmãos; profundidade só para estado/hierarquia; correções ópticas após ver renderizado. "Repetition should support recognition; break it only when content or priority changes."

**critique** (revisão, não correção)
- Veredito de especificidade primeiro: "Does the result feel authored for this product, or could an unrelated product use it unchanged?"
- 10 heurísticas de Nielsen 0-4 (7 e 10 podem ser n/a em Persuade); checklist de carga cognitiva (8 itens: foco único, chunking <=4, agrupamento, hierarquia, uma coisa por vez, <=4 opções por decisão, sem memória entre telas, revelação progressiva; 0-1 falhas = bom); regra de memória de trabalho (<=4 itens; nav <=5 itens de topo; 1 primário + 1-2 secundários); jornada emocional (peak-end, reasseguro em momentos de risco); personas (power user, first-timer, dependente de acessibilidade, stress tester, mobile distraído).
- Severidade P0 bloqueia / P1 maior / P2 menor / P3 polimento; "Would a user contact support about this?" => >=P1.
- Sem o binário: rodar só a avaliação A (design) + evidência de navegador (Playwright já disponível na sessão) e declarar "DEGRADED".

**distill**
- Fontes de complexidade: elementos demais, variação excessiva, tudo visível, ruído visual, hierarquia confusa, feature creep. Achar a essência: UM objetivo primário; o que é necessário vs. agradável; o que remover/esconder/combinar.
- Aplicar: 1-2 cores + neutros; uma família, 3-4 tamanhos, 2-3 pesos; remover bordas/sombras/fundos sem função; sem cards para layout básico; fluxo linear; UMA próxima ação; copy cortada pela metade duas vezes; sem título que repete a intro.
- NUNCA: remover função necessária, sacrificar acessibilidade, remover informação de decisão, eliminar hierarquia, simplificar demais domínio complexo.

**adapt** (web)
- Avaliar contexto de origem vs alvo (dispositivo, input, tela, conexão, contexto de uso). "Adaptation is rethinking the experience for the new context, not scaling pixels."
- Mobile: coluna única, alvos 44x44, sem dependência de hover, 16px mínimo, revelação progressiva. Breakpoints por conteúdo. NUNCA esconder função central no mobile, nem mudar arquitetura de informação entre contextos, nem esquecer paisagem.
- Verificar: 320px e telas grandes, orientações, Safari/Chrome/Firefox, touch/mouse/teclado, rede lenta; dizer o que produziu a evidência (viewport emulado, engine, dispositivo real).

**harden**
- Texto: `overflow-wrap`, `hyphens`, `min-width:0` em flex/grid, `clamp()`, 16px no mobile (Safari iOS força zoom em input <16px), zoom 200%.
- i18n, erros (nomear problema e recuperação), edge cases, validação de entrada, resiliência de acessibilidade (teclado total, skip link, live regions, alt, alto contraste sem depender só de cor), performance sob rede ruim.
- Verificar: nomes com 100+ caracteres, emoji, vazio, erros forçados, cliques repetidos no submit.

**polish** (refinamento, nunca redesign disfarçado)
- Classificar cada desvio: token faltando / implementação one-off / descompasso conceitual / defeito local; corrigir na causa.
- Triagem em ordem: tarefas bloqueadas e caminhos inacessíveis; estados faltando; drift de fluxo/hierarquia/responsivo/sistema; inconsistências visuais e de motion; limpeza de código.
- Verificar caminho completo com mouse, teclado e toque em mobile/intermediário/largo; console, CLS, latência, fontes; diff final sem churn. "Ask before changing claims."

**audit** (técnico, 5 dimensões 0-4): a11y (contraste, reduced-motion com alternativa intencional e não `0.01ms` global, ARIA, foco, semântica, alt, formulários); performance; theming (tokens, dark mode); responsivo (larguras fixas, alvos <44px, scroll horizontal, escala de texto); integridade de implementação.

**optimize**: medir antes/depois (LCP <2.5s, INP <200ms, CLS <0.1); CSS crítico inline, preload de recursos-chave, dimensões em imagens, `aspect-ratio`, nada injetado acima do conteúdo existente; testar em Android de entrada e 3G.

### 1.4 Sequência recomendada para o redesign CONFENGE (sem binário)
1. `shape` consumindo registry/matriz/constituição -> brief por família de rota com modo (Persuade|Read).
2. `new-work` §1-§4 manual: declarar "Redesign" ou "Incomplete brand"; 7 candidatos do mundo da engenharia/perícia (normas, memoriais, pranchas, laudos, ART, cadernos de encargos, gráficos de ensaio); estratégia de cor Restrained; fontes verificadas livres e auto-hospedadas (memória: só ativos gratuitos, verificar antes de citar).
3. Build com craft-floor como floor; uma rodada de screenshots desktop+mobile (Playwright); uma rodada de correções; parar.
4. `critique` degradado (avaliação A + evidência de navegador) e `audit` via Lighthouse/site-excellence já existentes.
5. `polish` -> `harden` -> `adapt` conforme achados; `distill` se o resultado ficou carregado.

## 2. Checklist Vercel para site estático HTML/CSS (itens verificáveis no `_site`)

Fonte: AGENTS.md (MUST/SHOULD/NEVER). Itens de hidratação, React, `nuqs`, virtualização >50 itens, inputs controlados/uncontrolled, mutações <500ms omitidos por não se aplicarem a HTML/CSS estático. Conflito interno: README oferece `maximum-scale=1` como alternativa ao input 16px; AGENTS.md diz NEVER `user-scalable=no`/`maximum-scale=1`. Adotar AGENTS.md.

Foco visível / teclado
- [ ] Todo elemento focável mostra anel de foco visível e não obscurecido com `:focus-visible`; grupos com `:focus-within`. Grep: nenhum `outline: none`/`outline:0` sem substituto visível.
- [ ] Header sticky/fixed nunca cobre o elemento focado (verificar com Tab até o fim da página).
- [ ] Tab percorre menu, links de situação, formulário e rodapé na ordem visual; `<details>`/menus abrem e fecham com Enter/Espaço/Esc.
- [ ] Link "Pular para o conteúdo" existe e funciona; títulos com `scroll-margin-top` (âncoras não ficam sob o header).
- [ ] Navegação sempre em `<a href>`; nunca `<div onClick>`; Ctrl/Cmd+clique e clique do meio funcionam.

Alvos de toque
- [ ] Alvo >=24px em desktop e >=44px em mobile; se o visual é menor, expandir a área (padding/pseudo-elemento).
- [ ] `touch-action: manipulation` em controles; `-webkit-tap-highlight-color` coerente com o design.
- [ ] Label e controle de checkbox/radio compartilham um único alvo (sem zona morta entre eles).
- [ ] Meta viewport sem `user-scalable=no` nem `maximum-scale=1`.

Motion
- [ ] `@media (prefers-reduced-motion: reduce)` presente com variante reduzida que preserva mudança de estado (não `animation: none` global sem alternativa; Impeccable audit flagra `0.01ms` global).
- [ ] Só `transform`/`opacity` animados; nunca `top/left/width/height`; nenhum `transition: all`.
- [ ] Motion automático >5s tem pausa/parar; `transform-origin` correto.

Formulários (contato/lead)
- [ ] Cada input com `<label>` visível ou `aria-label`; `name` significativo; `autocomplete`, `type` e `inputmode` corretos (tel, email).
- [ ] Input `font-size` >=16px no mobile.
- [ ] Colar nunca bloqueado; texto livre aceito e validado depois; envio incompleto permitido para exibir validação.
- [ ] Erros inline ao lado do campo com `aria-live="polite"`; no submit, foco vai ao primeiro erro; erro nomeia problema e recuperação.
- [ ] Enter envia; botão mantém o rótulo original ao carregar ("Enviando…"); botão só desabilita após início da requisição.
- [ ] Placeholder termina com "…" e mostra padrão de exemplo; valores com `trim()`; spellcheck off em e-mail.
- [ ] Ação nomeia o que acontece ("Enviar pedido de orçamento", não "Submit"); mesmo nome no recibo.

Contraste e cor
- [ ] Piso verificável: WCAG 2 AA (corpo >=4.5:1, grande >=3:1), pois Lighthouse/site-excellence medem WCAG 2; APCA como refinamento opcional (Vercel prefere APCA).
- [ ] Contraste aumenta em `:hover/:active/:focus`.
- [ ] Estado nunca só por cor: ícone tem rótulo textual; status tem texto redundante.
- [ ] Texto secundário em superfície colorida é tingido da matiz, não cinza (Impeccable).
- [ ] `<select>` nativo com `background-color` e `color` explícitos.

Texto e conteúdo
- [ ] `<title>` corresponde ao contexto da página; `<h1>`–`<h6>` hierárquicos sem saltos.
- [ ] Aspas curvas (“ ”) e caractere "…" (não "..."); `text-wrap: balance` em títulos; espaços não separáveis em "10&nbsp;MB", números com unidade, nomes de marca.
- [ ] `font-variant-numeric: tabular-nums` em tabelas de valores/prazos.
- [ ] `translate="no"` em CONFENGE, CREA, ART, códigos de norma, CNPJ.
- [ ] Datas e números em formato PT-BR consistente (Intl ou pré-renderizado).
- [ ] Contêineres suportam texto longo (`overflow-wrap`, `line-clamp`), flex children com `min-width: 0`; sem UI quebrada com string vazia.
- [ ] Sem becos sem saída: toda página oferece próximo passo (contato contextual funcional).
- [ ] Nomes acessíveis existem mesmo quando o visual omite rótulo; ícone-only tem `aria-label`; decorativos `aria-hidden`.
- [ ] Semântica nativa antes de ARIA (`button`, `a`, `label`, `table`).

Layout e scroll
- [ ] Verificar em 320px, laptop e ultra-wide (simular a 50% zoom); sem scroll horizontal; sem barras indesejadas.
- [ ] Alinhamento deliberado a grade/baseline; lockups ícone+texto equilibrados.
- [ ] `env(safe-area-inset-*)` em elementos fixos; `overscroll-behavior: contain` em drawers/menus.
- [ ] Back/Forward restaura scroll; estado de painéis expandidos/abas refletido na URL (`#fragment`) quando compartilhável.
- [ ] Skeletons (se houver) espelham o conteúdo final; estados vazio/esparso/denso/erro desenhados.

Imagens e mídia
- [ ] `width`/`height` ou `aspect-ratio` explícitos (CLS); above-the-fold com preload, resto `loading="lazy"`.
- [ ] `alt` descritivo ou `alt=""` decorativo; mídia com legenda/transcrição quando aplicável; decorativa escondida de AT.
- [ ] `<link rel="preconnect">` para CDN; fontes críticas `preload as="font"` + `font-display: swap`.
- [ ] Vídeo em vez de GIF, `muted loop playsinline`, com fallback estático e condição `prefers-reduced-motion`.

Tema
- [ ] Se houver dark mode: `color-scheme: dark` no `<html>`; `<meta name="theme-color">` igual ao fundo.
- [ ] Design: sombras em camadas (ambiente + direta), bordas semitransparentes, raios concêntricos (filho <= pai), bordas/sombras tingidas para a matiz do fundo.

## 3. frontend-design (Anthropic): critérios anti-"template de IA"

Postura: "design lead at a design studio... client has already rejected proposals that felt cliché or templated". Fundamentar no assunto: "The subject's industry, subject matter, materials, and vernacular are where distinctive visual choices come from." Processo em dois passos: plano de tokens (cor 4-6 hex nomeados, tipos e papéis, layout com wireframe ASCII e alinhamento, princípios) -> revisar contra o brief ("if any part of it reads like the generic default you would produce for any similar page... revise") -> só então código.

Tipografia
- Uma ou duas famílias; se duas, claramente distintas. Escolha deliberada, "not the default families you would reach for on any other project". Escala clara (Elements of Typographic Style), pesos/larguras/espaçamento intencionais.
- Medida <80 caracteres; serifa pode ter linha um pouco mais longa e mais entrelinha.
- Evitar (os "commonest tells"): acentuar uma única palavra do título em itálico/negrito/cor; ALL CAPS em labels; labels tipográficos desnecessários acima do conteúdo.

Cor e calibração (clusters de IA a não usar quando o brief deixa o eixo livre)
1. Creme quente (~#F4F1EA) + serifa display de alto contraste + acento terracota (~#D97757, acento da própria Anthropic: "reads as a tell").
2. Quase-preto + um acento ácido verde ou vermelhão.
3. Broadsheet: hairlines, radius zero, colunas densas de jornal.
4. SaaS-card kit: cards idênticos arredondados, mesmo radius em tudo, mesma sombra `rgba(0,0,0,.1)`, gradientes decorativos.
5. Chrome de template: eyebrow ALL-CAPS tracked acima de todo título; metas com "A · B · C"; "WORD — fragment"; #0B0B0B/#111 como preto; monospace para labels de dados; "→" no fim de links/botões.

Composição
- Hero: abrir com "the most characteristic thing in the subject's world"; número grande + label pequeno + stats + gradiente é o default, só usar se for a melhor opção.
- "Visual structure is information": bordas, numeração, eyebrows, divisores só se codificam informação; 01/02/03 só para sequência real.
- Motion: um único momento orquestrado; fade-slide-up por seção e hover em todo card "read as AI-generated"; motion em resposta a ação do usuário é bem-vinda.
- "Spend your boldness in one place"; "remove one accessory" (Chanel). Piso silencioso: responsivo até mobile, foco visível, reduced-motion, contraste, paleta harmônica.
- CSS: cuidado com especificidade (`.section` vs `.cta` cancelando padding/margin).

Copy
- Palavras são conteúdo de design; nomear pelo que o usuário entende, não pela arquitetura; voz ativa; CTA diz exatamente o que acontece e mantém o nome no fluxo inteiro ("Publicar" -> "Publicado"); erros explicam o que houve e como corrigir, sem pedir desculpa nem vagueza; vazio é convite à ação; sentence case, sem enchimento.

## 4. Convergências entre as três fontes (o que vale mais para CONFENGE)
- Kicker/eyebrow acima do título: ban (Impeccable), tell (frontend-design). Remover.
- ALL CAPS em labels e mono "técnico": evitar nas duas; CONFENGE prova tecnicidade com conteúdo, não fantasia.
- Cards iguais como estrutura e cards aninhados: rejeitados nas duas.
- Um só momento de motion + reduced-motion com alternativa: nas três.
- Contraste, foco visível, alvos de toque, 16px no mobile, `min-width:0`: Vercel + Impeccable harden/audit.
- Verdade das alegações: Impeccable ("A candidate that fails on truth is replaced"; "Ask before changing claims") alinha com a gate fail-closed do AGENTS.md do repositório.
- Modo Persuade/Read: abertura inteligível + ação visível + prova que só a CONFENGE tem; Read com compreensão e wayfinding intactos.
