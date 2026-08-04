# Changelog SEO, sprint 2026-07-30

## Dados

- Importado GSC `confenge.com.br-Performance-on-Search-2026-07-30.zip` → `seo/gsc-2026-07-30/`.
- Gerado `seo/priority-pages.json`.
- Classificação dos 120 guias → `seo/content-classification.json`.
- Relatório final → `seo/RELATORIO-FINAL-SEO-2026-07-30.md`.

## Técnico

- Redirects 301 de URLs fantasma (`netlify.toml`) + trailing slash nos pilares.
- `llms.txt` na raiz.
- Campo hidden `origem` no form de contato + prefill `?tema=` / `?origem=` em `script.js`.
- Link do form para `/privacidade/` (canônico).
- Componentes `.lead-inline`, `.lead-inline-soft`, `.compare-table`, `.button-secondary` em `styles.css`.
- Camada de eventos em `script.js` (`whatsapp_click`, `lead_form_*`, `content_to_service_click`, `qualified_scroll`, etc.) sem PII.
- Documentação analytics em `seo/ANALYTICS.md`.
- Validadores: `seo/scripts/validate_seo.py`, `seo/scripts/test_analytics_pii.mjs`.

## Bulk (120 artigos)

- Meta descriptions sem sufixo genérico idêntico.
- WhatsApp com mensagem contextual por tema.
- FAQ “ofício isolado” substituída por pergunta específica.
- Bloco de conversão mid-content (`lead-inline`) em todos os guias.
- Titles otimizados para top ~20 prioridades GSC.
- `content-lead` do hero reescrito.
- `article:modified_time` / `dateModified` → 2026-07-30 nas páginas tocadas.
- Remoção site-wide de boilerplate (“A resposta não é automática…”, “leitura conjunta…”, “causa, responsabilidade, impacto e valor”, “a análise deve analisar”).
- Respostas executivas reescritas nos guias que ainda abriam com template.

## Reescrita profunda (Tier S + GSC zero-click)

1. `sinapi-desonerado-nao-desonerado`, tabela, decisão, checklist, exemplo, CPRB, 3 CTAs, title SERP
2. `bdi-diferenciado-obra-publica`
3. `limite-aditivo-25-50-obra-publica`
4. `mobilizacao-desmobilizacao-orcamento-obra`
5. `atraso-pagamento-contrato-publico-suspender`
6. `demolicao-nao-prevista-obra-publica`
7. `administracao-local-orcamento-obra-publica`
8. `atraso-obra-culpa-administracao`
9. `aditivo-empreitada-por-preco-global`
10. `resposta-notificacao-atraso-obra-publica`
11. `data-base-orcamento-reajuste-obra-publica`
12. `medicao-por-evento-obra-publica`
13. `glosa-por-qualidade-obra-publica`
14. `atraso-na-medicao-obra-publica`

## Pilares

- Title/meta de `/aditivos-obras-publicas/` (query “aditivos obra pública”).
- Title/meta de `/auditoria-orcamento-licitacao/` (cluster SINAPI/BDI).

## Sitemap

- `lastmod` atualizado nas URLs prioritárias e pilares.

## Remediação anti-template (mesmo sprint)

- Removido mold “decisão correta depende / amarre fato…” introduzido na 1ª passagem bulk.
- Critérios, FAQs, leads, WA labels e JSON-LD spam corrigidos.
- Classificação honesta: 19 manter / 99 aprofundar / 2 consolidar.
- `validate_seo.py` passa a falhar em molds novos e classificação desonesta.
