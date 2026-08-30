# Direção comercial da home: o parecer

**Campanha:** `CONFENGE_HOME_COMMERCIAL_DIRECTION_20260830`
**Issue:** a abrir · **Parent:** #493 · **Supersede estético de:** #525/#526 (canário da planilha, commit `31fcff816`) e da remoção que veio depois (`0709c7d93`, `15e56bc5c`)
**Estado da decisão:** `EXECUTE_NOW` · **Frente executiva:** INBOUND ENGINE
**Alavancas:** revenue, trust, customer.
**Tempo até evidência:** uma rota, a home, na janela de medição que já corre até 2026-09-13.
**North Star:** oportunidades comerciais qualificadas. Não é page count, não é linha de CSS, não é quantidade de componentes.

---

## 0. `BRAND_OWNER_VETO_AFTER_LIVE_REVIEW`

O brand owner inspecionou a produção no SHA `e2b11f10920aba65d078636362fe16a41f91c7d4`, publicado em 2026-08-30, e vetou a direção visual da home. O diagnóstico registrado é que a página ficou tecnicamente rigorosa e comercialmente inadequada, e que a premissa que sustentava a direção anterior, *"o visitante não é persuadido por acabamento, é persuadido por rastreabilidade"*, é uma falsa dicotomia. A meta declarada é uma superfície comercial de altíssimo nível para consultoria B2B/B2G, no patamar em que operam as casas globais, e explicitamente não uma planilha orçamentária, não um backoffice, não um relatório de auditoria.

Isto **supera a direção estética de #525/#526 sem apagar a evidência dela**, exatamente do mesmo modo que #525 superou a conclusão estética de #494 sem apagar a `DECISION_RULE_494_PRE_REGISTERED.md`. O `12-breakthrough-canary.md` continua no repositório, íntegro, com a escolha em prosa, o delta de custo do primeiro webfont e o índice de captura dos 20 pares. A medição de #538, que quantificou o custo do trilho (quatro trilhos estreitos ocupando 599,4px de um viewport de 1366px), continua válida e é justamente uma das razões pelas quais a planilha não volta. O que muda não é o registro: é o enquadramento do problema.

O erro conceitual que esta campanha não repete é o simétrico do que #525 apontou em #494. Lá, comparar mecanismo com mecanismo sob direção fixa não podia produzir ruptura. Aqui, o risco é o oposto: produzir ruptura escolhendo o artefato errado como metáfora. A planilha é um artefato do ofício, mas é o artefato do **fornecedor de insumo**, não o do **julgamento**. Uma casa que vende decisão não pode se apresentar como a folha de custo que ela lê.

---

## 1. Diagnóstico, em duas partes

### 1.1 A metáfora da planilha já tinha saído antes desta sessão

O veto incidiu sobre a produção, e a produção ainda estava em `e2b11f109`. A branch, porém, já tinha andado. O commit `0709c7d93` reduziu `assets/home-10x.css` em cerca de 1.334 linhas de diff, quase todas remoções, e o cabeçalho da folha resultante registra o motivo por escrito: a régua de colunas congelada (`ITEM / DESCRICAO / UNIDADE / QUANT / FONTE`), os cinco trilhos herdados por seção e as faixas de metadado por banda saíram, citando a medição de #538 e a classificação de cluster 3 do `DESIGN_DIRECTION_BRIEF_2026-08-30.md` §1, que nomeia "fios finos, radius zero, colunas de jornal, numeração `01/02/03`" como o terceiro agrupamento genérico proibido a qualquer candidato.

Ou seja: a parte do veto que dizia "isto parece uma planilha" já estava endereçada quando esta sessão começou. Registrar isso importa porque impede que este documento reivindique uma correção que outro commit fez.

### 1.2 O que sobrou não era a terceira direção, era a segunda de novo

A folha em `15e56bc5c`, que é o estado da branch imediatamente antes desta sessão, tinha 238 linhas e nenhuma tese visual. A evidência é literal, no próprio arquivo:

O dispositivo da primeira dobra era `.hero-artifact`, declarado como `background:var(--panel); border:1px solid var(--panel-line); border-top:3px solid var(--accent); border-radius:var(--radius-sm)`, com `--panel:#f7f9fa` e `--panel-line:#e3e9ed` definidos ali mesmo. Isso é a caixa cinza clara com fio de acento no topo e canto arredondado, que é a mobília padrão de qualquer landing page de serviço profissional. Ela não carrega informação que a página perderia se fosse removida; carrega os mesmos três itens que o parágrafo `.hero-deliverable` ao lado já anunciava.

A tipografia rodava três famílias na mesma página. O corpo era Archivo variável, carregado pela home; `.type-serif` e `.type-mono`, que aparecem 3 e 10 vezes no `index.html`, não eram redefinidos pela camada da home e portanto caíam nos tokens globais de `styles-tokens.css:25-26`, isto é, `--serif:ui-serif,"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif` e `--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`. Na prática, Georgia e Menlo. Nenhum dos dois é um desenho escolhido: são o que o navegador entrega quando ninguém escolheu. Uma casa que compra uma fonte variável e depois pinta a manchete com a serifa padrão do sistema está pagando por identidade e usando default.

A hierarquia de títulos era uma única regra, `h1, h2, h3 { font-stretch:96%; font-weight:700; letter-spacing:-.022em }`: os três níveis com o mesmo tratamento, distintos só por tamanho herdado. E o eixo de largura do Archivo, que vai de 66% a 110% e é a única propriedade tipográfica que a página tinha e a concorrência não, estava sendo usado em uma faixa de 8 pontos (88% a 96%), uma variação que não constrói contraste.

Sair da planilha em direção a isso não é a terceira direção. É a segunda de novo, com outro nome.

---

## 2. A direção "parecer"

### 2.1 A tese

A CONFENGE vende julgamento técnico e econômico. O artefato do julgamento neste mercado não é a planilha, que é insumo, nem o relatório, que é embalagem: é o **parecer**, e o parecer termina em uma palavra. Participar, condicionar ou recusar. Essa terna é o único elemento da página que um concorrente não copia sem mudar de negócio, porque copiá-la significa assumir o risco de recomendar recusa a um cliente que quer participar. Logo, é ela, e não a mobília de tabela, que deve carregar a identidade da primeira dobra.

A consequência de composição é direta: o painel `.hero-artifact` deixou de existir e o lado direito da dobra passou a ser `.hero-verdict`, com o rótulo "O parecer termina em uma destas palavras", a lista Participar / Condicionar / Recusar e um pé que nomeia o que sustenta a escolha: o critério, o número e o responsável. Não é uma lista de entregáveis reformatada; é a saída do trabalho.

### 2.2 As três decisões que produzem a identidade

**Um campo escuro, no topo.** A primeira dobra é um campo contínuo de tinta em `--field:#08130e`, não mais uma folha branca com caixas dispostas sobre ela. O valor não é o navy corporativo genérico nem o quase-preto do cluster 2 do brief: é o verde da marca escurecido até virar tinta, derivado de `--green-700`, o que faz a superfície pertencer à CONFENGE em vez de pertencer à categoria. O mesmo campo assume a oferta dominante e a faixa de captura, e o rodapé da home, que antes empilhava navy `#071a31` contra a captura escura, passa a ser o mesmo campo, porque duas tintas quase iguais empilhadas leem como erro de produção e não como decisão.

**Uma família, três larguras.** O Archivo variável já estava carregado, com dois eixos declarados no `@font-face` (`font-weight:100 900` e `font-stretch:66% 110%`). A camada agora usa o eixo de largura como alavanca real: títulos e display em `--wide:96%`, rótulos em `--narrow:78%` com peso 750 e versalete, texto corrido na largura natural de 100%. `.type-serif` e `.type-mono` foram reapontados para o próprio Archivo dentro do escopo da home, o que remove Georgia e Menlo da página. Uma família cobre display, texto e número tabular, e o rótulo estreito em versalete vira a assinatura tipográfica reconhecível, aparecendo em eyebrow, rótulo de porta e legenda de dado, sempre nomeando, nunca decorando.

**Régua no lugar de caixa.** Um único estilo de fio, `1px` em `--rule`, com uma variante forte para abrir a tira de método. Nada de barra de acento de 2px ou 3px, nada de painel cinza, nada de card com sombra. O raio sobrevive apenas onde significa "clicável": botão e campo de formulário. É por isso que a tira de método deixou de ser quatro cards lado a lado e virou quatro colunas separadas por fio vertical, e que a caixa de artefato virou uma lista sob régua.

Nenhum score. Nenhuma média ponderada. Nenhuma afirmação sobre o que uma pessoa sente ao ver a página: isso é #336 e só #336, e #336 continua bloqueada com 0 de 20 participantes.

---

## 3. Restrições respeitadas, com prova

**Superfície pública tocada: dois arquivos.** `index.html` e `assets/home-10x.css`, e mais nada. `assets/home-10x.css` já carregava a regra *"não carregar em outra rota"* desde #526, já é fingerprintado pelo build e já está na baseline de uso de CSS, então o veículo não é novo. Nenhuma das outras rotas foi redesenhada, nenhum ADR foi alterado e nenhuma fronteira do `AGENTS.md` foi cruzada.

*Ressalva de higiene, registrada porque o rigor do repositório exige.* A árvore de trabalho desta sessão contém também modificações em treze HTMLs de `guias-contratos-obras/`, `lei-14133-obras/` e `jurisprudencia-contratos-obras/`, nos dois sitemaps e em vários JSONs de relatório editorial. Elas são saída de regeneração de build (inclusão de `style="min-height:44px"` e `aria-current="page"` na navegação global) e **não pertencem a esta direção**. Ou entram em commit próprio, com justificativa própria, ou não entram.

**Congelamento de medição respeitado.** `styles.css`, `styles-tokens.css`, `styles-tools.css`, `script.js` e `js/modules/analytics.js` estão congelados até 2026-09-13 por `docs/decisions/DEFERRED-BY-MEASUREMENT-FREEZE-2026-08-30.md`, sob janela das issues #529 e #533. Nenhum deles foi tocado. Toda a direção é uma camada por cima, escopada em `body[data-content-cluster="home"]`, o que é o que torna a mudança reversível sem risco para as 260 rotas restantes. (Nota de conserto pendente: o cabeçalho comentado de `assets/home-10x.css` aponta o congelamento em `docs/decisoes/...`; o caminho real é `docs/decisions/...`.)

**Nenhum arquivo de fonte novo.** O bloco `@font-face` é byte-idêntico ao anterior: mesmo `assets/archivo-var-latin-bf6e041e.woff2`, mesmos eixos, mesmo subconjunto. O orçamento de `data/site/design-system.json` (`font_files_max: 1`, `font_total_gzip_kb_max: 60`) e os tetos de módulo em `scripts/site/audit_performance.py` não se movem, e o gate `test_font_glyph_coverage.py` continua respondendo pela cobertura de glifos. O eixo de largura é gratuito: já estava no arquivo pago em #526 e simplesmente não estava sendo usado.

**Paleta: uma superfície nova, contra o teto do brief §4.** O `DESIGN_DIRECTION_BRIEF_2026-08-30.md` §4 permite no máximo uma adição justificada e proíbe adição com ΔE inferior a 3 de token existente. A adição justificada aqui é uma só, `--field:#08130e`, a superfície de autoridade que a home não tinha. O que acompanha `--field` não é uma segunda paleta: é o conjunto legível **sobre** ela, sem o qual o campo escuro não pode existir com contraste conferível (`--field-ink:#f4f7f4`, `--field-muted:#a9bcae`, `--accent-live:#5ea85a`, `--field-soft:#12241b`), mais dois valores de fio (`--rule:#dfe4e6`, `--rule-strong:#0d1b12`). São oito literais hexadecimais novos na folha, todos declarados **dentro** do escopo `body[data-content-cluster="home"]` e nenhum em `styles-tokens.css`, cujo cabeçalho manda literalmente não inventar uma segunda paleta. A home não inventa: ela deriva localmente. Se a direção herdar para outras famílias, esses valores sobem para o arquivo de tokens em issue própria, com diff auditável, e não por absorção silenciosa.

`--lime:#ced62a` sai por completo da home. A última ocorrência era o `.eyebrow-dot`, agora oculto, o que também afasta a página do agrupamento "escuro mais acento ácido" que o brief §1 registra como cluster 2, precisamente o risco de uma dobra escura.

**Contrato de logo preservado, e é por isso que o cabeçalho continua claro.** `scripts/site/test_design_gates.py:768` crava, para a home, `src="/assets/logo-confenge-500-f8a83f6d.png"` com `width="224"` e `height="58"` no `.brand` do cabeçalho, e a variante branca com `loading="lazy"` no `.footer-brand`. Essa asserção fixa o arquivo, não a cor de fundo. Pintar o cabeçalho de escuro exigiria a logo branca no topo e quebraria o gate, então a camada da home não escreve nenhuma regra para `.site-header`: ele permanece com o `rgba(255,255,255,.97)` de `styles.css`. A aresta entre o cabeçalho claro e o campo escuro logo abaixo é, portanto, uma consequência de contrato assumida como decisão de composição, não um acidente.

**A numeração 01/02/03/04 saiu por regra escrita, não por gosto.** O brief §1 classifica `01/02/03` como assinatura do cluster 3, e o §14 registra que a pesquisa interna já observava "serif mais mono mais off-white mais fios finos mais 01/02/03 mais grade assimétrica" como um novo default rejeitado. Na tira de método, os `<span class="type-mono">01 · Selecionar</span>` viraram `<span class="phase-verb">Selecionar</span>`. O que se perde é um ordinal decorativo; o que fica é o verbo, que é a informação.

**Meta-copy removida.** Saíram "Cada rótulo diz exatamente para onde o clique leva" e "Escolha a faixa mais próxima do seu contrato". Ambas eram instruções de uso da própria página, e uma casa de consultoria que precisa explicar como se lê a sua home está gastando a primeira dobra com manual. No lugar entraram afirmações sobre o negócio do visitante: "A CONFENGE entra em três momentos. Cada um começa por uma pergunta econômica diferente." e "O mesmo método muda de peso conforme o porte do contrato."

**Texto legal consolidado, não escondido.** Os avisos de canal seguro, acesso, retenção de até 730 dias e exclusão saíram do rótulo do checkbox `canal_seguro`, que agora lê apenas "Solicitar canal seguro para envio de documentos", e foram para o bloco `.form-legal` no pé do formulário, com fio superior, `--muted` e 0.82rem. O conteúdo é o mesmo, palavra por palavra; muda a posição na hierarquia. Um checkbox opcional não deve carregar um parágrafo de política no rótulo, porque isso faz o visitante ler política de retenção antes de decidir se quer anexar um arquivo.

### 3.1 Correção de rigor apurada nesta revisão

Aplicando a mesma disciplina da `DECISION_RULE_494_PRE_REGISTERED.md` §7.7, que corrigiu o próprio brief onde a aritmética não fechava, uma afirmação do código não sobrevive à conferência com `_contrast_ratio` de `scripts/site/test_design_gates.py`:

| Afirmação no comentário de `home-10x.css` §0 | Medido com a função do repositório | Consequência |
|---|---|---|
| branco sobre `--field` dá **18,6:1** | **18,92:1** | a folga é maior do que o comentário anuncia; o erro é conservador |

Os demais pares do campo escuro, medidos pela mesma função: `--field-ink:#f4f7f4` sobre `--field` dá **17,53:1**; `--field-muted:#a9bcae` sobre `--field` dá **9,45:1**; `--accent-live:#5ea85a` sobre `--field` dá **6,51:1**; e `--field-ink` sobre `--field-soft:#12241b` dá **15,04:1**. Nenhum par depende de cor como único portador, o que é a regra dura do brief §4.1.

---

## 4. O que NÃO foi feito, e por quê

Os três parágrafos `.evidence-illustration` da seção de mercado continuam abrindo com "Conta ilustrativa, não é economia observada", e um deles ainda fecha com "a CONFENGE não é economicamente indicada neste porte". As duas construções são defensivas, contradizem a lei editorial já aplicada ao resto da superfície comercial e a reescrita já existe pronta, registrada no item 4 de `docs/decisions/DEFERRED-BY-MEASUREMENT-FREEZE-2026-08-30.md`.

Elas não entram agora por razão mecânica, não por escolha estética. Esse texto não é escrito no HTML: vive em `data/commercial/offer-fit-matrix.v1.json`, é compilado para `js/modules/offer-fit.js` e daí para `script.js`, que está congelado pela janela de medição. `tests/commercial/test_offer_fit_copy.mjs` exige que a home contenha o texto da matriz literalmente e `test_offer_fit_matrix.mjs` exige que o módulo do navegador seja gerado a partir dela, de modo que trocar a frase obriga a reconstruir `script.js` e quebra a baseline dos frozen specs. Ação datada para 2026-09-13, com a sequência de comandos já escrita no documento de adiamento.

**A mitigação aplicada agora foi de proporção, não de remoção.** O parágrafo perdeu a barra lateral e o destaque de caixa e passou a ser subordinado ao dado que ilustra: fio superior de `1px` em `--rule`, cor `--muted`, tamanho `0.84rem` e entrelinha 1,55. Ele continua legível e continua dizendo exatamente o que dizia, com o mesmo conteúdo de ressalva; deixa de competir com o número. Isso não é a correção. É a única coisa que a janela de congelamento permite fazer sem invalidar a medição em curso, e este documento a registra como paliativo datado justamente para que ninguém a confunda com a solução.

---

## 5. Regra de decisão para o próximo passo

Este PR troca a direção **sem** regra pré-registrada nos moldes de #494, e isso precisa estar dito em vez de disfarçado. Ele não pode, portanto, reivindicar o tipo de autoridade que a `DECISION_RULE_494_PRE_REGISTERED.md` tem: aquela regra foi escrita antes de existir variante para olhar, e o commit que a introduziu é a prova da ordem. Aqui a ordem é a inversa, porque o gatilho foi um veto do brand owner sobre a produção, e um veto não espera protocolo.

O que se pode fazer, e o que este parágrafo faz, é registrar **antes da evidência chegar** o critério pelo qual esta direção deve ser julgada, para que a avaliação futura não seja escrita depois de ver o resultado.

**Critério de sucesso.** A unidade de julgamento é oportunidade comercial qualificada originada na home, contra a mesma definição que o funil já usa, comparada com a janela equivalente imediatamente anterior. Nenhuma outra métrica promove esta direção: não taxa de rolagem, não tempo em página, não número de componentes, não elogio a captura de tela. A janela de medição de #529 e #533 já cobre a primeira dobra e vence em 2026-09-13; a leitura desta direção acompanha essa janela, e a decisão de mantê-la ou revertê-la é tomada quando o dono da janela liberar, não por passagem de data.

**Critério de reversão, e o rollback é o SHA.** A superfície inteira desta mudança são dois arquivos, então reverter é restaurar `index.html` e `assets/home-10x.css` no estado de `15e56bc5c`, que é a branch imediatamente antes desta sessão. Reverter **não** significa voltar a `e2b11f109`: aquele é o estado da planilha, que o brand owner já vetou, e nenhum resultado ruim desta direção o reabilita.

**O que seria evidência de fracasso.** Qualquer um destes, isoladamente, obriga a reversão ou a emenda registrada:

Primeiro, queda de oportunidades qualificadas originadas na home na janela comparável, sem outra causa identificada. Segundo, reprovação em qualquer gate que hoje passa, com destaque para o piso funcional de 14px, o contrato de logo de `test_design_gates.py:768`, a cobertura de glifos e o `npm run inbound:gates`, que é fail-closed por `AGENTS.md` e no qual a conversão nunca é a variável em disputa. Terceiro, crescimento não declarado do orçamento de fonte ou de CSS. Quarto, a descoberta de que a dobra escura foi classificada como cluster 2 pelo próprio critério do brief §1, isto é, que o campo mais o `--accent-live` reproduzem a assinatura "escuro mais acento ácido" que a direção afirma evitar. Quinto, qualquer vazamento desta camada para outra rota, que quebraria a premissa de reversibilidade que sustenta o escopo.

**O que não conta como evidência, em nenhuma direção.** Afirmação sobre percepção humana. Nem a favor, nem contra. O `AGENTS.md` e a §5.4 da regra de #494 são explícitos: nenhum documento, papel ou agente pode afirmar o que uma pessoa achou mais confiável, mais premium ou menos genérico. Isso é #336, exclusivamente, e #336 está bloqueada com 0 de 20 participantes. Enquanto ela não rodar, esta direção se defende por derivação (cada decisão vem de um artefato real do ofício e carrega informação), por conformidade medida (contraste, gates, orçamento) e por resultado comercial, e por mais nada.

---

## 6. Definition of done

- [x] veto do brand owner registrado com SHA e data, e a evidência de #525/#526 preservada em vez de apagada
- [x] diagnóstico separa o que outro commit já tinha corrigido do que ainda estava genérico
- [x] o estado anterior é caracterizado com evidência literal do código, não com adjetivo
- [x] tese de direção declarada em prosa, sem score e sem média ponderada
- [x] identidade produzida por três decisões nomeadas: campo escuro, uma família em três larguras, régua no lugar de caixa
- [x] superfície pública limitada a `index.html` e `assets/home-10x.css`
- [x] artefatos sob janela de medição não tocados
- [x] nenhum arquivo de fonte novo; orçamento e tetos inalterados
- [x] adição de paleta contida em uma superfície justificada, escopada na home, fora de `styles-tokens.css`
- [x] contraste de todos os pares do campo escuro medido com a função do próprio repositório
- [x] contrato de logo do cabeçalho preservado, com a consequência de composição assumida
- [x] item bloqueado pelo congelamento declarado, datado e mitigado por proporção em vez de silenciado
- [x] critério de sucesso, critério de reversão e evidência de fracasso registrados antes do resultado
- [x] rollback atômico por SHA, com o alvo correto nomeado
- [x] nenhuma afirmação de percepção humana
- [ ] leitura da janela de medição em 2026-09-13, com liberação explícita do dono da janela
- [ ] reescrita das três ilustrações via `offer-fit-matrix.v1.json`, após a liberação
- [ ] matriz de herança para as demais famílias, se e quando esta direção sobreviver ao critério da §5
