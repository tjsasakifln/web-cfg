# Redirects legados (GSC)

URLs do site anterior ainda apareciam no Search Console. Mapeamento em `netlify.toml`:

| De | Para | Status | Nota |
|----|------|--------|------|
| `/privacy-policy` | `/privacidade/` | 301 | Política atual |
| `/terms-and-conditions` | `/privacidade/` | 301 | Sem página de termos separada |
| `/contato` | `/#contato` | 301 | Form na home |
| `/blog` | `/conteudos/` | 301 | Biblioteca técnica |
| `/servicos` | `/#atuacao` | 301 | Intenção de serviços |
| `/trabalhe-conosco` | `/#contato` | 301 | Canal de contato |
| `/vision` | `/` | 301 | Fantasma sem equivalente |
| `/nexgen` | `/` | 301 | Legado descontinuado |
| `/avcbclcb` | `/` | 301 | Fora do posicionamento B2G |
| `/privacidade` (sem barra) | `/privacidade/` | 301 | Normalização |
| Pilares sem barra final | `.../` | 301 | Consistência canônica |

HTTP→HTTPS: `_headers` com HSTS + `upgrade-insecure-requests` (efetivo no host Netlify).

Após deploy, no GSC: **Remoções** só se necessário; preferir deixar o 301 consolidar por algumas semanas.
