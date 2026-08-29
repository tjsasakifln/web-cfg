# Inventário de URLs legadas

Fonte canônica machine-readable: `data/organic/legacy-url-inventory.json`  
Redirects: `_redirects`

## Regra

- Equivalente semântico real → **301**
- Removido sem equivalente → **410/404**
- Nunca redirecionar tópico removido para a home “para preservar SEO”

## Itens (resumo)

| Legacy | Ação | Destino |
|--------|------|---------|
| `http://confenge.com.br/` | host HTTPS canônico | `https://confenge.com.br/` |
| `/blog` | 301 | `/conteudos/` |
| `/trabalhe-conosco` | 410 | `/404.html` (sem página de carreiras; não é contato comercial) |
| `/avcb`, `/avcbclcb`, `/vision`, `/nexgen` | 410 | `/404.html` |
| `/contato`, `/servicos` | 301 | âncoras da home |
| `/sobre` | 301 | `/especialista/tiago-jun-sasaki/` |
| `/lei-14133-obras/limite-25-50-aditivo-obra/` | 301! | `/conteudos/limite-aditivo-25-50-obra-publica/` |
| `/conteudos/limite-aditivo-25-50-obra-publica/` | manter | self-canonical owner da consulta geral 25%/50% |
| `/conteudos/desconto-da-proposta-em-item-novo-aditivo/` | 301! | `/lei-14133-obras/preco-item-novo-desconto-proposta/` |

## Sinais GSC residuais

Impressões em `/blog`, `/trabalhe-conosco`, host `http://` e query `avcb` são **esperadas** por um tempo após cutover. Não provam falha de indexação se o destino canônico responde 200 e o legado não está no sitemap.
