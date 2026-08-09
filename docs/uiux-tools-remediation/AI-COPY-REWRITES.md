# Frases reescritas (aparência de IA / travessão)

| Antes | Depois |
|-------|--------|
| Pedido incompleto vira diligência eterna. Este checklist é o mínimo para não perder a fila nem a prova. | Pedido incompleto gera diligência prolongada e atraso no protocolo. Use este checklist para reunir o mínimo documental antes de protocolar. |
| O que faltar vira risco explícito — não surpresa na medição. | Marque cada requisito e revise as pendências antes de protocolar o pedido. |
| resultado acionável | resultado útil no navegador |
| ordem de ataque | ordem recomendada de correção |
| engenharia + prova | documentação técnica e prova contemporânea |
| execução sem papel | execução sem formalização |
| Análise inicial — … | Análise inicial: … |
| Quando a CONFENGE agrega valor | Removido; CTA contextual após resultado |
| Score alto ≠ direito (tom de aforismo repetido) | Prontidão documental + ressalva única no resultado |

Travessões restantes apenas em **títulos de fontes oficiais** (Planalto/AGU/TCU/CAIXA) no bloco Fontes: citação externa, não prosa CONFENGE.

## Extensão pública (radar, conteúdos, inteligência, pilares)

Utilitário: `scripts/site/scrub_em_dashes.py` (`npm run scrub:em-dashes` / `scrub:em-dashes:check`).

| Antes | Depois |
|-------|--------|
| operação — não para o mercado | operação, não para o mercado |
| empresa — capacidade, acervo… — para | empresa (capacidade, acervo…) para |
| Delimite o problema — valor… — antes | Delimite o problema (valor…) antes |
| próximos passos — sem cadastro | próximos passos, sem cadastro |
| CONFENGE — Conteúdos | CONFENGE · Conteúdos |
| Edificações públicas — PR | Edificações públicas (PR) |
| Placeholder de dado `—` | `n/d` |

Geradores alinhados: `scripts/pseo/build.py`, `scripts/pseo/render.py`, `scripts/site/inbound_first_remediate.py`.
