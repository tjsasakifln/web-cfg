# Falhas encontradas (antes da remediação)

1. **Travessões e copy de IA** em leads/CTAs/ferramentas (`diligência eterna`, `ordem de ataque`, `resultado acionável`, `agrega valor`).
2. **`guia-*` ⇒ checklist** automático em `render.py` — guias operacionais viravam checkboxes sem semântica.
3. **CSS inline + azul `#0b5fff`** copiado em cada ferramenta; hub sem estilos de card.
4. **Hub marcado como `WebApplication`** única; sem entrada de nav.
5. **Limite**: valor default fictício; `num()` virava 0 silenciosamente; resultado misturado; “OK” como validade.
6. **Reequilíbrio**: score = proporção de checks; urgência/impacto sem efeito real de bloqueio.
7. **Matriz**: veredito por contagem de causas (adm > cont ⇒ verde).
8. **Aditivo**: só checkbox binário; bloqueadores aumentavam progresso; CTAs triplicados.
9. **A11y (pós-implementação, corrigido)**: selects sem nome acessível; progressbar sem `aria-label`; inputs dinâmicos da matriz sem `for`/`id`.

## Skeptic re-open (post main 194996e0)

Fixed:
1. Limite secondary money fields no longer use `||0` after invalid parse; values kept + field errors.
2. Versioned localStorage (schema+TTL) on limite, reequilibrio, matriz via `tool-persist` + `saveState/loadState/clearState`.
3. Hub cards now list audience, dados, resultado type, limitações.
4. Matriz: duração, observação, concorrência UI; full per-event docs/nexo/crítico/concorrência in result.
5. Reequilibrio radio groups wrapped in fieldset/legend.
6. Unit tests: pack/unpack/TTL/schema, reeq N/A, concurrent matrix, report text.
7. E2E: invalid money, persist→reload, erase, copy/download buttons + professional result text, print btn, fieldsets, matriz fields.
8. Before screenshots: honest unavailability note under `evidence/screenshots/before/README.md`.
