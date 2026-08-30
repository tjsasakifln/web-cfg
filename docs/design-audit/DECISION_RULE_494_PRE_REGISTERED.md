# DECISION_RULE_494 — regra de decisão pré-registrada

**Status:** pré-registrada. Escrita **antes** de qualquer captura de variante.
**Data de registro:** 2026-08-30
**Issue:** #494 · **Parent:** #493 · **Material comparável:** `DESIGN_DIRECTION_BRIEF_2026-08-30.md` §11–§13

---

## 0. Por que este arquivo existe e por que a data importa

O §11 do brief exige uma regra de decisão pré-registrada e registra o motivo: sem ela, *"comparação cega"* se reduz a quem fala primeiro na sala. A v1 do anexo não tinha nenhuma.

Uma regra escrita depois de ver as capturas não é regra — é justificativa. Por isso este documento entra no repositório **antes** das pré-condições P1/P2 estarem satisfeitas e **antes** de existir qualquer variante para olhar. O commit que o introduz é a evidência da ordem.

**Emenda:** este documento pode ser alterado livremente **até** a primeira captura de variante ser commitada. Depois disso, qualquer alteração exige um commit próprio, datado, que declare o que mudou e por quê, e a decisão passa a ser registrada como `AMENDED_AFTER_CAPTURE` — que é um resultado mais fraco e deve ser evitado.

---

## 1. Quem decide

| Papel | Quem | Autoridade |
|---|---|---|
| **Barreira de elegibilidade** | CI | G1–G8 (§12.1 do brief). Mecânica, bloqueante, sem juízo humano. |
| **Escolha entre elegíveis** | **a regra da §4.3, auto-executável** | Aplica-se sozinha ao resultado medido. Não pode promover candidata reprovada em G1–G8. |
| **Execução** | design system / `web-cfg` | Implementa; não decide. |
| **Percepção humana** | **#336, exclusivamente** | Nenhum outro papel, documento ou agente pode afirmar o que uma pessoa sente. Substituto sintético é desqualificado. |

**Delegação registrada em 2026-08-30.** O founder / brand owner delegou a escolha e instruiu que o caminho recomendável seja adotado sem submeter a decisão de volta. A §4.3 já determinava o vencedor por medida, com margem e tolerâncias declaradas — o sign-off era carimbo sobre um cálculo. Portanto a decisão **não aguarda aprovação humana**: apurado o resultado, o desfecho da §4.4 é aplicado e registrado na §6.

Isto **não** afrouxa nada. As barreiras seguem eliminatórias, o empate segue resolvendo em `KEEP_CURRENT`, e a delegação não transfere para cá nenhuma autoridade sobre percepção — que continua sendo #336 e só #336. O founder mantém o direito de emendar esta regra pela cláusula de emenda da §0, isto é, **antes** da primeira captura.

O painel humano do §12.2 é **consultivo**: N≥3 revisores nomeados, divergência registrada, sem nota numérica. Ele não bloqueia merge e não entra no cálculo da §4. Sua ausência não adia a decisão.

---

## 2. Quando se decide

A decisão só pode ser tomada com as pré-condições satisfeitas — porque sem elas o custo é literalmente não mensurável (§10 do brief):

- **P1** — `CAPTURE_FULLPAGE`, `CAPTURE_JS=off`, `CAPTURE_MOTION=reduced` → issue **#507**
- **P2/P3** — `font_total_gzip_kb_max`, `font_files_max`, `cls_max`, medição por rota → issue **#508**
- **P4** — exclusão de `docs/design-audit/prototypes/**` do build → issue **#507**

**Gatilho:** a janela de decisão abre quando #507 e #508 estiverem em `main` e verdes. Não antes, por nenhum motivo de cronograma.

**Backstop:** se a janela não abrir até **2026-10-31**, a decisão é `KEEP_CURRENT` por decurso de prazo e #493 fecha como `SUPERSEDED`. Prazo vencido não vira aprovação silenciosa.

---

## 3. O que está sendo comparado

Direção única **Technical Editorial** — que é o `concept` já cravado em `test_design_gates.py:52` como `"engenharia editorial premium"`. Não há segunda constituição em disputa. O que se compara são **dois mecanismos**:

- **A — Trilho de memória:** a coluna numérica é o motor de layout; fonte, data de corte, artigo, unidade e versão na mesma linha de base. Sem dado, a afirmação **aparece incompleta**.
- **B — Estado de revisão:** página com data de corte vencida renderiza degradada e marcada, automaticamente. Sem data de corte, nasce marcada. Carimbo desenhado é **proibido**.

**C — Asserção citável** está fora do par por quatro defeitos independentes (§5 do brief) e retorna apenas pela cláusula §5.3 deste documento.

O vencedor entra como **sub-quadro nomeado** de "engenharia editorial premium", nunca como conceito substituto (§13 do brief). Alterar constante cravada em gate exige ADR **antes** da implementação.

---

## 4. A regra, com margem

### 4.1 Elegibilidade — eliminatória

Uma candidata que reprove em **qualquer** de G1–G8 está fora. Não há compensação entre barreiras: passar bem em G2 não compra uma reprovação em G6. G6 (piso funcional) inclui os nove alvos nomeados, não dois.

### 4.2 Medidas decisivas — só entre elegíveis

Três medidas, todas mecânicas, todas capturadas no mesmo conteúdo fixo e nos cinco viewports do §11:

| Medida | Definição operacional | Direção |
|---|---|---|
| **M1 — densidade de proveniência** | nº de campos de `{fonte, data de corte, unidade, responsável, versão}` que **desaparecem da árvore de acessibilidade** sob a ablação de G2 | maior é melhor |
| **M2 — proximidade da prova** | distância medida entre claim/preço e evidência, em dobras na definição de #327 | menor é melhor |
| **M3 — custo** | KB gzip de fonte + pior CLS por rota, contra o budget de #508 | menor é melhor |

### 4.3 Margem para declarar vencedor

Uma candidata vence se, e somente se:

1. ambas passaram G1–G8; **e**
2. vence **M1 por ≥ 2 campos**; **e**
3. **não perde** em M2 (tolerância: 0,25 dobra) nem em M3 (tolerância: 5 KB gzip **e** 0,01 CLS).

A margem de M1 é o critério dominante porque é a única das três que mede a hipótese em disputa — se a assinatura carrega informação que hoje não está na página, ou se é revestimento. M2 e M3 são guardas: impedem que uma candidata compre proveniência empurrando a prova para baixo ou estourando o custo.

**Qualquer resultado fora dessas três condições é empate.**

### 4.4 O que acontece em cada desfecho

| Desfecho | Resultado registrado | Consequência em #493 |
|---|---|---|
| Uma vence pela §4.3 | `SELECT_DIRECTION` | `SELECT_ONE_CANARY` — exatamente um canário, um movimento memorável |
| Empate (§4.3 não satisfeita) | **`KEEP_CURRENT`** | epic fecha ou é recaracterizada; **nenhum canário** |
| Ambas reprovam G1–G8 | **`KEEP_CURRENT`** | §5.3 abaixo |
| Ambas reprovam **por a mesma barreira** | `KEEP_CURRENT` | a barreira vira issue própria antes de qualquer nova tentativa |

**Empate default = `KEEP_CURRENT`.** Isto não é um resultado ruim: o brief é explícito em §15 de que manter o sistema atual é desfecho legítimo, e o kill criterion de #494 diz que se as candidatas não produzirem diferença material verificável, mantém-se o sistema atual.

---

## 5. Cláusulas de escape, fechadas

**5.1 — Sem terceira tentativa por insistência.** Reprovação em G1–G8 não se resolve reapresentando a mesma candidata com ajuste cosmético. Exige mudança de mecanismo declarada.

**5.2 — Conversão nunca é a variável.** A ação terminal e o par preço↔captura não são o acessório removido, não contam como a ousadia e não perdem peso relativo entre variante atual e candidata. `npm run inbound:gates` roda em toda variante, inclusive protótipo. A conversão é fail-closed por `AGENTS.md`.

**5.3 — Retorno de C.** O Mecanismo C só retorna se **ambas** A e B forem `KEEP_CURRENT` **e** o motivo registrado for ausência de diferença material — nunca por reprovação em barreira, porque C herdaria a mesma barreira. Retorno exige issue própria e re-registro desta regra.

**5.4 — Nenhuma afirmação de percepção.** Nenhum desfecho deste documento autoriza dizer que uma pessoa achou algo melhor, mais confiável ou menos genérico. Isso é #336 e só #336.

**5.5 — Ativos.** Somente ativos com licença livre verificada, conferidos em fonte primária. Nome, hex e capacidade tipográfica não entram em decisão sem inspeção de binário (§6.1 do brief já registra que **IBM Plex não tem `tnum` em nenhum arquivo**, ao contrário da divulgação, e que "Tipos do aCERVO" **não existe** — foi nome inventado por associação plausível na v1).

---

## 6. Registro do resultado

Quando a decisão for tomada, ela é acrescentada **abaixo desta linha, neste arquivo**, com SHA da baseline, SHA de cada variante, as três medidas por candidata, o desfecho e quem assinou. Não em outro documento, para que regra e resultado fiquem no mesmo diff auditável.

<!-- RESULTADO: ainda não decidido. Não preencher antes da janela do §2 abrir. -->

---

## 7. RESULTADO — apurado em 2026-08-30

**Desfecho: `KEEP_CURRENT`.** Empate pela §4.3. Nenhum canário em #493.

### 7.1 O que foi medido, e sobre o quê

| Item | Identidade |
|---|---|
| Baseline (main e produção) | `b396d1ab6f797e4b8e57801cc2c4dbcb306e62e5` |
| Conteúdo fixo | `docs/design-audit/prototypes/fixed-content.json`, sha256 `fcf60cfd021537d7…` |
| Variante A — trilho de memória | árvore `docs/design-audit/prototypes/a-trilho-de-memoria/`, sha256 concatenado `df2bfafba006d696…` |
| Variante B — estado de revisão | árvore `docs/design-audit/prototypes/b-estado-de-revisao/`, sha256 concatenado `e3d29d08da0f09fc…` |
| Casca comum às duas | `docs/design-audit/prototypes/base.css`, sha256 `1bf38ca62612297f…` |
| Evidência de barreira e medida | `docs/design-audit/evidence/direction-probe.json` |
| Evidência de paleta (G3) | `docs/design-audit/evidence/palette-g3.json` |
| Evidência de captura | `docs/design-audit/evidence/capture-index.json` — 55 PNGs, hash por arquivo, full-page · JS-off · reduced-motion, nos cinco viewports do §11 |

Três jobs, um exemplar cada, conteúdo fixo: comercial (espelha `/defesa-margem-contratos-publicos/`), leitura/evidência (`/conteudos/documentos-reequilibrio-obra-publica/`) e instrumento (`/ferramentas/limite-acrescimos-supressoes/`). Zero byte alterado em rota pública.

### 7.2 §4.1 — elegibilidade: as oito barreiras

| Barreira | A | B | Como foi medida |
|---|---|---|---|
| G1 slots de domínio | ✅ | ✅ | com todos os campos nulos a página **não** renderiza intacta (árvore de acessibilidade difere) e a primeira dobra carrega ≥3 slots obrigatórios no pior viewport |
| G2 ablação da assinatura | ✅ | ✅ | `[data-signature]{display:none}` muda o conjunto extraível nos três jobs |
| G3 separação de luminância | ✅ | ✅ | paleta única; nenhum par abaixo de 3:1 sem portador não-cromático declarado |
| G4 capacidade da webfont | ✅ | ✅ | nenhuma candidata propõe webfont: 0 arquivo, 0 KB, 0 regra `@font-face` |
| G5 proximidade da prova | ✅ | ✅ | pior distância claim↔evidência 0,240 dobra (A) e 0,215 dobra (B), contra o teto de 1 |
| G6 piso funcional | ✅ | ✅ | os nove alvos nomeados verdes no mesmo commit |
| G7 custo declarado | ✅ | ✅ | 0 arquivo e 0,00 KB gzip contra `font_files_max: 0` e `font_total_gzip_kb_max: 0`; CLS delta 0 contra a baseline de 0,000 em 261 rotas |
| G8 sem hover lift | ✅ | ✅ | hover renderizado, `getBoundingClientRect().top` relativo ao documento: 0,00 px nas duas |

Nenhuma reprovação. As duas candidatas são elegíveis, então a §4.3 se aplica.

### 7.3 §4.2 — as três medidas decisivas

| Medida | A — trilho | B — estado | Direção | Diferença |
|---|---|---|---|---|
| **M1** campos de proveniência que somem sob a ablação de G2 — pior job | **2** | 1 | maior é melhor | A + 1 |
| M1 por job (comercial · leitura · instrumento) | 2 · 3 · 3 | 1 · 1 · 1 | — | +1 · +2 · +2 |
| **M2** pior distância claim↔evidência, em dobras | 0,2403 | **0,2153** | menor é melhor | A − 0,025 |
| **M3** KB gzip de fonte · arquivos · pior CLS por rota | 0,00 · 0 · 0,000 | 0,00 · 0 · 0,000 | menor é melhor | empate exato |

### 7.4 §4.3 — a margem, aplicada

1. ambas passaram G1–G8 — **sim**;
2. vence M1 por ≥2 campos — **não**. A lidera M1, mas por 2 campos em dois jobs e por **1** no job comercial. A §4.1 proíbe compensação entre barreiras; o mesmo princípio, aplicado dentro de uma medida, exige que a margem se sustente em todo o conteúdo fixo do protocolo, não na média favorável. A margem que se sustenta nos três jobs é **1**;
3. não perde M2 nem M3 — **verdade** (A perde M2 por 0,025 dobra, dentro da tolerância de 0,25; M3 empata).

Falha a condição 2. Por definição da §4.3, **qualquer resultado fora das três condições é empate**.

**A escolha de agregação foi declarada antes de valer:** a regra pré-registrada não diz como somar M1 entre os três jobs, e essa lacuna decide o desfecho — pela média (2,67 × 1,00) ou pelo melhor job (3 × 1) a margem chegaria a ≥2. Uma regra silenciosa resolve pelo lado conservador, que é o mesmo lado do empate-default da §4.4 e da proibição de compensação da §4.1, e não pelo lado que fabrica um vencedor. As três agregações estão registradas acima para que a escolha seja auditável em vez de invisível.

### 7.5 §4.4 — desfecho e consequência

| Campo | Valor |
|---|---|
| Desfecho | **`KEEP_CURRENT`** |
| Consequência em #493 | **nenhum canário**; a epic fecha ou é recaracterizada |
| Mecanismo C | **não retorna**. A §5.3 só o libera se ambas forem `KEEP_CURRENT` por ausência de diferença material. Aqui houve diferença medida (A lidera M1 em todos os jobs); ela apenas não alcançou a margem. Reabrir C exige issue própria e re-registro |
| Quem assinou | a própria **§4.3, auto-executável**, sobre os números da §7.3, pela delegação registrada na §1 em 2026-08-30. Nenhuma pessoa arbitrou, e nada aqui afirma percepção humana — isso é #336 e só #336 |
| Emenda pós-captura | nenhuma. Esta regra não foi alterada depois da primeira captura; o desfecho **não** é `AMENDED_AFTER_CAPTURE` |

### 7.6 O que o empate não significa

Não significa que os mecanismos sejam equivalentes. Significa que a diferença medida não alcançou a margem pré-registrada, e a margem existe justamente para impedir que uma diferença de um campo compre um redesign. O que a medição deixa estabelecido, e que vale para qualquer tentativa futura:

- **A assinatura de A carrega informação.** Sob a ablação, o trilho leva embora fonte, data de corte e unidade em dois dos três jobs — não é revestimento.
- **A assinatura de B carrega menos, por definição própria.** O §5 do brief atribui a B frescor, versão e responsável; responsável e versão continuam legíveis na linha de autoria, que é comum às duas variantes, então só a data de corte desaparece. B não foi prejudicado por implementação: foi medido no que declara carregar.
- **O custo das duas é o mesmo e é zero**, porque nenhuma propõe webfont. A comparação não foi decidida por performance.
- **A conversão não foi variável em nenhum momento**: a subárvore de preço, ação terminal e captura é byte-idêntica entre A e B, e isso é asserção de teste, não promessa.

### 7.7 Correções de rigor apuradas nesta medição

Duas afirmações do material comparável não sobrevivem à conferência com a aritmética que o próprio repositório usa (`_contrast_ratio` em `scripts/site/test_design_gates.py`):

| Afirmação no brief §4 / Anexo A.3 | Medido aqui | Consequência |
|---|---|---|
| `--caution-700:#8A5F00` dá **5,26:1** sobre branco | **5,65:1** | a adição continua válida e com mais folga do que o brief anunciava |
| `#9A6B00` dá **4,37:1** e **reprova em AA** | **4,69:1**, que **passa** em AA | o motivo para não ressuscitar `#9A6B00` não é AA. É que dois âmbares a 0,5:1 de distância são a mesma cor com dois nomes, e o valor mais escuro guarda folga contra `--soft` e contra a folha de impressão |

Registrado aqui, e não em outro documento, porque a §5.5 exige que hex e capacidade tipográfica só entrem em decisão depois de conferidos em fonte primária — e essa regra vale contra o próprio brief.
