# Matriz de aplicabilidade — estrutura candidata

Esta estrutura transforma “pacote completo ou modular” em escopo verificável. Ela não é um modelo jurídico nem substitui o regulamento do ente. A versão preliminar usa somente contexto não sensível; a versão contratada recebe os fundamentos e responsáveis confirmados.

## Estados permitidos

- `APLICÁVEL`: entra no escopo e tem responsável, insumo e critério de conclusão.
- `NÃO_APLICÁVEL`: foi avaliado e existe razão registrada para não integrar o caso.
- `PENDENTE_DE_INFORMAÇÃO`: a decisão depende de norma, origem do recurso, regime, levantamento ou outro dado ainda não confirmado.
- `FORA_DO_ESCOPO`: pode ser necessário ao processo, mas não será produzido pela CONFENGE nesta contratação.

## Campos obrigatórios

| Campo | Pergunta respondida |
| --- | --- |
| Módulo ou peça | O que está sendo avaliado? |
| Status | Entra, não entra, depende ou pertence a terceiro? |
| Fundamento ou critério | Qual regra, decisão do ente ou característica do objeto sustenta o status? |
| Insumo | O que precisa existir antes da produção? |
| Responsável por fornecer | Quem entrega norma, levantamento, decisão ou dado? |
| Responsável por produzir | CONFENGE, ente ou terceiro? |
| Responsável por validar/decidir | Qual unidade ou agente competente fecha a escolha? |
| Responsabilidade técnica | Há ART/RRT? Qual atividade e profissional serão confirmados? |
| Versão | Qual é a versão atual da peça? |
| Dependência ou pendência | O que impede iniciar ou concluir? |

Antes das linhas de documentos, a matriz deve identificar o regime: Lei nº 14.133 e regulamento do ente; Lei nº 13.303 e regulamento interno da estatal; outro regime confirmado; ou pendente de confirmação. Nenhuma linha DFD/DOD, ETP ou TR é marcada automaticamente para estatal.

## Exemplo sintético de estrutura

Exemplo inteiramente fictício, sem documento real, cliente, valor, capacidade ou conclusão profissional. Para tornar os estados internamente coerentes, o exemplo pressupõe que a incidência da Lei nº 14.133 e do regulamento local já foi confirmada; o objeto abstrato é “reforma de edificação pública”. Todos os demais campos precisam ser confirmados no caso concreto.

| Módulo ou peça | Status | Fundamento ou critério | Insumo | Fornece | Produz | Valida/decide | Responsabilidade técnica | Versão | Dependência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Enquadramento e matriz | APLICÁVEL | necessário para delimitar o pacote | natureza jurídica, regime, regulamento e descrição da necessidade | unidade demandante | CONFENGE | equipe de planejamento | verificar no escopo | 0.1 | confirmar responsável; regime já confirmado no exemplo |
| DFD/DOD | PENDENTE_DE_INFORMAÇÃO | nomenclatura depende do regulamento | norma e fluxo interno | ente | a definir | autoridade/unidade competente | a definir | 0.1 | confirmar nomenclatura e fluxo no regulamento já identificado |
| ETP | APLICÁVEL | fase preparatória informada | necessidade, alternativas e estimativas | ente | CONFENGE no limite contratado | equipe de planejamento | verificar atividades técnicas | 0.1 | dados de uso do imóvel |
| Termo de Referência | PENDENTE_DE_INFORMAÇÃO | depende da caracterização do objeto | ETP e escolha do instrumento | ente | a definir | equipe competente | a definir | 0.1 | fechar regime e peça técnica |
| Projeto básico | APLICÁVEL | caracterização técnica do objeto | levantamentos e disciplinas | ente/terceiros | CONFENGE nas disciplinas contratadas | responsável do ente | ART/RRT por atividade a confirmar | 0.1 | acesso e levantamento |
| Projeto executivo | PENDENTE_DE_INFORMAÇÃO | depende do regime e da estratégia de contratação | projeto básico e decisões | ente | a definir | responsável do ente | a definir | 0.1 | decisão do regime |
| Quantitativos e orçamento | APLICÁVEL | estimativa exige memória e fontes | projetos, data-base e referências | ente/CONFENGE | CONFENGE | responsável do ente | verificar atividade | 0.1 | projetos consistentes |
| Cronograma | APLICÁVEL | prazo precisa refletir quantitativos e sequência | projetos e produtividade | CONFENGE/ente | CONFENGE | responsável do ente | verificar atividade | 0.1 | fechar quantitativos |
| Critérios de medição/recebimento | APLICÁVEL | instrumento deve permitir verificação | objeto, regime e marcos | ente | CONFENGE como subsídio | fiscalização/gestão competente | ato de recebimento é do ente | 0.1 | fechar cronograma |
| Matriz de riscos | PENDENTE_DE_INFORMAÇÃO | aplicação e profundidade dependem do caso | riscos, regime e regra aplicável | ente/CONFENGE | CONFENGE como subsídio | autoridade/equipe competente | decisão de alocação é do ente | 0.1 | confirmar hipótese e owners |
| Licença ou ensaio especializado | FORA_DO_ESCOPO | terceiro ainda não contratado | requisitos do órgão competente | ente/terceiro | terceiro | órgão/unidade competente | responsabilidade do terceiro | 0.1 | contratar terceiro |

## Regra de fechamento

Uma proposta só pode chamar o pacote de delimitado quando todos os itens `APLICÁVEL` têm saída, owner, insumo, dependência, responsabilidade e critério de conclusão; os itens pendentes têm condição e data de decisão; e os itens externos têm interface explícita. Quantidade de páginas nunca substitui unidade de trabalho.
