# MV-09 — matriz final de intenção e canonical

Estado em 2026-09-05. A matriz separa trabalhos do visitante; não cria páginas por persona. Quando a prova de oferta ou credencial ainda está retida, o destino público é o hub corporativo com triagem contextual, não uma money page improvisada.

| Query / intenção | Canonical | Família pública | Adjacente, sem competir | Estado de índice | Uso outbound |
|---|---|---|---|---|---|
| serviços de engenharia, perícias e inteligência técnica | `/servicos/` | `servicos-corporativos` | Home explica a tese; triagem recebe contexto | `index,follow` | Destino amplo somente quando a mensagem também for ampla |
| consultoria para licitação e contrato de obra pública | `/servicos-obras-publicas/` | `servicos-obras-publicas` | `/servicos/` apresenta B2G como vertical e aponta para este catálogo | `index,follow` | Sim, para first touch B2G com message match |
| quantitativos, levantamento de quantidades ou orçamento de obra privada | `/quantitativos-orcamento-obras/` | `private-engineering-quantities-budget` | `/servicos/` é o hub; a triagem recebe os demais trabalhos de projeto | `index,follow` | Pode receber tráfego somente quando a mensagem for sobre quantitativos/orçamento |
| projeto complementar, compatibilização ou BIM | `/servicos/` | `servicos-corporativos` | `/triagem-tecnica/#projetos` é ação; a rota de quantitativos não substitui revisão/compatibilização | `index,follow` | Não até existir oferta/rota específica comprovada |
| inspeção, patologia, reforma ou problema técnico em condomínio | `/servicos/` | `servicos-corporativos` | `/triagem-tecnica/#obra-imovel` coleta o contexto mínimo | `index,follow` | Não até existir oferta/rota específica comprovada |
| perícia de engenharia, assistente técnico ou disputa trabalhista técnica | `/servicos/` | `servicos-corporativos` | `/triagem-tecnica/#pericia-avaliacao`; conteúdo público não promete credencial retida | `index,follow` | Não até prova nominal e oferta aprovadas |
| avaliação de imóvel ou ativo | `/servicos/` | `servicos-corporativos` | Perícia é situação adjacente, não sinônimo; triagem separa o caso | `index,follow` | Não até prova nominal e oferta aprovadas |
| segurança do trabalho / SST | `/servicos/` | `servicos-corporativos` | `/triagem-tecnica/#sst`; título, atribuição e capacidade permanecem retidos | `index,follow` | Não |
| planejamento técnico de obra por órgão público | `/servicos/` | `servicos-corporativos` | `/triagem-tecnica/#planejamento-publico`; catálogo do licitante fica separado | `index,follow` | Não até oferta multidisciplinar e responsabilidade técnica provadas |
| obra privada pronta para contratar, executar ou retomar | `/ferramentas/prontidao-tecnica-obra-privada/` | `prontidao-tecnica-obra-privada` | Resultado útil antes do contato; não substitui consultoria nem domina a navegação | `noindex,follow`; fora do sitemap | Não usar como landing principal nesta release |
| glosa, medição, aditivo, reequilíbrio, atraso ou defesa B2G | rota de serviço/conteúdo B2G exata | `service-pillars`, `guias-contratos-obras` ou `editorial-library` | `/servicos-obras-publicas/` é catálogo; `/problemas-que-resolvemos/` organiza situações | `index,follow` conforme registry | Sim, somente para a promessa exata |
| calculadora ou diagnóstico B2G | rota de ferramenta exata | `ferramentas` | Hub `/ferramentas/` permite descoberta; readiness privada não é alternativa | `index,follow` conforme registry | Sim quando campanha e ferramenta correspondem |
| inteligência PNCP / mercado público | `/radar/nacional-obras-publicas/` ou conteúdo de inteligência exato | `radar` ou `inteligencia-pseo` | Bid Room é para decisão de proposta e não substitui inteligência PNCP | `index,follow` conforme registry | Somente após corrigir o mapping MV-08 |

## Regras de conservação

- `/servicos/` resolve a demanda corporativa; `/servicos-obras-publicas/` resolve a vertical B2G. Não há redirect entre elas.
- Perícia e avaliação compartilham entrada de triagem, mas preservam intenções distintas; inspeção/patologia e reforma/condomínio seguem a mesma regra.
- Não há doorway por profissão, persona, cidade ou estado. Uma nova canonical exige utilidade própria, prova, captura, freshness e registry.
- Links de outbound sempre usam a rota que repete a promessa da mensagem. Home ampla não é fallback para first touch de alta intenção.
