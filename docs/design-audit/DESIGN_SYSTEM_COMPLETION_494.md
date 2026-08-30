# Completar a constituição visual — entregável do Anexo A.5 de #494

**Issue:** #494 · **Parent:** #493 · **Data:** 2026-08-30
**Desfecho da comparação:** `KEEP_CURRENT` — registrado em [DECISION_RULE_494_PRE_REGISTERED §7](DECISION_RULE_494_PRE_REGISTERED.md#7-resultado--apurado-em-2026-08-30)
**Baseline:** `b396d1ab6f797e4b8e57801cc2c4dbcb306e62e5`
**Escopo:** especificação. **Zero byte alterado em rota pública, em token, em CSS servido ou em runtime.**

---

## 0. Por que este documento existe mesmo com `KEEP_CURRENT`

O empate decide **qual mecanismo de assinatura entra**, e a resposta foi: nenhum, por ora. Não decide se o sistema está completo — e ele não está. O Anexo A.5 lista nove especificações que "um diretor de B2B premium não assina sem", e a ausência delas é independente da escolha de mecanismo: um formulário sem estado de erro especificado continua sem estado de erro especificado em qualquer direção.

Então este documento completa **o contrato que já está no lugar**, sem criar segunda constituição. Onde o sistema já decide, ele cita. Onde o sistema não decide, ele decide e mede. Onde não é possível decidir com honestidade, ele registra o custo e o dono.

Todo número aqui foi computado com `_contrast_ratio` de `scripts/site/test_design_gates.py`, a mesma aritmética que os gates usam, para que documento e CI não possam divergir. Reprodução: `npm run design:palette`.

---

## 1. Paleta — diff dos tokens, não segunda paleta

`styles-tokens.css:3` diz, literalmente, *"Do not invent a second palette."* Este é o diff.

### 1.1 Reuso, sem alteração

| Token | Valor | Papel | Sobre branco |
|---|---|---|---|
| `--ink` | `#071a31` | texto estrutural, número dominante, regra de cabeçalho de tabela | 17,48:1 |
| `--text` | `#26374a` | corpo | — |
| `--muted` | `#5d6a7a` | rótulo, unidade, nota, metadado | 5,51:1 |
| `--green-700` | `#2d6f2d` | **sinal de decisão**, nunca decoração | 6,13:1 |
| `--navy-950 / 900 / 800` | `#031020` / `#061a33` / `#0a294b` | superfície de autoridade, uso raro | — |
| `--line` | `#dce3e8` | keyline funcional | 1,30:1 — nunca portador de significado |
| `--white` / `--soft` | `#fff` / `#f3f4f5` | fundo editorial e respiro | — |

### 1.2 Adição — exatamente uma

| Token | Valor | Sobre branco | Sobre `--soft` | AA texto normal |
|---|---|---|---|---|
| `--caution-700` | `#8A5F00` | **5,65:1** | 5,13:1 | ✅ |

Falta na paleta um sinal de **ressalva/lacuna** — limite, pendência, dado ausente, prazo vencido —, que é o vocabulário mais característico da casa e hoje não tem valor nenhum.

**Correção de rigor.** O brief anunciava 5,26:1 para `#8A5F00` e 4,37:1 para o `#9A6B00` da v1, dizendo que este último reprovava em AA. Medido com a função do próprio repositório: **5,65:1** e **4,69:1**. `#9A6B00` **passa** em AA. O motivo para não o ressuscitar não é acessibilidade — é que dois âmbares a 0,5:1 de distância são a mesma cor com dois nomes, e o valor mais escuro guarda folga contra `--soft` e contra a folha de impressão. A regra "verificar antes de citar" vale contra o próprio brief.

**Nenhuma adição com ΔE < 3 de um token existente.** `--caution-700` é o único valor novo; não há proposta de "papel", "creme" ou cinza alternativo — a v1 propunha `#F5F6F5` a ΔE 1,21 de `--soft`, reinventando um token que já shippa.

### 1.3 `--lime:#ced62a` — decisão: **`restrict`**

Não decidir é depreciar em silêncio, então a decisão é explícita.

**Medido:** 1,58:1 sobre branco · 1,48:1 sobre o gradiente do hero · 12,08:1 sobre `--navy-950` · 11,03:1 sobre `--navy-900` · 9,27:1 sobre `--navy-800`.

**Regra:** `--lime` é permitido **exclusivamente** sobre superfície de autoridade escura (`--navy-950/900/800` e os `#071a31`/`#0b2949` já servidos), onde é o **único valor da paleta que funciona como acento** — `--green-700` mede 3,12:1 sobre `--navy-950` e 2,39:1 sobre `--navy-800`, ou seja, reprova como texto nas duas. Sobre branco, `--soft` ou o gradiente do hero, `--lime` é **proibido**, em qualquer papel, inclusive decorativo.

**Superfície de migração — 16 linhas de `styles.css`, 25 ocorrências, enumeradas por `npm run design:palette`:**

| Situação | Ocorrências | Ação |
|---|---|---|
| Sobre fundo navy/ink (`.article-callout > .icon`, `.pillar-stat strong`, `.lead-inline-copy span`, `.final-cta-section .eyebrow`, `.decision-spine li.is-core .type-mono`, `.offer-dominant .offer-label`, `.offer-dominant-link .icon`, `.contact-channels .icon` ×2, `.model-section .eyebrow`, `.hero-evidence .evidence-kicker`, `.evidence-tab.is-active` fundo+borda, `.evidence-tier`, `.evidence-cta` fundo+borda, `.evidence-method li > span`, `.pillar-evidence .pillar-evidence-count strong`, `.pillar-docs li:not(:has(.icon))`, `.content-feature .type-mono`, `.compare-human` borda + `.compare-human > .type-mono`, `.dm-node.is-core > .type-mono`) | 23 | **mantém** — todas ≥9,27:1 |
| `.hero-eyebrow > span` — ponto de 7 px sobre o gradiente claro do hero | 1 | **remove** — 1,48:1, não carrega significado, é ornamento |
| `.evidence-callout` — fio de 3 px sobre `rgba(206,214,42,.075)` | 1 | **substitui** por `--caution-700` ou `--ink`, conforme o papel; hoje é o único diferenciador do bloco a ~1,5:1 |

Duas ocorrências, não dezesseis. O custo da decisão é pequeno e agora é conhecido, que era a questão.

### 1.4 Regra dura: cor nunca é o único portador

Medido em cinza 100% (luminância relativa convertida de volta a hex):

| Par | Razão | Separado por luminância? | Portador não-cromático de cada lado |
|---|---|---|---|
| decisão `#2d6f2d` × ressalva `#8A5F00` | 1,09 | ❌ | palavra "válida" + glifo `·` × palavra "vencida"/"sem …" + glifo `×`/`!` + peso 700 |
| decisão × metadado `#5d6a7a` | 1,11 | ❌ | glifo + linha de status no início do bloco × rótulo em caixa alta na coluna fixa |
| decisão × estrutura `#071a31` | 2,85 | ❌ | glifo × peso 700 e posição na coluna do número |
| ressalva × metadado | 1,02 | ❌ | peso 700 + fio de borda de 4 px × corpo ≥12,8 px |
| ressalva × estrutura | 3,10 | ✅ | — |
| metadado × estrutura | 3,17 | ✅ | — |

**Quatro dos seis pares somem em preto e branco.** É por isso que a regra existe, e é por isso que ela é `≥3:1 de luminância **ou** portador não-cromático declarado`, nunca só cor. Verificação: `npm run design:palette` retorna `G3_PASS` apenas quando todo par abaixo de 3:1 declara portador dos dois lados.

### 1.5 Anel de foco — não é desta issue, e já está corrigido

`--focus-ring` era `0 0 0 3px rgba(45,111,45,.35)`, que composto sobre branco dá `#b6cdb6` = 1,69:1 contra os 3:1 que a WCAG 2.2 1.4.11 exige. **#513 já corrigiu** para `0 0 0 2px var(--white),0 0 0 5px var(--ink)`, medido entre 13,48:1 e 19,11:1 em nove superfícies, e apurou que o defeito era maior do que #506 descrevia — quatro regras de `outline` em `styles.css` mais nove folhas de rota, e `.contact-form input:focus` apagava o anel inteiro no formulário de captura da home.

**Consequência para qualquer candidata futura:** herda o anel corrigido, não redefine `outline` nem `box-shadow` em `:focus-visible` sem medir, e não pode regredi-lo. Os protótipos desta issue herdam `var(--focus-ring)` e acrescentam apenas `outline:2px solid transparent`, que preserva o anel em `forced-colors`, onde `box-shadow` não é pintado.

---

## 2. Estados de interação

Oito estados, cada um com portador não-cromático, porque o momento de dinheiro do site é um formulário.

| Estado | Portador visual | Portador não-cromático | Medida |
|---|---|---|---|
| **repouso** | `--ink` sobre `--white`; borda `--muted` em campo | — | 17,48:1 / 5,51:1 |
| **foco** | `--focus-ring` de #513 | halo branco + núcleo `--ink`, 5 px no total, visível em `forced-colors` pelo `outline` transparente | 13,48:1–19,11:1 |
| **hover** | mudança de **cor de fundo** ou de borda, nunca de posição | o cursor já é o portador | **deslocamento vertical proibido**: `getBoundingClientRect().top` medido no render, tolerância 0,0 px |
| **ativo** | fundo `--navy-900` em botão primário | — | ≥7:1 |
| **desabilitado** | `--muted` sobre `--soft`, `cursor:not-allowed` | atributo `disabled` na árvore de acessibilidade + texto de motivo adjacente | contraste dispensado por 1.4.3, mas o motivo é texto normal e mede AA |
| **erro** | borda 2 px `--caution-700`, texto `--caution-700` peso 700 | prefixo literal `Erro — `, `aria-invalid="true"`, `aria-describedby` apontando a mensagem | 5,65:1 |
| **carregando** | rótulo do botão troca para o verbo no gerúndio | `aria-busy="true"` + `role="status"`; **sem spinner animado** (`prefers-reduced-motion` sempre) | — |
| **vazio** | bloco `--soft` com convite à ação | frase que diz o que fazer, não "nenhum resultado" | 5,51:1 mínimo |
| **selecionado** | fundo `--green-100`, texto `--ink` | `aria-current` / `aria-selected` + peso 700 | 15,9:1 |

**Sem hover lift** vira regra declarada, não três `transform:none` de override espalhados pela cascata. Verificação por render, não por regex: cinco regras existentes já são neutralizadas por override posterior, então só a cascata resolvida responde. Medido nos dois protótipos: **0,00 px**.

---

## 3. Especificação de formulário

A superfície comercial do negócio. Ordem fixa, de cima para baixo:

1. **Rótulo** — `<label for>`, sempre visível, nunca placeholder como rótulo. Peso 700, `--ink`. Nomeia o que a pessoa controla, não a implementação: "Número ou apelido do contrato", não "contract_id".
2. **Ajuda** — `<p class="field__help" id>` antes do controle, referenciada por `aria-describedby`. Diz o que reduz a chance de erro; não repete o rótulo. `--text-small`, `--muted`, ≥12,8 px.
3. **Controle** — altura mínima `--touch-min` (44 px), borda `--muted` 1 px, `border-radius:--radius-sm`, `font:inherit`. Campo numérico usa a classe `.num` (`font-variant-numeric: tabular-nums lining-nums`).
4. **Validação** — no `blur` para formato, no `submit` para obrigatoriedade. Nunca a cada tecla, que transforma digitação em repreensão.
5. **Erro inline** — imediatamente **abaixo** do controle, nunca em balão nem em resumo distante. `aria-invalid="true"` no controle, `aria-describedby` apontando a mensagem, prefixo literal `Erro — `, borda de 2 px em `--caution-700`. A mensagem dirige e não se desculpa: *"Informe pelo menos um evento com data. Sem data não dá para montar cronologia."*
6. **Turnstile** — bloco reservado **entre o último campo e o botão**, com altura reservada em CSS antes do widget carregar, para que o CLS medido continue 0,000. O protótipo não carrega widget de terceiro; a página real carrega.
7. **Envio** — um único botão primário. O verbo é estável entre botão e confirmação: o botão diz `Registrar este evento`, a confirmação diz `Evento registrado`; o botão diz `Analisar meu caso`, a confirmação diz `Análise solicitada`.
8. **Sucesso** — `role="status"`, prefixo `✓`, `--green-700`, e diz o próximo prazo real ("retorno em até 1 dia útil"), não "obrigado".

**Cerca:** esta especificação é tratamento tipográfico e compositivo do formulário existente. Não altera contrato de formulário, endpoint, campo enviado nem runtime — isso é fora de escopo por §15 do brief.

---

## 4. Especificação de tabela de dados

Os mecanismos apostam identidade em figuras tabulares, e a v1 dava uma frase.

| Aspecto | Regra |
|---|---|
| **Alinhamento** | texto ao início; número ao fim, sempre com `.num`. Colunas de moeda e de percentual alinham pela vírgula decimal, o que só funciona com avanço de dígito idêntico |
| **Formatação PT-BR** | milhar `.` e decimal `,`. É contrato de conteúdo, não propriedade da fonte, e é o que de fato quebra alinhamento em coluna de preço brasileira |
| **Cabeçalho** | `--text-micro`, caixa alta, `--muted`, `border-bottom: 2px solid var(--ink)`. A regra de 2 px é o que separa cabeçalho de corpo; não há segunda pista |
| **Zebra × keyline** | **keyline**. `border-bottom: 1px solid var(--line)` por linha. Zebra é proibida: cria um segundo eixo de cor sem significado e, impressa em 100%, vira ruído. Uma regra só existe se separar dois conteúdos que precisam ser distinguidos |
| **Cabeçalho fixo** | apenas em tabela com mais de 12 linhas, via `position:sticky` no `<thead>`; nunca por duplicação de DOM |
| **Rodapé de total** | `border-top: 2px solid var(--ink)`, peso 700. O total é estrutura, não decoração |
| **`<caption>`** | obrigatório e informacional: diz a unidade, a base e a data de corte. Não é título repetido |
| **Transformação mobile** | **scroll horizontal declarado** dentro de um contêiner `overflow-x:auto`, com o `<caption>` fora do scroll. **Nunca cards empilhados**, que destroem exatamente a comparação que a tabela existe para permitir. O `<body>` nunca rola na horizontal — medido: 0 px de overflow nos cinco viewports |
| **Coluna de sinal** | número negativo carrega o sinal `-` como caractere, nunca só cor nem só parênteses |

---

## 5. Contrato de superfície escura

**Decisão: não existe `prefers-color-scheme: dark` neste site, e isso é escolha declarada, não omissão.**

Razão: os valores escuros da paleta são **superfície de autoridade** — painéis raros dentro de uma página clara —, não um tema. Adotar um esquema escuro dobraria a paleta, o que a §4 do brief proíbe, e dobraria a superfície de todo gate sem nenhum job de visitante que o peça. O que existe, e precisa de contrato, é o comportamento **sobre esses painéis**.

`:root` declara `color-scheme: light` explicitamente, para que o agente de usuário não inverta controle de formulário por conta própria.

**Contraste medido sobre as três superfícies de autoridade:**

| Valor | sobre `--navy-950` | sobre `--navy-900` | sobre `--navy-800` | Veredicto |
|---|---|---|---|---|
| `--white` `#fff` | 19,11 | 17,45 | 14,67 | ✅ texto primário |
| `--green-100` `#edf5ec` | 17,18 | 15,68 | 13,18 | ✅ texto primário alternativo |
| `--line` `#dce3e8` | 14,74 | 13,46 | 11,31 | ✅ texto secundário e fio |
| `#9aabbc` (já servido em `.final-cta-section .hero-micro`) | 8,12 | 7,42 | — | ✅ texto secundário — promovido a papel nomeado, sem valor novo |
| `--lime` `#ced62a` | 12,08 | 11,03 | 9,27 | ✅ **acento, exclusivo desta superfície** |
| `--muted` `#5d6a7a` | 3,47 | 3,16 | 2,66 | ❌ **proibido** — reprova AA nas três |
| `--green-700` `#2d6f2d` | 3,12 | 2,84 | 2,39 | ❌ **proibido como texto**; reprova até o piso de 3:1 sobre `--navy-800` |
| `--caution-700` `#8A5F00` | 3,38 | 3,09 | 2,60 | ❌ **proibido** — reprova AA nas três |

**Consequências:**

- o **sinal de decisão** sobre escuro não é `--green-700`. É `--lime`, que é a justificativa medida do `restrict` da §1.3 — sem ele a superfície escura fica sem acento algum;
- o **sinal de ressalva** sobre escuro **não tem cor**, porque a §4 autoriza uma única adição e ela reprova sobre navy. Sobre escuro, ressalva é carregada por **palavra + glifo + fio `--white` de 4 px**. Isso é consistente com a regra dura: a cor nunca era o portador;
- **`--muted` é proibido sobre navy** em qualquer papel. Onde texto secundário for necessário, `--line` ou `#9aabbc`.

---

## 6. Folha de impressão

A ferramenta do art. 125 já oferece imprimir e baixar, e o brief testa impressão em cinza 100% — logo é preciso projetar para ela.

```
@media print {
  chrome de navegação, CTA, formulário e banner: display:none
  fundo: #fff · texto: #000 · corpo: 11pt
  bloco de afirmação: break-inside: avoid
  keyline: 1pt solid #000 (o --line de 1,30:1 desaparece no papel)
  link externo: o href impresso após o texto, em 9pt
  metadado (fonte, data de corte, versão, responsável): impresso, nunca escondido
}
```

**O que a impressão obriga, e que a tela deixava passar:** decisão, ressalva e metadado neutro ficam entre 1,02 e 1,11 de contraste em cinza (§1.4). Sem portador não-cromático, uma página impressa em preto e branco perde o sinal de decisão inteiro. É por isso que a regra dura da §1.4 não é preciosismo de acessibilidade: é o requisito de um artefato que o cliente imprime e leva para uma reunião.

---

## 7. Zoom 400% e refluxo (WCAG 1.4.10)

Ambas as assinaturas são risco de refluxo — trilho lateral persistente e marca de estado ancorada — e ambas têm consequência de ordem de leitura para leitor de tela.

| Requisito | Regra | Verificado |
|---|---|---|
| Nenhum scroll horizontal do documento | `html,body{overflow-x:hidden}` e todo conteúdo largo rola dentro do próprio contêiner | **0 px** de overflow nos cinco viewports do protocolo, nas duas variantes |
| Trilho lateral a 400% | abaixo de 900 px o trilho **deixa de ser coluna** e vira nota ancorada logo após a prosa da afirmação, pelo mesmo `id` (`#trilho-c1`) — nunca rodapé de página | build determinístico + captura em 390×844 |
| Ordem de leitura | o trilho vem **depois** da prosa no DOM nas duas larguras; a coluna lateral é posicionamento de grade, não reordenação. A ordem visual e a ordem de leitura coincidem | `page.accessibility.snapshot()` |
| Marca de estado a 400% | é linha de status de largura total, não bloco de canto; reflui como parágrafo | idem |
| Tabela a 400% | contêiner com `overflow-x:auto`, `<caption>` fora do scroll | idem |

---

## 8. Consequência sobre logo, favicon e `og:image` em fundo não-branco

O logo servido é `assets/logo-confenge-500-*.png`, um raster para fundo claro.

| Ativo | Sobre `--white` / `--soft` | Sobre `--navy-9xx` | Decisão |
|---|---|---|---|
| Logo | shippa hoje | **não há versão para fundo escuro**; um PNG de tinta escura sobre navy é ilegível | nenhuma superfície escura recebe o logo até existir variante declarada. Enquanto isso, o rodapé escuro carrega o **nome em texto**, que é acessível, imprime e não exige ativo novo |
| Favicon | 1 ativo | o `manifest.webmanifest` declara `theme-color` `#061a33` | mantém; nenhuma mudança é necessária porque nenhuma direção foi selecionada |
| `og:image` | fundo claro | — | mantém. Um `og:image` de fundo escuro só faria sentido junto de uma direção adotada, e não há |

**Regra que fica:** nenhuma superfície pode receber marca sobre fundo não-branco sem que exista o ativo correspondente **e** sua licença registrada. Gerar uma variante "clara" invertendo o PNG não é decisão de design, é ativo novo sem dono.

---

## 9. Modelo de custo de autoria — quem preenche isso na página 200

**É a razão pela qual direções assim morrem no terceiro mês, e é o único custo que a v1 não precificou.**

### 9.1 O inventário

Cada afirmação pública exigiria, sob qualquer um dos dois mecanismos:

| Campo | Origem legítima | Quem pode preencher | Custo por afirmação |
|---|---|---|---|
| `fonte` | contrato SELECT-only do `extra-cli`, ou documento oficial nomeado | pipeline, ou autor com o documento aberto | ~30 s se o documento já está aberto; **indeterminado** se não está |
| `data_de_corte` | data em que a fonte foi consultada ou consolidada | pipeline (automático) ou autor | ~10 s |
| `unidade` | do próprio número | autor | ~5 s |
| `artigo` | do dispositivo citado | autor | ~15 s |
| `versao` | versionamento do conteúdo | pipeline (automático) | 0 |
| `responsavel` | responsável técnico da página | pipeline (automático, por rota) | 0 |

### 9.2 A conta que decide

O terreno real (§14 do brief) é de **262 rotas**, das quais **155 têm esqueleto de `<main>` byte-idêntico** e **545 instâncias de `.criterion-card` em 138 páginas**. Se cada rota carrega em média 6 afirmações, são **~1.570 preenchimentos**. A 60 s cada, **26 horas de trabalho manual** — e o trabalho manual é exatamente o que envelhece: um campo digitado à mão não sabe que venceu.

**Conclusão, e é a razão do `KEEP_CURRENT` ser confortável:** nenhum dos dois mecanismos é adotável enquanto os campos forem digitados. Os dois só se pagam **derivados de contrato**. O mecanismo A já declara isso ("o trilho não renderiza se o contrato não responder"); o mecanismo B também ("o estado é derivado, nunca digitado"). O que falta não é decisão de design: é o contrato SELECT-only versionado do `extra-cli` que devolva fonte, data de corte e unidade por afirmação.

**Dono:** aquisição, fatos canônicos, identidade e proveniência são do `extra-cli` por [ADR-STRAT-002](../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md). O `web-cfg` **consome**; criar authority paralela aqui cruza boundary e exige ADR antes. Portanto a pré-condição de qualquer canário futuro de #493 é um contrato, e ela não pertence a este repositório.

**Gatilho objetivo de reabertura:** existir contrato versionado `extra-cli` que devolva `{fonte, data_de_corte, unidade}` por afirmação para pelo menos uma família de rotas. Sem isso, reabrir a comparação produz as mesmas 26 horas com outra pintura.

---

## 10. Superfície entregável — quem é o dono do artefato que o cliente recebe

Para uma consultoria, o artefato que o cliente recebe — relatório, memória de cálculo, dossiê, PDF — **é** o design. A vitrine pública é a menor parte.

**Estado apurado:** o repositório `web-cfg` é dono da superfície pública e de nada além dela. O relatório entregue ao cliente não tem folha de estilo, não tem contrato tipográfico, não tem gate e não tem dono nomeado neste repositório. `data/commercial/deliverables-registry.v1.json` registra **o que** é entregue; não registra **como se parece**.

**Declaração, porque a alternativa é fingir que não é assim:** redesenhar a vitrine e deixar o produto sem dono é escolha, e ela está sendo feita — por ora, deliberadamente. Consequência prática: a folha de impressão da §6 é hoje a única ponte entre o design público e o artefato que o cliente leva para a reunião, e ela cobre a página, não o relatório.

**Não é resolvível dentro de #494** — exige dono, repositório e job de negócio próprios. Fica registrado como custo aceito, com o mesmo peso das §6.2 do brief: um custo declarado, não um problema resolvido.

---

## 11. Contrato tipográfico

### 11.1 O que shippa hoje, medido

Zero `@font-face`. Zero arquivo de fonte. `docs/performance/PERFORMANCE-BUDGET-BASELINE.json` registra **261 rotas com 0 arquivo de fonte, 0,00 KB gzip e CLS máximo observado de 0,000**. O orçamento em `data/site/design-system.json` é `font_files_max: 0` e `font_total_gzip_kb_max: 0` — calibrado no zero de propósito, para que a primeira webfont apareça como delta revisado e não seja absorvida em silêncio. `cls_max` continua 0,05 e **isso não é folga a gastar**.

### 11.2 G4 — a pergunta mecânica, respondida

*A webfont entrega uma capacidade que a pilha de sistema não entrega?* Medido em Chrome headless sobre a pilha que os protótipos usam (`npm run design:probe`):

| Papel | Pilha | `measureText("111") == measureText("000")` | avanço `0` ÷ `O` |
|---|---|---|---|
| tese / interface | `system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif` | ✅ 30,539 = 30,539 | 0,808 |
| dado / identificador | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | ✅ 28,898 = 28,898 | 1,000 |
| leitura | `ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif` | ✅ 30,539 = 30,539 | 0,776 |
| condensada | `"Arial Narrow", "Liberation Sans Narrow", sans-serif` | — | **não resolve**: mede exatamente igual a uma família inexistente, isto é, cai no fallback |

**Resposta:** a pilha de sistema **já entrega figuras de largura idêntica nos três papéis medidos**, e distingue `0` de `O` por avanço em todos eles. A única capacidade que ela **não** entrega é uma **face condensada garantida** — nenhuma largura estreita resolve de forma portável. Portanto uma webfont proposta só por "tabulares" não se paga; uma webfont só se paga se a condensada for requisito de layout.

Nenhuma das duas candidatas propõe webfont, então **G4 passa nas duas com custo zero**, e o manifesto publicado com o candidato é: **0 arquivos, 0,00 KB gzip, delta de CLS 0,000**.

### 11.3 Especimen — os nove critérios de aprovação

Renderizado em `docs/design-audit/prototypes/{variante}/specimen/`, capturado nos cinco viewports do protocolo em full-page, JS-off e reduced-motion:

| # | Artefato | Critério | Situação |
|---|---|---|---|
| 1 | H1 real de money page em 390 / 768 / 1366 / 1440 | sem quebra órfã; altura de linha declarada (1,06) | ✅ |
| 2 | parágrafo de 68ch com diacríticos densos | `--read-measure:68ch` aplicado; face de leitura ≠ face de tese | ✅ |
| 3 | tabela de preço `R$` com milhar `.` e decimal `,` | avanço de dígito idêntico, medido em G4 | ✅ |
| 4 | coluna de percentual com sinal e casas | alinhamento decimal ao fim, sinal como caractere | ✅ |
| 5 | bloco de metadado: fonte, data de corte, versão, status | `--text-micro:.8rem` = 12,8 px, o piso declarado | ✅ |
| 6 | rótulo, erro e estado vazio de formulário | erro em 5,65:1, prefixo literal, `aria-invalid` | ✅ |
| 7 | o número dominante da página | portador não-cromático declarado em texto adjacente | ✅ |
| 8 | tudo repetido em cinza 100% | `filter:grayscale(1)`; a hierarquia sobrevive porque nenhum papel depende só de cor | ✅ |
| 9 | manifesto de arquivos | 0 WOFF2 · 0,00 KB gzip · delta de CLS 0,000 contra a pilha atual | ✅ |

### 11.4 Licenças verificadas em fonte primária — não material de divulgação

Nenhuma dessas famílias é adotada por esta issue. Elas ficam registradas porque a próxima tentativa vai começar por elas, e porque a v1 do anexo citou uma fundição que **não existe**.

**Método, 2026-08-30:** para cada família, `OFL.txt` e `METADATA.pb` baixados do repositório canônico `google/fonts` e o binário `.ttf` baixado e aberto com `fontTools` — tabelas `GSUB` (features), `OS/2` (`fsType`, `fsSelection` bit 7 = `USE_TYPO_METRICS`), `cmap` (cobertura) e `hmtx` (avanços). Nenhuma afirmação abaixo vem de memória, de site de fundição ou do material de divulgação. **Nenhum binário foi versionado neste repositório.**

| Família | Licença | `tnum` no binário | Dígitos uniformes por padrão | Variável / eixos | `fsType` | `USE_TYPO_METRICS` | Cobertura exigida |
|---|---|---|---|---|---|---|---|
| **Archivo** (Omnibus-Type, 🇦🇷) | OFL 1.1 | ✅ real — `tnum` remapeia para `.tf` a 579u | ❌ proporcional | ✅ `wght` 100–900, **`wdth` 62–125** | 0 | ligado | completa |
| **Chivo** (Omnibus-Type, 🇦🇷) | OFL 1.1 | ✅ | ✅ **tabular por padrão** | ✅ `wght` 100–900, sem eixo de largura | 0 | ligado | completa |
| **Chivo Mono** (Omnibus-Type, 🇦🇷) | OFL 1.1 | ✅ | ✅ **tabular por padrão** | ✅ `wght` 100–900 | 0 | ligado | completa |
| **Source Serif 4** (Adobe) | OFL 1.1 | ✅ | ✅ **tabular por padrão** | ✅ `wght` 200–900 + `opsz` 8–60 | 0 | ligado | completa |
| **Spectral** (Production Type) | OFL 1.1 | ✅ | ✅ | ❌ **não é variável** | 0 | ligado | completa |
| **Public Sans** (USWDS) | OFL 1.1 | ✅ | ❌ | ✅ `wght` 100–900, **mas `default` = 100** | 0 | ligado | completa |
| **IBM Plex Sans** | OFL 1.1 | ❌ **não existe `tnum`** | ✅ | ✅ `wght` 100–700, `wdth` 75–100 | 0 | **ligado** | completa |
| **IBM Plex Mono** | OFL 1.1 | ❌ **não existe `tnum`** | ✅ | ❌ estática | 0 | **ligado** | completa |
| **IBM Plex Sans Condensed** | OFL 1.1 | ❌ | — | ❌ estática | 0 | **desligado** | — |
| **IBM Plex Serif** | OFL 1.1 | ❌ | — | ❌ estática | 0 | **desligado** | — |
| **Gabarito** (Naipe, 🇧🇷) | OFL 1.1 | ✅ real — `.tf` a 540u | ❌ | ✅ `wght` 400–900 | 0 | ligado | completa |
| **Lusitana** (Ana Paula Megda, 🇧🇷) | OFL 1.1 | ❌ **sem tabela GSUB** | ❌ | ❌ estática, 2 pesos | 0 | desligado | ❌ **falta `‰`** |

**Confirmações e correções apuradas nesta verificação:**

- **IBM Plex não tem `tnum` em nenhum dos quatro arquivos inspecionados**, ao contrário do que a divulgação sugere. Confirmado independentemente.
- **A divergência de `USE_TYPO_METRICS` entre irmãs Plex é real e verificada:** ligado em Sans e Mono, **desligado** em Condensed e Serif, com `sTypoLineGap` de 300 no Condensed contra 0 no Serif. Isso é altura de linha inconsistente entre irmãs sem normalização explícita.
- **Correção ao brief:** o brief afirmava que a Plex Condensed é "estática, sem versão variável" e tratava a condensada como família à parte. Verdade para a Condensed — mas o **arquivo variável de IBM Plex Sans em `google/fonts` carrega um eixo `wdth` de 75 a 100**, isto é, alguma estreita já vive no mesmo arquivo. A afirmação do brief é imprecisa, não falsa.
- **Correção ao brief:** Source Serif 4 foi descrita como "tabular por padrão, **só lining**". O binário tem `lnum`, `tnum` **e `onum`**. Ter figuras de texto não a desqualifica; a descrição é que estava errada.
- **Confirmação:** o bug de name-table da Public Sans variável tem uma causa verificável no binário — o eixo `wght` tem mínimo **e padrão** iguais a 100, então a instância padrão é literalmente "Thin".
- **Confirmação:** Gabarito é de origem brasileira (Naipe Foundry — Leandro Assis, Álvaro Franca, Felipe Casaprima) e tem tabulares reais, **mas o Google Fonts a categoriza como `DISPLAY`**. Usá-la aqui contraria o propósito declarado dela.
- **Novo, não registrado no brief:** **Lusitana não cobre `‰`**, que está na lista de glifos obrigatórios. Além de não ter mecanismo de tabular, ela reprova por cobertura.
- **Todas as doze têm `fsType: 0`** — sem restrição de incorporação.
- **"Tipos do aCERVO" não existe.** Foi nome inventado por associação plausível na v1 do anexo. Registrado aqui para que não volte.
- **Rawline**, usada na identidade do governo federal, **não é de origem brasileira** — deriva da Raleway, por autores dos EUA, Argentina e Chile.
- **Omnibus-Type é argentina.** Latino-americana, não brasileira, e nenhuma superfície deve afirmar origem tipográfica brasileira.

**Lacuna honesta, declarada:** nacionalidade não é campo pesquisável nos metadados do Google Fonts; a varredura do brief foi por nome reconhecível e um designer brasileiro com nome não óbvio pode ter passado. É lacuna de método, não negativa confirmada.

**Restrição de custo:** somente ativos gratuitos com licença livre verificada — tipo, imagem, ícone, mapa base e dado. As fundições brasileiras verificadas (Blackletra, Plau, Naipe, Harbor Type, Outras Fontes) operam com licença web comercial e estão fora de escopo; a recomendação de Dorival UI da v1 fica revogada, e a identidade regional passa a ser carregada por conteúdo, formatação PT-BR, vocabulário de obra pública e fonte oficial brasileira — não por procedência de tipo.

**Orçamento que fica declarado para a próxima tentativa:** ≤6 arquivos WOFF2 subsetados, ≤90 KB gzip, manifesto publicado junto do candidato, self-host apenas, nenhuma fonte remota, nenhuma ampliação de CSP, `font-display` decidido por papel com CLS medido e fallback métrico (`size-adjust`, `ascent-override`) declarado. Adotar qualquer webfont exige **primeiro** subir `font_files_max` e `font_total_gzip_kb_max` em `data/site/design-system.json`, que é o delta revisado que o #508 desenhou.

---

## 12. Nenhuma candidata é classificável como cluster 1, 2 ou 3

Registrado por escrito, como o Anexo A.11 exige.

| Cluster | Assinatura | Por que nenhuma candidata cai nele |
|---|---|---|
| **1 — Editorial cream** | creme `#F4F1EA`, serif display de alto contraste, terracota | fundo é `--white`/`--soft`, valores que já shippam; a serifada é a **face de leitura**, nunca display; não há terracota nem valor novo além de `--caution-700` |
| **2 — Dark + acid** | fundo quase preto com acento verde-ácido | fundo claro nas duas variantes; `--lime` fica **proibido sobre fundo claro** pela §1.3 e restrito a painel de autoridade, que nenhum protótipo usa |
| **3 — Broadsheet hairline** | fios finos, radius zero, colunas de jornal, `01/02/03` | o radius dos tokens é preservado (`--radius-sm` em botão e campo); keyline só onde separa dois conteúdos que precisam ser distinguidos, nunca entre seções já separadas por espaço; **não há numeração ordinal** — a coluna numérica do mecanismo A carrega o **valor da afirmação** com sua unidade, e a taxonomia é por natureza (fato · cálculo · inferência · lacuna), não `01/02/03` |

---

## 13. Matriz `KEEP | REDUCE | REPLACE | REMOVE`

A Definition of Done pede a matriz. Ela é do **sistema existente**, apurada nesta comparação, e não autoriza execução — execução é de #493 e depende dos gatilhos da §9.2.

| Elemento | Situação apurada | Decisão | Dono / gatilho |
|---|---|---|---|
| `concept: "engenharia editorial premium"` | cravado em `test_design_gates.py:52` | **KEEP** | alterar exige ADR antes |
| Paleta atual (`--ink`, `--muted`, `--green-700`, navies, `--line`, `--white`, `--soft`) | shippa e mede | **KEEP** | — |
| `--caution-700:#8A5F00` | não existe | **ADD** (única adição, 5,65:1) | entra quando um papel de ressalva for implementado; hoje só vive no protótipo |
| `--lime` sobre navy (23 ocorrências) | 9,27–12,08:1 | **KEEP** | — |
| `--lime` em `.hero-eyebrow > span` | 1,48:1, ornamento | **REMOVE** | #493 ou issue de a11y |
| `--lime` em `.evidence-callout` | ~1,5:1, único diferenciador | **REPLACE** por `--caution-700` ou `--ink` | idem |
| `--focus-ring` | corrigido por #513, 13,48–19,11:1 | **KEEP** | nenhuma candidata pode regredi-lo |
| `--muted` sobre navy | 2,66–3,47:1 | **REMOVE** do vocabulário escuro | contrato da §5 |
| `.hero` / `.content-hero` / `.deliverables-hero` / `.article-hero` — quatro cópias da mesma receita em ~190 de 262 rotas | duplicação medida em #493 B.1 | **REDUCE** para uma receita | #493 |
| 155 rotas com `<main>` byte-idêntico | medido | **REDUCE** | #493; é o maior ganho estrutural disponível |
| `.criterion-card` — 545 instâncias, 49 páginas com exatamente quatro | é literalmente `forbidden_patterns.four_identical_cards_without_hierarchy` | **REDUCE** | #493; nenhum gate alcança hoje |
| `archetype_gated_surfaces` com 2 de 262 rotas | medido | **REPLACE** por cobertura derivada, no padrão de `test_copy_gates.py` | #493 |
| Zebra em tabela de dado | não especificada | **REMOVE** do vocabulário; keyline é a regra | §4 deste documento |
| Cards empilhados como transformação mobile de tabela | não especificada | **REMOVE**; scroll horizontal declarado | §4 |
| Hover lift | convenção não documentada, implementada como três `transform:none` de override | **REPLACE** por regra declarada + verificação por render | §2 |
| Mecanismo A — trilho de memória | mede, mas a margem não alcançou | **DEFER** — retorna com contrato `extra-cli` | §9.2 |
| Mecanismo B — estado de revisão | idem | **DEFER** | §9.2 |
| Mecanismo C — asserção citável | fora do par por quatro defeitos | **DEFER**, e a §5.3 da regra **não** o libera aqui | issue própria + re-registro |

---

## 14. O que este documento não autoriza

Redesign sitewide; big-bang; segunda constituição; segunda paleta; fonte remota; ampliação de CSP; ativo de terceiro versionado; ativo decorativo sem licença; alteração de conteúdo, URL, canonical, contrato de formulário ou runtime; enfraquecer gate sem ADR; authority de fato ou proveniência paralela ao `extra-cli`; e **qualquer afirmação sobre o que uma pessoa sente diante de uma composição** — percepção humana é #336 e só #336.
