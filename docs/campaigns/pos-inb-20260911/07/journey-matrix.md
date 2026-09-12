# Matriz de jornadas POS-INB-07

Antes/depois por alteração. Sem pontuação de conversão. SHA de base: `cb6facfaaf50aa8f1834aba43d0245e04cbea672`.

| Jornada | Antes (hub visível) | Depois (hub visível) | Hops úteis |
|---|---|---|---|
| Orçamento a partir de Serviços | Link dedicado `/quantitativos-orcamento-obras/` | Preservado | 1 |
| Revisão a partir de Serviços | Link dedicado; marcador opcional podia omitir a rota core | Mesmo destino, agora REQUIRED/CORE | 1 |
| Compatibilização a partir de Serviços | Link dedicado; OPTIONAL/CORE | Mesmo destino, REQUIRED/CORE | 1 |
| Elaboração complementar a partir de Serviços | Text-link no cartão de projeto; OPTIONAL/EXPANSION | Mesmo destino, REQUIRED/CORE, marcador no link | 1 |
| Inspeção a partir de Serviços | Link dedicado; OPTIONAL | REQUIRED/CORE; CTA de proposta na página dedicada | 1 |
| Perícia / assistência a partir de Serviços | Link dedicado; OPTIONAL; CTA reabria triagem genérica | REQUIRED/CORE; CTA vai à página dedicada `#contato-assistencia` | 1 |
| Avaliação a partir de Serviços | Misturada no texto de perícia, sem âncora própria | Bloco `#servico-avaliacao` no hub, WhatsApp/e-mail/triagem; sem landing nova | 0 (já no hub) |
| SST a partir de Serviços | Link dedicado sem entrada na matriz | REQUIRED/CORE; distingue ato médico | 1 |
| As oito ofertas a partir da Biblioteca | Revisão/compat/inspeção iam a âncoras de Serviços; perícia, avaliação e SST ausentes da lista por necessidade | Links diretos às páginas dedicadas; avaliação no hub; SST e perícia nomeados | 1 |
| Demonstrativo privado a partir de Casos | HTML já apontava `/casos/demonstrativo-projeto-privado/`; matriz ainda usava `/casos/prova-tecnica-obra-privada/` como OPTIONAL ausente | Matriz e HTML no URL vigente; partes ligadas a revisão, compat, orçamento e elaboração | 1 |
| Ferramentas | Prontidão e verificador presentes | Preservado; atalhos nomeados para serviços se a necessidade já estiver clara | 1 |

Visitante que não conhece o nome do serviço: a Biblioteca e Serviços nomeiam o problema (elaborar, revisar, compatibilizar, orçar, inspecionar, provar, avaliar, apoiar SST) sem núcleos ou verticais e sem forçar público/privado quando a entrega serve aos dois.
