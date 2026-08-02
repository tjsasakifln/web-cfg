# Estratégia editorial + pSEO inbound (CONFENGE)

## Objetivo
Biblioteca técnica que converte dúvidas reais de construtoras em contatos qualificados (WhatsApp/e-mail), sem páginas-shell de keyword.

## Arquétipos
| Código | Rota | Função |
|--------|------|--------|
| A | `/lei-14133-obras/` | Aplicação cotidiana da Lei 14.133 |
| B | `/jurisprudencia-contratos-obras/` | Jurisprudência com limites do precedente |
| C | `/guias-contratos-obras/` | Checklists e roteiros |
| D | `/inteligencia/` | Dados PNCP (fail-closed se amostra fraca) |

## Princípios
1. Fail-closed: sem fonte oficial, sem aprovação humana operacional, sem CTA contextual → fora do índice.
2. Canibalização: não republicar thin variants de `/conteudos/` noindex; Wave 1 cria páginas com contribuição própria.
3. Inteligência de dados: 0 publishable permanece correto até amostra/evidência suficientes.
4. Autoria Tiago Sasaki só com `author_is_tiago=true` após revisão nominal.

## Comandos
```bash
npm run editorial:build
npm run editorial:test
npm run build:site
```

## Wave 1
Teto 24; publicadas as que passam gates. Ver `data/editorial/EDITORIAL-REGISTRY.json` e `seo/editorial-evidence/`.
