# Limitações e recomendações futuras

## Limitações que permanecem
- Wave 1 editorial continua `noindex` até aprovação humana nomeada (governança intocada).
- Travessões em títulos de fontes oficiais no HTML gerado (dados do SOURCE-MANIFEST).
- Checklist estruturado exige JS para interação; corpo markdown permanece legível sem JS.
- Persistência só em `localStorage` (sem backend — deliberado).
- Playwright package não é dependência do projeto; E2E usa puppeteer-core + Chrome do sistema (script `test:tools-uiux-e2e`).

## Fora do escopo / próximo
- Scaffold de nova ferramenta 100% por JSON de config.
- Passada literária em todos os 120+ HTML de `/conteudos/`.
- Sumário sticky com IntersectionObserver em todas as páginas longas de lei.
- PDF server-side (hoje: print do navegador + `.txt`).
