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
