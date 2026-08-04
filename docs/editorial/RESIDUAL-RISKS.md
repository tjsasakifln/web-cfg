# Riscos residuais explícitos (não surpresa na medição)

Atualizado com a remoção site-wide de travessão (U+2014 → vírgula; vazio → `n/d`).

## Aceitos / abertos (não esconder)

| ID | Risco | Impacto na medição | Mitigação / próximo passo humano |
|----|--------|-------------------|----------------------------------|
| R1 | **Wave1 permanece `noindex`** até aprovação humana nomeada (`approve_cli` + hash). | Páginas Wave1 **não** entram em GSC/indexação orgânica. Qualquer lead vindo delas é bônus, não prova de SEO. | Humano externo revisa `/ops/wave1-review.html` e aprova página a página. **Proibido** auto-approve / Tiago impersonado. |
| R2 | **GSC credentials ausentes** no ambiente de sync (`BLOCKED_MISSING_CREDENTIAL` quando aplicável). | Insights/agenda GSC **não** são live; relatórios internos podem estar stale. | Provisionar credencial real; não inventar impressões/cliques. |
| R3 | **Receita / conversão UNPROVEN** no sentido causal. | Form LIVE e probe sintético **não** contam como lead comercial. | Funil ops só com leads reais; probe rotulado e descartado. |
| R4 | **Canibalização Wave1** com peers `/conteudos/*` ainda em revisão. | Indexar cedo pode diluir queries entre URLs. | Humano escolhe canônica **antes** de `index,follow`. |
| R5 | **`jur-sumula-260-art` REJECTED** até dossiê completo. | URL existe em preview/noindex; não é ativo indexável. | Não aprovar; completar dossiê ou manter rejeitada. |
| R6 | **Cache CDN de `styles.css`** (max-age ~1d). | Visitante pode ver CSS antigo (hero 2 colunas, tipografia legada) por até TTL após deploy. | Hard-refresh / query bust se medição visual for no dia do deploy; validar SHA de `/styles.css` pós-publicação. |
| R7 | **En-dash (U+2013) em faixas numéricas** (ex.: P25–P75) mantido de propósito. | Não é travessão; gate cobre U+2014. | Não tratar en-dash de intervalo como defeito de copy. |
| R8 | **HTML estático de inteligência/radar** pode precisar rebuild pSEO se snapshot mudar. | Copy regenerada usa `n/d` e vírgula nos geradores; HTML já commitado foi normalizado nesta rodada. | Rodar `build:site` / pipeline pSEO em mudanças de dados. |
| R9 | **UI/UX “primoroso” além de travessão** (ritmo editorial, contraste, checklist) depende do CSS completo em produção. | Se CSS truncado/cacheado, medição Playwright diverge do repo. | Confirmar `article-hero` + `editorial-cta` no CSS servido; re-medir após cache frio. |
| R10 | **Ops interno** (`/ops/*`) é ferramenta humana, não superfície comercial. | Não entra em SEO; copy/UI de review pode evoluir à parte. | Gate de travessão em HTML público **exclui** `ops/` de propósito. |

## O que esta rodada **não** afirma

- Não afirma aumento de ranking, CTR ou receita.
- Não afirma Wave1 aprovada ou indexável.
- Não afirma que todo visitante já recebe o CSS novo (ver R6).
- Não substitui revisão humana de conteúdo jurídico/editorial.

## Gate de regressão

- `scripts/site/test_copy_gates.py::test_no_emdash_sitewide_public_html` — HTML/XML/txt públicos sem U+2014.
- Comercial: assert de travessão em páginas de oferta.
- Vazio de dados em radar/tools: `n/d` (não travessão, não `", "`).
