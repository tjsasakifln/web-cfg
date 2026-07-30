# Redirects e URLs legadas (migração SEO)

Fonte principal: `netlify.toml` (não duplicar em `_redirects`).

Mapa legível: `docs/legacy-url-map.csv`.

Auditoria: `npm run audit:migration -- --base=https://confenge.com.br`

## Host

| De | Para | Status | Nota |
|----|------|--------|------|
| `https://confenge.netlify.app/*` | `https://confenge.com.br/:splat` | 301 force | Canonização de host; preserva path |
| `https://www.confenge.com.br/*` | apex | 301 | Automático Netlify (domínio principal) |
| `http://*` | `https://*` | 301 | Plataforma Netlify |

## Path — substituta semântica (A)

| De | Para | Status | Nota |
|----|------|--------|------|
| `/blog`, `/blog/` | `/conteudos/` | 301 | Biblioteca técnica |
| `/contato`, `/contato/` | `/#contato` | 301 | Formulário na home |
| `/servicos`, `/servicos/` | `/#atuacao` | 301 | Seção de atuação |
| `/privacy-policy` (+ `/`) | `/privacidade/` | 301 | Política canônica |
| `/politica-de-privacidade` (+ `/`) | `/privacidade/` | 301 | Variante PT |
| `/privacidade` | `/privacidade/` | 301 | Normalização |
| `/trabalhe-conosco` (+ `/`) | `/#contato` | 301 | Sem carreiras públicas |

## Path — termos (B)

| De | Para | Status | Nota |
|----|------|--------|------|
| `/terms-and-conditions` (+ `/`) | `/termos-de-uso/` | 301 | **Não** redirecionar para privacidade |
| `/termos-de-uso` | `/termos-de-uso/` | 301 | Canônica institucional prudente |

## Path — abandonados (C) — sem soft-404

| De | Para | Status | Nota |
|----|------|--------|------|
| `/vision`, `/vision/` | `/404.html` | **410** | Marca/produto legado sem equivalente B2G |
| `/nexgen`, `/nexgen/` | `/404.html` | **410** | Idem |
| `/avcbclcb`, `/avcbclcb/` | `/404.html` | **410** | AVCB/CLCB fora do posicionamento atual |
| `/*` (desconhecido) | `/404.html` | **404** | Catch-all real; sem SPA 200 |

## Ordem das regras

1. Host `confenge.netlify.app`
2. Normalização de paths canônicos
3. Legados 301 com substituta
4. Legados 410 abandonados
5. Trailing slash de pilares
6. Catch-all 404

Não usar `/* /index.html 200`.
