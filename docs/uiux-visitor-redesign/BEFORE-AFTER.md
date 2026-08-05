# Before / After — redesign da experiência do visitante

Evidência visual: `evidence/before/` (snippets/hash pré-mudança) e `evidence/after/` (screenshots pós-redesign).

## Home

| Antes | Depois | Por quê |
|---|---|---|
| Nav com 6+ labels (Bid Room, Proteger, B2G, Conteúdos, Ferramentas…) | 4 grupos + CTA **Analisar meu caso** | Carga cognitiva menor; CTA situacional |
| Hero com “decision spine” tipo dashboard | Matriz fato→prova→impacto ilustrativa | Demonstra raciocínio técnico sem métricas falsas |
| Três journey cards iguais com botões competindo | Lista editorial; contrato sob pressão dominante | Hierarquia por urgência comercial |
| CTA primário “Diagnosticar a operação B2G” no hero | “Analisar meu caso” + link secundário aos caminhos | Uma ação clara na primeira dobra |

## Hub `/conteudos/`

| Antes | Depois | Por quê |
|---|---|---|
| “20 guias indexáveis”, frentes, eixos | Pergunta do problema + busca | Visitante chega com dor, não com SEO |
| 6 featured cards simétricos | 1 análise principal + apoios | Hierarquia de decisão |
| 8 cluster cards (incl. 0 guias / 1 guias) | 3 estágios; só temas com conteúdo; plural correto | Fim de taxonomia e bugs de cópia |
| Diretório com setas e badges repetidos | Linhas: tema, título, descrição | Leitura rápida |

## Checklist aditivo

| Antes | Depois | Por quê |
|---|---|---|
| 36 itens de uma vez | 4 etapas progressivas | Carga cognitiva e mobile |
| “Atualizar diagnóstico” + auto | Progresso auto; diagnóstico sob demanda | Sem redundância |
| Pílulas minúsculas | Segmented ≥44px | Toque e teclado |
| Copiar/Baixar/Apagar = primários | Primário único + secundários + apagar discreto | Hierarquia de ação |
| Ferramenta estreita + aside vazio | Workbench largo; aside some com ferramenta | Área de trabalho real |

## Editorial

| Antes | Depois | Por quê |
|---|---|---|
| Answer-box verde “alert” | Regra lateral + tipografia maior | Escaneável, sóbrio |
| Chips de meta | Uma linha de autoria/atualização | Menos ruído |
| Fontes em caixas clicáveis iguais | Lista com órgão/dispositivo quando houver | Confiança sem bibliografia dump |

## Ferramentas `/ferramentas/` (rodada adversarial)

| Antes | Depois | Por quê |
|---|---|---|
| Lista com 7 metadados por ferramenta (público, dados, tempo, resultado, estado, estágio, limitação) | Entrada por situação: “Preciso conferir um aditivo / reequilíbrio / atrasos” | Visitante escolhe pela dor, não por ficha técnica |
| Três cards simétricos + “Estado só no navegador” repetido | Uma recomendada + duas secundárias; disclaimer único no fim | Hierarquia comercial e menos ruído |
| CSS novo sobre inventário burocrático | Markup situation-first (`tool-situation`) | Redesign de fonte, não só folha de estilo |

Evidência: `evidence/after/tools-hub-1440x900.png`, `tools-hub-390x844.png`.

## Verificador de limites (etapas)

| Antes | Depois | Por quê |
|---|---|---|
| Seis campos em grid plano | Etapa 1 base → Etapa 2 histórico com eixos visuais → Etapa 3 alteração + resumo pré-cálculo | Segue o raciocínio do orçamentista |
| Resultado competia com formulário e ações | Resultado dominante (percentual, saldo, situação, alertas, premissas, próximo passo) | Decisão legível após calcular |
| “Apagar respostas” como botão secundário forte | Ação textual de baixa ênfase; copiar/baixar/imprimir só após resultado | Hierarquia de ação |

Evidência: `limite-empty-1440x900.png`, `limite-filled-1440x900.png`, `limite-result-1440x900.png`. Matemática/jurídico de `computeLimiteAditivo` preservados.

## Hub `/conteudos/` — filtros por estágio

| Antes | Depois | Por quê |
|---|---|---|
| `data-stage=""` em todos os 20 itens | `data-stage` ∈ {antes, durante, conflito} via mapa versionado `data/site/content-stage-classification.json` | Filtros passam a funcionar de verdade |
| Busca ignorava estágio | Interseção busca ∩ filtro; limpar busca mantém estágio; empty state + `aria-live` no contador | Comportamento de diretório utilizável |

Evidência: `hub-filter-durante-1440x900.png`, `hub-search-filter-1440x900.png`.

## Página-pilar sem guias públicos

| Antes | Depois | Por quê |
|---|---|---|
| “0 guias públicos neste tema” + biblioteca vazia | Sem contador, sem CTA para lista vazia, sem seção de biblioteca; nota técnica + ação de caso | Não publicar inventário vazio |
| Hero com `Ver os →` apontando a `#guias` mesmo com lista vazia (SVG no anchor) | Remoção do anchor inteiro (SVG-tolerante) + seções `library-section` sem `library-item` em qualquer HTML público | CTA quebrado e biblioteca vazia são proibidos |

Evidência: `pillar-empty-1440x900.png` / `pillar-empty-390x844.png` (`/acompanhamento-contratos-obras/`, sem “Ver os”). Gate global `remediate_empty_libraries_global` + testes de `library-section` sem item e de `href=#guias` com zero cards.

## Checklist — mapa semântico por `item_id`

| Antes | Depois | Por quê |
|---|---|---|
| Etapas = categorias antigas (essential/support/…) | Mapa explícito `ITEM_STEP` dos 36 IDs em 4 etapas semânticas | Título da etapa coerente com os itens |
| “Sem JavaScript, as etapas aparecem em sequência abaixo.” | `<noscript>` em linguagem útil; fallback técnico removido da UI normal | Visitante não vê jargão de pipeline |

Evidência: `checklist-step1` … `checklist-step4-1440x900.png`.

## Shell global

| Antes | Depois | Por quê |
|---|---|---|
| `/ferramentas/*` com nav antiga (Analisar licitação, Proteger contrato, Operação B2G…) | Mesmos 4 itens + CTA **Analisar meu caso** via `brand.json` / `patch_shell` / `html_shell` | Superfície única; teste compara home, hub, pilares, artigos, ferramentas e comerciais |

## Compromissos

- Não alteramos conteúdo jurídico material nem indexação.
- Não fabricamos cases.
- Esta rodada **não declara** aprovação humana visual do redesign — apenas remove bloqueadores objetivos e deixa evidência para revisão.
