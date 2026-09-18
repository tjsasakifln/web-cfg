# G06 — desempenho (diagnóstico, produção main 252fc98d1, 2026-09-18)

- `lighthouse-prod-252fc98d1-baseline.json` + `baseline-run.log`: `lighthouse_edge.mjs --runs 5`, rotas `/`, `/quantitativos-orcamento-obras/`, `/servicos/` (mobile, simulate, cache frio).
- `lhr-<rota>.json`: LHR completo, 1 execução, `throttlingMethod: devtools` (trace e métrica coincidem).
- `lhr-<rota>-simulate.json`: LHR completo, 1 execução, `throttlingMethod: simulate` (mesmo método da baseline; fases do trace são sem throttling de rede).
- `lhr_full.mjs`: script usado para gerar os LHR. `lcp-extract.json`: extrato (elemento LCP, fases, render-blocking, font-display, árvore de dependências, 10 primeiros requests).
- Versões: lighthouse 13.4.1; Chrome for Testing 151.0.7922.34; Node v22.23.2.
- Nenhum arquivo do site foi alterado; nenhum formulário enviado.
