# Auditoria — experiência do visitante (pré-redesign)

Data-base: `main` em `8535e504` (pós PR #54).

## Diagnóstico

O site estava tecnicamente correto (SEO, gates, testes), mas a experiência pública falhava em hierarquia e tom:

1. **Card soup** — quase todo bloco usava fundo + borda + raio + rótulo + seta, nivelando urgência e aprofundamento.
2. **Aparência de dashboard** — métricas de hub (`guias indexáveis`, `frentes de decisão`, `eixos integrados`), spine de “etapas” no hero e grades simétricas.
3. **Taxonomia exposta** — linguagem de arquitetura editorial/SEO no copy público do hub e de pilares.
4. **Hierarquia fraca** — CTAs e cards com peso visual semelhante; múltiplos botões primários competindo.
5. **Checklist** — 36 itens em parede contínua, pílulas idênticas, botão “Atualizar diagnóstico” redundante com auto-update, ações secundárias no mesmo peso do primário.
6. **Hub orientado a inventário** — contadores e grade de clusters, não à pergunta “qual problema preciso resolver?”.

## Superfícies auditadas

| Superfície | Problema principal |
|---|---|
| `/` | Hero com painel tipo dashboard; jornadas em 3 cards iguais; nav com 6–7 labels |
| `/conteudos/` | Métricas internas; 6 featured iguais; cluster cards; “1 guias” / “0 guias” |
| Pilares | `pillar-stat` com eixos/frentes |
| Checklist aditivo | Parede de 36 requisitos; diagnóstico confuso |
| Editorial | Answer-box estilo alert; chips de meta; fontes em “cards” |
| Form home | Texto de contingência de JS visível |

## O que não era o problema

- URLs, canonicals, robots, sitemaps
- Conteúdo jurídico material (hashes)
- Cobertura de testes de SEO/governança
- Posicionamento de marca (tagline e provas EESC-USP)

## Fontes de verdade mapeadas

| Superfície | Fonte | Gerador | CSS | JS |
|---|---|---|---|---|
| Home | `index.html` + `data/site/brand.json` | `inbound_first_remediate.patch_shell` | `styles.css` | `script.js` |
| Hub | `conteudos/index.html` | `remediate_hub` | `styles.css` | inline search |
| Checklist | `data/editorial/pages/guia-checklist-aditivo.json` | `checklist_ui.py` → `editorial:build` | `styles-tools.css` | inline + `tool-compute.js` |
| Artigos | JSON editorial | `scripts/editorial/render.py` | `styles.css` | — |
| Nav | `brand.json` navigation | `build_nav_html` | `styles.css` | menu toggle |
