# Changelog SEO — sprint 2026-07-30

## Dados

- Importado GSC `confenge.com.br-Performance-on-Search-2026-07-30.zip` → `seo/gsc-2026-07-30/`.
- Gerado `seo/priority-pages.json`.

## Técnico

- Redirects 301 de URLs fantasma (`netlify.toml`).
- `llms.txt` na raiz.
- Campo hidden `origem` no form de contato + prefill `?tema=` / `?origem=` em `script.js`.
- Componentes `.lead-inline` e `.button-secondary` em `styles.css`.
- Documentação analytics em `seo/ANALYTICS.md`.

## Bulk (120 artigos)

- Meta descriptions sem sufixo genérico idêntico.
- WhatsApp com mensagem contextual por tema.
- FAQ “ofício isolado” substituída por pergunta específica.
- Bloco de conversão mid-content (`lead-inline`) em todos os guias.
- Titles otimizados para top ~20 prioridades GSC.
- `content-lead` do hero reescrito.
- `article:modified_time` / `dateModified` → 2026-07-30 nas páginas tocadas.

## Reescrita profunda (Tier S)

1. `sinapi-desonerado-nao-desonerado` (88 imp, 0 cliques)
2. `bdi-diferenciado-obra-publica`
3. `limite-aditivo-25-50-obra-publica`
4. `mobilizacao-desmobilizacao-orcamento-obra`
5. `atraso-pagamento-contrato-publico-suspender`

## Pilares

- Title/meta de `/aditivos-obras-publicas/` (query “aditivos obra pública”).
- Title/meta de `/auditoria-orcamento-licitacao/` (cluster SINAPI/BDI).

## Sitemap

- `lastmod` atualizado nas URLs prioritárias e pilares.
