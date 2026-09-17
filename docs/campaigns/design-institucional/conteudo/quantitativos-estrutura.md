# /quantitativos-orcamento-obras/ : reconhecimento antes, aprofundamento depois

Procedência: lido em 2026-09-17 na base `47da03b64` (worktree `salto-01-piloto`): `quantitativos-orcamento-obras/index.html` (44.571 bytes, 12.030 px em 1440 e 19.739 px em 390 segundo o caderno), `quantitativos-orcamento-obras/sample-trail.mjs`, `quantitativos-orcamento-obras/proof-entrances.mjs`, `data/organic/public-family-registry.json` (família `private-engineering-quantities-budget`), `data/site/public-ia-map.json`, `tests/campaigns/orc-b2b-20260913/test_purchase_path.mjs`, `tests/pos-inb-20260911/02/test_purchase_proof.mjs`, `tests/intake/test_quantity_takeoff_path.mjs`, `tests/ativacao_20260912/03/test_presentation_and_sharing.py`, `scripts/site/test_copy_gates.py`, `scripts/site/test_integral_solution_copy.py`, `docs/campaigns/design-institucional/caderno.md` (diagnóstico 5). Frente A, conteúdo e percurso. Nada aqui altera HTML; a aplicação é do integrador.

## 0. O que não pode mudar (contrato observado)

- Dois blocos são gerados e delimitados por comentário. `<!--pos-inb-02:qty-trail-->` abre `#qty-sample-trail` (composto por `scripts/campaigns/pos-inb-20260911/02/compose_purchase_proof.mjs` a partir de `sample-trail.mjs`) e `<!--orc-b2b-20260913:proof-entrances-->` ... `<!--/orc-b2b-20260913:proof-entrances-->` envolve `#qty-proof-entrances` (composto por `scripts/campaigns/orc-b2b-20260913/compose_proof_entrances.mjs` a partir de `proof-entrances.mjs`). O teste D2/F cobra o comentário de fechamento, `data-proof-entrance="edificacao"` e `"infraestrutura"`, `data-trail-step="quantity"`, `data-trail-memory="true"`, `data-proof-quantity`, `data-proof-item` e "19,60 m²". Decisão possível para eles: mover o bloco inteiro delimitado pelo comentário; reescrever só pelo compositor. Nunca editar o HTML gerado.
- Ids cobrados por teste ou por contrato: `amostra-quantitativos` (a home aponta para `#amostra-quantitativos`), `levantamento-quantitativos`, `elaboracao-orcamento`, `revisao-orcamento`, `projeto-parcial`, `triagem-quantitativos` (é o `value_first_header_cta.href` do registro de famílias, com rótulo "Solicitar proposta de orçamento"), `qty-sample-trail`, `qty-proof-entrances`. Os demais ids (`qty-title`, `qty-check-title`, `qty-sample-title`, `qty-plan-t`, `qty-plan-d`, `exemplos-conferiveis`, `qty-proof-entrances-title`, `qty-trail-title`, `o-que-contratar`, `qty-buy-title`, `quem-contrata`, `qty-output-title`, `metodo-quantitativos`, `qty-method-title`, `condicoes-da-proposta`, `qty-conditions-title`, `qty-partial-title`, `o-que-influencia`, `qty-factors-title`, `publico-e-privado`, `qty-public-private-title`, `decisoes`, `qty-decisions-title`, `qty-proof-title`, `qty-limits-title`, `qty-triage-title`, `qty-channels-title`) ficam como estão: são âncoras do índice de página proposto e de `aria-labelledby`.
- Frases que precisam sobreviver em algum ponto da página: "serviço de engenharia contratado", "não é software", "planilha gratuita", "demanda pequena", "obra pública", "documentação inicial incompleta não", "insumos possíveis", "não pedimos campos de licitação", "Amostra demonstrativa", "Preços hipotéticos daquele recorte não são preço do serviço", "nem preço da CONFENGE", "Área das paredes menos as aberturas descontáveis.", "exemplo demonstrativo", e os quatro termos de quem contrata: "construtora", "empresa de engenharia", "escritório de projeto", "terceirizar". H1 literal "Quantitativos e orçamento de obras". Só uma regra é posicional: "revisão técnica de projetos" não pode aparecer nos primeiros 1.200 caracteres de texto. É essa folga que torna segura a consolidação das ressalvas em um bloco só.
- Proibidos no texto: "informe o cnpj", "informe o cpf", "valor da obra", "endereço exato da obra". Sem travessão. Sem "sob medida", "personalizado", "solução completa", "compras distintas", "é outra compra". (Esta lista e os identificadores de contrato citados neste documento são listas de proibição e nomes de campo; nunca entram como cópia de página.)
- Contato: pelo menos um `href` `wa.me`, um `mailto:` e um `tel:+` no corpo, com a mensagem do WhatsApp citando quantitativos ou orçamento. Os três hrefs atuais ficam exatamente como estão (ver `rotas-inventario.json`).
- Faixa `dl.keys` (Cliente, Revisão, Entregáveis, Responsável técnico), figura SVG com `title#qty-plan-t` e `desc#qty-plan-d`, tabela real de `quantitativos.csv` (7 linhas) e JSON-LD (WebPage, Service, BreadcrumbList) permanecem. Números da amostra não mudam: 2,40 × 1,80, pé-direito 2,60, 21,84, 1,68, 0,56, 19,60, Q-PAR-01, ORC-PAR-01, 4,32, 6,84, 0,1296, 7,60, 42,00 (infraestrutura).

## 1. Nova ordem da página

Reconhecimento (o visitante decide se é aqui em uma tela e meia):

1. Abertura (hero, sem id): necessidade, trabalho assumido, entrega, próximo passo. Prancha ao lado.
2. `#amostra-quantitativos`: a prancha do recorte de banheiro com carimbo (`dl.keys`) e a memória Q-PAR-01.
3. `#o-que-contratar` fundido com "O que chega às suas mãos": três pedidos, cada um com o documento que chega.
4. Chamada curta para `#triagem-quantitativos`.

Aprofundamento (quem quer conferir antes de pedir):

5. `#metodo-quantitativos`: três passos.
6. `#exemplos-conferiveis`: trilha técnica gerada, tabela CSV, dois exemplos abertos (blocos gerados movidos inteiros).
7. `#condicoes-da-proposta`: entradas (`#projeto-parcial`), o que influencia o esforço (`#o-que-influencia`), obra pública e privada (`#publico-e-privado`) e o bloco único "Condições e limites" (`#qty-limits-title`).
8. `#decisoes` + `#qty-proof-title`: leituras e quem responde.
9. `#triagem-quantitativos`: próximo passo, três canais, aviso de privacidade.

Índice de página (6 rótulos, na ordem): **Amostra** (`#amostra-quantitativos`) · **O que pedir** (`#o-que-contratar`) · **Método** (`#metodo-quantitativos`) · **Demonstrações** (`#exemplos-conferiveis`) · **Condições e limites** (`#condicoes-da-proposta`) · **Pedir proposta** (`#triagem-quantitativos`). Sétimo rótulo opcional: **Quem responde** (`#qty-proof-title`), se o integrador preferir separar autoridade de leituras.

## 2. Seção a seção

| Ordem atual | Id / título atual | Decisão | Observação |
| --- | --- | --- | --- |
| 1 | hero, `h1#qty-title` "Quantitativos e orçamento de obras" | reescrever | texto em §3.1; mantém H1, eyebrow, botão `#triagem-quantitativos`, WhatsApp e e-mail com os hrefs atuais |
| 2 | `aside.aside-note`, `h2#qty-check-title` "Em 30 segundos" | reescrever e encostar na abertura | vira quatro pares curtos (Pedido, Entrega, Antes do aceite, Quem assina); texto em §3.2; "Não assinamos projeto de terceiros" migra para Condições e limites |
| 3 | `#amostra-quantitativos` "Uma parede de banheiro, do desenho ao item da planilha." | manter, subir para logo após a abertura (já está) | é a prancha da página; figcaption, `dl.keys`, memória e critério ficam; a frase "Quantidade não é preço..." fica aqui como legenda única da amostra (ver R5). A figura passa a ser a prancha P1 da frente B (`assets/pranchas/recorte-banheiro-{desktop,mobile}.svg`, manifesto `assets-manifest.json`, slot `figure.qty-sample`), mantendo `title#qty-plan-t` e `desc#qty-plan-d` se for inline |
| 4 | `#exemplos-conferiveis` "A mesma conta na trilha técnica, na planilha aberta e em dois exemplos publicados." | mover inteiro para depois do método | os dois blocos gerados vão junto, com os comentários delimitadores; a tabela CSV e "Dois exemplos abertos" também; parágrafo de fechamento "Reconheceu o seu caso?" é reescrito em §3.5 |
| 5 | `#o-que-contratar` "Diga o que precisa decidir; nós nomeamos o serviço." | manter e fundir com a seção 6 | cada `li` (`#levantamento-quantitativos`, `#elaboracao-orcamento`, `#revisao-orcamento`) ganha a linha "Chega às suas mãos" com o documento correspondente; `p#quem-contrata` fica (termos cobrados por teste); texto em §3.3 |
| 6 | seção sem id, `h2#qty-output-title` "Números que você consegue conferir antes de gastar." | fundir na seção 5 | os três `h3` (Planilha de quantitativos, Memória e premissas, Orçamento ou revisão) viram as linhas "Chega às suas mãos" dos três pedidos; o `h2#qty-output-title` pode sobreviver como subtítulo do bloco fundido para não perder a âncora |
| 7 | `#metodo-quantitativos` "Da situação à decisão, sem esconder o que falta." | manter | só a última frase do passo 3 ("Sem isso, o arquivo não é orçamento para executar obra.") migra para Condições e limites (R11) |
| 8 | `#condicoes-da-proposta` "Projeto incompleto, esforço, finalidade e limites: o que a proposta considera." | reescrever a introdução e consolidar | `#projeto-parcial`, `#o-que-influencia`, `#publico-e-privado` mantidos; `#decisoes` e `#qty-proof-title` saem para a seção 8; `#qty-limits-title` passa a ser o bloco único "Condições e limites" (§3.6) |
| 8a | `#projeto-parcial` "Documentação inicial incompleta não encerra o pedido." | manter | literal cobrado por teste; "insumos possíveis" fica |
| 8b | `#o-que-influencia` "O que influencia o esforço, sem tabela de preço inventada." | manter | sem mudança de conteúdo |
| 8c | `#publico-e-privado` "Obra pública e obra privada compartilham o ofício, não as regras da contratação." | manter, encurtar as duas frases sobre SINAPI em uma (R15) | "não pedimos campos de licitação" fica aqui |
| 8d | `#decisoes` "Três decisões que costumam vir antes da proposta." | mover para a seção 8 (Leituras e quem responde) | três links para `/conteudos/...` mantidos |
| 8e | `h3#qty-proof-title` "Quem responde e como conferir." | mover para a seção 8 | texto mantido; ver nota sobre "R$ 700 milhões" em §5 |
| 8f | `h3#qty-limits-title` "Limites materiais: primeiro entendemos o caso; a proposta vem depois." | reescrever como "Condições e limites" | bloco único, §3.6 |
| 9 | `#triagem-quantitativos` "Solicite uma proposta de levantamento, orçamento ou revisão." | manter, encurtar | canais e aviso de privacidade ficam colados aos botões; ressalvas repetidas saem (R19, R21); texto em §3.7 |

## 3. Textos propostos

### 3.1 Abertura (hero)

Eyebrow: Antes de comparar, contratar ou planejar a obra

H1: Quantitativos e orçamento de obras

Necessidade: Você tem propostas para comparar, uma obra para contratar ou um número para aceitar, e não tem base própria para conferir.

Trabalho: Levantamos as quantidades a partir das plantas e do memorial, compomos ou revisamos o orçamento e assinamos o trabalho, em obra pública ou privada. Serviço de engenharia contratado, com responsável técnico: não é software, planilha gratuita nem execução de obra.

Entrega: Você passa a ter a planilha de quantitativos, a memória de cálculo e o orçamento ou a revisão, com a origem e o critério de cada número visíveis, para comparar propostas pela mesma base, contratar com escopo fechado ou aceitar o número sabendo o que ele carrega.

Próximo passo: botão "Solicitar proposta de orçamento" (`href="#triagem-quantitativos"`), link secundário "WhatsApp (48) 98834-4559" (href atual). Microcopy: O primeiro contato é em texto, sem anexo. A resposta nomeia o serviço, o que você recebe e o que falta reunir. Também por e-mail (href atual).

### 3.2 "Em 30 segundos" (aside, `#qty-check-title`)

Pedido: levantamento de quantitativos, elaboração de orçamento ou revisão de orçamento existente, em obra pública ou privada. Se não souber qual é o seu, descreva a decisão: a proposta nomeia o serviço.

Entrega: de qual planta, parede ou trecho saiu cada quantidade; o critério de medição, item por item; composições, encargos, referências e data-base de cada preço; e o que faltou no projeto e pode mudar o número.

Antes do aceite técnico: escopo, local, necessidade de campo, atribuição profissional e ART, quando o serviço exigir. Detalhes em Condições e limites.

Quem assina: Tiago Sasaki, Engenheiro Civil formado pela EESC-USP, com registro profissional ativo no CREA. Serviços técnicos emitidos com ART e nota fiscal, no escopo contratado.

### 3.3 O que pedir e o que chega (`#o-que-contratar` fundido com `#qty-output-title`)

Eyebrow: Qual decisão está na mesa?

H2 (`#qty-buy-title`): Diga o que precisa decidir; nós nomeamos o serviço.

Lead: Levantamento, orçamento e revisão são pedidos diferentes, e a proposta combina os três quando a decisão pede. Se não souber qual é o seu, descreva a decisão e o que já existe.

`p#quem-contrata` (manter o texto atual): Quem contrata costuma ser construtora, empresa de engenharia, escritório de projeto, incorporadora, loteador ou proprietário com uma obra para orçar, uma planilha para conferir ou a produção do orçamento para terceirizar, sem montar equipe própria. Demanda pequena, reforma particular e obra pública entram pelo mesmo caminho.

01 · `#levantamento-quantitativos` · Comparar propostas ou comprar material · h3 Levantamento de quantitativos. Transformamos plantas, memoriais e o que já existe do projeto em serviços, unidades e quantidades conferíveis. Chega às suas mãos: a planilha de quantitativos, com cada linha ligada à planta e ao critério que a originou, e a memória de premissas e exclusões. Serve para comparar propostas de execução pela mesma quantidade e planejar a compra de material. Limite: sozinho, não inclui o preço de cada item.

02 · `#elaboracao-orcamento` · Decidir investir ou contratar · h3 Elaboração de orçamento. Compomos os custos sobre as quantidades, ou levantamos e compomos no mesmo escopo, com premissas, encargos, data-base e referências identificadas. Chega às suas mãos: a planilha orçamentária com composições abertas, custos, encargos, data-base e referências, além da memória. Serve para decidir investir, contratar, licitar ou preparar a planilha de referência.

03 · `#revisao-orcamento` · Aceitar ou recusar um número · h3 Revisão de orçamento existente. Testamos a planilha ou o estudo que já está na mesa: quantitativos, unidades, exclusões, composições e data-base. Chega às suas mãos: a revisão com o que confere, o que diverge e o que falta, número por número. Serve para aceitar, condicionar ou recusar o número apresentado, ou descobrir se é preciso elaborar de novo.

Fecho (subtítulo `#qty-output-title` preservado): Em qualquer um dos três, a origem e o critério de cada número ficam visíveis. O formato dos arquivos fica combinado na proposta.

### 3.4 Chamada curta (fim do reconhecimento)

Reconheceu o seu caso? Peça a proposta agora (`#triagem-quantitativos`) ou continue: método, demonstrações abertas e condições da proposta estão logo abaixo.

### 3.5 Demonstrações (`#exemplos-conferiveis`, movido para depois do método)

H2 (`#qty-proof-entrances-title`, manter): A mesma conta na trilha técnica, na planilha aberta e em dois exemplos publicados.

Lead (manter): Antes de pedir, confira no que reconhece: a trilha completa da parede W-02, todas as linhas de quantitativos.csv do recorte e dois exemplos abertos, um de edificação e um de infraestrutura, com desenho, memória e planilhas para baixar.

Blocos gerados `#qty-sample-trail` e `#qty-proof-entrances`: intactos, movidos com os comentários delimitadores. As ressalvas dentro deles (R6, R7, R8, R9) pertencem ao compositor e ficam.

Parágrafo final (reescrito): As demonstrações mostram o formato do que chega às suas mãos. O que muda no seu caso é o escopo, e ele fica na proposta: veja as condições abaixo ou vá direto ao pedido (`#triagem-quantitativos`).

### 3.6 Condições e limites (bloco único, `h3#qty-limits-title` dentro de `#condicoes-da-proposta`)

Introdução da seção (`#qty-conditions-title`, reescrita): Projeto incompleto, esforço, finalidade e limites: o que a proposta considera. Para quem quer entender como trabalhamos antes de pedir. Preço, prazo e disciplinas são fechados na proposta, depois da leitura do escopo e dos documentos disponíveis.

Título do bloco: Condições e limites

1. Preço e prazo. Não há preço fechado, prazo fechado nem desconto nesta página. A proposta sai depois da leitura dos documentos disponíveis; os fatores que mudam o esforço estão acima.
2. Onde o trabalho acontece. A leitura documental pode ser remota. Campo, local, atribuição profissional, registro ou visto e ART são confirmados antes do aceite técnico, somente quando o escopo exigir.
3. O que a entrega é, e o que não é. Levantamento, orçamento ou revisão são documentos de engenharia assinados. Sem escopo, disciplinas e premissas definidos na proposta, o arquivo não é orçamento para executar obra. A CONFENGE não executa a obra nesta entrega, não assina projeto de terceiros e não substitui projetistas ou responsáveis técnicos de origem.
4. Referências de preço. SINAPI e tabelas oficiais são referência de orçamento público quando a finalidade é licitar, contratar ou fiscalizar; não são o preço de mercado da sua obra privada. A data-base é a data das referências e cotações usadas.
5. Comprador privado. Não pedimos campos de licitação, edital nem processo. Documentação inicial incompleta muda o escopo, não encerra o pedido.
6. Amostras desta página. Os recortes de banheiro e de infraestrutura são exemplos demonstrativos de método: não representam cliente, obra executada, prazo, preço ou resultado da CONFENGE, e seus preços hipotéticos não são cotação vigente nem SINAPI real.
7. Arquivos. O primeiro contato é em texto. Plantas, planilhas e orçamentos entram depois, por canal seguro combinado com você.

### 3.7 Próximo passo (`#triagem-quantitativos`)

H2 (`#qty-triage-title`, manter): Solicite uma proposta de levantamento, orçamento ou revisão.

Lead: Basta dizer o que está na mesa. Documentação incompleta não impede o contato, e não é obrigatório passar por triagem ou diagnóstico antes.

O que ajuda a informar no primeiro contato (manter a lista atual: pública ou privada; o que precisa decidir; qual pedido, ou se prefere que a proposta nomeie; fase do projeto e documentos só pelo nome; disciplinas e áreas).

Parágrafo (manter): O primeiro contato é direto com o Engº Tiago Sasaki, por WhatsApp, e-mail ou telefone. A resposta nomeia o serviço, o que você recebe e o que falta reunir, e combina o canal seguro para os arquivos. Escopo, formato da entrega e o modo de combinar revisões e devolutivas ficam na proposta, depois da leitura do que você já tem.

`h3#qty-channels-title` Três canais diretos: botão WhatsApp (dominante, href atual "Solicitar proposta pelo WhatsApp"), botão e-mail (secundário, href atual), link telefone (href atual).

Aviso colado aos canais (manter integralmente, é a condição contextual do contato): Este primeiro contato é uma conversa técnica, sem contratação, pagamento ou aceite. Descreva a situação em texto: este primeiro contato não recebe arquivo, planta, orçamento, endereço exato, CPF, processo ou texto livre com dados de terceiros; o que for sensível segue depois, por canal seguro combinado com você. Dados usados apenas para este retorno; retenção de até 730 dias, com exclusão pelos canais da Política de Privacidade.

Fecho (manter): Situação que não é de quantitativos nem de orçamento? Use o contato e triagem geral (`/triagem-tecnica/`).

## 4. Ressalvas: de onde saem, onde passam a viver

| # | Ressalva original (seção atual) | Destino |
| --- | --- | --- |
| R1 | hero: "Serviço de engenharia contratado, com responsável técnico: não é software, planilha gratuita nem execução de obra." | fica no hero (literais cobrados por teste); "não executa a obra" reaparece uma única vez em Condições e limites, item 3 |
| R2 | hero: "O primeiro contato é em texto e sem anexos: conversa técnica, sem contratação nem pagamento." | encurta para "O primeiro contato é em texto, sem anexo." no hero; a versão completa vive no aviso de `#triagem-quantitativos` |
| R3 | aside: "Não assinamos projeto de terceiros." | Condições e limites, item 3 |
| R4 | `#amostra-quantitativos`: "Não é obra de cliente" (figcaption e `dl.keys`) | fica com a figura (rótulo da amostra) |
| R5 | `#amostra-quantitativos`: "Quantidade não é preço: os valores do recorte são hipotéticos e não representam preço da CONFENGE nem referência SINAPI real." | fica como legenda única da amostra ("nem preço da CONFENGE" é literal cobrado); não se repete fora dos blocos gerados |
| R6 | `#qty-sample-trail` (gerado): "Amostra demonstrativa do recorte de banheiro. Não é orçamento para executar obra, não representa cliente, não é preço da CONFENGE e não é SINAPI real." | fica; pertence ao compositor |
| R7 | `#qty-sample-trail` (gerado): "Preços hipotéticos daquele recorte não são preço do serviço nem SINAPI real." | fica; literal cobrado |
| R8 | `#qty-proof-entrances` (gerado, duas vezes): "Este é um exemplo demonstrativo de método. Não representa cliente, obra executada, prazo ou resultado da CONFENGE. Os preços daquele recorte são hipotéticos..." | fica; literal cobrado por entrada |
| R9 | `#qty-proof-entrances` (gerado): "Não é projeto executivo nem orçamento para executar obra." / "Não é projeto executivo, dimensionamento de pavimento, fundação nem verificação de capacidade hidráulica." / "Espessura não é dimensionamento de pavimento." | fica; pertence ao compositor |
| R10 | `#levantamento-quantitativos`: "Limite: Sozinho, não inclui o preço de cada item." | fica; define o pedido, não é ressalva repetida |
| R11 | `#metodo-quantitativos`: "Sem isso, o arquivo não é orçamento para executar obra." | Condições e limites, item 3 |
| R12 | `#condicoes-da-proposta` intro: "Não há preço fechado, prazo fechado nem desconto nesta página..." | Condições e limites, item 1 |
| R13 | `#projeto-parcial`: "A ausência muda o escopo, não dispensa o comprador." | fica em `#projeto-parcial`; ecoa em Condições e limites, item 5 |
| R14 | `#publico-e-privado`: "Não pedimos campos de licitação, edital nem processo." | fica em `#publico-e-privado` (literal cobrado) e em Condições e limites, item 5; sai de `#triagem-quantitativos` |
| R15 | `#publico-e-privado`: "SINAPI não é, aqui, o preço de mercado da sua obra." e "SINAPI, quando couber, é referência de orçamento público, não é preço de mercado universal." | uma frase em Condições e limites, item 4; `#publico-e-privado` mantém só a menção de contexto por tipo de obra |
| R16 | `#qty-proof-title`: "Exemplo sintético: ... isso não representa cliente, obra, prazo, preço ou resultado da CONFENGE." | fica junto do exemplo sintético (rótulo obrigatório do exemplo), na seção Leituras e quem responde |
| R17 | `#qty-limits-title` (quatro parágrafos: preço e prazo; leitura remota e campo; não executa, não assina, não substitui; arquivos por canal seguro) | vira o núcleo de Condições e limites, itens 1, 2, 3 e 7 |
| R18 | aside "O que confirmamos antes do aceite técnico" | resumo de uma linha no aside; versão completa em Condições e limites, item 2 |
| R19 | `#triagem-quantitativos`: "Orçamento desconhecido ou documentação inicial incompleta não impede o contato, e de comprador privado não pedimos campos de licitação, edital ou processo." | encurta para "Documentação incompleta não impede o contato"; o restante vive em Condições e limites, item 5 |
| R20 | `#triagem-quantitativos`: "Não é obrigatório passar por triagem ou diagnóstico antes deste contato." | fica, incorporado ao lead do próximo passo |
| R21 | `#triagem-quantitativos`: aviso completo de conversa técnica, sem arquivo, retenção 730 dias, Política de Privacidade | fica integralmente colado aos canais (condição contextual do contato); Condições e limites, item 7, só aponta para ele |

Nenhuma ressalva desaparece; as que aparecem em blocos gerados continuam nos blocos gerados.

## 5. Decisões que precisam do integrador

- Mover `#exemplos-conferiveis` para depois de `#metodo-quantitativos` muda a posição dos blocos gerados; os compositores localizam o slot pelo comentário e pelo id, não pela posição, mas isso precisa ser confirmado rodando `compose_purchase_proof.mjs --check` e `compose_proof_entrances.mjs --check` depois da mudança.
- Fundir `#qty-output-title` em `#o-que-contratar` remove um `h2`; conferir `test_ui_geometry.mjs` e o gate de arquétipos se a página entrar no universo gated.
- "Mais de R$ 700 milhões em obras e projetos analisados" aparece em `#qty-proof-title`. No registro de credenciais essa alegação é SELF_ATTESTED com superfícies de projeção `/confianca/` e `/especialista/tiago-jun-sasaki/`; esta página não está entre elas. Não toquei; registro para decisão.
- O índice de página é um componente novo; a frente A só nomeia rótulos e âncoras.
