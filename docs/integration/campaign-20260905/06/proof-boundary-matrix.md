# MV-06 — matriz de prova e fronteiras

Data de corte: 2026-09-05. Esta matriz controla a copy dos candidatos; não é uma declaração de habilitação profissional. `UNKNOWN` não é convertido em negativa nem em afirmação positiva.

## Prova comum às três famílias

| Afirmação ou necessidade | Evidência atual | Estado no candidato | Fronteira para publicação |
| --- | --- | --- | --- |
| A marca e o CNPJ são CONFENGE, 52.407.089/0001-09 | `data/site/credential-registry.json` (`org-cnpj=VERIFIED`) e `/confianca/`; consulta oficial da Receita é o caminho público | Visível | Manter paridade com o registro canônico integrado; não inferir situação cadastral além da consulta oficial |
| Tiago Jun Sasaki conduz publicamente a CONFENGE | `data/site/credential-registry.json` (`person-legal-name=VERIFIED`), `/confianca/` e perfil público | Visível | Não transformar responsável pelo enquadramento em executor habilitado de toda disciplina |
| Engenharia Civil pela EESC-USP | `data/site/credential-registry.json` (`person-civil-eesc-usp=SELF_ATTESTED`) registra que a fonte pública atual é auto declarada | Visível com a limitação “publicada pelo próprio responsável” | Só substituir ou complementar por registro documental verificável; não chamar de verificação independente |
| Engenheiro de Segurança do Trabalho | `person-sst-engineer=WITHHELD` no registro canônico porque a consulta oficial não foi reproduzida | Ausente | Só projetar após fonte, `as_of`, owner, rechecagem e redação pública permitida |
| Pós-graduação em Avaliações e Perícias | `person-postgrad-valuations=WITHHELD` por falta de diploma/certificado oficial reproduzido | Ausente | Mesma exigência de fonte nominal verificável |
| Cadastro CPTEC/TJSC e número de trabalhos | `person-cptec-registration` e `person-cptec-work-count` estão `WITHHELD`; screenshot de entrada não é fonte durável | Ausente | Só publicar por consulta oficial reproduzível, com data e distinção entre cadastro, trabalho e nomeação |
| CREA-PJ, número de registro e vínculo técnico | `org-crea-pj`, `person-crea-sc` e `person-technical-link` estão `WITHHELD` sob #243 | Ausente | Não promover enquanto o registro canônico não fornecer projeção válida; nunca inventar número ou vínculo |
| NF | Regra comercial autorizada em #577/#581 | Copy diz que a proposta contempla NF | Não expor preço, regime tributário ou condição não registrada |
| ART | #577/#581 permitem “quando aplicável”; Resolução CONFEA 345/1990 sustenta a responsabilidade em atividades abrangidas | Condicional e ligada ao escopo/atribuição | Nunca usar ART como selo genérico; proposta identifica a necessidade e o profissional |
| Atendimento nacional | Superfície atual declara atendimento nacional | Visível como enquadramento nacional | Campo, deslocamento, formalidades locais, disponibilidade e responsável são definidos por local/escopo; sem promessa de presença imediata |
| Resultados, clientes, casos, taxa de êxito e SLA | Nenhuma prova aplicável a estas famílias foi encontrada | Ausente | Permanecem bloqueados até evidência permissionada e contrato canônico |
| Equipe multidisciplinar própria | Nenhuma prova encontrada | Negada como presunção | Dependências devem ser nomeadas na proposta; rede ou equipe só aparece após prova e vínculo de escopo |

## Perícias e assistência técnica

| Elemento | Pode ser dito | Limite obrigatório | Fonte/owner |
| --- | --- | --- | --- |
| Assistente técnico da parte | É indicado pela parte e pode apoiar quesitos, diligência e manifestação técnica | Não é o perito nomeado pelo juízo; não substitui advogado | CPC, arts. 465 e 466 |
| Perito do juízo | É nomeado pelo juiz quando a prova depende de conhecimento técnico | Não ofertar nomeação, influência ou resultado; não usar “perito oficial/do TJSC” | CPC, arts. 156 e 465; #581 |
| Triagem pré-litígio | Organiza objeto, fatos, documentos, lacunas e necessidade de aprofundamento | Não concluir mérito jurídico nem prometer viabilidade | #583 e método proposto |
| Quesitos | Perguntas técnicas ligadas ao objeto e às evidências disponíveis | Estratégia processual e redação jurídica permanecem com o advogado | CPC, art. 465 |
| Acompanhamento de diligência | Preparação e presença técnica quando incluídas e viáveis | Cidade, data, acesso, atribuição e custos de campo constam da proposta | CPC, art. 466; #583 |
| Análise de laudo, parecer e esclarecimentos | Examina método, dados, respostas, cálculos e limites | Não “derruba” laudo, “defende tese” ou garante acolhimento | CPC, arts. 473 e 477; #577/#583 |
| Conflito e confidencialidade | O primeiro contato não recebe autos ou partes; triagem precede corpus substantivo | Mesmo caso não admite papéis incompatíveis; detalhes ficam fora de analytics | #585 |

## Avaliações de imóveis

| Elemento | Pode ser dito | Limite obrigatório | Fonte/owner |
| --- | --- | --- | --- |
| Finalidade | O uso pretendido e o destinatário orientam o escopo | Não presumir requisito de banco, juízo ou órgão | #583; Resolução CONFEA 345/1990 |
| Data de referência | A conclusão representa uma data definida | Não confundir data de vistoria com referência sem análise | #583; método técnico |
| Imóvel e documentação | Identificação, direitos, matrícula, cadastro, plantas e registros conforme o caso | Não solicitar documento pessoal ou matrícula em canal aberto inicial | #583; privacidade do repositório |
| Vistoria | A necessidade, o acesso e suas limitações são registrados | Não dispensar ou prometer campo universalmente | #583; Resolução CONFEA 345/1990 |
| Método e norma | A proposta identifica método e norma aplicáveis | Não afirmar versão, conformidade ABNT ou conteúdo protegido sem conferência/licença | Catálogo ABNT; #583 |
| Laudo ou parecer | O tipo de documento é escolhido conforme finalidade, escopo e atribuição | Sem valor antecipado, chancela, aceitação universal ou decisão garantida | Resolução CONFEA 345/1990; #577/#583 |

## Segurança do Trabalho

| Elemento | Pode ser dito | Limite obrigatório | Fonte/owner |
| --- | --- | --- | --- |
| GRO/PGR | O PGR materializa o gerenciamento e contém, no mínimo, inventário de riscos e plano de ação | Verificar estabelecimento, atividade, perigos e dispensas; não vender pacote automático | MTE, página PGR e NR-1 |
| NR-1 vigente | O enquadramento usa a redação vigente e considera riscos psicossociais relacionados ao trabalho | Registrar versão/data; não congelar regra na copy | MTE, NR-1 vigente desde 26/05/2026 |
| LTCAT | Tem finalidade previdenciária própria | PGR não o substitui; responsável habilitado precisa ser identificado | FAQ oficial GRO/PGR; eSocial |
| AEP/AET | A avaliação preliminar integra o processo; AET ocorre quando necessária e produz relatório | Não anunciar AET automática | MTE, NR-17 |
| Insalubridade/periculosidade | Análises dependem de atividade, agente, exposição e critérios aplicáveis | Não concluir adicional, direito ou caracterização na página | MTE, NR-15 e NR-16 |
| eSocial | É possível organizar insumos técnicos e apoiar o fluxo se contratado e autorizado | A empresa permanece responsável; não prometer transmissão ou regularização automática | eSocial, FAQ e documentação técnica |
| PCMSO/ASO/saúde ocupacional | São dependências possíveis e devem ser identificadas | Não publicar como entrega própria de engenharia; exigem profissional habilitado | Limite multidisciplinar de #583 |
| Higiene, ergonomia e outras especialidades | Podem ser necessárias conforme risco, método e medição | Não afirmar equipe/rede disponível sem prova | #583 e regra de verdade |
| Credencial SST | Deve estar visível e verificável antes da contratação/indexação | Hoje está `BLOCKED_PENDING_MV02`; não inferir do título de engenheiro civil | #581, #243 e MV-02 |

## Resultado da revisão

- `PUBLICATION_PROOF_STATE=BLOCKED_PENDING_MV02_MV03_MV09`
- `CANDIDATE_COPY_STATE=READY`
- Nenhuma página exibe preço, SLA, cliente, case, resultado, quantidade de trabalhos, número de registro ou cobertura presencial irrestrita.
- As fontes oficiais sustentam fronteiras gerais; não são usadas como prova de credencial ou capacidade da CONFENGE.
