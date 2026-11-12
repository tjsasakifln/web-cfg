# Delta de fontes: projetos residenciais

Em 12/11/2026, três páginas passaram a integrar o censo de fontes:

- `/projetos-prontos/`
- `/projetos-prontos/condicoes/`
- `/projetos-prontos/pedidos/`

O medidor existente, `scripts/site/audit_performance.py`, encontra em cada
rota o mesmo arquivo `/assets/archivo-var-latin-b19be0f7.woff2`, já usado
pelo site. O censo permanece em um arquivo único, 41,25 KB gzip por rota
e 41,25 KB no total de fontes únicas. Os limites continuam em um arquivo
e 60 KB gzip por rota. Não houve inclusão ou duplicação de arquivo de fonte.

A atualização de `PERFORMANCE-BUDGET-BASELINE.json` foi limitada ao objeto
`fonts`, produzido pela função existente `build_baseline()`. As duas listas,
`routes_with_font_files` e `routes_with_font_face_rules`, ganharam exatamente
as três rotas acima; nenhuma rota saiu e os demais valores desse objeto
permaneceram iguais.

A evidência histórica de CLS, o orçamento e o snapshot informacional de
ativos foram preservados. Esta atualização não representa uma nova medição
de CLS ou Lighthouse nas páginas residenciais. A conferência de navegador
e os testes de desempenho do artefato publicado pertencem ao CI da PR #832.

O comando de atualização integral continua sendo
`npm run audit:performance -- --write-baseline`. Para este delta de cobertura,
a atualização parcial evita substituir evidência histórica que não foi
remedida nesta tarefa.
