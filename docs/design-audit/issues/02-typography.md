Parent: #493

## Decision state

**P1 / VALIDATE → EXECUTE_CANARY** · Front: INBOUND ENGINE · Time to evidence: specimens e canário em uma família · Leverage: trust, conversion e customer.

**Visitor job:** ler tese, instrução, tabela, preço, fonte e ressalva rapidamente em PT-BR.  
**Hypothesis:** papéis tipográficos deliberados aumentam autoridade e scanning sem depender de decoration.  
**100 repetitions:** um contrato de type roles, loading e numeral melhora o sistema; 100 overrides de `font-size/font-weight` criam dívida.

## Problem

A tipografia computada é a pilha segura em quase toda superfície. Na home, 333/359 elementos visíveis usam system sans e apenas 2 usam serif; money page, artigo, ferramenta e trust usam system sans em 100% dos elementos visíveis. H1/H2 dependem de bold sans, tracking negativo e clamps típicos de landing page. A escolha é racional para performance, mas ainda não prova ser uma decisão de marca adequada a texto técnico, moeda, percentuais, tabelas e português.

## Contemporary evidence

- Source `origin/main@b4cafc4…`; live/screenshots `7500d7b…`, 2026-08-30; o delta #483 não altera arquivos visuais públicos.
- URLs: `/`, `/entregas/`, artigo, money, tool, radar e trust nos quatro viewports.
- Screenshots live: corpus de 18 capturas em `/tmp/confenge-design-audit-20260830/`; âncoras `home-mobile.png` (`46970e…`), `entregas-desktop.png` (`6377b6…`) e `intelligence-desktop.png` (`18c400…`).
- CSS/contracts: `--serif`, `--mono`, `--text-display/h1/h2`, body system stack; `.eyebrow`, `.type-serif`, `.type-mono`, `.vitrine-item__facts dt`.
- Tell: safe default, headline always bold sans, negative tracking repetido, uppercase/mono saturado em `/entregas/` (148 uppercase, 219 mono).
- Preserve PR #462: body ≥16 px, critical microcopy ≥12.8 px e geometria real.

## Desired perception

Precisão editorial e técnica: tese com voz, corpo confortável, números tabulares, metadado discreto, fonte/nota inequívoca e UI produtiva.

## Design hypothesis

Definir roles antes de família: display/tese, reading, productive UI, numeric/table, caption/source/footnote. Comparar manter system stack versus uma combinação licenciada e auto-hospedada; serif/display só se melhorar contraste e PT-BR.

## Constraints

Sem FOIT, tracking excessivo ou microtexto; CLS controlado; WOFF2/subset/fallback; licença/privacidade; bold/italic reais; numerais, moeda e percentuais; SEO/semantics; WCAG; mobile; CWV; print; no dependency remota silenciosa.

## Scope

- specimens PT-BR em 390, 768/1024 e 1440 para títulos, parágrafos, listas, forms, tabela, R$, %, datas, fonte, footnote, bold/italic;
- comparar 2–3 direções incluindo “system stack refinado”;
- contrato de roles/tokens, font loading, preload somente se necessário, subset e fallback metrics;
- canário em home ou artigo + uma tabela/tool; medir antes de expandir;
- reduzir uppercase/mono/negative tracking sem retirar metadado funcional.

## Out of scope

Escolher fonte por tendência; Google Fonts remoto por default; serif em tudo; baixar legibilidade; reescrever copy; alterar nomes/preços; refatorar layout sitewide no mesmo PR.

## Acceptance

- [ ] 2–3 specimens comparáveis cobrem PT-BR, números, tabelas, UI e mobile;
- [ ] licença, arquivos, subset, italic/bold, privacy, fallback e owner documentados;
- [ ] roles semânticos substituem overrides casuais e mantêm floors #462;
- [ ] line length/leading têm contrato separado para leitura e tarefa;
- [ ] preço, percentual, data e coluna numérica alinham com `font-variant-numeric` adequado;
- [ ] uppercase/mono têm função de status/código/fonte, não textura;
- [ ] canário passa screenshot diff e teste em zoom/reflow sem clipping/overflow;
- [ ] LCP/CLS/CSS/font payload não regredem além dos budgets aprovados;
- [ ] system stack permanece fallback funcional e JS-off não muda;
- [ ] revisão human-crafted responde às oito perguntas.

## Before / After evidence

Mesmas rotas/estados em 390×844, 768×1024, 1024×768 e 1440×1000; incluir specimen, waterfall/font loading, computed font e screenshot. Não afirmar preferência humana sem participantes reais.

## Responsive

Todos os breakpoints de type/layout existentes, com atenção a 320/360/390, 768/1024, 1240 e 1440/1661; sem escala alternativa escondida em media query.

## Accessibility

WCAG 2.2 AA, zoom 200/400%, line-height ajustável, legibilidade de acentos e `I/l/1`, foco e labels. Fonte não pode ser único sinal semântico.

## Performance

Definir teto WOFF2/gzip, número de files/weights, preload e cache; medir LCP/CLS em três execuções. Regressão requer rejeição ou exceção explícita.

## Analytics and data contracts

Nenhuma mudança de evento, PII, capture, extra-cli, Warmbly ou `CONFENGE_WEB`.

## Rollback

Feature/token flag ou revert do canário restaura stacks/tokens anteriores sem alterar conteúdo/URL.

## Dependencies

`depends_on: #494`  
`unblocks: #497, #498, #499, #500, #501, #502, #504`

## Perceptual leverage

`HIGH`

## Effort

`M`

## Human-crafted review

1. A composição parece específica ao conteúdo? 2. A hierarquia existe sem card? 3. O visual informa? 4. A decisão tipográfica é clara? 5. Há ritmo? 6. É CONFENGE sem logo? 7. Há default de UI gerada? 8. Algo parece prompt result?

Registrar evidência e divergência; percepção humana só com teste real.

## PR evidence and ADR

O futuro PR inclui visitor job, hipótese de conversão, licença/data owner, gates, analytics, rollback e ADR-STRAT-002. Nenhuma boundary muda por default.
