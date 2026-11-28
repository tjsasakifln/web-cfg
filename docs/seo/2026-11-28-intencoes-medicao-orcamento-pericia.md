# Perguntas de compra em medição, orçamento e assistência técnica

Decisão `EXECUTE_NOW`, frente `INBOUND ENGINE`, alavancas de distribuição e confiança. A hipótese de receita depende da qualidade dos contatos, não da quantidade de palavras-chave. Diagnóstico técnico antes da publicação e comparação de 28 dias após rastreamento confirmado.

## Evidência utilizada

No [recorte de 20/10 a 16/11](2026-11-18-search-performance.md), a página de medição teve 288 impressões, 2 cliques e posição média 5,01. A de orçamento teve 27 impressões e nenhum clique. Esses números são históricos, não medem a demanda do mercado nem isolam o efeito das versões publicadas naquele intervalo.

Em 28/11/2026, foram consultadas 31 combinações no preenchimento automático público do Google, em português, com país Brasil (`hl=pt-BR`, `gl=BR`). A [metodologia do AnswerThePublic](https://answerthepublic.zendesk.com/hc/en-us/articles/26624566060315-How-to-Get-the-Most-out-of-AnswerThePublic) orientou a estrutura de perguntas, preposições e comparações. Não foi uma exportação do produto. As sugestões não informam frequência nem volume e foram filtradas pela utilidade para cada visitante.

| Situação | Sugestões observadas | Resposta e próximo passo na rota existente |
| --- | --- | --- |
| Preparar a medição de obra pública ou responder a um corte | “boletim de medição de obra pública”, “como fazer medição de obra publica”, “glosa medição” | Checklist curto de boletim na página de medição e glosa. O dossiê e a solicitação identificam a divergência, a diferença e a evidência. Os guias continuam responsáveis por ateste, atraso e outras perguntas específicas. |
| Contratar ou revisar quantitativos e orçamento | “levantamento de quantitativos para orçamento”, “diferença orçamento analítico e sintético”, “orçamento analítico x sintético”, “orçamento sinapi” | Distinguir o total sintético da composição, a estimativa por área da contratação detalhada e a referência de preço do regime da empreitada. Manter guias independentes para as duas últimas perguntas e o contato contextual para elaborar, revisar ou comparar. |
| Preparar quesitos ou analisar laudo de uma perícia de engenharia | “assistente técnico para perícia judicial”, “perito judicial ou assistente técnico”, “quesitos perícia engenharia civil”, “diferença entre laudo e parecer técnico de engenharia” | Distinguir papéis, oferecer orientação a quem já recebeu o laudo e pedir apenas o assunto, a etapa e o prazo conhecido antes de combinar o canal para dados sensíveis. |
| Produzir projetos e coordenar disciplinas | “projetos complementares em bim”, “compatibilização de projetos bim” | Mantido na PR #916. A rota de revisão não vira sinônimo de compatibilização. |
| Usar ferramentas no navegador | “converter pdf para dwg online grátis”, “pdf para dwg editavel”, “converter pdf em dwg com layers” | Intenção de uso imediato, não de contratação. O conversor e o guia já respondem assuntos diferentes. O texto não pode ampliar as garantias de editabilidade, gratuidade ou fidelidade além do produto verificado. |
| Preparar SST para obra e pesquisar mercado público | “pgr para obra civil”, “como fazer pesquisa de preços para licitação” | PGR já tem página por etapa da obra. A consulta de pesquisa de preços também pode ser de agente público que prepara uma contratação, diferente da prospecção de empresas. Não foi usada para alterar a oferta de inteligência. |

Consultas de cursos, vagas ou perícias médicas não foram aproveitadas. A comparação com estimativa por área foi uma decisão editorial, não uma sugestão observada nessa coleta. Não se criou página para variante de consulta, cidade ou público. Referências para a conferência técnica: [TCU sobre orçamento detalhado](https://licitacoesecontratos.tcu.gov.br/4-4-3-6-orcamento-detalhado-do-custo-global-da-obra/), [Lei 14.133/2021, art. 143](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm) e [CPC, arts. 465 a 477](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm). Respostas úteis, títulos claros e links rastreáveis seguem as [orientações do Google](https://developers.google.com/search/docs/essentials).

## Publicação e medição

As três rotas mantêm canônicas, indexabilidade, eventos e canais de contato vigentes. A origem `CONFENGE_WEB`, as regras de consentimento, a persistência e os controles de privacidade não mudam. `web-cfg` responde pelo conteúdo e a captura. O `warmbly` mantém a oportunidade, a proposta e o resultado financeiro. Não há aquisição de novos fatos do `extra-cli`. Permanecem as [ADR-STRAT-002](../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md) e [ADR-STRAT-004](../architecture/ADR-STRAT-004-commercial-constitution-and-finite-portfolio.md).

Verificar o HTML renderizado, as perguntas em relação ao conteúdo estruturado, o CTA e o destino dos guias. Em produção, confirmar o SHA do [build](https://confenge.com.br/.well-known/build-info.json), o HTTP 200 e o texto efetivo de cada página. Não testar envio com contatos fictícios em produção. A reversão usa o revert pelo fluxo canônico Netcup.

Comparar 28 dias completos antes e depois da atualização encontrada pelo Google, usando o mesmo recorte e separando página de consulta. Interpretar posição, cliques e impressões em conjunto. Quando possível, cruzar entrada orgânica e contato qualificado com os eventos existentes sem dados pessoais, mantendo proposta, contrato e recebimento como resultados distintos.
