# ACCESSIBILITY-AUDIT

Static audit via `npm run audit:accessibility` (OK).

Checks:
- `lang="pt-BR"`
- skip-link → `#conteudo`
- main landmark
- form labels on home
- `:focus-visible` styles in CSS
- `prefers-reduced-motion`
- Journey content fully in DOM without JS; enhancement only filters display when `data-enhanced`

Limitations: full axe/Lighthouse not executed as score authority in this environment; static gates only.
