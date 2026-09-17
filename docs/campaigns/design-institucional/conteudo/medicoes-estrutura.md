# /medicoes-glosas-obras-publicas/ : pilar B2G na mesma composição do site

Procedência: lido em 2026-09-17 na base `47da03b64` (worktree `salto-01-piloto`): `medicoes-glosas-obras-publicas/index.html` (37.551 bytes; 10.077 px em 1440 e 13.836 px em 390 segundo o caderno), `data/bofu-dominance/frozen-specs/hashes.json`, `data/bofu-dominance/frozen-specs/unlock-plan.v1.json`, `data/organic/bofu-intent-matrix.json` (linha `medicoes-pagamentos`), `data/organic/public-family-registry.json` (família `service-pillars`), `scripts/site/document_intake.py` (`FROZEN_RELATIVE_PATHS`), `scripts/site/scrub_em_dashes.py`, `tests/commercial/test_cta_form_next_state.mjs`, `docs/campaigns/design-institucional/caderno.md` (diagnóstico 6). Frente A, conteúdo e percurso. Nada aqui altera HTML.

## 0. Aviso de escopo, antes de qualquer coisa

Esta rota está congelada por hash. Em `frozen-specs/hashes.json`, `forbidden["medicoes-glosas-obras-publicas/index.html"] = 53bb71bb3edaeae8a325e29d266020a89f5cff72c1be0486c07b19a276a8d3e1`, `baseline_commit f1bf6da68ecd69bb090f810f90a13f9604aa65a3`, recaptura de 2026-09-16 (motivo registrado: captura on-page nos seis pilares). A autorização do fundador de 2026-09-16 (`unlock-plan.v1.json#capture.authorization`) cobre o formulário on-page com o componente compartilhado; `html_mutation_authorized` continua `false` para o gate das substituições experimentais. Uma reestruturação editorial como a proposta aqui não está coberta por essa autorização: precisa de decisão própria e de recaptura revisada (`scripts/bofu_dominance/frozen_specs/materialize.py`, com `baseline_commit` e motivo), além de `test:page-contract-*`, `inbound:gates` e `tests/bofu_dominance/frozen_specs/test_frozen_specs.py`. A rota também está em `FROZEN_RELATIVE_PATHS` de `document_intake.py` (o gate de honestidade não reescreve; só confere) e em `scrub_em_dashes.py`.

## 1. Tudo o que é contrato nesta página (observado)

- Preço e condições publicados: nenhum. Zero ocorrências de "R$" no arquivo. A linha `medicoes-pagamentos` do `bofu-intent-matrix` tem `offer_class: null` e `offer_id: null`. Não inventar preço, prazo nem condição.
- `document_intent`: não existe nesta página (zero ocorrências). O formulário não tem esse campo; a honestidade sobre arquivos está na frase visível "O site não recebe arquivo; quando necessário, o canal seguro é combinado após o protocolo." e no `FROZEN_RELATIVE_PATHS`.
- Formulário on-page (`#captura-pilar`): `<form class="pillar-capture-form" name="diagnostico-confenge" method="post" action="/.netlify/functions/lead" data-offer-id="" data-cta-id="medicoes-glosas-obras-publicas-handraise" data-asset-id="medicoes-glosas-obras-publicas" data-route-family="medicoes-glosas" data-cta-position="pillar_capture" data-form-contract="next-state/v1" data-next-state-profile="service_fit_review" data-runtime-profile="shared_lead_form_v1" data-receipt-required="true">`. Campos ocultos: `offer_id`, `terms_id`, `jornada=contrato` (`#jornada-hidden`), `estagio=medicoes-glosas-obras-publicas` (`#estagio`), `origem`, `asset_id`, `cta_id`, `route_family=medicoes-glosas`, `landing_page`. Visíveis: `#nome` (obrigatório), `#empresa`, `#email`, `#telefone`, `#mensagem`, `consentimento` (obrigatório, valor 1). Botão "Descrever a medição". Recibo inline "Protocolo CONFENGE:" (contrato next-state/v1 conferido por `test_cta_form_next_state.mjs`). A família `service-pillars` declara `terminal_action: capture_form` (estrito, não `or_whatsapp`): o formulário precisa continuar dentro de `<main>`; `missing_on_page_form` é regra dedicada do `inbound:gates`.
- JSON-LD: `Organization`, `Person` (Engº Tiago Sasaki, `knowsAbout` inclui "Fiscalização e medição de obras"), `CollectionPage#collection` com `ItemList numberOfItems 6` e posições 1, 4, 7, 8, 11, 13, `Service#service` com `name: "Dossiê de Medição, Glosa e Pagamento"` e `description` igual ao H2 de objetivo ("Organize a prova da execução, identifique o critério contratual aplicável e reduza o tempo entre produzir, medir e receber."), `FAQPage` com as três perguntas da seção `faq-section`, `BreadcrumbList` (Início > Contrato sob pressão > Medições, glosas e pagamentos em obras públicas), `WebSite`. `og:image` e `image` apontam para `/assets/clusters/medicoes-glosas-obras-publicas.jpg`.
- Biblioteca: exatamente 6 guias, os mesmos de `supporting_indexable_routes`: `/conteudos/atraso-pagamento-contrato-publico-suspender/`, `/conteudos/atraso-na-medicao-obra-publica/`, `/conteudos/pagamento-parcial-etapa-empreitada-global/`, `/conteudos/medicao-por-evento-obra-publica/`, `/conteudos/fiscal-nao-assina-medicao-obra-publica/`, `/conteudos/glosa-por-qualidade-obra-publica/`. Cada `article.library-item` carrega `data-content-item data-cluster="medicoes-glosas-obras-publicas" data-search="..."`. O número 6 aparece no hero ("Ver os 6 guias"), no bloco de objetivo ("6 guias públicos neste tema"), na seção e no JSON-LD: um índice regrado precisa manter seis.
- Metadados de rota: `robots index,follow,...`, canonical `https://confenge.com.br/medicoes-glosas-obras-publicas/`, `<body data-route-family="medicoes-glosas" data-asset-id="medicoes-glosas-obras-publicas" data-cta-id="pillar_hero" data-journey="contrato">`, breadcrumb pai `/problemas-que-resolvemos/` (public-ia-map.parents), header ativo `/servicos-obras-publicas/`.
- Ids no main: `quando-ajuda`, `executado-medido-contratado-evidenciado`, `entrega-dossie`, `exemplo-demonstrativo`, `guias`, `quando-nao-contratar` (com `data-when-not-hire="1"`), `captura-pilar`, `metodo` (com `data-surface-type="oferta"`), mais os ids do formulário. Âncora interna consumida: `#guias` (hero). A home aponta para `/medicoes-glosas-obras-publicas/` (rótulo "Dossiê de Medição, Glosa e Pagamento") e `/servicos/` idem.
- Contatos: um único href de WhatsApp na página, repetido três vezes (hero "Analisar uma demanda", ponte "Enquadrar um risco contratual" com `data-cta-position="pillar_bridge"`, fechamento "Abrir a medição no WhatsApp"): `https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Tenho%20glosa%20ou%20medi%C3%A7%C3%A3o%20contestada%20e%20preciso%20enquadrar%20a%20posi%C3%A7%C3%A3o%20t%C3%A9cnica.` Sem `mailto:` nem `tel:` no main (só no rodapé). Links de saída no corpo: `/especialista/tiago-jun-sasaki/`, `/ferramentas/diagnostico-defesa-margem/` (aside `data-stage-cta="exploracao"`, `data-cta-id="diagnosticar-contrato"`), `/diretoria-b2g/` (botão "Diretoria Fracionada para o Mercado Público na execução", nome de oferta existente), `/privacidade/`, `/triagem-tecnica/#corrigir-o-site`, `/conteudos/fiscal-nao-assina-medicao-obra-publica/` (duas vezes).
- Rodapé de autoridade (`#metodo`): "Autor institucional: CONFENGE · Responsável técnico: Engº Tiago Sasaki · Referência: 15 de agosto de 2026", método, fonte (Lei nº 14.133/2021 e os critérios de medição do contrato), limitação ("não é parecer jurídico"), "Atualizado em 11 de setembro de 2026". Gerido por `scripts/site/authority.py`.
- Frases de limite que sustentam a honestidade e não podem sumir: "Não substitui o ateste do órgão nem a petição do advogado."; "A CONFENGE atende a empresa contratada. O órgão público contratante decide o ateste, a liquidação e o pagamento."; "não promete recebimento, êxito administrativo nem decisão judicial"; "O registro não é compra, parecer jurídico ou promessa de resultado."; "O órgão contratante continua responsável pelo ateste."

## 2. Nova ordem da página

Reconhecimento:

1. Abertura (hero): necessidade, trabalho, entrega nomeada, próximo passo. Uma coluna, mesma tipografia do restante do site, sem degradê próprio. Prancha ao lado ou logo abaixo.
2. `#exemplo-demonstrativo`: prancha "Mesma parede, quatro números" (P3 da frente B, legenda em §3.2), movida para depois do hero.
3. `#entrega-dossie`: o documento entregue, com o que contém e o que não contém.
4. Chamada curta para `#captura-pilar` (ação dominante) com o WhatsApp como alternativa.

Aprofundamento:

5. `#quando-ajuda` fundido com `#quando-nao-contratar`: "Quando pedir, quando resolver na obra".
6. `#executado-medido-contratado-evidenciado`: o método em quatro recortes (texto atual, mantido).
7. Base documental e riscos de abordagem (seção sem id, hoje duas listas): fundidas em "Entradas e erros que custam caro".
8. `#guias`: os seis guias como índice regrado (lista numerada de uma linha por guia, sem seis cartões iguais).
9. `faq-section`: três perguntas mantidas como "Condições e limites".
10. Seção "Oferta comercial relacionada": reduzida a uma linha subordinada dentro do próximo passo (link `/diretoria-b2g/` preservado com o rótulo atual).
11. `content-cta` + `#captura-pilar`: um único bloco de próximo passo com o formulário; WhatsApp como botão secundário.
12. `#metodo`: rodapé de autoridade, intacto.

O aside `lead-inline` (ferramenta de leitura do contrato) permanece como caixa subordinada dentro do aprofundamento (item 7), com os mesmos atributos `data-*`.

Índice de página (6 rótulos): **Exemplo** (`#exemplo-demonstrativo`) · **O dossiê** (`#entrega-dossie`) · **Quando pedir** (`#quando-ajuda`) · **Quatro números** (`#executado-medido-contratado-evidenciado`) · **Guias** (`#guias`) · **Descrever a medição** (`#captura-pilar`).

## 3. Textos propostos

### 3.1 Abertura (hero)

Eyebrow (manter): Fluxo de caixa e direito ao recebimento

H1 (manter): Medições, glosas e pagamentos em obras públicas

Necessidade: O boletim voltou glosado, a medição parou ou o fiscal lê o critério de um jeito e a obra de outro, e o caixa da empresa está financiando o contrato enquanto isso.

Trabalho: Lemos o contrato, o critério de medição, o boletim contestado e a memória de quantitativos; separamos o que foi executado, o que foi medido, o que o contrato manda medir e o que a prova sustenta; apuramos em reais o que está glosado ou retido e escrevemos a posição técnica que a empresa apresenta ao fiscal.

Entrega: Você passa a ter o Dossiê de Medição, Glosa e Pagamento: cronologia do período com a prova de cada evento, diferença em reais entre medido e glosado, parcela incontroversa separada, lacunas declaradas e a posição técnica escrita para ser protocolada.

Limite (uma linha, mantida): A CONFENGE atende a empresa contratada. O órgão contratante decide o ateste, a liquidação e o pagamento; a análise técnica não é petição jurídica e não promete recebimento.

Próximo passo: botão dominante "Descrever a medição" (`href="#captura-pilar"`), botão secundário "Falar pelo WhatsApp" (href atual), link "Ver os 6 guias" (`#guias`). Byline mantida: "Engenharia por Engº Tiago Sasaki: documentos, cálculos e fontes conferíveis."

Nota: hoje o botão primário do hero é o WhatsApp. Apontar a ação dominante para o formulário da própria página segue a ação terminal declarada (`capture_form`) e o caderno ("contato único"); é decisão do integrador porque muda hash, `data-cta-position` e o inventário de CTAs.

### 3.2 Prancha "Mesma parede, quatro números" (`#exemplo-demonstrativo`)

Eyebrow (manter): Exemplo demonstrativo

H2 (manter): Mesma parede, quatro números

Figura: prancha P3 da frente B, já gerada nesta worktree (`assets/pranchas/medicao-parede-desktop.svg` e `medicao-parede-mobile.svg`, fonte `data/demonstrative/plates/medicao-parede.v1.json`, manifesto `docs/campaigns/design-institucional/assets-manifest.json`, slot declarado para `/medicoes-glosas-obras-publicas/#exemplo-demonstrativo`). A composição é dela: três séries sobre uma régua de 0 a 120 m² (EXE-01 executado declarado 120, MED-01 medido no boletim 90, EVI-01 evidenciado por fotos datadas 80), duas faixas derivadas (DIF-01 diferença medido × executado, 120 − 90 = 30 m²; LAC-01 lacuna de prova, 90 − 80 = 10 m²) e o critério contratual CRIT-01 como régua, não como quarta medição. Sem valores em reais. O rótulo "exemplo demonstrativo" e o aviso da fonte ("Premissas sintéticas para mostrar a estrutura do dossiê. Não é medição de cliente, não é direito automático a 120 m² e não substitui o ateste do órgão contratante.") fazem parte da prancha. A frente A não redesenha a figura; a legenda abaixo é escrita para essa composição.

Legenda: Exemplo demonstrativo, com premissas sintéticas; não é obra de cliente. A mesma alvenaria em quatro números: 120 m² é o executado declarado pela empresa no período; 90 m² é o que o boletim mediu; 80 m² é o que as fotos contemporâneas, com data e local, evidenciam; a régua é o critério contratual de medição pela área de projeção da parede, e não uma quarta medição. O dossiê registra os quatro separados e não trata os 120 m² como direito automático: a diferença entre medido e executado (30 m²) e a lacuna de prova (10 m²) saem escritas, e o que não tem protocolo, foto ou memória fica como lacuna, nunca como estimativa apresentada como fato. O órgão contratante continua responsável pelo ateste.

Parágrafo abaixo da figura (manter o texto atual): Premissas sintéticas, não obra de cliente. Uma alvenaria de 120 m² executada no período; o boletim mediu 90 m²; o contrato manda medir a área de projeção da parede; as fotos contemporâneas cobrem 80 m² com data e local. O dossiê não trata 120 m² como direito automático: registra 90 m² como medido, 120 m² como executado declarado, o critério contratado como régua e 80 m² como evidenciado. A diferença e a lacuna de prova saem escritas. O órgão contratante continua responsável pelo ateste.

Link mantido: Para a recusa de assinar o boletim nas primeiras 48 horas, o recorte operacional está no guia da recusa de ateste (`/conteudos/fiscal-nao-assina-medicao-obra-publica/`).

### 3.3 O dossiê (`#entrega-dossie`)

Eyebrow (manter): O que você recebe

H2 (manter): Dossiê de Medição, Glosa e Pagamento

Texto (manter, com a ordem: contém, não contém, como começar): A entrega é um documento técnico: cronologia do período com a prova de cada evento, diferença em reais entre o medido e o glosado, itens controvertidos com causa e evidência, lacunas declaradas, parcela incontroversa e subsídio para a empresa protocolar a contestação. Não inclui petição jurídica, representação nem promessa de recebimento. Você pode começar sem o conjunto completo. Contrato ou critério de medição, boletim contestado e a memória que existir já abrem a conversa. O que faltar vira lista de lacunas, não recusa de atendimento. Descreva o período, o órgão contratante e o que já está em mãos, mesmo que falte diário, foto ou nota fiscal.

Observação: o texto atual usa hífen com espaços ("em mãos - mesmo que"); a versão acima troca por vírgula. Não há travessão no arquivo hoje (zero ocorrências), e assim deve continuar.

### 3.4 Quando pedir, quando resolver na obra (`#quando-ajuda` + `#quando-nao-contratar`)

H2: Glosa, boletim parado ou critério opaco: quando a análise técnica entra

Texto: O apoio técnico cabe quando a empresa contratada precisa classificar o que foi executado, o que entrou no boletim, o que o contrato manda medir e o que a prova contemporânea sustenta, e transformar isso num dossiê para apresentar ao fiscal ou ao gestor do órgão contratante. Faz sentido pedir quando a glosa se repete, o critério de medição é lido de um jeito na obra e de outro no boletim, a parcela incontroversa mistura com o ponto controvertido, ou o fiscal recusou o ateste e falta nexo entre diário, memória e contrato. Divergência pontual já esclarecida com o fiscal, sem impacto de fluxo, continua podendo fechar no diário de obras; escala quando a glosa se repete, o critério é opaco, parcela relevante fica retida ou a contestação exige nexo técnico-contratual além da rotina da obra. Não substitui o ateste do órgão nem a petição do advogado.

O id `quando-nao-contratar` com `data-when-not-hire="1"` precisa sobreviver como âncora do parágrafo de limite (o atributo é lido por gate de cópia).

### 3.5 Quatro números (`#executado-medido-contratado-evidenciado`)

Manter o texto atual integralmente (Executado, Medido, Contratado, Evidenciado e o parágrafo final "O dossiê classifica cada valor..."). Só a pontuação "lacuna - não vira" passa a "lacuna, não vira".

### 3.6 Entradas e erros que custam caro (fusão das duas listas sem id)

H2: O que lemos e o que costuma destruir valor

Coluna "O que normalmente precisa ser analisado": manter os oito itens atuais (edital, contrato e anexos; critério de medição e pagamento; planilha, composições e memória; boletins e memórias; diário, relatórios, fotos e registros; projetos, revisões e as built; comunicações com fiscalização; notas fiscais, certidões, liquidação e histórico de pagamentos).

Coluna "O que costuma destruir valor": manter os cinco itens atuais.

Caixa subordinada (aside `lead-inline`, atributos mantidos): Exploração · Ler o contrato no recorte público · Identidade, valor assinado, vigência e lacunas de informação. Sem cadastro e sem tese jurídica. Botão "Diagnosticar contrato" (`/ferramentas/diagnostico-defesa-margem/`).

### 3.7 Guias (`#guias`)

Eyebrow (manter): Biblioteca especializada. H2 (manter): Guias sobre medições e pagamentos. Lead (manter).

Índice regrado, seis linhas numeradas, cada uma com título linkado e uma frase de risco concreto (as frases "O foco é reduzir um risco concreto: ..." já existem em cada item e passam a ser a única descrição): 01 Atraso de pagamento permite suspender a obra pública? · 02 Atraso na medição da obra pública: como proteger o fluxo de caixa · 03 Pagamento parcial de etapa em empreitada global: quando é permitido? · 04 Medição por evento ou por quantitativo: qual modelo protege melhor a construtora? · 05 O fiscal se recusa a assinar a medição: quais documentos produzir · 06 Defeito de qualidade autoriza glosa total da medição? Os `article.library-item` com `data-content-item`, `data-cluster` e `data-search` permanecem; muda a composição, não a marcação semântica.

### 3.8 Condições e limites (`faq-section`)

Manter as três perguntas e respostas atuais (quando vale contratar; análise remota; a CONFENGE não substitui o jurídico). O título passa de "Dúvidas objetivas" para "Condições e limites"; o JSON-LD `FAQPage` fica igual porque as perguntas não mudam.

### 3.9 Próximo passo (`content-cta` + `#captura-pilar`)

Eyebrow: Próximo passo. H2: Descreva a medição ou a glosa sem sair desta página.

Lead (manter): Envie o contexto mínimo: o boletim ou a glosa em questão, o critério de medição aplicado e o prazo de resposta. A resposta diz qual documento sustenta a posição e o que falta reunir. Este formulário não conclui contratação e não promete reversão da glosa.

Formulário: byte-idêntico ao atual (ver §1). Rodapé do formulário mantido: "O registro não é compra, parecer jurídico ou promessa de resultado. O site não recebe arquivo; quando necessário, o canal seguro é combinado após o protocolo. Dados usados apenas para este retorno; retenção de até 730 dias. A exclusão pode ser pedida pelos canais da Política de Privacidade, com o protocolo."

Alternativas subordinadas, abaixo do formulário: "Falar pelo WhatsApp" (href atual, botão secundário) · "Quando a glosa se repete ao longo do contrato, a mesma leitura vira rotina de registros: Diretoria Fracionada para o Mercado Público na execução" (`/diretoria-b2g/`, link de texto).

### 3.10 Rodapé de autoridade (`#metodo`)

Intacto. É gerado por `scripts/site/authority.py`; qualquer alteração passa por lá, não pelo HTML.

## 4. Ressalvas: de onde saem, onde passam a viver

| # | Original | Destino |
| --- | --- | --- |
| M1 | `#quando-ajuda`: "Não substitui o ateste do órgão nem a petição do advogado." | fecho de §3.4 |
| M2 | `#quando-ajuda`: "A CONFENGE atende a empresa contratada. O órgão público contratante decide o ateste, a liquidação e o pagamento. A análise técnica não é petição jurídica e não promete recebimento, êxito administrativo nem decisão judicial." | linha de limite do hero (§3.1) |
| M3 | `#executado-...`: "Sem protocolo, foto ou memória, o item fica como lacuna, não vira 'quase certo'." e "Não redige petição jurídica e não promete que o órgão pague." | ficam em §3.5 |
| M4 | `#entrega-dossie`: "Não inclui petição jurídica, representação nem promessa de recebimento." | fica em §3.3 |
| M5 | `#exemplo-demonstrativo`: "Premissas sintéticas, não obra de cliente." / "não trata 120 m² como direito automático" / "O órgão contratante continua responsável pelo ateste." | legenda da prancha e parágrafo (§3.2) |
| M6 | `#quando-nao-contratar`: "Divergência pontual já esclarecida ... pode fechar no diário de obras." | fundido em §3.4, âncora preservada |
| M7 | FAQ: "Não. A consultoria estrutura a base técnica, contratual e econômica do caso para que engenharia, direção e jurídico decidam com mais segurança." | fica em §3.8 |
| M8 | `#captura-pilar`: "Este formulário não conclui contratação e não promete reversão da glosa." e "O registro não é compra, parecer jurídico ou promessa de resultado. O site não recebe arquivo..." | ficam em §3.9 |
| M9 | `#metodo`: "Limitação: não é parecer jurídico. O valor a receber é apurado caso a caso..." | fica em §3.10 (gerado) |

## 5. Decisões que precisam do integrador

- Autorização e recaptura de hash (ver §0). Sem isso, nada desta página muda.
- Ação dominante: formulário (`#captura-pilar`) em vez do WhatsApp no hero. Muda `data-cta-position` do hero e o inventário `docs/commercial/cta-form-next-state-inventory.json`.
- Reduzir três botões de WhatsApp com o mesmo href para um botão secundário e um link: conferir `tests/commercial/test_single_commercial_route.mjs` e `test_offer_fit_copy.mjs`.
- Figura P3 da frente B: decidir entre SVG inline (com `title`/`desc` e ids únicos) e `<img>` para os dois arquivos; contraste de texto e `test_html_integrity`. Os números derivados 30 m² e 10 m² aparecem na prancha e na legenda; o parágrafo atual da seção não os cita e continua verdadeiro.
- `og:image` continua sendo `/assets/clusters/medicoes-glosas-obras-publicas.jpg` (contrato `test_presentation_and_sharing`); a prancha não substitui a imagem social.
