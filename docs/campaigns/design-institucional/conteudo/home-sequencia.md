# Home: sequência proposta e cópia completa por bloco

Procedência: lido em 2026-09-17 na base `47da03b64` (worktree `salto-01-piloto`): `index.html`, `data/site/brand.json` (`hero`, `service_situations`, `proof_labels`, `positioning`, `contact`, `forbidden_phrases`, `copy_leaks`), `data/site/public-ia-map.json` (`service_situations`, `journeys`, `footer`), `data/site/credential-registry.json`, `especialista/tiago-jun-sasaki/index.html`, `casos/demonstrativo-projeto-privado/index.html`, `casos/demonstrativo-infraestrutura/index.html`, `medicoes-glosas-obras-publicas/index.html`, `quantitativos-orcamento-obras/index.html`, `data/site/design-system.json` (`section_archetypes`), `scripts/site/test_home_conversion_contract.py`, `scripts/site/test_copy_gates.py`, `scripts/site/test_design_gates.py`, `scripts/site/test_integral_solution_copy.py`, `docs/campaigns/design-institucional/caderno.md` (diagnósticos 1 a 4 e 7). Frente A, conteúdo e percurso. Nada aqui altera HTML.

## 0. Invariantes que a sequência respeita

- Hero (`<section class="hero ...">`, a primeira seção com essa classe): eyebrow literal "Engenharia, Perícias e Inteligência Técnica"; a palavra "engenharia"; "público e privado" ou "pública ou privada" (regex `p[úu]blic\w*\s+(?:e|ou)\s+privad\w*`); pelo menos uma situação de comprador (comparar propostas, conferir um projeto, infiltração, avaliar um imóvel, glosa, medição...); dois ou mais verbos de trabalho distintos (assumimos, levantamos, calculamos, conferimos, assinamos, elaboramos, revisamos, compatibilizamos, inspecionamos, avaliamos, orçamos); uma entrega nomeada (planilha, projeto, laudo, relatório, parecer, memória de cálculo, quantitativo) e um uso (comparar, contratar, decidir, orçar, executar, coordenar, aprovar, licitar); "demonstrativ" no texto visível do hero (hoje satisfeito por "deste desenho demonstrativo" no parágrafo, e a legenda da figura repete "Exemplo demonstrativo"); "Engenharia Civil pela EESC-USP"; "CNPJ 52.407.089/0001-09"; `href="/servicos/"`; exatamente um `button-primary`; sem "PNCP", "54.055" ou "4,48 mi".
- `#situacoes` antes de `#obras-publicas`. Dentro de `#situacoes`: os sete rótulos de `brand.json.service_situations` literais; exatamente sete `class="situation-row"`; sete `class="situation-action"` com hrefs distintos, internos e iguais ao contrato; cada linha com `<h3>`, `class="situation-use"` e "passa a ter"; nenhum `href="/triagem-tecnica/#"`; sem "ICP" e sem "CTA"; `class="situation-list"` com cinco ou mais linhas.
- `#obras-publicas`: "PNCP · 01/08/2026", "54.055", "4,48 mi", `href="/servicos-obras-publicas/"`.
- `#triagem-tecnica`: `mailto:tiago.sasaki@confenge.com.br`, `wa.me/5548988344559`, "Não envie documentos sensíveis". `#formulario-contato` byte-idêntico (hash `798d9b47...`, 23 controles, 3 obrigatórios, um único `action="/obrigado"` no body).
- Arquétipos (`data-section-archetype` no main): 5 a 8 blocos, 5 ou mais distintos, `journey_paths` obrigatório, sem três iguais seguidos, no máximo duas grades legadas.
- Literais que precisam existir em algum lugar do arquivo (`test_copy_gates`): "contrato sob pressão", "edital e proposta", "operação recorrente", "solicitar canal seguro para envio", "operação de proposta para licitação crítica" (hoje só dentro do JSON-LD), "defesa técnica" ou "proteção de margem". Proibidos visíveis: "Jornada A/B/C", "risco de não agir", "owners", "funil", "arquétipo", "javascript", e todas as `forbidden_phrases` de `brand.json`. Sem travessão.
- Âncoras legadas `#jornadas` e `#ofertas` (`anchor-alias`) continuam; `#descrever-situacao`, `#mercado-pncp`, `#jornada-contrato`, `#contato` são destinos de links externos e internos.
- H1, subtítulo e microcopy do hero são o contrato de `brand.json.hero` (`h1`, `subheadline`, `cta_primary`, `cta_secondary`, `microcopy`); esta frente os mantém literais e reescreve só o parágrafo de entrega, a legenda da figura e os blocos seguintes.

## 1. Sequência (seis blocos, seis arquétipos distintos)

| # | Bloco | Id | Arquétipo proposto | Função |
| --- | --- | --- | --- | --- |
| 1 | Abertura | hero (sem id; `#hero-title`) | `hero_split` | quem somos, para quem, o que entregamos, prancha |
| 2 | Reconhecimento | `#situacoes` (+ `#descrever-situacao`) | `journey_paths` | seis áreas de apresentação sobre sete situações |
| 3 | Entregas | novo id `#entregas-demonstrativas` | `content_editorial` | três amostras, uma prancha cada |
| 4 | Responsabilidade | `#responsabilidade` (hoje seção sem id com `#trust-title`) | `authority_editorial` | retrato, credenciais conferíveis, como conduzimos, biblioteca |
| 5 | Obras públicas | `#obras-publicas` (com `#mercado-pncp` dentro) | `market_context` | faixa escura, percurso edital → contrato → medição, três contratos como tabela |
| 6 | Contato | `#triagem-tecnica` + `#contato` | `cta_formal` | ação dominante, alternativas, o que acontece depois, formulário |

Hoje a home tem seis marcações (`hero_split`, `journey_paths`, `authority_editorial`, `market_context`, `cta_formal`, `cta_formal`) na ordem hero, situações, autoridade, obras públicas, triagem, contato. A sequência proposta mantém essa ordem e insere o bloco Entregas entre o reconhecimento e a responsabilidade: seis blocos com seis arquétipos distintos. Se `#triagem-tecnica` e `#contato` continuarem duas seções, são sete blocos, ainda dentro do limite de oito.

## 2. Cópia por bloco

### Bloco 1 · Abertura (hero)

Eyebrow: Engenharia, Perícias e Inteligência Técnica

H1 (contrato brand.json): Assumimos a parte de engenharia que falta para você orçar, contratar ou decidir.

Subtítulo (contrato brand.json): Comparar propostas de obra, completar ou conferir um projeto, entender uma infiltração, avaliar um imóvel ou responder a uma glosa: em obra pública ou privada, levantamos, calculamos, conferimos e assumimos a responsabilidade técnica.

Parágrafo de entrega (reescrito; mantém "demonstrativo", entrega nomeada e uso): Com a quantidade levantada deste desenho demonstrativo, duas propostas de obra se comparam pela mesma base. É assim com tudo o que sai daqui: planilha, projeto, laudo, relatório ou parecer, assinados, com ART e nota fiscal, para você orçar, contratar ou decidir com um número que explica a si mesmo.

Superado em 2026-09-18 (CONFENGE-LAPIDACAO-COMERCIAL-20260918): o parágrafo de entrega passou a "A quantidade levantada no exemplo demonstrativo põe duas propostas de obra na mesma base de comparação. Planilha, projeto, laudo e relatório saem assinados, com ART e nota fiscal, com origem e critério em cada número." — sem "sem obra de cliente" e sem repetir o fecho do H1. Proteção equivalente: `scripts/site/test_home_first_fold.mjs` (conceitos `prova_rotulada`, `entrega_nomeada`, `uso_da_entrega` na dobra dos dois viewports) e `scripts/site/test_deliverables_hub.py` (entrega ligada a uso, ≥ 120 caracteres).

Botões: "Ver serviços por situação" (`/servicos/`, único `button-primary`) · "Descrever a minha situação" (`/triagem-tecnica/`, link de texto).

Linha de confiança: Engenharia Civil pela EESC-USP · CNPJ 52.407.089/0001-09 · Como conferir credenciais e limites (`/confianca/`).

Prancha (figura `proof-figure hero-figure`, `title#hero-plan-title`, `desc#hero-plan-desc`): a planta do recorte de banheiro em tamanho editorial, com carimbo "Exemplo demonstrativo · R01 · sem obra de cliente". Legenda: Exemplo demonstrativo. Recorte de banheiro, paredes W-01 a W-04: 21,84 − 1,68 (porta) − 0,56 (janela) = 19,60 m² de revestimento, item ORC-PAR-01. Sem obra de cliente. Conferir a conta (`/quantitativos-orcamento-obras/#amostra-quantitativos`).

Superado em 2026-09-18 (CONFENGE-LAPIDACAO-COMERCIAL-20260918): a legenda e o carimbo das pranchas levam só "Exemplo demonstrativo"; "Sem obra de cliente" saiu da legenda e do carimbo (`scripts/demonstrative/plates/sheet.py: DEMO_LABEL`). Proteção equivalente: `scripts/demonstrative/plates/test_render_plates.py` exige o rótulo no título, na descrição e no carimbo de cada prancha e recusa "sem obra de cliente".

### Bloco 2 · Reconhecimento (`#situacoes`)

Eyebrow: Comece pela sua situação

H2 (`#situations-title`): Em qual destas você se reconhece?

Lead: Cada linha diz o que assumimos e o que você passa a ter. Se a sua mistura duas, qualquer uma serve. Seis áreas, sete situações.

As seis áreas são cabeçalhos de apresentação (ver `index-areas.json`); as sete linhas abaixo continuam sendo `li.situation-row` com os ids, os h3 e os hrefs atuais. A área "Inspeções e perícias" contém as linhas 03 e 05.

Área · Projetos e compatibilização

01 · `#situacao-projeto` · h3: Preciso completar, conferir ou compatibilizar um projeto. Elaboramos a disciplina que falta, conferimos o projeto recebido ou compatibilizamos as interfaces. Você passa a ter plantas, relatório ou registro de interferências para aprovar, contratar e executar com referência comum. Autoria existente fica com o autor. Links: Complementares (`/projetos-complementares-engenharia/`, texto) · Ver projeto e revisão (`/servicos/#servico-projeto`, `situation-action`).

Área · Quantitativos e orçamentos

02 · `#situacao-orcamento` · h3: Preciso comparar propostas, contratar a obra ou aceitar um número sem base própria. Levantamos os quantitativos e orçamos com critério, referência e data-base declarados. Você passa a ter planilha, memória e orçamento para comparar, contratar ou conferir. Link: Ver quantitativos (`/quantitativos-orcamento-obras/`).

Área · Inspeções e perícias

03 · `#situacao-obra-imovel` · h3: Tenho infiltração, fissura, mofo ou dano no imóvel. Inspecionamos o recorte combinado e separamos evidência de hipótese. Você passa a ter o relatório da condição, com hipóteses e próximo exame, para priorizar ou orçar. Visita combinada na proposta. Link: Ver inspeção (`/inspecao-diagnostico-edificacoes/`).

05 · `#situacao-pericia` · h3: Estou em uma disputa que depende de prova técnica de engenharia. Organizamos evidências e quesitos e acompanhamos a discussão técnica do seu lado. Você passa a ter manifestação técnica com evidências e conclusão, para instruir parte e advogado. Não vendemos nomeação de perito. Link: Ver assistência (`/assistencia-tecnica-pericial-engenharia/`).

Área · Avaliações imobiliárias

04 · `#situacao-avaliacao` · h3: Preciso do valor de um imóvel para negociar ou registrar. Avaliamos o imóvel para a finalidade e a data definidas, com objeto, método e dados declarados. Você passa a ter laudo ou parecer com conclusão delimitada, para negociar, partilhar, dar em garantia ou registrar. Pessoa física começa sem CNPJ. Link: Ver avaliação (`/servicos/#servico-avaliacao`).

Área · Segurança do trabalho

06 · `#situacao-sst` · h3: Preciso de um documento de segurança do trabalho. Diagnosticamos o que existe, o que falta e o que pode ser produzido. Você passa a ter o diagnóstico e o documento de SST nomeado, com profissional habilitado. Atos médicos ficam fora. Link: Ver apoio técnico de SST (`/seguranca-trabalho-apoio-tecnico/`).

Área · Obras públicas

07 · `#situacao-obras-publicas` (`situation-row situation-row--b2g`) · h3: Medição glosada ou pagamento travado em contrato público. Lemos contrato, boletim e memória, apuramos em reais o que está em jogo e escrevemos a posição técnica ao fiscal. Você passa a ter o dossiê técnico do evento, com cronologia e prova. O órgão decide o ateste e o pagamento. Link: Ver serviços para obras públicas (`/servicos-obras-publicas/`).

Fecho do índice: Ver todas as situações (`/servicos/`).

`#descrever-situacao` (h3): Não se reconheceu em nenhuma, ou a sua mistura duas? Conte do seu jeito, sem contratação nem documento sensível. A resposta nomeia o serviço, o que você recebe e o que falta reunir: em obra pública, casos urgentes em até 1 dia útil; os demais, em até 2. Ou use o formulário (`#contato`). Botões: Descrever pelo WhatsApp (href atual) · Descrever por e-mail (href atual).

Observação sobre a ordem: as linhas 03 (inspeção) e 05 (perícia) ficam adjacentes dentro da área "Inspeções e perícias", o que altera a ordem visual para projeto, orçamento, inspeção, perícia, avaliação, SST, obras públicas. A numeração 01 a 07 pode ser refeita nessa ordem ou retirada; os ids e os hrefs não dependem do número, e o total continua sendo sete linhas.

### Bloco 3 · Entregas (novo, `#entregas-demonstrativas`)

Eyebrow: O que chega às suas mãos

H2: Três necessidades, três documentos, os números abertos.

Lead: Cada exemplo abaixo é demonstrativo: mostra o método e o formato do documento, não uma obra de cliente. Os números estão publicados com desenho, memória e planilhas para você refazer a conta.

Superado em 2026-09-18 (CONFENGE-LAPIDACAO-COMERCIAL-20260918): o lead passou a "Cada exemplo mostra o método e o formato do documento; desenho, memória e planilhas estão publicados para você refazer a conta."; a identificação fica no kicker "Exemplo demonstrativo · <objeto>" de cada legenda, e as legendas 2 e 3 perderam "Premissas sintéticas, não obra de cliente." e "Nenhum valor de mercado é inventado aqui." (a 3 diz "Estrutura do laudo, sem valor de mercado"). Proteção equivalente: conceito `prova_rotulada` em `scripts/site/test_home_first_fold.mjs` e o rótulo por figura.

Amostra 1 · Exemplo demonstrativo · Edificação

Necessidade: Comparar duas propostas de reforma de um banheiro sem saber se as quantidades são as mesmas.

Trabalho: Levantamos as quatro paredes do recorte, descontamos a porta e a janela pelo critério declarado e ligamos cada quantidade à planta e ao item da planilha.

Documento entregue: Planilha de quantitativos com memória de cálculo. Prancha: planta PR-ARQ-R01 com a conta 21,84 − 1,68 − 0,56 = 19,60 m², item Q-PAR-01 / ORC-PAR-01.

Link: Abrir o recorte de banheiro (`/casos/demonstrativo-projeto-privado/#quantitativos`). Serviço: Quantitativos e orçamento (`/quantitativos-orcamento-obras/`).

Amostra 2 · Exemplo demonstrativo · Infraestrutura

Necessidade: Orçar ou conferir pavimento e drenagem de um acesso viário de loteamento antes de contratar.

Trabalho: Estaqueamos a faixa de pavimento de 40 m e o trecho de rede de 20 m, declaramos camadas e cotas e calculamos o volume de cada camada como área da faixa vezes espessura declarada.

Documento entregue: Planilha de quantitativos e memória, com a origem de cada volume. Prancha: perfil INF-PV-R01 com a memória 280,00 × 0,15 = 42,00 m³, item Q-SUB-01 / ORC-SUB-01. Espessura não é dimensionamento de pavimento.

Link: Abrir o recorte de acesso viário e drenagem (`/casos/demonstrativo-infraestrutura/#quantitativos`). Serviço: Quantitativos e orçamento (`/quantitativos-orcamento-obras/`).

Amostra 3 · Exemplo demonstrativo · Obra pública

Necessidade: O boletim de medição voltou com 90 m² de alvenaria quando a empresa executou 120 m², e o pagamento parou.

Trabalho: Separamos executado, medido, contratado e evidenciado, lemos o critério contratual de medição e apuramos a diferença e a lacuna de prova.

Documento entregue: Dossiê de Medição, Glosa e Pagamento, com cronologia, prova de cada número e parcela incontroversa. Prancha: "Mesma parede, quatro números" (120 m² executado declarado, 90 m² medido, 80 m² evidenciado, critério contratual de projeção). O dossiê não trata 120 m² como direito automático; o órgão decide o ateste.

Link: Ver o exemplo de medição (`/medicoes-glosas-obras-publicas/#exemplo-demonstrativo`). Serviço: Medição, glosa e pagamento (`/medicoes-glosas-obras-publicas/`).

Fecho: Todos os exemplos publicados, com arquivos abertos, estão em Casos demonstrativos (`/casos/`).

Os três links existem na base (`casos/demonstrativo-projeto-privado/index.html#quantitativos`, `casos/demonstrativo-infraestrutura/index.html#quantitativos`, `medicoes-glosas-obras-publicas/index.html#exemplo-demonstrativo`, verificados em 2026-09-17). Os números da amostra de infraestrutura vêm de `#qty-proof-entrances` (gerado a partir de `data/demonstrative`).

Pranchas: a frente B já publicou, na mesma worktree, `docs/campaigns/design-institucional/assets-manifest.json` com P1 `assets/pranchas/recorte-banheiro-{desktop,mobile}.svg` (páginas `/`, `/quantitativos-orcamento-obras/`, `/casos/demonstrativo-projeto-privado/`), P2 `drenagem-perfil-*` (páginas `/servicos/` e `/casos/demonstrativo-infraestrutura/`) e P3 `medicao-parede-*` (página `/medicoes-glosas-obras-publicas/#exemplo-demonstrativo`). As três amostras deste bloco usam P1, P2 e P3 nessa ordem; a composição é da frente B. P2 e P3 não declaram a página `/` no manifesto: a frente B precisa acrescentar `/` em `pages` ou o integrador decide usar só o link sem figura para as amostras 2 e 3.

### Bloco 4 · Responsabilidade (`#responsabilidade`, hoje `#trust-title`)

Eyebrow: Quem assina

H2 (`#trust-title`): Quem assina, como trabalha e onde você confere antes de pedir.

Retrato: `assets/tiago-sasaki-foto-v11-sem-fundo-560.{avif,webp,png}` (o mesmo de `/especialista/`), com legenda "Engº Tiago Sasaki, Engenheiro Civil, responsável técnico pela CONFENGE".

Quem assina (só alegações VERIFIED ou SELF_ATTESTED do registro, na redação permitida): Tiago Sasaki, Engenheiro Civil formado pela EESC-USP, com registro profissional ativo no CREA, responde tecnicamente pela CONFENGE, CNPJ 52.407.089/0001-09. Experiência na iniciativa privada e na Administração Pública, em fiscalização, gestão e orçamento contratual. Serviços técnicos emitidos com ART e nota fiscal, no escopo e na atribuição contratados. Conhecer quem responde (`/especialista/tiago-jun-sasaki/`) · Como conferir credenciais e limites (`/confianca/`).

Como trabalha: Cada entrega separa fato, cálculo, hipótese e lacuna. Não assinamos projeto de terceiros nem prometemos aprovação, pagamento ou resultado de processo. Atendimento em todo o Brasil, conforme escopo, local e atribuição confirmados na proposta.

Como o trabalho passa para cá (três passos, texto atual mantido): 1 · Você descreve a situação. Em texto, com o que já sabe. Documento sensível só depois, por canal seguro. 2 · Nós dizemos o trabalho, a entrega e o que falta. Quando o caso pede mais de um serviço, a proposta combina as etapas com um responsável nomeado. 3 · Escopo e responsabilidade ficam claros antes de começar. Local, atribuição, visita e ART, quando aplicáveis, são confirmados antes do aceite técnico. Daí em diante, a parte técnica é conduzida por nós.

Biblioteca: Guias, ferramentas e exemplos abertos, com fonte, data e limite declarados: Biblioteca (`/conteudos/`). Encontrou um erro no site? (`/triagem-tecnica/#corrigir-o-site`).

Excluídos por estarem WITHHELD no registro de credenciais: números de CREA e RNP, título de Engenheiro de Segurança do Trabalho, cadastro no CPTEC/TJSC, pós-graduação em avaliações, vínculo de responsável técnico da pessoa jurídica. "Mais de R$ 700 milhões em obras e projetos analisados" é SELF_ATTESTED com projeção só em `/confianca/` e `/especialista/`; não entra na home. Pelo mesmo critério, a razão social "Confenge Serviços de Desenhos Técnicos Ltda" (VERIFIED, mesmas duas superfícies de projeção) fica só no JSON-LD da home, onde já está como `legalName`, e não entra na cópia visível; se o integrador quiser exibi-la, é decisão registrada com essa nota.

### Bloco 5 · Obras públicas (`#obras-publicas`, faixa escura)

Eyebrow: Especialidade em obras públicas

H2 (`#b2g-title`): Obras públicas: edital, proposta e contrato em execução.

Lead: É onde a CONFENGE mais trabalha, com página própria por etapa. O PNCP separa mercado, oportunidade e risco no contrato.

Percurso em três etapas (mesmos hrefs de hoje, como linha de estágios, não como três cartões):

- Edital e proposta (`/bid-room-licitacoes-obras/`): ler o edital e a planilha antes de decidir participar.
- Contrato sob pressão (`/problemas-que-resolvemos/`): medição, glosa, aditivo, atraso e reequilíbrio com registro contemporâneo. Dentro: Dossiê de Medição, Glosa e Pagamento (`/medicoes-glosas-obras-publicas/`, `#jornada-contrato`), Reequilíbrio contratual (`/reequilibrio-obras-publicas/`), Defesa técnica e margem (`/defesa-margem-contratos-publicos/`).
- Operação recorrente (`/diretoria-b2g/`): rotina de escolha, orçamento, responsáveis e acompanhamento. Guias técnicos (`/guias-contratos-obras/`).

Botões: Ver serviços para obras públicas (`/servicos-obras-publicas/`, secundário) · Conferir método e limites (`/metodologia-inteligencia/`, texto).

Órgão público preparando uma obra? Descreva a necessidade (`/triagem-tecnica/#planejamento-publico`): respondemos com o apoio técnico que cabe ao caso, com a responsabilidade profissional confirmada antes do aceite.

Números de mercado (mantidos literais): Contratos de engenharia confirmados 54.055 · Registros públicos mapeados 4,48 mi · Leitura correta: números de mercado, não resultados de clientes · Fonte e corte: PNCP · 01/08/2026.

`#mercado-pncp` (h2 `#market-title`): Contratos reais, diferentes portes. Três contratos publicados no PNCP, de portes muito diferentes, e o que cada um coloca em jogo tecnicamente. Tabela regrada (uma linha por contrato, colunas Faixa · Valor observado · O que mostra · Conferir):

| Faixa | Contrato observado | O que este contrato mostra | Conferir |
| --- | --- | --- | --- |
| Até R$ 250 mil | R$ 179.737,67 | Obra de porte local, medição simples e pouca margem para absorver imprevisto. A pergunta técnica costuma ser se o que foi executado está documentado no ritmo em que a medição é apresentada. | `https://pncp.gov.br/app/contratos/01258036000132/2026/7` |
| R$ 250 mil a R$ 1 milhão | R$ 719.177,48 | Prazo longo o bastante para acumular alteração de escopo, reajuste e evento não previsto. A pergunta técnica costuma ser se o pedido de aditivo ou de reequilíbrio está sustentado por registro contemporâneo. | `https://pncp.gov.br/app/contratos/14862788000150/2026/69` |
| Acima de R$ 1 milhão | R$ 18.293.629,80 | Várias frentes, medições sobrepostas e cadeia de subcontratação. A pergunta técnica costuma ser onde a glosa, o atraso e o desequilíbrio nascem, e quem tem o documento que prova cada um. | `https://pncp.gov.br/app/contratos/81648859000103/2026/45` |

Rodapé da tabela (texto atual mantido): Atendemos contratos de qualquer porte, e o porte do contrato não decide sozinho o formato do trabalho: isso depende do risco, dos documentos que existem e de a necessidade ser pontual ou recorrente. O preço de cada oferta está publicado na página dela, com escopo e prazo: ver as entregas e os preços (`/entregas/`). Fonte: PNCP, consulta pública. Contratos conferidos em 21/08/2026. Contexto de mercado. Números não representam resultados de clientes.

### Bloco 6 · Contato (`#triagem-tecnica` + `#contato`)

`#triagem-tecnica` (eyebrow Próximo passo; h2 `#triage-title`): Solicite uma proposta a partir da sua necessidade. Indicamos a entrega e o que falta para a proposta. Ação dominante: Descrever minha situação (`#contato`, leva ao formulário). Alternativas: Conversar sobre o serviço pelo WhatsApp (href atual, botão secundário) · Solicitar proposta por e-mail (href atual, link). Não envie documentos sensíveis; o canal é combinado depois.

`#contato` (eyebrow Descreva a sua situação): Escolha a situação e conte o essencial. O canal de documentos vem depois.

O que acontece depois (ver `contato-depois.md`, versão curta): 1 · Confirmação imediata na tela, com protocolo. 2 · Resposta em até 2 dias úteis; contrato ou obra pública urgente, até 1 dia útil. 3 · Proposta com escopo, responsabilidade e preço, depois de confirmarmos o caso.

Situação de obra pública? Falar sobre obras públicas (`/servicos-obras-publicas/`). WhatsApp (48) 98834-4559 (href atual) · E-mail tiago.sasaki@confenge.com.br (href atual) · Atendimento: todo o Brasil, conforme escopo, local e atribuição confirmados na proposta. Eng. Civil EESC-USP · iniciativa privada e Administração Pública · como conferir estas credenciais (`/confianca/`).

Aviso de formulário indisponível (texto atual mantido).

`#formulario-contato`: byte-idêntico. Título `#contact-title` "Conte o essencial. Devolvemos o próximo passo." e todos os rótulos, opções, dicas, consentimento, "Solicitar canal seguro para envio de documentos.", rodapé de retenção e `#form-status` ficam como estão.

## 3. Decisões que precisam do integrador

- O bloco Entregas é novo: precisa de `data-section-archetype` (`content_editorial` é o mais próximo em `design-system.json`; `deliverable_feature` descreve uma entrega com preço, o que não é o caso) e das pranchas P1, P2 e P3 do manifesto da frente B (ver nota no bloco 3; P2 e P3 ainda não declaram a home).
- Retrato na home: `assets/tiago-sasaki-foto-v11-sem-fundo-560.*` entra no orçamento de bytes da primeira dobra só se ficar abaixo dela; o bloco 4 está abaixo.
- `#mercado-pncp` como tabela troca três `article.service-card` por uma `table`; `test_home_card_grid_limit` conta grades legadas, não cartões, e continua satisfeito.
- A frase "operação de proposta para licitação crítica" só existe no JSON-LD da home; qualquer reescrita do `@graph` precisa preservá-la ou o gate de cópia reprova.
- Numeração das linhas 01 a 07 sob as seis áreas: decidir entre renumerar na ordem visual ou retirar os números.
- Área "Inspeções e perícias" com duas linhas: o `li.situation-row` continua sendo a unidade; a área é só cabeçalho e agrupamento visual.
