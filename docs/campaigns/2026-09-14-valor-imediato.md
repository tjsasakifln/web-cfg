# Campanha VALOR-IMEDIATO-20260914: pertinência, entrega e prova na primeira tela

Decisão do fundador de 2026-09-14: EXECUTE_NOW para a home, o hub `/servicos/`
e as landings de serviço; VALIDATE para efeitos de aquisição e conversão.
Frente executiva: comercial/editorial. Alavancas: confiança e cliente. Tempo
até evidência: publicação verificada no domínio e reamostragem da primeira
tela nas duas larguras de referência (390×844 e 1366×768).

Base: `eddd918d2` (= `origin/main` na abertura da campanha). Branch
`campaign/valor-imediato-20260914`. O primeiro commit do ramo corrige o
prefill genérico dos cinco pilares B2G congelados (bloqueador datado de
16/09) e recaptura `frozen-specs` e `first-fold` de forma honesta. Este
registro não grava o SHA do candidato: ele é gravado pelos pins de evidência
depois do merge, nunca pelo texto.

## Resultado exigido

Quem chega à home ou a `/servicos/` deve, sem rolar, reconhecer a própria
situação no vocabulário em que a descreveria (comparar propostas, completar ou
conferir um projeto, entender uma infiltração, avaliar um imóvel, responder a
uma glosa), entender que parte do trabalho a CONFENGE assume e o que passa a
ter em mãos, ver uma razão de confiança autorizada e um único próximo passo
principal, com o contato a um passo. A sequência A → E do protocolo: A tem a
ver com meu problema · B entendi que parte assumem e o que muda para mim · C
visualizo a entrega e como vou usá-la · D há motivo concreto para acreditar ·
E conversar é um próximo passo útil e simples.

## Universo, descoberta e concepção

A descoberta (universo, gates, baseline de texto visível, capturas,
produtores, mapa de situações e crítica) está no scratchpad da sessão
(`discovery/01-universo.md` a `07-critica.md`) e o exame cego de três
concepções (P/Q/R, 21 revisores, protocolo congelado) em
`concepts/sintese-home.md` e `concepts/sintese-quantitativos.md`. Só entram
na página fatos autorizados pelo inventário de confiança (`06-situacoes.md`
§5): EESC-USP, CNPJ, registro ativo no CREA sem número, "serviços técnicos
emitidos com ART e nota fiscal", amostras demonstrativas rotuladas e dado PNCP
como contexto de mercado. Credenciais WITHHELD não entram; "R$ 700 milhões"
só aparece como trajetória, nunca como prova de resultado.

### Concepção implementada: híbrido

O exame classificou alt2 > alt1 > base nas duas rotas. O que se implementa é
um híbrido, porque a alt2 venceu pela pertinência (situações no subtítulo do
hero) e perdeu pontos onde a amostra dominava a primeira tela:

1. Mecanismo de pertinência da alt2: o subtítulo do hero nomeia as situações
   no vocabulário do comprador e o verbo de trabalho assumido, em obra pública
   ou privada. Foi o único padrão com pertinência suficiente na primeira tela
   em todos os cenários do exame.
2. Disciplina de cartões da alt1: cada situação em duas cláusulas (o que
   assumimos / o que você passa a ter e para que serve), limite material curto
   na mesma linha, um destino principal e no máximo um apoio.
3. Prova demonstrativa compacta: a amostra (21,84 m² menos 1,68 m² e 0,56 m²
   de vãos = 19,60 m², item ORC-PAR-01) fica em três linhas, rotulada como
   demonstrativa, com legenda em linguagem comum e quem assina, sem dominar a
   primeira tela de quem chega com infiltração, avaliação ou glosa.
4. Faixa de contato logo depois das situações, antes de obras públicas:
   WhatsApp e e-mail contextuais, compromisso escrito do primeiro contato e o
   prazo de resposta já publicado para obra pública junto dos canais.
5. Dois CTAs na dobra: um primário com destino declarado (`/servicos/`) e um
   secundário para descrever a situação (`/triagem-tecnica/`).
6. Sete situações na home: projeto (elaborar, completar, conferir,
   compatibilizar), quantitativos e orçamento, imóvel com problema, avaliação
   de imóvel, perícia e assistência, segurança do trabalho, obra pública. Ids
   existentes preservados; novos: `situacao-orcamento` e `situacao-avaliacao`.
   Inspeção, assistência e SST apontam direto à landing.
7. `/servicos/`: lead curto por situação, nove cartões com um caminho
   principal e no máximo um apoio, `article#servico-avaliacao` próprio (fora
   de `#servico-pericia`), oito ids anteriores preservados.

### O que não muda

Preços e condições publicadas; `<form id="formulario-contato">` (hash, nomes,
values); `#triagem-tecnica`, `#contato`, `#obras-publicas`,
`li#jornada-contrato` e `#mercado-pncp` byte a byte; demonstrativos
(geometrias, critérios, preços hipotéticos, oito CSV); slots gerados; limites
materiais C4/C5 visíveis junto da oferta; disponibilidade nacional
condicional; opções do `#estagio` e `js/modules/nav.js`.

## Migração de gates

Regra desta campanha: antes de editar um consumidor, a propriedade legítima
que ele protegia é escrita aqui. Nenhum teste é esvaziado nem marcado como
`skip`; cada um continua reprovando um defeito nomeado (contraprova).

| Regra antiga | Consumidor | Por que impedia | Propriedade legítima | Substituição | Controle positivo | Contraprova |
|---|---|---|---|---|---|---|
| ≥3 de 7 termos de trabalho (`elaboração, revisão, compatibilização, quantitativos, orçamentos, perícias, análises técnicas`) e ≥3 de 7 formatos (`plantas, detalhes, memórias de cálculo, planilhas, laudos, pareceres, relatórios`) visíveis na dobra | `scripts/site/test_home_first_fold.mjs` (`CONTENT_CONCEPTS`) | Obrigava a enumeração de disciplinas e formatos na primeira tela; o exame cego mostrou que a enumeração não gera pertinência (Q1 só na fatia ii/iii) e faz a entrega virar formato (falha B) | A dobra, medida no texto renderizado em 390×844 e 1366×768, nomeia ≥1 situação no vocabulário do comprador, ≥1 verbo de trabalho assumido, ≥1 entrega nomeada, ≥1 uso da entrega e ≥2 credenciais autorizadas; um só primário; contato a um passo; "engenharia" e alcance público+privado presentes | Conceitos `situacao_do_comprador` (≥1), `trabalho_assumido` (≥2), `entrega_nomeada` (≥1), `uso_da_entrega` (≥1), `prova_rotulada` (≥1: demonstrativ) somam-se aos que ficam (`engenharia`, `públic`+`privad`, credenciais ≥2) | Hero novo passa nas duas larguras | "Engenharia com solução personalizada. Solicite uma proposta." e "Engenharia que transforma o seu projeto" reprovam (`generic_hero_is_rejected`, `generic_hero_transforma_is_rejected`) |
| Literais "Projetos e serviços de engenharia", "obras públicas e privadas", todos de `elaboração, revisão, compatibilização, orçamentos` e ≥5 de 8 documentos nomeados na `<section class="hero">` | `scripts/site/test_home_conversion_contract.py::test_first_fold_answers_category_problem_result_trust_and_start` | Congelava o H1 e a enumeração da base | Hero contém "engenharia", alcance público e privado (`públic… e/ou privad…`), ≥1 verbo de trabalho assumido, ≥1 situação do comprador, ≥1 entrega nomeada, ≥1 uso, credenciais EESC-USP e CNPJ, um primário para `/servicos/`, sem PNCP | Regexes de propriedade em vez de literais | Hero novo passa | Hero sem verbo de trabalho ou sem situação reprova |
| 5 rótulos literais + `== 5 situation-row` + 6 hrefs literais (4 deles `/servicos/#servico-*`) | `test_home_conversion_contract.py::test_situation_chooser_has_five_paths_without_catalog_wall`; `test_design_gates.py` (`test_journey_accessible_without_js`, `test_trace_matrix_and_tension_present`); `test_visitor_redesign.py` (L734, L1133); `test_nav_taskflow.py` (L477, L486); `test_public_ia.py` (L52); `test_production_cutover.mjs` (L242); `test_ui_geometry.mjs` (9, 11, 12c) | Fixava cinco situações, uma delas fundindo perícia e avaliação, e obrigava as quatro privadas a passar pelo hub mesmo quando a landing existe | Uma única taxonomia de situações (`brand.json.service_situations` = `public-ia-map.json.service_situations`), cada situação com rótulo presente na home, id `situacao-*` presente, href distinto, interno e existente (fragmento existente no destino), nenhuma para `/triagem-tecnica/#`; `#situacoes` antes de `#obras-publicas`; obra pública mantém `/servicos-obras-publicas/` | Contagem = `len(service_situations)`; rótulos e hrefs lidos do contrato; destinos aceitos: hub `/servicos/#servico-*` ou landing registrada no mapa | 7 situações passam | Situação sem href, href repetido, href externo ou fragmento inexistente reprova; duas situações com o mesmo destino reprovam |
| `SERVICE_SITUATION_IDS` = 5 ids fixos | `scripts/site/public_ia.py::validate_contract` | Impedia situação própria de quantitativos e de avaliação | O conjunto de ids é o contrato; cada id tem regra de destino própria; situação fora do contrato falha fechada para triagem | 7 ids (`quantities_budget` → `/quantitativos-orcamento-obras/`; `property_valuation` → `/servicos/#servico-avaliacao`) | mapa novo valida | id desconhecido reprova |
| Lista exata e ordenada de 8 `article.corporate-service-row` | `test_home_conversion_contract.py::test_services_hub_is_corporate_indexable_and_price_free` | Impedia `article#servico-avaliacao` próprio | Conjunto obrigatório de ids de cartão presente (8 anteriores + `servico-avaliacao`), cada um como `article.corporate-service-row`; ordem livre | Igualdade de conjunto | 9 cartões passam | Cartão ausente reprova |
| `== 8 data-section-archetype` e `main > section === 8` | `test_deliverables_hub.py` (L575), `test_deliverables_hub_ui.mjs` (L489), `test_production_cutover.mjs` (L244) | Impedia retirar "Para quem" e o ledger genérico | Home com 5 a 8 blocos narrativos, ≥5 arquétipos distintos, `journey_paths` presente, nunca três iguais seguidos, `#situacoes` antes de `#obras-publicas` (já em `test_design_gates`) | Faixa 5–8 nas três contagens; ≥5 distintos em `test_deliverables_hub.py` | 7 blocos, 6 distintos | 4 blocos ou 9 blocos reprovam |
| Literais "O que sai do trabalho" + 4 h3 do ledger + `offer_dominant` contendo `corporate-deliverables` + `class="deliverable-ledger"` | `test_deliverables_hub.py::test_home_keeps_deliverables_concrete_inside_the_corporate_journey`; `test_design_gates.py::test_home_card_grid_limit` | Congelava um ledger que os 21 revisores leram como genérico nos três rótulos | A home nomeia a entrega concreta e o seu uso dentro de cada situação: toda `.situation-row` tem `h3` e uma cláusula de uso (`.situation-use` com "passa a ter"); o hero nomeia uma entrega ligada a uso (`.hero-deliverable` ≥120 caracteres com formato e finalidade) | Verificação por linha de situação | 7 linhas passam | Linha sem cláusula de uso reprova |
| `.hero-deliverable` ≥120 chars com `(planta|projeto|memória|planilha)` e `(orçamento|laudo|parecer|relatório)`; `serviceDestinations ≥ 4` hrefs `/servicos/` | `test_ui_geometry.mjs` item 9 | Obrigava a home a devolver quatro situações ao hub em vez da landing | Sem JS: h1 presente, `len(service_situations)` linhas, toda linha com destino interno de explicação, ≥2 canais diretos, hero com entrega ligada a uso | `serviceDestinations` = ações de situação com href interno não genérico | passa | Linha sem ação ou apontando para `/triagem-tecnica/` reprova |
| 4 primeiros hrefs `^/servicos/#servico-`; 5ª = `/servicos-obras-publicas/` | `test_ui_geometry.mjs` 12c | Idem | Cada situação chega a explicação com próximo passo: hub (fragmento existente, ≥300 chars, cláusulas de trabalho e entrega, contato contextual) ou landing (h1, main ≥1800 chars, canal de contato); destinos distintos; projeto alcança quantitativos; obra pública mantém o hub | Ramo por tipo de destino | passa | Destino sem contato ou fragmento ausente reprova |
| Rótulo literal "Conhecer os serviços" | `test_brand_contract.py` (L82), `test_design_gates.py` (L451, L497) | O rótulo não declarava destino (achado G) | O primário do hero usa o rótulo canônico de `brand.json.hero.cta_primary`, que declara o destino (`/servicos/`) | Literal lido do contrato | passa | Rótulo divergente do contrato reprova |
| `EXPECTED_H1_TERMS` = projetos, serviços de engenharia, obras públicas, privadas | `test_production_cutover.mjs` (L94) | Congelava o H1 antigo | H1 nomeia engenharia e um verbo de trabalho assumido | Termos: "engenharia" + regex de verbo | passa | H1 genérico reprova |
| Jornada `pericia_avaliacao → /servicos/#servico-pericia` | `test_contact_journeys.mjs` (L49) | Fundia perícia e avaliação | Perícia → landing de assistência; avaliação → `/servicos/#servico-avaliacao`; inspeção e SST → landings; quantitativos → `situacao-orcamento` | Tabela de jornadas realinhada ao contrato | passa | Home sem entrada para uma jornada reprova |
| `design-system.json#home_architecture` (7 blocos com `tension_sequence`/`journey_rail`, CTAs "Analisar meu caso") | nenhum leitor | Contrato morto que induzia concepção reprovada pelos gates reais | Descrição do real, marcada como não normativa | Alinhado à home publicada | n/a | n/a |

### Gates que continuam intactos

`CAPTURE_FORM_SHA256`, `li#jornada-contrato`, `#mercado-pncp` (3 painéis),
`test_authority_contract` (`ul.hero-proof`), `test_self_deprecating_copy`,
`test_integral_solution_copy` (nenhum "solução completa / sob medida" sem
enumeração), `test_copy_gates`, `hub_link_matrix.json` (9 âncoras
preservadas e marcadores `data-hub-link` em `/servicos/`), `render_nav_hubs`
e `shell_nav` (shell inalterado), `frozen-specs` (nenhum arquivo congelado
tocado), `test_cta_whatsapp` (mensagens contextuais).

## Analytics e atribuição

`data-cta-id="home-private-quantities-budget"` passa da linha de projeto para
a ação da nova linha de quantitativos (`#situacao-orcamento`), que é o destino
que o id sempre descreveu. Eventos `whatsapp_click` e `email_click` da nova
faixa de contato usam `data-cta-position="contact_band"`. Nenhum PII em
analytics; mensagens de WhatsApp continuam pré-escritas e contextuais.

## Rollback

Reverter o merge commit da campanha devolve a home, `/servicos/`, os
contratos de dados e os testes ao estado da base. Os pins de evidência
(`first-fold-measurements`, `frozen-specs`) apontam para commits alcançáveis
em ambos os estados.

## Revisão adversarial sobre o candidato (2026-09-15)

Protocolo congelado antes de existir candidato (perguntas Q1–Q7, cenários
S1–S10, falhas A–I). Exame A cego: 36 revisores (11 rotas × cenários × duas
versões com rótulos neutros P/Q sorteados por rota, só texto visível em
fatias e capturas; sem briefing). Exame B: 11 revisores confrontando a
impressão com a oferta autorizada (`proof.json`, `credential-registry`,
preços por estado, destino e prefill de cada CTA, aprofundamento contra a
base). Resultado: o candidato venceu a base nas 11 rotas; 10 vieram com
correções obrigatórias, todas aplicadas antes do merge. A mais material: a
amostra do hero da home atribuía à parede W-02 a conta das quatro paredes
(21,84 m²); corrigida para "recorte de banheiro, paredes W-01 a W-04".
Outras: "assinamos o que falta" → "assumimos a responsabilidade técnica pelo
que falta, no escopo e na atribuição confirmados na proposta"; cartão de
obra pública restrito à medição glosada; condições de autoria, conflito de
interesse e atribuição por disciplina junto da oferta em revisão,
compatibilização, complementares, assistência, SST e triagem; CTA do órgão no
hub B2G deixou de voltar à triagem em laço; contadores CSS das amostras de
assistência e SST corrigidos. Revisores são agentes, não compradores; nenhuma
métrica humana foi produzida.

### Antes → depois por rota (texto visível, DOM; base eddd918d2 → candidato)

| Rota | palavras em `main` | abertura | palavras até o 1º contato em `main` | palavras até a 1ª prova |
|---|---|---|---|---|
| `/` | 1732 → 1876 | 127 → 194 | 73 → 132 | nenhuma → 83 |
| `/servicos/` | 1173 → 1655 | 94 → 117 | 212 → 83 | 326 → 427 |
| `/quantitativos-orcamento-obras/` | 2180 → 2541 | 158 → 266 | 2166 → 147 | 90 → 74 |
| `/revisao-tecnica-projetos-engenharia/` | 1232 → 1604 | 178 → 306 | 1214 → 228 | 99 → 103 |
| `/compatibilizacao-projetos-engenharia/` | 1614 → 1917 | 150 → 280 | 1600 → 218 | 636 → 91 |
| `/projetos-complementares-engenharia/` | 1420 → 1732 | 151 → 305 | 96 → 257 | 153 → 131 |
| `/inspecao-diagnostico-edificacoes/` | 1371 → 1534 | 119 → 293 | 1353 → 220 | 121 → 128 |
| `/assistencia-tecnica-pericial-engenharia/` | 1394 → 1450 | 120 → 294 | 1376 → 237 | 122 → 143 |
| `/seguranca-trabalho-apoio-tecnico/` | 1423 → 1570 | 137 → 310 | 1405 → 245 | 139 → 155 |
| `/servicos-obras-publicas/` | 882 → 1603 | 181 → 132 | nenhum → 658 | 38 → 39 |
| `/triagem-tecnica/` | 459 → 833 | 298 → 618 | 79 → 98 | – |

Leitura honesta: o texto total cresceu na maioria das rotas (a abertura
ganhou a frase de situação, a entrega ligada ao uso e a linha de canal com
compromisso), e o que caiu foi o esforço de localização: o primeiro contato
nas landings passou do rodapé (1.200 a 2.200 palavras) para a abertura
(150 a 260 palavras), a prova não-âncora chegou antes e cada cartão tem um
caminho principal. A home ficou dentro do teto de texto visível a 1440 px
(7.279 de 7.500 caracteres, medido no `innerText` de `main`). Número de
palavras é diagnóstico, não objetivo.

### Gates migrados fora do núcleo

| Regra antiga | Consumidor | Propriedade legítima | Substituição | Contraprova |
|---|---|---|---|---|
| "Ver os" proibido em página sem cartões de biblioteca | `test_visitor_redesign.py::test_global_no_zero_or_one_guias_plural_bugs` | sem "Ver os 0 guias" | rótulos reescritos (não era o bug de plural); regra intacta | — |
| "qual destas situações se parece com a sua" + 5 rótulos literais | `test_copy_gates.py::test_microcopy_preferences` | bloco `#situacoes` com título visível e cada situação de `brand.json#service_situations` presente com destino distinto | fonte única | rótulo ausente ou destino repetido reprova |
| "Entrar em obras públicas" literal | `test_copy_gates.py::test_public_surfaces_have_no_prose_em_dashes` | ação da situação de obra pública leva ao hub | regex de `situation-action` → `/servicos-obras-publicas/` | — |
| `offer_dominant` antes do PNCP | `test_home_real_contract_case.py` | a oferta própria (`journey_paths`) precede o contexto de mercado | arquétipo das situações | — |
| "menos de um minuto" e "não é contratação nem pagamento" literais | `tests/intake/test_mv03_adaptive_intake.mjs` | rota acolhe quem não sabe nomear o serviço; compromisso do primeiro contato escrito | regex de paráfrase | ausência do compromisso reprova |
| link obrigatório a `/triagem-tecnica/` em quatro fragmentos de `/servicos/` | `tests/campaigns/pos_inb_20260911/10/test_composition.mjs` | próximo passo de contato dentro do cartão | triagem, bloco de contato da landing ou canal direto | fragmento sem contato reprova |
| censo de CTAs = 128 | `data/commercial/cta-form-next-state.v1.json` | cada CTA com destino real e contrato next-state | 133 com nota factual (faixa de contato da home, canal do hub B2G, canais do hero de inspeção) | inventário regerado pelo escritor canônico |
| `_headers`/`sitemap.xml` regenerados pela build; `frozen-specs` | `test_frozen_specs.py` | bytes protegidos só mudam com recaptura datada e motivo | recaptura sobre commit alcançável (só lastmod de `/triagem-tecnica/`) | drift sem recaptura reprova |

### Correções técnicas surgidas nos gates pós-build

Hero móvel com quebra fixa para a face de fallback e a Archivo dividirem a
linha no mesmo ponto (deriva 26 px → 0); estimativas de
`contain-intrinsic-size` por faixa de largura para as seções da home e as duas
seções finais sempre renderizadas (a rolagem até o formulário deslocava o
alvo do toque); `/entregas/` abaixo do teto de 17.900 px a 390 px; lead e
prova do hub B2G encurtados para a ação primária caber na dobra de 390 px.

## Estados de evidência

- Implementação: concluída e commitada nesta branch.
- Revisão editorial/visual: Exame A cego e Exame B executados por agentes;
  correções aplicadas; não substitui compreensão com pessoas reais.
- Integridade técnica: bateria pré-build do CI, gates pós-build sobre `_site`
  (geometria, dobra, jornadas de contato, hub de entregas, acessibilidade,
  payload), duas builds consecutivas idênticas.
- Publicação: registrada no PR e na execução de `netcup-release` do
  candidato (este arquivo não grava o SHA do próprio candidato).
- Compreensão com pessoas reais: NOT_STARTED (protocolo humano existente,
  sem participantes nesta campanha).
- Recebimento operacional e resultado comercial: não observados nesta
  execução; observar por página/origem → abertura de canal → conversa
  recebida → contato qualificado → proposta, com as fontes já existentes.

## Pendências registradas

- `assets/og-confenge.jpg` tem o H1 anterior gravado na imagem; sem produtor
  no repositório. Regeneração pendente com ativo e fonte de licença livre.
- `scripts/commercial/render_public_catalog.mjs` mantém a opção
  "Perícia, assistência técnica ou avaliação" no seletor de `/entregas/`
  (`SERV-PERICIA`); separar exige regravar `/entregas/` no mesmo PR.
- `scripts/pseo/html_shell.py` mantém o rodapé de fallback com
  `/#situacao-pericia` (id preservado; link válido).
