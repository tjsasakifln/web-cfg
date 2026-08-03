# Limpeza de entidade legada — CONFENGE

## Matriz esperada (`_redirects`)

| Path | Ação | Destino | Motivo |
|------|------|---------|--------|
| `/vision` | 410 | `/404.html` | Produto abandonado |
| `/nexgen` | 410 | `/404.html` | Produto abandonado |
| `/avcbclcb`, `/avcb`, `/clcb`, `/avcb-clcb` | 410 | `/404.html` | AVCB/CLCB abandonado |
| `/avaliacoes`, `/avaliacoes-imobiliarias`, `/avaliacao-imovel` | 410 | `/404.html` | Avaliações imobiliárias abandonadas |
| `/ia`, `/inteligencia-artificial` | 410 | `/404.html` | IA genérica abandonada |
| `/automacao` | 410 | `/404.html` | Automação genérica abandonada |
| `/blog`, `/blog.html` | 301 | `/conteudos/` | Substituição semântica |
| `/servicos`, `/servicos.html`, `/services` | 301 | `/#como-atuamos` | Ofertas atuais na home |
| `/contato`, `/contato.html`, `/contact` | 301 | `/#contato` | Formulário atual |
| `/sobre`, `/sobre-nos`, `/about` | 301 | `/especialista/tiago-jun-sasaki/` | Entidade pessoa |
| `confenge.netlify.app/*` | 301! | `confenge.com.br/:splat` | Host canônico |

Regras: **um salto**; **não** soft-404 irrelevante → home; 410 com corpo 404 customizado.

## Evidência de produção

Executar (rede necessária):

```bash
npm run test:redirects:prod
# ou
node scripts/site/test_redirects.mjs https://confenge.com.br
```

Capturar status, URL final e hops em `docs/evidence/` ou scratch da missão.

**Status nesta sessão:** prova HTTP de produção depende de rede; a matriz de regras em `_redirects` está validada pelo gate `legacy_entity` e por `test_redirects` local quando disponível. **Não declarar limpeza concluída só pela regra** — revalidar em produção após deploy.

## Instruções GSC (humanas)

Para URLs 410 prioritárias ainda em índice:

1. Search Console → Remoções temporárias (se ainda ranqueando com snippet antigo).
2. Inspecionar URL → solicitar indexação só se 410/404 estiver estável em produção.
3. Não solicitar indexação de páginas `noindex`.
4. Enviar `sitemap-index.xml` atualizado após deploy.

## Gate

`scripts/site/inbound_gates.py` → `gate_legacy_entity_matrix`  
Teste: `npm run test:inbound-gates`
