# CONFENGE-SALTO-INSTITUCIONAL-02 — caderno dos lotes (contrato comum)

Campanha 2 de 2. Direção autorizada: **A-prancha-e-percurso** (piloto da campanha 01, ramo
`campaign/salto-institucional-01-piloto`, `pilot_source_sha` 3afa55a24; estado em
`docs/campaigns/design-institucional/estado.json`). Autorização: encaminhamento da campanha 02
pelo proprietário em 2026-09-17 (EXECUTE_NOW). Não reabrir a pesquisa estética.

Ramo de integração: `campaign/salto-institucional-02-expansao`. Cada lote trabalha em um
sub-ramo `campaign/salto-02/lote-<x>` numa worktree própria e **só escreve nos arquivos do seu
lote** (lista abaixo). O integrador é o único que escreve em: `styles-tokens.css`, `css/**`,
`styles.css`, `assets/editorial.css`, `assets/home-10x.css`, `scripts/site/build_css.py`,
`scripts/pseo/html_shell.py`, `scripts/site/shell_nav.py`, `js/**`, `script.js`,
`data/site/**`, `data/organic/**`, `data/bofu-dominance/**`, `seo/**`, `index.html`,
`servicos/index.html`, `triagem-tecnica/**`, `quantitativos-orcamento-obras/**`,
`medicoes-glosas-obras-publicas/**`, `casos/demonstrativo-projeto-privado/**`,
`scripts/demonstrative/plates/{render_plates,inline,sheet,build_manifest,capture_plates,test_render_plates}.py`,
`docs/campaigns/design-institucional/estado.json`, manifestos e qualquer teste fora do lote.
Se um lote precisar de CSS novo ou de mudança em arquivo do integrador, registra o pedido em
`docs/campaigns/design-institucional/expansao/pedidos-lote-<x>.md` (seletor, motivo, página) e
segue com o que existe. Não usar `!important`, `style=""` inline nem uma folha nova por rota.

## 1. Referência de execução (o piloto é o padrão mínimo)

Ler antes de editar, nesta ordem: `docs/campaigns/design-institucional/caderno.md` (§2–§5),
`estado.json#design_contract`, `assets/editorial.css` (todos os blocos, inclusive os novos:
Article, Hub, Tool, Trust, States, Timeline, Figure pair), `css/components.css` (primitivos
`list-ruled`, `steps`, `phases`, `keys`, `dark-block`, `data-table`, `table-scroll`, `split`,
`grid-2`, `aside-note`, `proof-figure`, `tag`), e as páginas de referência:

| Função | Página de referência (bytes finais do piloto) |
| --- | --- |
| Serviço (privado) | `quantitativos-orcamento-obras/index.html` |
| Pilar de obras públicas | `medicoes-glosas-obras-publicas/index.html` |
| Exemplo/caso | `casos/demonstrativo-projeto-privado/index.html` (gerado por `scripts/demonstrative/private_project/render.py`) |
| Hub de serviços / avaliações | `servicos/index.html` |
| Contato e estados | `index.html#contato`, `triagem-tecnica/index.html` |

Esqueleto do serviço (ordem obrigatória): breadcrumbs → `section.svc-open` (kicker `.t-kicker`,
`h1.t-service`, `.svc-open__lead` = necessidade, `.measure` = trabalho, `.hero-deliverable` =
documento entregue, `.svc-open__actions` com **uma** ação dominante `button-primary` + alternativa
em texto, `.svc-open__note` com e-mail; `aside.aside-note` "Em 30 segundos") → `nav.page-index`
→ `section.sec.sec--soft` com `figure.plate.plate--dominant` (prancha pertinente + legenda com
`span.tag` "Amostra demonstrativa"/"Exemplo demonstrativo") → o que contratar (`list-ruled` ou
`svc-chain`) → método → exemplos conferíveis → `div.conditions` "Condições e limites"
consolidado (uma vez; não repetir ressalvas por bloco) → um único bloco `sec--dark` de próximo
passo com `.contact-primary` (ação dominante) + `.contact-alt` (WhatsApp, e-mail) + `ol.after`
(três passos, sem prazo de resposta inventado). Um bloco escuro por página.

Papéis tipográficos: `.t-institutional` (só na home), `.t-service` (h1 de serviço/pilar/
ferramenta/estado), `.t-editorial` (h2 de seção e h1 de artigo), `.t-callout`, corpo (16/18),
`.t-caption`, `.t-data` (números). Kicker `.t-kicker` (ou `.eyebrow`). Identidade única,
escala por função.

## 2. Pranchas (materiais técnicos)

Toda figura técnica nova é uma **prancha** gerada de JSON em `data/demonstrative/**` por um
módulo `scripts/demonstrative/plates/family_<lote>.py` que expõe `SOURCES`, `PLATE_SOURCES` e
`RENDERERS` (ver `render_plates.py`, que agrega os módulos; usar `sheet.py`: `line`, `rect`,
`path`, `text`, `dim_h`, `dim_v`, `dim_group`, `callout`, `leader`, `level`, `br`, `fmt`,
`validate`; paleta `INK/GREEN/LIME/MUTED/RULE/SOFT/WHITE`; carimbo de três células com revisão
e `S.DEMO_LABEL`). Desktop e móvel são composições distintas (móvel `viewBox 0 0 360 420`,
fonte mínima 12,5); nunca a mesma composição escalada. Nenhum número fora do JSON de origem;
`python3 -m scripts.demonstrative.plates.render_plates` escreve `assets/pranchas/<id>-{desktop,mobile}.svg`
e `--check` prova o determinismo; `python3 -m pytest scripts/demonstrative/plates -q` deve passar
(o teste de numerais exige que todo numeral do SVG exista no JSON). No HTML a prancha entra por
slot `<!-- plate:<id> --><!-- /plate -->` dentro de `div.plate__sheet` e
`python3 -m scripts.demonstrative.plates.inline` materializa o `<picture>` (a primeira prancha
da página, quando está na dobra, leva ` eager`). Registrar cada prancha nova em
`docs/campaigns/design-institucional/expansao/assets-lote-<x>.json` (id, origem dos dados,
licença: gerado pela CONFENGE a partir de dados demonstrativos, classificação: demonstrativo,
uso: rotas, hash sha256 dos SVGs). Proibido: foto de banco, ícone genérico, painel fictício,
métrica cenográfica, degradê, dado de cliente, número inventado sem JSON.

## 3. Conteúdo protegido (não mudar; se precisar mover, mover inteiro)

- Preços, condições comerciais, prazos, checkout, descontos, ofertas, `document_intent`,
  `data-offer-*`, `data-cta-id`, `data-asset-id`, `data-section-archetype`, JSON-LD, canonical,
  robots, `<title>`/description (título editorial pode mudar mantendo intenção e serviço).
- Formulários: byte-idênticos (`#formulario-contato`, `#captura-pilar`, `pillar-capture-form`,
  `lead-form`, `offer-request-form`); mover o bloco inteiro é permitido, editar por dentro não.
- Links de contato (`wa.me`, `mailto:`, `tel:`, `/triagem-tecnica/#…`, `/#contato`) e seus textos
  pré-preenchidos; âncoras (`id`) e `href` internos referenciados por testes: antes de remover ou
  renomear qualquer `id`, `class` ou `data-*`, `grep -rn "<valor>" scripts tests seo/scripts data`;
  se houver referência, preservar.
- Rótulos de veracidade ("Exemplo demonstrativo", "Amostra demonstrativa", "não representa cliente"),
  limites de ferramenta, papéis de terceiros, frases de responsabilidade técnica.
- Nada de currículo extenso, equipe fictícia, depoimento, cliente, certificado ou aprovação
  inventados. Decisão SOLUCAO-INTEGRAL (2026-09-13): necessidade → solução → trabalho e entregas →
  condução → conclusão → contato; sem "isso é outra compra", sem inventário de capacidades.

## 4. Testes por lote (camada de iteração; rodar com Node 22: `source <scratch>/build_env.sh`)

Obrigatórios após cada página: `python3 scripts/site/html_integrity.py --root . --surface source`
(ou `npm run test:html-integrity`), `npm run test:design`, `npm run test:copy`,
`npm run test:brand`, `npm run test:authority`, `npm run test:integral-solution`,
`npm run test:self-deprecation`, `npm run organic:test`, `npm run test:inbound-gates`,
`npm run test:deliverables-registry`, `npm run test:real-proof-registry`,
`npm run test:commercial-contract-consistency`, `npm run test:public-offer-truth`, os
`test:page-contract-*` da família tocada, `npm run test:cta-form-next-state`,
`npm run test:form-funnel`, `node --test tests/intake/test_mv03_adaptive_intake.mjs` e os testes que
o `grep` do §3 apontar. Regra: um teste que discorda da nova composição por **estética**
(classe de cartão, grade, altura) pode ser atualizado com motivo no commit, **por rota exata**;
um teste de veracidade, preço, responsabilidade, privacidade, formulário, persistência ou revisão
obrigatória não pode ser afrouxado. Não editar testes fora da sua família sem registrar em
`pedidos-lote-<x>.md`.

Pré-visualização e capturas: `python3 -m http.server <porta única do lote> --directory <worktree>`
(a árvore rastreada serve como site; `styles.css` e `assets/**` já estão no lugar). Capturar com
puppeteer-core (`node_modules/puppeteer-core`, Chromium do `~/.cache/puppeteer`) em 390×844 e
1440×1000, dobra e página inteira, com `content-visibility` forçado visível e fontes carregadas,
para `docs/campaigns/design-institucional/expansao/evidence/lote-<x>/<rota>-<vw>-<fold|full>.jpg`
(qualidade 70). Conferir 320 px sem rolagem horizontal. Ver o próprio screenshot antes de dar a
página por pronta.

## 5. Entrega de cada lote

1. Commits pequenos e revisáveis no sub-ramo (mensagem em pt-BR, prefixo `feat(design):`,
   `fix(design):`, `chore(plates):`), com o rodapé `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
2. `docs/campaigns/design-institucional/expansao/matriz-lote-<x>.json`: uma entrada por rota
   tratada `{route, family, function, source, generator, priority, treatment, owner, state,
   evidence: [...], impediment}` com `treatment` ∈ {COMPOSICAO_REDESENHADA,
   COMPONENTES_ADEQUADOS, HERANCA_VISUAL_VALIDADA, PRESERVADA_COM_JUSTIFICATIVA}. Só
   COMPOSICAO_REDESENHADA quando a composição foi refeita e capturada; fonte/casca não bastam.
3. `assets-lote-<x>.json`, `pedidos-lote-<x>.md` (se houver), `relatorio-lote-<x>.md` (o que
   mudou por rota, testes executados com resultado real, testes ajustados e motivo, pendências).
4. Árvore limpa (`git status` vazio), sem `_site/`, sem arquivos fora do lote.
