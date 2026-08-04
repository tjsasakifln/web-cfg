# Redirects e URLs legadas (migração SEO)

**Fonte principal:** `_redirects` na raiz publicada (`publish = "."`).

`netlify.toml` só define build + espelho do redirect de host (opcional).  
**Não** duplicar regras de path no `netlify.toml`.

Mapa: `docs/legacy-url-map.csv`  
Auditoria: `npm run audit:migration -- --base=https://confenge.com.br`

## Deploy summary (obrigatório)

No deploy Netlify, o resumo deve mostrar:

```text
Redirect rules processed
X redirect rules processed
```

com **X > 0** (esperado ~12–14). Se aparecer `0`, o arquivo `_redirects` não entrou no publish.

## Host

| De | Para | Status |
|----|------|--------|
| `https://confenge.netlify.app/*` | `https://confenge.com.br/:splat` | 301! |
| `www` / HTTP | apex HTTPS | plataforma Netlify |

## Path, substituta (A/B)

| De | Para | Status |
|----|------|--------|
| `/blog` | `/conteudos/` | 301 |
| `/contato` | `/#contato` | 301 |
| `/servicos` | `/#atuacao` | 301 |
| `/privacy-policy` | `/privacidade/` | 301 |
| `/politica-de-privacidade` | `/privacidade/` | 301 |
| `/terms-and-conditions` | `/termos-de-uso/` | 301 |
| `/trabalhe-conosco` | `/#contato` | 301 |
| `/privacidade.html` | `/privacidade/` | 301! |

## Path, abandonados (C)

| De | Status |
|----|--------|
| `/vision`, `/nexgen`, `/avcbclcb` | **410** → body `/404.html` |

## Barra final

**Não** há regras `/foo` → `/foo/` só para normalizar.  
Netlify normaliza antes do match; Pretty URLs cuida de `/dir` ↔ `/dir/`.

## 404

`404.html` na raiz → Netlify serve 404 real em paths inexistentes.  
Sem `/* /index.html 200`.
