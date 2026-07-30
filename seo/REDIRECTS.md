# Redirects legados (GSC)

URLs do site anterior ainda apareciam no Search Console. Mapeamento em `netlify.toml`:

| De | Para | Status |
|----|------|--------|
| `/privacy-policy` | `/privacidade/` | 301 |
| `/terms-and-conditions` | `/privacidade/` | 301 |
| `/contato` | `/#contato` | 301 |
| `/blog` | `/conteudos/` | 301 |
| `/servicos` | `/#atuacao` | 301 |
| `/vision` | `/` | 301 |
| `/trabalhe-conosco` | `/#contato` | 301 |
| `/nexgen` | `/` | 301 |
| `/avcbclcb` | `/` | 301 |

Após deploy, no GSC: **Remoções** só se necessário; preferir deixar o 301 consolidar por algumas semanas.
