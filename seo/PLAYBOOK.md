# Playbook SEO inbound — CONFENGE

Rotina para transformar impressões do Google Search Console em cliques e leads.

## Baseline (export 2026-07-30)

| Métrica | Valor |
|--------|-------|
| Cliques (3 meses) | ~10 |
| Impressões | ~325 |
| Página #1 | `/conteudos/sinapi-desonerado-nao-desonerado/` (88 imp, 0 cliques) |
| Form lead | homepage `#contato` + campo `origem` |
| WhatsApp | contextual por artigo |

## Quinzenal (30 min)

1. Exportar GSC (Consultas + Páginas) e salvar em `seo/gsc-AAAA-MM-DD/`.
2. Listar páginas com **pos. 4–15**, **imp. ≥ 10**, **CTR &lt; 5%** → reescrever title/meta.
3. Listar queries com impressão e página pos. &gt; 20 → reforçar conteúdo ou internal link.
4. Verificar se URLs fantasma (`/servicos`, `/vision`, etc.) caíram após redirects 301.
5. Conferir leads Netlify Forms: filtrar por `origem` (path do artigo).

## Mensal

1. Atualizar 2–3 artigos Tier S/A com dados novos (ex.: data-base SINAPI).
2. Adicionar 1 conteúdo só se houver query GSC sem página adequada.
3. Revisar pilares com maior tráfego (hoje: orçamento/SINAPI e aditivos).

## Conversão

| Canal | Como medir |
|-------|------------|
| Form Netlify | campo `origem` + `mensagem` com tema |
| WhatsApp | mensagem pré-preenchida com tema do artigo |
| Analytics | ver `seo/ANALYTICS.md` (configurar ID) |

## Deploy

1. Publicar pelo caminho de produção do RUNTIME-AUTHORITY: `main` → artefato do `site-ci` → `netcup-release.yml`.
2. GSC → Sitemaps → `https://confenge.com.br/sitemap.xml`.
3. Solicitar indexação das 5 URLs reescritas (Tier S).
4. Remover sitemaps antigos com erro, se houver.

## Não fazer

- Reescrever 120 artigos de uma vez sem dados GSC.
- Criar conteúdo sobre temas do site antigo (AVCB etc.).
- Inventar jurisprudência ou percentuais legais sem base.
