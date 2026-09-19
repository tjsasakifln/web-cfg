# Inventário de ativos e prova — web-cfg (somente leitura, 2026-09-15)

Repositório: `.`, branch `campaign/design-authority-20260915`, HEAD `dce15f9e6`.
Escopo do grep de uso: HTML fonte, excluindo `_site`, `node_modules`, `.claude`, `.grok`, `docs`, `build`, `dist`, `seo`, `scripts/_tmp`.

Premissa (assumida, declarada): "home + 4 rotas prioritárias" = `/`, `/servicos/`, `/quantitativos-orcamento-obras/`, `/compatibilizacao-projetos-engenharia/`, `/revisao-tecnica-projetos-engenharia/`. Base: `docs/campaigns/2026-09-14-valor-imediato.md` (EXECUTE_NOW para home, hub e landings de serviço) e as três demonstrações nomeadas na tarefa vivem exatamente nessas três landings.

Fora do inventário: `orc-390-entrances.png` (untracked, 390x844, captura de sessão), `.playwright-mcp/*.png` (ignorado pelo git), 900+ PNG/JPG em `docs/**`, `seo/**`, `build/**` (evidência de QA, não ativos servidos).

---

## 1. Imagens servidas (assets/ e subpastas de rotas)

### 1.1 Marca e ícones (`assets/`)

| Arquivo | Dim. | Peso | Uso (HTML fonte) | Origem / licença |
|---|---|---|---|---|
| `assets/logo-confenge.png` | 800x208 RGBA | 38,6 KB | `<img>` só nas 6 BOFU congeladas (`FORBIDDEN_RELATIVE_PATHS`) + `"logo"` no JSON-LD Organization de ~174 páginas | commit inicial `2477b111b`; master raster; sem master vetorial (contrato diz `ABSENT`, `BLOCKED_AWAITING_FOUNDER_ARTWORK`); licença de tipografia da assinatura "INTELIGÊNCIA TÉCNICA" não identificada (item pendente do fundador em `data/brand/logo-contract.v1.json`) |
| `assets/logo-confenge-white.png` | 800x208 RGBA | 38,6 KB | `<img>` rodapé das mesmas 6 BOFU congeladas | idem |
| `assets/logo-confenge-500-f8a83f6d.png` | 500x130 P | 10,6 KB | cabeçalho de todo o site mutável (224 ocorrências no censo; `<link rel=preload>` na home) | derivado por `scripts/site/optimize_brand_logos.py` (commit `94b4f04a0`) |
| `assets/logo-confenge-white-500-1677038e.png` | 500x130 P | 10,6 KB | rodapé de todo o site mutável (214 ocorrências) | idem |
| `assets/favicon-32.png` | 32x32 | 1 KB | `<link rel=icon>` sitewide | não documentada |
| `assets/apple-touch-icon.png` | 180x180 | 11 KB | `<link rel=apple-touch-icon>` sitewide | não documentada |
| `assets/icon-192.png`, `icon-512.png` | 192², 512² | 12 / 24 KB | só `manifest.webmanifest` (0 HTML) | não documentada |

### 1.2 Cartões de compartilhamento (OG) — raster com texto

| Arquivo | Dim. | Peso | Uso | Origem / licença |
|---|---|---|---|---|
| `assets/og-confenge.jpg` | 1200x630 | 126 KB | `og:image` + JSON-LD `image` em ~7.000 páginas (todo o site) | `data/site/commercial-media/source.json`: retexturizado por "built-in image_gen" (EXECUTE_NOW 2026-09-09) a partir do master `data/site/commercial-media/og-confenge.png` (1731x909, 1,5 MB). Fundo fotográfico (grua/skyline) anterior à edição: **licença não documentada em lugar nenhum do repo** |
| `assets/og-tiago-sasaki-v11.jpg` | 1200x630 | 89 KB | `og:image` só em `/especialista/tiago-jun-sasaki/` | mesmo pipeline; master `data/site/commercial-media/og-tiago-sasaki-v11.png` |
| `assets/og-conteudos.jpg` | 1200x630 | 67 KB | `og:image` só em `/conteudos/` | commit inicial; não documentada |
| `assets/clusters/*.jpg` (8) | 1200x630 | 66–75 KB cada | `og:image` de 8 hubs B2G; **`<img fetchpriority=high>` visível em 6 BOFU congeladas** (aditivos, auditoria, diag-b2g-360, diag-pre-licitacao, medicoes, reequilibrio) e em `atrasos-…`, `acompanhamento-…`, `defesa-tecnica-…` | cartão-título gerado (título/categoria/logo rasterizados; "15 GUIAS" etc.), commit inicial; sem doc de origem |
| `assets/conteudos/*.jpg` (120) + 1 SVG | 1200x630 | 8,9 MB total (~74 KB cada) | só `og:image` de cada artigo (`scripts/site/remove_redundant_article_covers.py` retirou-as do corpo por serem título repetido em raster) | idem; 2 delas retexturizadas por image_gen (`consultoria-b2g-…`, `gestao-contrato-…`) |
| `assets/conteudos/como-contratar-projetos-complementares.svg` | — | — | 1 artigo | SVG local |

### 1.3 Diagramas e gráficos vetoriais

| Arquivo | viewBox | Peso | Uso | Origem |
|---|---|---|---|---|
| `assets/projetos-complementares-engenharia/pacote-entrega.svg` | 1200x640 | 4,0 KB | `<img width=1200 height=640 alt="Esquema ilustrativo do pacote de elaboração…">` em `/projetos-complementares-engenharia/` | SVG autoral (texto + caixas, `ui-sans-serif`), commit `08a068301` (inb-12) |
| `assets/projetos-complementares-engenharia/interfaces-versoes.svg` | 1200x640 | 4,4 KB | `<img>` na mesma rota | idem |
| `assets/data-desk/valor-tipico-contratos-pavimentacao-sc/v1/chart.svg` | 720x280 | 1,9 KB | só `assets/data-desk/…/v1/index.html` (kit de citação) | `data/data-desk/…/asset.v1.json`: `license: NEEDS_REVIEW`, `indexable: false`, `do_not_index: true`, `sitemap: false`; dados extra-cli, quartis SC pavimentação. **Barrado de superfície indexável.** |
| `data/data-desk/fixture/chart.svg`, `packages/*/chart.svg` | 480x240 / 720x280 | <2 KB | fixtures/pacote, não servidos como prova | — |

### 1.4 Desenhos das demonstrações (`casos/*/assets/`) — ver §2

9 SVGs determinísticos, gerados por `scripts/demonstrative/{private_project,infrastructure_pilot}/render.py` a partir de `data/demonstrative/*/source.v1.json`. Todos com `role="img"`, `<title>`, `<desc>` e a frase "Exemplo demonstrativo" gravada em `<text>` dentro do próprio desenho.

| Arquivo | viewBox | Peso | Conteúdo |
|---|---|---|---|
| `casos/demonstrativo-projeto-privado/assets/planta-r00.svg` | 419x384 | 2,0 KB | planta do banheiro 2,40x1,80: D-01 norte, WN-01 leste, B-01 tracejada leste, HS-01 oeste |
| `…/planta-r01.svg` | 419x384 | 2,0 KB | idem, nota R01 |
| `…/elevacao-leste-r00.svg` | 282x370 | 1,4 KB | parede W-02: janela WN-01 (1,40→2,30) sobreposta à viga B-01 (fundo 2,20); cotas laterais |
| `…/elevacao-leste-r01.svg` | 282x370 | 1,4 KB | verga em 2,10, folga 0,10 |
| `casos/demonstrativo-infraestrutura/assets/planta-r00.svg`, `planta-r01.svg` | 672x324 | 1,9 KB | faixa PV-01 40x7 m, rede DR-01, MH-01/MH-02, IN-01 |
| `…/perfil-drenagem-r00.svg`, `perfil-drenagem-r01.svg` | 468x264 | 1,4–1,6 KB | perfil MH-01→MH-02, invert 12,80/12,35, divergência 0,15 m em R00 |
| `…/secao-pavimento.svg` | 574x162 | 1,1 KB | camadas sub-base 0,15 / base 0,12 / capa 0,04 |

Uso hoje: **inline** (`<figure class="demo-figure">` + `<figcaption>`) só em `/casos/demonstrativo-projeto-privado/` (4 figuras) e `/casos/demonstrativo-infraestrutura/` (5 figuras), mais links `<a href="assets/…svg">` para o arquivo. **Nenhuma das 5 rotas prioritárias contém um único desenho** (`other-svg-with-viewBox=0`, `role="img"=0`, `<table>=0`).

### 1.5 Retrato do responsável técnico — ver §3

### 1.6 Tipografia
`assets/archivo-var-latin-b19be0f7.woff2` (Archivo v2.001, Omnibus-Type, SIL OFL 1.1, licença em `assets/archivo-OFL.txt`; subconjunto latino, 58,7 KB gzip, carregada só na home via `assets/home-10x.css`). Única fonte com licença verificada no repo.

---

## 2. Demonstrações / amostras técnicas

Rótulo canônico e política: `permission_class = "demonstrativo"` (`scripts/site/authority.py`, `scripts/site/permissioned_proof.py`): `is_client_proof: false`; a página é classificada como demonstrativa se tiver `data-permission-class="demonstrativo"` ou o texto "demonstrativo"/"não é case de cliente"; **proibido** coexistir com "caso confenge", "customer success", "caso de sucesso" (erros `demonstrativo_labeled_caso_confenge`, `demonstrativo_claims_client`).

### 2.1 Recorte de banheiro (W-01..W-04, Q-PAR-01, ORC-PAR-01) — "private-project-pilot"

- **Fonte de verdade**: `data/demonstrative/private-project-pilot/source.v1.json` (schema `confenge.demonstrative-sample-source/1.0`, `origin: demonstrative`, R01, `client_name/address/art_number/signature: null`). Elementos W-01..W-04 (2,40/1,80 x 2,60), SL-01, CL-01, D-01 (0,80x2,10), WN-01 (0,80 x 0,90→0,70 por revisão, peitoril 1,40), B-01 (viga), HS-01 (poço). Critério: aberturas ≥0,50 m² descontadas.
- **Derivados** (`scripts/demonstrative/private_project/derive.py` → `render.py`): `data/demonstrative/private-project-pilot/consumption.v1.json` (descriptor com `quantity_rows`, `budget_rows`, `coordination_findings`, `review_findings`, `sample_trail`, `named_totals`: wall_net 19,60 m², floor 4,32, waterproofing 6,84, screed 0,1296 m³, skirting 7,60 m, subtotal 4.250,35 BRL "hypothetical", overlap 0,10, verga 2,30→2,10, fundo viga 2,20, janela 0,56 m², porta 1,68 m²); `casos/demonstrativo-projeto-privado/data/{quantitativos,orcamento,coordenacao,revisao}.csv` (cabeçalho `# exemplo demonstrativo; revisao=R01`; `classe_preco=hypothetical`); `casos/demonstrativo-projeto-privado/excerpt-quantitativo.v1.json` (schema `confenge.quantity-takeoff-excerpt/1.0`, Q-PAR-01 → ORC-PAR-01, disclaimer); 4 SVGs (§1.4).
- **Rota canônica**: `/casos/demonstrativo-projeto-privado/` — badge `<p class="case-badge" data-permission-class="demonstrativo">exemplo demonstrativo · revisão R01`; h2 O recorte / Planta e elevação (4 `figure.demo-figure` com SVG inline + figcaption) / Quantitativos (`table.data-table`) / Orçamento (table) / Compatibilização (table) / Revisão (table) / Contratar. Única superfície com desenho + tabela renderizados.
- **Como aparece hoje nas rotas prioritárias** (tudo texto, sem imagem, sem tabela):
  - `/` (`index.html` L92–95): `div.hero-sample` com `p.hero-sample-label` "Exemplo demonstrativo" + linha "paredes W-01 a W-04: 21,84 − 1,68 (porta) − 0,56 (janela) = 19,60 m², item ORC-PAR-01. Sem obra de cliente." + link `/quantitativos-orcamento-obras/#amostra-quantitativos`; L195 bloco "Amostra conferível" com link ao caso.
  - `/servicos/` (L105, L110): frase na linha 04 "Quantitativos e orçamento" (21,84 → 19,60 → ORC-PAR-01) e link "Ver a interferência demonstrativa" → `/casos/demonstrativo-projeto-privado/#CF-GEO-01`.
  - `/quantitativos-orcamento-obras/`: `figure.qty-sample` no hero (L142, texto) e seção `#qty-sample-trail` (L224) — `ol.qty-trail-steps` em 6 passos (elemento → critério → cálculo com `<data value>` → quantidade 19,6 → item ORC-PAR-01 → referência RF-01), 13 `<code>`, 12 `<data>`, `p.qty-trail-disclaimer` "Amostra demonstrativa… não é SINAPI real"; escrito à mão no HTML fonte (nenhum script gera esse bloco).
  - `/compatibilizacao-projetos-engenharia/`: `figure.coord-sample` no hero (L106, texto) e `article.coord-finding` CF-GEO-01 / CF-INFO-01 (L180–212) como `<dl>` (Localização, Elementos, Interface, Documentos comparados, Evidência, Consequência, Encaminhamento, Estado); kicker "Exemplo demonstrativo do recorte de banheiro. Não é obra de cliente e não é projeto executivo." Contrato: `data/coordination/interference-register.v1.json` (`public_label`, `piloto_finding_href`); gate `tests/coordination/test_page_contract.mjs` exige `href="/casos/demonstrativo-projeto-privado/#CF-GEO-01"`.
  - `/revisao-tecnica-projetos-engenharia/`: `figure.rv-sample` no hero (L119, `ol` de 3 itens, figcaption "Extrato demonstrativo · não é trabalho de cliente") e seção `#extrato-demonstrativo` com 4 `article` + `<dl>` (RF-01, RF-02, verificação não realizada, informação faltante).
- **Renderizável hoje sem inventar**: `elevacao-leste-r00.svg` (mostra exatamente CF-GEO-01/RF-01: janela x viga), `planta-r00/r01.svg`, e os CSV → `<table>` (já existe `_table()` em `render.py`). O número 19,60 e a memória W-01..W-04 já estão em `<data>` na landing de quantitativos.

### 2.2 Recorte de acesso viário e drenagem — "infrastructure-pilot"

- Fonte `data/demonstrative/infrastructure-pilot/source.v1.json` (+ `purchase_question_pt_br`, `information_classes` chosen/derived/absent, `absent_real_inputs`). Derivados: `consumption.v1.json`, 4 CSV, 5 SVGs. Rota `/casos/demonstrativo-infraestrutura/` (badge idem; h2 para comprador / para parceiros / recorte / Desenhos (5 figuras inline) / Quantitativos / Orçamento / Compatibilização / Revisão / Contratar). Referenciada 5x em `/quantitativos-orcamento-obras/` (links). Números: faixa 40x7 m = 280 m², sub-base 42 m³, base 33,6, capa 11,2, tubo 20 m, MH-02 invert 12,35 desenho x 12,50 planilha (R00), subtotal 20.118 BRL hypothetical.

### 2.3 Outros `/casos/`

- Hub `/casos/`: gate exige `<h1>Exemplos de entrega (demonstrativos)</h1>`, `data-proof-kind="demonstrative"`, bloco `data-proof-state="none"` com condição de autorização e frase "não representam contrato, contratante, contratada ou resultado de cliente" (`scripts/site/test_permissioned_proof.py`, `test_hub_link_matrix.py`).
- `casos/aditivo-art125-demonstrativo/`, `casos/medicao-glosa-demonstrativo/`: texto (0 tabelas, 0 desenhos), badge "DEMONSTRATIVO · NÃO É CASO CONFENGE · NÃO É CASE DE CLIENTE".
- `casos/modelo-*` (8 modelos B2G, `data/site/cases.json`, `report-model.css`): h1 "Demonstrativo. …" / "Modelo sintético…"; **têm prova renderizada** (1–7 `<table>` e 7–15 `<svg>` cada), mas pertencem ao vocabulário **sintético** dos 8 relatórios de inteligência: `/entregas/` exige literalmente `"Ver o demonstrativo sintético de {nome}"` e `"{nome} — exemplo sintético"` (`scripts/site/test_deliverables_hub.py`) e proíbe "sintét" na navegação de oferta. Não misturar com as amostras de engenharia.

### 2.4 `/entregas/` e `/ferramentas/`

- `/entregas/`: 0 tabelas/figuras; catálogo JS (`catalog-data.js`); prova só por link aos 8 `casos/modelo-*`.
- `/ferramentas/*` (5 calculadoras: checklist-reequilibrio, diagnostico-defesa-margem, limite-acrescimos-supressoes, matriz-atraso-obra, prontidao-tecnica-obra-privada): formulários, 0 tabelas, 0 imagens além dos logos; 1 menção "demonstrativ" cada.

### 2.5 Rótulos obrigatórios (resumo dos gates)

| Superfície | Regra | Gate |
|---|---|---|
| Hero da home | texto visível com regex `demonstrativ`; ≥1 entrega nomeada, uso, 2 credenciais, um só `button-primary` → `/servicos/`, sem "PNCP" | `scripts/site/test_home_conversion_contract.py` (`DEMONSTRATIVE_LABEL`) |
| Dobra da home 390x844 / 1366x768 | conceito `prova_rotulada` = "demonstrativ" no texto renderizado | `scripts/site/test_home_first_fold.mjs` |
| Página de caso | `data-permission-class="demonstrativo"` ou texto; nunca "caso de sucesso"/"customer success" | `scripts/site/authority.py` |
| Landing de quantitativos | "Amostra demonstrativa" no HTML | `tests/ativacao_20260912/03/test_presentation_and_sharing.py` |
| Compatibilização | link `#CF-GEO-01` do caso; `public_label` do registro | `tests/coordination/test_page_contract.mjs` |
| CSV/JSON | `# exemplo demonstrativo; revisao=R01`, `classe_preco=hypothetical`, `origin: demonstrative` | `scripts/site/verify_promised_public_resources.mjs`, `tests/pos-inb-20260911/03` |
| Detector editorial | regex `demonstrativ|n[aã]o [ée] (case|cliente|resultado de cliente)|dados sint[eé]ticos|hipot[eé]tic` | `tests/campaigns/inb_20260911/15/lib/html.mjs` |
| Se embutir SVG via `<img>` | `<title>/<desc>` não contam como texto visível para os extratores; rótulo deve estar em `alt`/`figcaption` (como já fazem as páginas `/casos/`) | — |

---

## 3. Retrato do responsável técnico (`assets/tiago-sasaki-*`)

| Variante | Dim. | Peso png / webp / avif | Uso |
|---|---|---|---|
| `tiago-sasaki-foto-v11-sem-fundo.{png,webp,avif}` | 1080x1350 RGBA | 529 / 33 / 14 KB | `<picture>` só em `/especialista/tiago-jun-sasaki/` (srcset 1080w); `"image"` do JSON-LD Person em ~145 páginas (home inclusive) |
| `tiago-sasaki-foto-v11-sem-fundo-560.{png,webp,avif}` | 560x700 RGBA | 203 / 14 / 6 KB | `<picture>` da mesma página (560w, `sizes` 273/309 px, `fetchpriority=high`) |
| `tiago-sasaki-avatar-v11-sem-fundo.{png,webp,avif}` | 512x512 RGBA | 175 / 14 / 8 KB | `figure.author-photo` `<picture>` (lazy) em 127 páginas: 120 artigos `/conteudos/*`, 5 `/inteligencia/cenarios/*`, panorama SC, `/conteudos/` |

- Home hoje: **zero retrato visível** (2 `<img>` na home = os dois logos); só JSON-LD.
- Origem: commit inicial `2477b111b`; "sem-fundo" = recorte PNG; AVIF/WebP derivados do PNG (`docs/campaigns/2026-09-08-comunicacao-publica-comercial.md` L272). Direito de imagem/autor da foto: **não documentado** (é o responsável técnico da empresa; nenhum arquivo de licença/consentimento no repo). Auditoria de design (`docs/design-audit/DESIGN_AUDIT_ANTI_GENERIC_2026-08-29.md`) classifica "retrato real" como KEEP/AMPLIFY.
- `alt` uniforme: "Engº Tiago Sasaki".

---

## 4. Logos e contrato congelado

Arquivos e censo: §1.1. Contrato `data/brand/logo-contract.v1.json` (schema `confenge-logo-contract-v1`, issue #326, `updated_at 2026-09-01`, EXECUTE_NOW/BLOCKED_EXTERNAL).

O que está **congelado literalmente**:
- **SHA-256** dos 4 PNG (`e6af0125…` 800x208 preto; `f8a83f6d…` 500x130 preto; `e6bb135d…` 800x208 branco; `1677038e…` 500x130 branco), bit depth 8, proporção **50:13** (tolerância 1e-12) — `tests/brand/test_logo_contract.mjs` + `test_design_gates.py::test_brand_logo_assets_fit_their_render_box` (masters byte-idênticos; versionados = saída exata de `optimize_brand_logos.optimize`, ≤16 KiB, 500x130, ≥2x da caixa CSS).
- **Markup**: `a.brand` e `div.footer-brand` com exatamente **um** `<img>`, `src` em {`/assets/logo-confenge-500-f8a83f6d.png`, `/assets/logo-confenge-white-500-1677038e.png`}, `alt` não vazio, `width="224" height="58"` (drift <0,02), sem `srcset`/`<picture>`/`<svg>`; rodapé com `loading="lazy" decoding="async"`. As 6 páginas BOFU de `FORBIDDEN_RELATIVE_PATHS` devem manter `/assets/logo-confenge{,-white}.png` 800x208 — daí os 6+6 no censo (`test_shipped_pages_use_versioned_proportional_logos`).
- **Templates** (`scripts/pseo/html_shell.py`, `scripts/market_answers/render.py`, `scripts/offers/render.cjs`, `scripts/site/inbound_first_remediate.py`) devem emitir exatamente esse `<img>` (`test_logo_templates_match_the_shipped_markup`).
- **CSS** (`styles.css`): caixa `.brand img`/`.footer-brand img` ≤236 px, sem `filter`/`image-rendering`, `width` ≤500 px.
- **Censo fail-closed** em `current_surface_observation`: 233 HTML visitor-facing (`public_copy_scope.visitor_facing_relpaths`), 450 `<img logo>`, 230 lockups de cabeçalho, 220 de rodapé, por asset 224/214/6/6. **Qualquer rota nova ou removida reprova até recontagem manual do JSON** (histórico de deltas nos comentários do teste).
- **Master vetorial**: `assets/logo-confenge.svg` deve **não existir** (`no_fabricated_svg`); proibido traçar raster, adivinhar fonte, gerar geometria, embutir raster, trocar asset vivo. Header preto-no-branco marcado `NON_COMPLIANT`; promoção depende de 4 condições do fundador (vetor autorizado, contrato validado, regressão viewport/DPR, paridade produção). Escopo `lockup_only`, `sitewide_recolor_allowed: false`.
- Orçamento de bytes: `test_home_header_footer_asset_budget` (#185/#299) — logos não competem com o LCP.

---

## 5. Sprite SVG (`scripts/site/svg_sprite.py`)

11 símbolos, viewBox 24x24, stroke-only: `i-arrow`, `i-check`, `i-menu`, `i-close`, `i-chart`, `i-shield`, `i-building`, `i-file`, `i-mail`, `i-pin`, `i-whatsapp`. `ensure_sprite()` injeta só os referenciados após o skip-link; `missing_symbols()` falha fechado. Uso nas rotas prioritárias: home usa arrow x18, close, mail, menu, pin, whatsapp x3; `/servicos/` arrow x10 + menu/close; as 3 landings só arrow + menu + close. `i-chart`, `i-shield`, `i-building`, `i-file`, `i-check` não são usados nas 5 rotas. Não há ícone de "planta", "planilha", "régua" ou "revisão".

---

## 6. Restrições que decidem o que pode virar prova

1. **Home**: `design-system.json` `performance_budget.critical_content_bytes_max = 153600`; a campanha registra a home em **152.931 bytes (folga ~0,7 KB)**. Nenhum raster, `<picture>` do retrato nem SVG inline cabe sem cortar outra coisa (a própria campanha aponta ~15 KB de comentários não minificados em `home-10x.css` como folga a recuperar). Fonte única permitida (`font_files_max: 1`).
2. **OG cards e capas** (`og-confenge.jpg`, `clusters/`, `conteudos/`): texto rasterizado, edição por image_gen, fundo fotográfico sem licença documentada; a migração `remove_redundant_article_covers.py` tirou-as do corpo de propósito. Não servem como prova legível nem passam a regra "ativo só com licença verificada".
3. **`data-desk/chart.svg`**: `license NEEDS_REVIEW` + `do_not_index` → não entra em rota indexável.
4. **Logos**: qualquer novo `<img>`/página altera o censo do contrato; troca de ativo ou vetor está bloqueada.
5. **Rótulo demonstrativo** deve estar em texto visível (não só em `<title>`/`<desc>` do SVG) e nunca ao lado de vocabulário de caso de cliente.

## 7. O que pode virar prova legível sem inventar nada

- **Já existente e renderizável**: os 9 SVGs de `casos/*/assets/` (geometria derivada do `source.v1.json`, com "Exemplo demonstrativo" no próprio desenho) e as 8 CSV (→ `<table>`, como já faz `render.py::_table`). Especialmente `elevacao-leste-r00.svg` (é a imagem exata de CF-GEO-01/RF-01) e `planta-r00.svg` (W-01..W-04, D-01, WN-01 do cálculo de 19,60 m²).
- **Slots que já existem nas landings**: `figure.qty-sample` (quantitativos), `figure.coord-sample` (compatibilização), `figure.rv-sample` (revisão) — hoje só texto; a `<figcaption>` demonstrativa já está lá. Embutir o SVG inline (1,4–2,0 KB) ou `<img>` com `alt` rotulado mantém os gates de rótulo.
- **`/servicos/`**: linha 03 e 04 já citam CF-GEO-01 e ORC-PAR-01; poderiam receber o mesmo desenho pequeno (sem orçamento de bytes declarado para o hub, verificar Lighthouse).
- **Home**: prova textual `hero-sample` já cumpre `prova_rotulada`; imagem só se houver corte equivalente de bytes. O retrato real (avatar 512², avif 8 KB) é o único ativo fotográfico com origem conhecida (responsável técnico), mas idem quanto ao orçamento.
- **Nada disso exige** novo dado, novo desenho, nova licença ou alteração do contrato de logo.
