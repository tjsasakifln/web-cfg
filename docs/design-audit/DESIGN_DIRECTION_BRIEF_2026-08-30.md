# DESIGN_DIRECTION_BRIEF_2026-08-30 — substância de direção para #494

**Campanha:** `WEB_CFG_HUMAN_CRAFTED_DESIGN_BACKLOG_20260829`
**Baseline:** `origin/main@b4cafc4fe0a005c3769a7b6acde882ff1f9d65d8` · live `7500d7bdeb325f9f72e38b72e7fd6bb6db29f680`
**Revisão:** v2, após red-team adversarial. A v1 foi reprovada pelo próprio critério que propunha; as correções estão marcadas.
**Status:** material de comparação **pré-decisão**. Não é design system, não é segunda constituição, não altera token, HTML, CSS ou rota pública.
**Consome:** [CONFENGE_DESIGN_READ](CONFENGE_DESIGN_READ_2026-08-29.md), [DESIGN_AUDIT_ANTI_GENERIC](DESIGN_AUDIT_ANTI_GENERIC_2026-08-29.md), [pesquisa externa](../research/DESIGN_RESEARCH_HUMAN_CRAFTED_2026-08-29.md).
**Alimenta:** #494 (decisão) → #493 (canário e ratchet).

---

## 0. Como ler este documento

A v1 propunha três direções com paletas próprias e uma rubrica de doze itens. O red-team mediu e derrubou:

- os três papéis estavam a **ΔE 1.14–1.88** entre si — abaixo do limiar perceptível; em comparação cega eram o mesmo fundo;
- o "ocre" de uma direção (matiz 42.1°) e o "âmbar" de outra (41.7°) eram **a mesma cor com dois nomes**;
- as três cores semânticas — decisão, ressalva, neutro — ficam entre **1.11 e 1.31 de contraste em cinza**, ou seja, **as três direções reprovavam no teste de impressão P&B que o próprio brief exigia**, e violavam WCAG 2.2 1.4.1;
- sete dos doze itens da rubrica mediam percepção, exatamente o que o brief proibia duas seções adiante.

A v2 abandona a ficção de três paletas. **Há uma paleta, derivada dos tokens que já existem, e três mecanismos concorrentes.** A comparação passa a medir uma variável de cada vez.

---

## 1. O risco que a auditoria não cobre

A auditoria diagnosticou corretamente system sans universal, `.content-hero` compartilhado, cardification, acabamento por radius/shadow/gradient e motion ritual. Mas a remediação implícita — fios de cabelo, radius zero, tabelas densas, serif de contraste, off-white — **é um preset**, e é o terceiro dos três agrupamentos em que o design gerado por IA se concentra hoje:

| Cluster | Assinatura | Risco para a CONFENGE |
|---|---|---|
| 1 — Editorial cream | fundo creme ~`#F4F1EA`, serif display de alto contraste, acento terracota | é para onde "publicação técnica" cai por gravidade |
| 2 — Dark + acid | fundo quase preto, um acento verde-ácido | **`--lime:#ced62a` sobre `--navy-950` já é vizinho deste cluster**, com 16 call sites vivos em `styles.css` |
| 3 — Broadsheet hairline | fios finos, radius zero, colunas de jornal, numeração `01/02/03` | **é para onde a remediação da auditoria aponta** |

Isto não é opinião externa: a pesquisa interna do repositório já registrou que "serif + mono + off-white + fios finos + `01/02/03` + grade assimétrica" **já é um novo default**, observado como padrão rejeitado em praticamente todas as skills anti-genéricas que ela auditou.

**Restrição:** nenhum candidato pode ser classificável como cluster 1, 2 ou 3. Trocar um default por outro é regressão com aparência de progresso.

O que separa direção de preset é **derivação**: cada decisão vem de um artefato real do ofício e carrega informação. E o que separa uma direção *copiável* de uma *incopiável* não é a forma — é o **mecanismo**. Um concorrente copia um trilho lateral em uma tarde; ele não copia um trilho que quebra visivelmente quando o dado não existe.

---

## 2. O brief, em uma frase

Uma casa técnica brasileira que lê edital, contrato e planilha e devolve uma decisão defensável — e cuja superfície pública **prova** essa capacidade antes de afirmá-la.

**Job do visitante:** decidir, em minutos, se esta casa sustenta tecnicamente uma posição que vale margem, caixa ou a obra.
**Perceptual leverage:** o visitante é competente e cético. Não é persuadido por acabamento; é persuadido por **rastreabilidade** — fonte, data de corte, unidade, método, limite, responsável.

Corolário: a matéria visual dominante é a **evidência**. Se a evidência não puder ser mostrada, a seção mostra o **método**. Se nem o método puder ser mostrado, a seção não existe.

---

## 3. Patamar de referência: o que transfere de Big Four / Fortune 500

A pesquisa interna dos 12 sites (McKinsey, BCG, Bain, Oliver Wyman; Arup, AECOM, WSP, Mott MacDonald; OECD, World Bank, Reuters Graphics, Our World in Data) mostra que o patamar delas **não vem de acabamento** — vem de disciplina editorial. Isso transfere integralmente. O que não transfere é escala.

**Transfere — e vira requisito:**

| Técnica observada | Origem | Aplicação CONFENGE |
|---|---|---|
| A home/hub se comporta como **publicação**, não grade de serviços: um item lidera, os demais têm pesos e formatos diferentes por importância | McKinsey, BCG | a tese domina; o resto se subordina |
| **Métrica nunca solta** — o número vem soldado a um caso nomeado ou a uma definição | Bain, WSP | nenhum número público sem fonte, data de corte, unidade e significado; o oposto do "big number + label" |
| **Numeração é taxonomia**, não ornamento: itens numerados *por tipo* (`Analysis`/`Trends`/`Insight`) | Oliver Wyman | numerar por natureza (fato, cálculo, inferência, lacuna, ação); `01/02/03` decorativo proibido |
| **Tipos e filtros precedem o feed**; data, autor, tipo e versão são primeira classe | OECD, World Bank | catálogo 8/54 e inteligência pública ganham eixo de tipo/estado antes da listagem |
| **A forma do gráfico segue a pergunta** — mapa, cronologia, diagrama — em vez de um shell reutilizado | Reuters Graphics | cada evidência escolhe sua forma |
| **Fonte, atualização, método, limitação e licença adjacentes ao dado**, não em rodapé | Our World in Data | estende ao site o que o Radar já faz bem |
| Identidade carregada por **projeto real, nome e contexto**, não por chrome de UI | Arup, Mott MacDonald | tira o site do estado UI-only |
| **Densidade varia por tarefa**: pausa na tese, compactação na comparação, abertura no CTA | transversal | base das duas marchas |

**Não transfere — imitar seria mentira detectável:** escala global, mapa de escritórios, parede de logos de cliente, fotografia institucional de alto orçamento como ocupação de hero, claim de porte, paleta e voz de consultoria global genérica, prova de cliente não autorizada (#328 é o único portão).

Um comprador cético compara a CONFENGE com quem ele já contratou. Sinal de porte emprestado produz incongruência, e incongruência lê como risco.

**A vantagem assimétrica:** McKinsey e BCG publicam tese sem memória de cálculo. A CONFENGE pode publicar o cálculo. Nenhuma consultoria global expõe planilha, artigo de lei, data de corte e limite na mesma dobra do claim. Esse é o único vetor em que uma casa pequena **supera** — não apenas alcança — o patamar Fortune 500. **Critério de desempate entre candidatos: vence quem expõe mais evidência verificável, não quem mais se parece com o benchmark.**

---

## 4. Uma paleta, expressa como diff dos tokens

`styles-tokens.css:3` diz, literalmente: *"Do not invent a second palette."* A v1 inventou oito valores. A v2 não inventa paleta: declara **reuso, adição justificada e depreciação**, com contraste medido em coluna obrigatória.

**Reuso (sem alteração):**

| Token | Valor | Papel | Contraste |
|---|---|---|---|
| `--ink` | `#071a31` | texto e regra estrutural | — |
| `--muted` | `#5d6a7a` | anotação, unidade, fonte | — |
| `--green-700` | `#2d6f2d` | **sinal de decisão**, nunca decoração | 6.13:1 sobre branco |
| `--navy-900` / `--navy-950` / `--navy-800` | `#061a33` / `#031020` / `#0a294b` | superfície de autoridade, uso raro | — |
| `--line` | `#dce3e8` | keyline funcional | — |
| `--white` / `--soft` | `#fff` / `#f3f4f5` | fundo editorial e respiro | — |

**Adição — no máximo uma, e só se justificada:** falta um sinal de **ressalva/lacuna** (limite, pendência, dado ausente, prazo). Hoje ele não existe e é o vocabulário mais característico da CONFENGE.

| Proposta | Valor | Sobre | Contraste | Nota |
|---|---|---|---|---|
| `--caution-700` | `#8A5F00` | `#fff` | **5.26:1** ✅ AA | âmbar escuro; a v1 propunha `#9A6B00`, que dá **4.37:1** e **reprova** |

**Nenhuma adição pode ter ΔE < 3 de um token existente.** A v1 propunha `#F5F6F5` como "papel", a ΔE 1.21 de `--soft:#f3f4f5` — reinventava um token que já shippa.

**`--lime:#ced62a` exige decisão explícita.** São 16 call sites em `styles.css` e uma regra declarada em `design-system.json` (`lime_accent`: acento raro em painel escuro). É também o que aproxima o site do cluster 2. A decisão é `keep | restrict | deprecate`, com os 16 call sites nomeados como superfície de migração. Não decidir é depreciar em silêncio, e §10 não autoriza isso.

### 4.1 Regra dura: cor nunca é o único portador

Medido nos tokens atuais, em escala de cinza:

| Par | Contraste em cinza |
|---|---|
| decisão `#2d6f2d` × ressalva `#8A5F00` | ~1.2 |
| decisão `#2d6f2d` × `--muted` | **1.11** |

Ou seja: **GO, RESSALVA e metadado neutro são o mesmo cinza.** Impressos em 100% — e a ferramenta do art. 125 já oferece print/download — o sinal de decisão desaparece. É também falha direta de WCAG 2.2 **1.4.1 Use of Color**.

**Requisito:** todo papel semântico declara um **portador não-cromático** — glifo, posição em coluna fixa, peso tipográfico ou a palavra literal. E a restrição computável: *dois valores que carregam significados diferentes diferem em ≥3:1 de luminância relativa **ou** nunca aparecem como único diferenciador.* Isso é script de 20 linhas e a matemática já existe em `scripts/site/test_design_gates.py` (`_contrast_ratio`, ~L1004).

### 4.2 Defeito ao vivo, herdado, que nenhuma direção corrige

`--focus-ring:0 0 0 3px rgba(45,111,45,.35)` composto sobre branco resulta em `#b6cdb6` = **1.69:1**. WCAG 2.2 **1.4.11** exige 3:1 para indicador não-textual. **Isto está em produção hoje**, em todas as rotas, e piora sobre qualquer papel mais claro. Não é criado por este brief e não deve ser corrigido dentro dele — deve virar issue própria de acessibilidade, com prioridade acima de qualquer trabalho de direção visual. Nenhuma candidata pode herdar o anel atual sem correção.

---

## 5. Três mecanismos, não três fantasias

A v1 propunha três "direções" que eram três documentos com o mesmo papel e as mesmas cores. A v2 mantém a linguagem **Technical Editorial** como direção única — ela já é o `concept` cravado no gate — e compara **três mecanismos de assinatura**. Um mecanismo é um comportamento do sistema, não um enfeite: ele exige dado, quebra sem dado, e por isso não é copiável por quem não tem o dado.

Cada mecanismo declara: derivação, o que ele exibe, o que acontece quando falta dado, forma mobile, e por que não é template.

### Mecanismo A — TRILHO DE MEMÓRIA (a coluna numérica é o motor de layout)

**Derivação:** a planilha de medição e a memória de cálculo.

**O que é:** não é uma barra lateral com fontes. É a **grade de base da página derivada do dado**: a coluna numérica define o ritmo vertical e a prosa se alinha a ela. Cada afirmação da página tem, na mesma linha de base, sua fonte, data de corte, artigo, unidade e versão.

**Comportamento sem dado:** o trilho é renderizado a partir de contrato `extra-cli` SELECT-only. Afirmação sem proveniência **aparece visivelmente incompleta** — não é escondida, é marcada. A página não pode ser autorada à mão com o trilho preenchido.

**Mobile:** o trilho colapsa em nota ancorada por afirmação, acessível pelo mesmo âncora — não vira rodapé.

**Por que não é template:** um concorrente copia um rail em uma tarde; ele não copia um rail que exige um pipeline de proveniência para renderizar. É o mecanismo com maior distância de imitação e o único cuja assinatura **não existe** em `section_archetypes` hoje.

**Risco:** vira cluster 3 se degenerar em fio vertical decorativo sem dado. Mitigação: o trilho não renderiza se o contrato não responder.

### Mecanismo B — ESTADO DE REVISÃO (o site envelhece à vista)

**Derivação:** o carimbo da prancha — responsável técnico, revisão, data, status. **Mas o carimbo desenhado fica proibido:** o bloco de título é o significante central da caricatura CAD, e banir azul de blueprint mantendo o carimbo é banir o acessório e manter o clichê.

**O que é:** responsabilidade **comportamental**. O estado de revisão governa a renderização: uma página cuja data de corte venceu renderiza degradada e marcada, automaticamente, sem intervenção editorial. Frescor, versão e responsável deixam de ser texto e viram estado.

**Comportamento sem dado:** página sem data de corte declarada **não pode entrar** no estado válido; ela nasce marcada.

**Mobile:** a marca de estado é persistente e não depende de hover nem de posição.

**Por que não é template:** exige pipeline de frescor. "Este site mostra quando está velho" é uma promessa que nenhum concorrente faz, porque quase nenhum consegue sustentar. E responde diretamente ao ceticismo do ICP: quem marca o próprio conteúdo como vencido não está vendendo.

**Risco:** vira ornamento se o estado for texto estático. Mitigação: o estado é derivado, nunca digitado.

### Mecanismo C — ASSERÇÃO CITÁVEL

**Derivação:** os autos de um pleito. **Mas a cronologia fica proibida como assinatura:** `journey_rail`, `tension_sequence` e `trace_matrix` já existem em `section_archetypes`, a auditoria já marcou as quatro sequências numeradas como `REDUCE`, e timeline datada é a seção B2B mais templatizada que existe. Uma assinatura que já shippa e já foi condenada não é assinatura.

**O que é:** o que os autos têm de genuinamente incomum não é a cronologia — é a **citabilidade**. Asserções numeradas, permanentemente endereçáveis, que um leitor pode citar numa disputa real: identificador estável, âncora permanente, afordância de copiar a citação com fonte e data.

**Comportamento sem dado:** asserção sem fonte não recebe identificador e, portanto, não é citável — a ausência é visível.

**Mobile:** a afordância de citação é toque de 44 px, não hover.

**Por que não é template:** uma clínica ou um SaaS não tem o que citar. Passa por construção o teste de transplante de setor.

**Risco:** vira ID decorativo se o identificador não for estável entre versões. Mitigação: identificador versionado e testado.

### Par recomendado: **A × B**

A v1 recomendava B × C. Com C reprovado por quatro defeitos independentes — assinatura já implementada, já auditada como excesso, componente de estoque e adjacência admitida ao cluster 1 — a recomendação muda.

**A × B** é o par de maior discriminação: ambos exigem pipeline, mas testam hipóteses opostas sobre a origem da confiança — **rastreabilidade do dado** (A) contra **responsabilidade sobre o tempo** (B). E ambos falham de forma visível se o pipeline não existir, o que torna a comparação honesta sobre custo. C permanece registrado como terceira opção e pode voltar se o par vencedor não produzir diferença material.

---

## 6. Contrato tipográfico

Hoje há **zero `@font-face`** no site. A pilha segura é racional para performance e privacidade, mas não tem opinião, e hierarquia por tamanho + bold + tracking negativo é a assinatura mais comum da web gerada. Trocar por "uma fonte bonita" não resolve.

**Cobertura obrigatória:** diacríticos PT-BR completos; **figuras tabulares lining** de largura idêntica em todos os pesos usados; alinhamento decimal em coluna de preço; `R$ % ‰ ± × – º ª § m² m³`; `1`/`l`/`I` distinguíveis em corpo de tabela.

Sobre "zero cortado": nenhuma das candidatas usuais entrega zero cortado fora do estilo mono, e "distinção clara de `O`" é prosa não mensurável. **Substituído por:** exigir figuras tabulares e testar a razão de avanço entre `0` e `O` renderizados; é isso que evita confusão em coluna de preço.

**Formatação PT-BR, que é contrato de conteúdo e não propriedade da fonte:** milhar `.`, decimal `,`. É o que de fato quebra alinhamento decimal em coluna de preço brasileira, e precisa estar afirmado no specimen.

### 6.1 Candidatas verificadas (inspeção de binário, não material de marketing)

Verificado em GSUB/cmap/hmtx e nos arquivos de licença canônicos, 2026-08-30. **Nenhuma escolha está feita** — isto substitui a lista de "candidatas a avaliar" da v1, que continha um nome inexistente.

| Família | Licença | Tabular | Condensada / Mono irmãs | Ressalva verificada |
|---|---|---|---|---|
| **IBM Plex** (Sans/Cond/Mono/Serif) | OFL 1.1 | uniforme por padrão — **não existe `tnum` em nenhum binário Plex**, ao contrário do que o material de divulgação sugere | sim, ambas | **`USE_TYPO_METRICS` ligado em Sans/Mono e desligado em Condensed/Serif** → altura de linha inconsistente entre irmãs sem normalização; Condensed é estática, sem versão variável |
| **Archivo** | OFL 1.1 | proporcional por padrão, `tnum` real | sub-famílias de largura reais **+ eixo variável `wdth` 62–125** | peso 600 servido pelo Google Fonts sai em itálico (bug de distribuição, não do repositório) |
| **Chivo** | OFL 1.1 | **tabular por padrão** | **Chivo Mono** é irmã real e licenciada à parte; **sem eixo de largura** | Chivo Mono perde alinhamento fixo no par "fi" |
| **Public Sans** | OFL 1.1 | proporcional, `tnum` real | nenhuma | bug de name-table na variável (toda instância lê "Thin"); cadência de manutenção baixa |
| **Source Serif 4** | OFL 1.1 | **tabular por padrão**, só lining | nenhuma | variável `wght` + `opsz`; artefato relatado em alguns rasterizadores PDF, causa indeterminada |
| **Spectral** | OFL 1.1 | **tabular por padrão** | SC (versaletes) | **não é variável** — 14 arquivos estáticos, caro contra um teto de 6 |
| **Literata** | OFL 1.1 | proporcional, `tnum` | nenhuma | dois arquivos variáveis separados (roman/itálico); métricas com forks de correção para e-ink |
| **Newsreader** | OFL 1.1 | tabular por padrão | nenhuma | GF sobrescreve o `opsz` padrão da fonte (16 contra 18 do próprio arquivo) |

**Consequência aritmética para o Mecanismo B:** ele pedia grotesca + condensada + leitura + mono. Com Plex isso são quatro famílias e ainda esbarra na divergência de `USE_TYPO_METRICS` entre as irmãs. Com **Archivo** o eixo `wdth` entrega tese e condensada **no mesmo arquivo variável**, o que fecha o orçamento de 6 arquivos. É a diferença entre B ser implementável e não ser.

### 6.2 Restrição de custo: somente ativos gratuitos

**Decisão do fundador, 2026-08-30: somente ativos gratuitos serão utilizados.** Isso é uma restrição dura de aquisição, não uma preferência estética, e ela reordena a §6.1.

**Consequência imediata:** as fundições brasileiras verificadas — Blackletra (Elza, Dorival UI), Plau (Matria, Compasso), Naipe, Harbor Type, Outras Fontes — operam com licença web comercial e **saem do escopo**. Com elas sai o caminho mais direto para tornar "reconhecível como brasileira" uma decisão tipográfica em vez de uma afirmação. Registrar isso como custo aceito, não como problema resolvido.

**O que sobra, e é suficiente:** todas as candidatas da §6.1 são **OFL 1.1**, self-hostáveis, sem CDN e sem ampliação de CSP. A escolha passa a ser feita por capacidade técnica medida, não por origem.

| Papel | Recomendada | Por quê |
|---|---|---|
| Tese + interface + condensada | **Archivo** (OFL, Omnibus-Type) | eixo variável `wdth` 62–125 entrega tese e condensada **no mesmo arquivo**, o que fecha o orçamento de 6 arquivos e **é a diferença entre o Mecanismo B ser implementável e não ser**; `tnum` real |
| Leitura longa | **Source Serif 4** (OFL, Adobe) | tabular por padrão, variável `wght` + `opsz`; sem irmã condensada ou mono, o que é irrelevante se Archivo cobre esses papéis |
| Dado / identificador | **Chivo Mono** (OFL, Omnibus-Type) | irmã real e licenciada à parte, tabular por padrão; usar **só** em identificador, nunca como textura |

**Precisão de origem, para não trocar uma afirmação vazia por outra:** Archivo e Chivo são da **Omnibus-Type, fundição argentina**. Isso é latino-americano, não brasileiro, e não deve ser apresentado como se fosse. Se a identidade regional continuar sendo objetivo, ela precisa ser carregada por conteúdo, formatação PT-BR, vocabulário de obra pública e fonte oficial brasileira — que é onde a CONFENGE já é forte — e não por procedência de tipo.

**Verificado, e a resposta é não.** Varredura dos 504 diretórios de designer do repositório `google/fonts` por vínculo brasileiro, seguida de inspeção de binário (GSUB, hmtx, cmap) das candidatas encontradas:

| Família | Origem brasileira | Tabulares (verificado no binário) | Veredicto |
|---|---|---|---|
| **Gabarito** (Naipe + Leandro Assis, Álvaro Franca, Felipe Casaprima) | confirmada — README da fundição: "Out of Rio de Janeiro" | **sim, real** — `tnum` remapeia os 10 dígitos para glifos `.tf` de 540u | **reprova por intenção declarada:** o Google Fonts a categoriza como *Display* e tanto a fundição quanto o Google a descrevem como "geométrica bem-humorada", feita para plataforma de cursinho. Usá-la aqui contraria o propósito declarado dela, não só o tom |
| **Fraunces** (co-desenho de Flavia Zimbardi, carioca) | mista — comissionada pelo Google, co-desenhada com fundição norte-americana | **não** — GSUB tem só `case, liga, rvrn, ss01`; nenhum `tnum`/`lnum`/`onum` | reprova nos dois critérios; é uma display serif deliberadamente "wonky" |
| **Lusitana** (Ana Paula Megda, Joinville) | confirmada | **não** — sem tabela GSUB alguma | serifada editorial sóbria e plausível, mas sem qualquer mecanismo de tabular e só 2 pesos |

**Conclusão registrada:** não existe hoje família brasileira, livre, sóbria **e** com tabulares reais. É custo aceito da restrição de gratuidade, não lacuna a ser preenchida com candidata fraca.

**Ruled out explicitamente, para evitar a armadilha de associação:** **Rawline**, usada na identidade do governo federal brasileiro, **não é de origem brasileira** — é derivada da Raleway, por Matt McInerney (EUA), Pablo Impallari (Argentina) e Rodrigo Fuenzalida (Chile). Adoção por instituição brasileira não é autoria brasileira.

**Lacuna honesta:** nacionalidade não é campo pesquisável nos metadados do Google Fonts, então a varredura foi por nome reconhecível. Um designer brasileiro com nome não óbvio pode ter passado despercebido. É lacuna real, não negativa confirmada.

**Extensão da restrição a todo ativo:** imagem, ícone, mapa base, dado e tipo seguem a mesma regra — licença livre verificada e registrada, ou não entra. Isso reforça §8: nenhum ativo decorativo sem licença, e o mapa de editais por UF de §8.1 usa fonte pública (PNCP) via contrato `extra-cli`, sem base cartográfica proprietária.

**Papéis (4):** tese · leitura em 68ch · interface/dado com tabular · nota/fonte/legenda ≥12,8px. Leitura não pode ser a mesma face da tese em corpo menor; mono não pode ser textura.

**Orçamento — em arquivos e KB, não em famílias.** A v1 fixava "≤3 famílias e ≤6 WOFF2" e a aritmética não fechava: um mecanismo que precise de grotesca + condensada + face de leitura + mono são quatro famílias, e condensada shippa como família distinta, não como eixo de largura. Além disso, 6 arquivos para 3 famílias dá 2 pesos cada, incompatível com "tabular em todos os pesos usados" mais peso alto de tese.

**Orçamento correto:** `≤6 arquivos WOFF2 subsetados` e `≤90 KB gzip no total`, com **manifesto publicado junto do candidato** — família, peso, estilo, subset, KB. O candidato cabe ou é desqualificado por evidência, não por contagem arbitrária de famílias.

**Licenciamento e carregamento:** self-host apenas; nenhuma fonte remota; nenhuma ampliação de CSP; licença verificada e registrada por família antes de citar; `font-display` decidido por papel com CLS medido; fallback métrico (`size-adjust`, `ascent-override`) declarado.

**Contradição da v1, corrigida:** a v1 exigia fallback métrico que "não desloque layout" e, na rubrica, reprovava a candidata se voltar para system sans "não mudasse a percepção". Um fallback bem ajustado é exatamente aquele cuja reversão não move o layout — a v1 premiava o que proibia. **Substituído por uma pergunta mecânica:** *a webfont entrega uma capacidade que a pilha de sistema não entrega?* Dois testes em página headless: (a) `ctx.measureText("111").width === ctx.measureText("000").width` (tabular presente?); (b) razão de largura da condensada contra a sans. Se a pilha de sistema já satisfaz todos os papéis declarados, a webfont não se pagou.

**Specimen obrigatório por candidata, com critério de aprovação** — a v1 pedia oito artefatos e nenhum limiar, o que produz galeria, não decisão:

| # | Artefato | Critério |
|---|---|---|
| 1 | H1 real de money page em 390 / 768 / 1366 / 1440 | sem quebra órfã; altura de linha declarada |
| 2 | parágrafo de 68ch com diacríticos densos | razão x-height/cap-height medida a 16px |
| 3 | tabela de preço `R$` com milhar `.` e decimal `,` | avanço de dígito idêntico, medido |
| 4 | coluna de percentual com sinal e casas | alinhamento decimal verificado |
| 5 | bloco de metadado: fonte, data de corte, versão, status | ≥12,8px |
| 6 | rótulo, erro e estado vazio de formulário | contraste AA medido |
| 7 | o número dominante da página | portador não-cromático declarado |
| 8 | tudo repetido em cinza 100% | hierarquia preservada, verificada por luminância |
| 9 | manifesto de arquivos | ≤6 WOFF2, ≤90 KB gzip, CLS delta contra a pilha atual |

---

## 7. Gramática de composição

- **Keyline não é decoração.** Uma regra só existe se separar dois conteúdos que precisam ser distinguidos. Fio entre seções já separadas por espaço é ornamento — e é a marca do cluster 3.
- **Um movimento ousado por página.** Exatamente um elemento memorável — o mecanismo escolhido. Tudo em volta fica quieto. Antes de aprovar, remova um acessório.
- **A ação terminal e o par preço↔captura nunca são o acessório removido, nunca contam como a ousadia, e nunca perdem peso relativo entre a variante atual e a candidata.** `npm run inbound:gates` roda em toda variante, inclusive protótipo. A conversão é fail-closed por `AGENTS.md`, e a auditoria já registrou que nenhuma direção de arte pode reduzir CTA, captura, compreensão ou alcance mobile.
- **A alternativa ao card não é card sem borda** — é outra estrutura: coluna numérica, tabela, matriz, trilho, índice. As quatro perguntas de `DESIGN-SYSTEM.md` continuam valendo.
- **Densidade por marcha declarada.** A transição expressiva→produtiva muda grade, corpo e ritmo vertical; não é gradual.
- **Mobile reeditado.** Tabela de comparação vira comparação par-a-par ou tabela com scroll declarado — nunca cards empilhados que destroem a comparação. **Cada mecanismo declara sua forma mobile** (§5).
- **Motion.** Só feedback, estado, navegação e continuidade espacial. Proibidos: hover lift, reveal-on-scroll ritual, contador animado, parallax. `prefers-reduced-motion` sempre.

### 7.1 O que a v1 não especificou e um diretor de B2B premium não assina sem

Estas seções são **obrigatórias no entregável de #494**, não opcionais:

1. **Estados de interação** — foco, hover, ativo, desabilitado, erro, carregando, vazio, selecionado. Para um site cujo momento de dinheiro é um formulário. Inclui a correção do anel de foco (§4.2).
2. **Especificação de formulário** — campo, rótulo, ajuda, validação, erro inline, posição do Turnstile, estado de envio, estado de sucesso. É a superfície comercial do negócio.
3. **Especificação de tabela de dados** — regra de coluna, classes de alinhamento, comportamento de cabeçalho, zebra × keyline, cabeçalho fixo, transformação mobile. Os três mecanismos apostam identidade em figuras tabulares e a v1 dava uma frase.
4. **Contrato de superfície escura** — não há regra `prefers-color-scheme` no CSS hoje; há valores de autoridade escuros; falta contraste de texto sobre escuro e o destino do `--lime`, o único acento desenhado para painel escuro.
5. **Folha de impressão** — o brief testa impressão (§9) e não projeta para ela, apesar de a ferramenta já oferecer print/download.
6. **Zoom 400% e refluxo (WCAG 1.4.10)** para as assinaturas — trilho lateral persistente e marca de estado ancorada são ambos riscos de refluxo e têm consequência de ordem de leitura para leitor de tela.
7. **Consequência sobre ativos de marca** — logo, favicon e `og:image` sobre fundo não-branco.
8. **Modelo de custo de autoria** — todos os mecanismos exigem que cada seção carregue fonte, data de corte, versão e responsável. Sem inventário de campos, contrato de dado e fluxo de autoria, não há resposta para "quem preenche isso na página 200". **É a razão pela qual direções assim morrem no terceiro mês**, e é o único custo que a v1 não precificou — enquanto a campanha pergunta se 100 repetições melhoram o sistema.
9. **Superfície entregável** — para uma consultoria, o artefato que o cliente recebe (relatório, memória de cálculo, PDF) *é* o design. Redesenhar a vitrine e deixar o produto sem dono é escolha, e precisa ser declarada como tal.

---

## 8. Imagery e artefatos

Todo artefato publicado declara `purpose`, `provenance`, `license`, `freshness`, `redaction`, `alt` informacional e `revocation`.

**Cerca dura:** este contrato cobre **metadado de ativo de mídia** — licença, corte, alt, redação. Ele **não** afirma proveniência nem frescor de *fato público*: `extra-cli` é o dono de aquisição, fatos canônicos, identidade e proveniência por `ADR-STRAT-002`, e o web-cfg consome contratos SELECT-only versionados. Criar authority paralela aqui cruza boundary e exige ADR antes.

**`revocation` precisa de mecanismo, não de campo.** Um campo que descreve um processo de retirada não é uma retirada. Ou existe um manifesto e uma checagem de build que remove o ativo — no padrão que `public-family-registry.json` já usa para rotas — ou o campo é documentação e deve ser chamado assim.

### 8.1 Exemplo trabalhado — abrangência nacional

A questão surge naturalmente: como mostrar alcance nacional sem parede de logos de cliente, que #328 não autoriza? A tentação é um carrossel de bandeiras das 27 unidades federativas. Ela falha em três frentes e serve de caso didático:

1. **Viola budget declarado.** `design-system.json → performance_budget` traz `no_carousel_video_webgl_lottie`. Carrossel está proibido por contrato vigente.
2. **É parede de logos com menos força.** Logo de cliente afirma "estes pagaram". Bandeira de estado afirma "este estado existe". O comprador decodifica de imediato, e o elemento some no teste informacional acima.
3. **O claim precisa ser verdadeiro.** "Atendemos todos os estados" é prova de cliente e passa por #328. Se o sentido é capacidade jurisdicional, o portador correto não é imagem: é o fato de a Lei 14.133 ser federal e de o registro profissional ter validade nacional definida — verificável, sem ilustração.

**A forma honesta é mais forte porque é mais difícil de copiar:** um mapa ou tabela de **editais de obra pública monitorados por UF**, com valor, órgão, data de corte e fonte PNCP. Entrega abrangência nacional como produto, não como enfeite; prova o alcance da inteligência, que é real e autorizada, em vez do alcance da carteira, que não é; e é o Mecanismo A em uso — artefato renderizado de contrato `extra-cli` que quebra visivelmente sem dado. Uma bandeira se copia com um `<img>`; um mapa de editais por UF com data de corte exige o pipeline inteiro.

**Teste informacional:** remova o artefato; se o visitante não perde entendimento, rastreabilidade ou contexto, era decoração.

**Proibidos:** stock de trabalhador com tablet, aperto de mão, skyline, dashboard fictício, blueprint decorativo, screenshot de software inexistente, gráfico sem fonte.

---

## 9. Copy é material de design

- Adjetivo sem número é ruído; toda afirmação carrega fonte, data e limite, ou é rebaixada a hipótese explícita.
- Voz ativa e **verbo estável**: o botão diz `Analisar meu caso`, a confirmação diz `Análise solicitada`.
- Nomear pelo que a pessoa controla, não pela implementação.
- Erro dirige e não se desculpa; estado vazio é convite à ação.
- Cada elemento faz um trabalho: rótulo rotula, exemplo demonstra, nota limita.
- Registro: frase curta, caixa de sentença, sem preâmbulo nem entusiasmo.

**Cercas:** não toca rótulo nem IA de navegação — congelado até #183→#336; não fabrica nem sugere prova de cliente — #328 é o único portão. Escopo é o tratamento tipográfico e compositivo da copy existente, não reescrita de mensagem.

---

## 10. Pré-condições — o que precisa existir antes de #494 decidir

A v1 especificou verificações que este repositório **não consegue executar**. São pré-condições, não subprodutos:

| # | Lacuna verificada | Precisa | Onde |
|---|---|---|---|
| P1 | `capture_screenshots.mjs:107` é `fullPage:false` cravado; sem `setJavaScriptEnabled`, sem emulação de `prefers-reduced-motion` | chaves `CAPTURE_FULLPAGE`, `CAPTURE_JS=off`, `CAPTURE_MOTION=reduced` | `scripts/site/capture_screenshots.mjs` |
| P2 | `performance_budget` tem só CSS/JS gzip; **sem budget de fonte, de asset, de CLS e sem medição por rota** | `font_total_gzip_kb_max`, `font_files_max`, `cls_max`, medição por rota | `data/site/design-system.json` + `scripts/site/audit_performance.py` |
| P3 | sem isso, os ≤6 WOFF2 do §6 são **invisíveis** para `npm run audit:performance` | idem P2 | — |
| P4 | protótipos "em local versionado" podem vazar para `_site` via `build:site` | caminho nomeado `docs/design-audit/prototypes/**`, exclusão no build e teste de que `_site` não o contém | `scripts/pseo/build_site.py` |

Sem P1 e P2, a decisão de #494 é tomada com o custo não mensurável.

---

## 11. Protocolo de comparação

- **Conteúdo fixo** nas variantes: mesmo texto, mesmos dados, mesmas fontes. Qualquer diferença de copy invalida a comparação.
- **Três jobs, um exemplar cada:** comercial (`/` ou money page) · leitura/evidência (`/conteudos/documentos-reequilibrio-obra-publica/`) · instrumento (`/ferramentas/limite-acrescimos-supressoes/`).
- **Viewports:** `390×844`, `768×1024`, `1366×768`, `1363×936`, `1440×1000`. Os dois de laptop são obrigatórios porque `tests/commercial/test_first_fold_contract.mjs` (L162–165) crava exatamente `390x844`, `1366x768` e `1363x936` — a v1 listava `1024×768` e **nenhum** dos dois laptops, caindo no buraco que o próprio `capture_screenshots.mjs` documenta em comentário.
- **JS-on e JS-off**, full-page e primeira dobra separadas — depende de P1.
- **Isolamento:** sem rota indexável, sem fonte remota, sem alteração de CSP, sem asset de terceiro versionado; caminho de protótipo excluído do build (P4).
- **Ordem cega:** variantes apresentadas sem rótulo de origem e em ordem sorteada. **Isto é revisão adversarial interna do founder/brand owner sobre composições — não é pesquisa com pessoas.** Toda validação com sujeito humano pertence exclusivamente a #336, que proíbe segunda amostra de recrutamento e desqualifica substituto sintético.
- **Baseline durável:** recapturar com SHA, data, hash por arquivo e manifesto legível, fora de `/tmp`.
- **Regra de decisão pré-registrada** — a v1 não tinha nenhuma, o que reduz comparação cega a quem fala primeiro na sala. Antes de capturar: quem decide, em que data, com que margem, o que acontece se ambos falharem na barreira, e o que acontece em empate. Empate default = `KEEP_CURRENT`.

---

## 12. Verificação: duas tabelas, duas autoridades

A v1 tinha uma rubrica de doze itens que afirmava "nenhum item mede gosto" e listava sete itens que mediam apenas gosto — e transformava percepção em critério de elegibilidade, que é o score estético que o próprio brief proibia. A v2 separa por autoridade.

### 12.1 Barreira mecânica — bloqueia, roda em CI

| # | Teste | Como | Reprova se |
|---|---|---|---|
| G1 | **Slots obrigatórios de domínio** | renderizar o template com os campos de domínio (`fonte`, `data de corte`, `artigo`, `unidade`, `responsável/CREA`, `protocolo`) nulos | a página renderiza intacta, ou a primeira dobra tem menos de 2 slots obrigatórios. *Substitui o "transplante de setor" da v1, que exigiria autorar nove conjuntos de conteúdo alternativo para produzir uma opinião.* |
| G2 | **Ablação da assinatura** | injetar `[data-signature]{display:none}` e diferenciar o **texto da árvore de acessibilidade** | o conjunto de `{fonte, data de corte, unidade, responsável, versão}` extraível não muda — logo a assinatura era decoração. ~30 linhas sobre o harness Puppeteer existente |
| G3 | **Separação de luminância** | matemática sobre a paleta declarada | dois valores com significados diferentes ficam abaixo de 3:1 de luminância **e** não declaram portador não-cromático (§4.1) |
| G4 | **Capacidade da webfont** | `measureText("111") == measureText("000")` e razão de largura da condensada | a pilha de sistema já satisfaz todos os papéis declarados — a webfont não se pagou |
| G5 | **Proximidade da prova** | distância medida entre claim/preço e evidência | > uma dobra, na definição de dobra do #327 |
| G6 | **Piso funcional** | `test:design`, `test:visual-structure`, `test:copy`, `test:ui`, `audit:axe`, `inbound:gates`, `test:lighthouse-gates`, `test:csp-*`, `test:first-fold-contract` | qualquer um vermelho. *A v1 nomeava dois de nove, o que convida a pular os outros sete* |
| G7 | **Custo declarado** | manifesto de fonte, CLS, KB por rota contra budget | budget ausente (bloqueado por P2) ou excedido |
| G8 | **Sem hover lift** | hover renderizado com diff de `getBoundingClientRect().top` | qualquer deslocamento. *Estático não serve: 5 regras existentes já são neutralizadas por override posterior; a verificação precisa ser da cascata resolvida ou do render* |

### 12.2 Painel humano — consultivo, não bloqueia, registrado

N≥3 revisores nomeados, divergência registrada, **sem nota numérica** e sem afirmação de percepção de usuário:

1. Contrafactual sem marca: removidos logo, nome e copy neutra, sobra sinal de engenharia, contrato público, dado ou cálculo?
2. É classificável como cluster 1, 2 ou 3 (§1)?
3. A composição parece específica ao conteúdo, ou é esqueleto reaproveitável?
4. Existe uma decisão tipográfica clara, ou só tamanho e peso?
5. Há ritmo, ou componentes empilhados?
6. Há um único elemento memorável, ou vários competindo?

Esta lista **substitui** o bloco de oito perguntas replicado nos rascunhos de issue. Ela não converte gosto em nota, não bloqueia merge e não afirma o que uma pessoa sente — percepção humana é exclusividade de #336.

---

## 13. Onde o vencedor é incorporado

`scripts/site/test_design_gates.py:52` crava `concept == "engenharia editorial premium"`, e as linhas 76–81 cravam `--navy-950:#031020`, `--green-700:#2d6f2d`, `--text-micro:.8rem`, `--text-body-mobile:1rem`.

Portanto: **o mecanismo vencedor entra como sub-quadro nomeado de "engenharia editorial premium", não como conceito substituto.** Alterar qualquer constante cravada em gate exige ADR antes da implementação, porque `docs/DESIGN-SYSTEM.md` declara que os gates são lei e não podem ser enfraquecidos sem ADR.

---

## 14. O terreno real que o canário vai encontrar

Levantado no código, não estimado — serve para dimensionar #493 e evitar promessa de escala:

- **`.content-hero` em 189 arquivos; `.article-hero` em 167; 158 carregam as duas classes no mesmo elemento.** `.hero`, `.content-hero` e `.deliverables-hero` são três cópias da mesma receita (gradiente branco→menta + `border-bottom` + blob radial verde fora de tela); `.article-hero` é a quarta, que depois se achata para `background:#fff`. O visitante vê a mesma faixa em ~190 de 262 rotas.
- **155 rotas com esqueleto de `<main>` byte-idêntico** (`breadcrumbs` → `content-hero article-hero` → `article-layout`). Três rotas de `analises-contratos-publicos/` têm **17 `<section class="section">` consecutivas**.
- **`.criterion-card`: 545 instâncias em 138 páginas**, 49 delas com exatamente 4 — que é literalmente o `forbidden_patterns.four_identical_cards_without_hierarchy`. Nenhum gate alcança.
- **O gate de arquétipo e de esqueleto funciona e roda em 2 de 262 rotas**, porque `archetype_gated_surfaces` é uma lista literal de dois itens. Estender a cobertura é o maior ganho estrutural disponível — e a cohorte de 155 rotas reprovaria imediatamente.
- **`.related-card` é definida três vezes em nível raiz** com geometrias contraditórias; só a última shippa. As duas primeiras são mortas-por-cascata, que nenhuma auditoria de uso detecta.
- **CSS morto:** `entregas/catalog.css` e `diagnostico-pre-licitacao/products.css` não têm `<link>` em lugar nenhum. `styles.css` tem 52 seletores de classe sem uso em HTML; `entregas/styles.css`, 47. Vários são **fixados no lugar por gates** que asseguram presença de CSS que nada usa.
- **`styles.css` tem 122 `border-radius` e 73 `box-shadow` cravados**, contra 3 raios e 1 sombra em token — os tokens de geometria são, na prática, decorativos.

**Consequência para #493:** o canário não é "aplicar a direção a uma página". É provar um mecanismo em uma superfície e deixar a próxima herdável. Qualquer plano que ignore a cohorte de 155 rotas está prometendo escala que o terreno não dá.

---

## 15. O que este brief não autoriza

Redesign sitewide; big-bang; framework novo; marca ou logo novos; segunda constituição visual; segunda paleta; copiar identidade de terceiro; fonte remota; ampliação de CSP; asset decorativo sem licença; case, número ou dado inventado; score estético em gate; percepção humana afirmada fora de #336; authority de fato/proveniência paralela ao `extra-cli`; alteração de conteúdo, URL, canonical, contrato de formulário ou runtime; enfraquecer gate sem ADR; reabrir #497–#502 fora dos triggers objetivos.
