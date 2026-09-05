# MV-05 — pesquisa de intenção: engenharia privada

**Decisão:** `VALIDATE` — frente executiva: receita privada; tempo para evidência: primeiras conversas qualificadas e pedidos de escopo por rota. Alavancas: receita, confiança e reutilização de um método de triagem por artefato. A recomendação é um hub e três rotas, não páginas por persona ou por palavra-chave.

## Método e limites

Pesquisa feita em **05-09-2026**, Brasil, pt-BR. Foram consultadas buscas web para combinações de `compatibilização BIM`, `projetos complementares`, `levantamento quantitativo orçamento`, `auditoria de orçamento`, `inspeção predial`, `recebimento de obra`, `plano de reforma condomínio`, `as built`, `incorporadora` e `loteamento infraestrutura`. Os resultados comerciais servem exclusivamente para observar a linguagem e o agrupamento de intenção da SERP; não comprovam capacidade, escopo, preço, prazo, ART ou resultado da CONFENGE. Fontes normativas/institucionais suportam apenas as restrições técnicas indicadas.

Inventário local realizado no HEAD `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb` (igual ao build-info observado em produção em 05-09-2026). O site em produção responde em `confenge.com.br`, Cloudflare, com `X-Confenge-Host-Architecture-Version: confenge-nginx-node/v2`, conforme [RUNTIME-AUTHORITY](../../../architecture/RUNTIME-AUTHORITY.md).

## O que a SERP separa

| Cluster / consulta representativa | Linguagem observada em páginas da SERP | Job e consequência | Decisão de rota |
| --- | --- | --- | --- |
| `compatibilização BIM`, `coordenação BIM`, `projetos complementares BIM` | “compatibilização multidisciplinar”, “modelo federado”, “detecção de interferências”, “gestão de ocorrências”, “revisões”, “arquivos para obra”; [A3A](https://a3aengenharia.com.br/servicos/servicos-transversais/compatibilizacao-e-integracao-de-projetos/), [Vebim](https://vebim.com.br/), [onBIM](https://www.onbim.com.br/) | Coordenar disciplinas antes da mobilização; sem isso, conflito chega à obra e decisões/revisões ficam dispersas. | Rota própria. Arquitetos, escritórios, construtoras e plataformas têm o mesmo job de interface, não rotas próprias. |
| `levantamento quantitativo orçamento obra`, `auditoria orçamento obra` | “levantamento de quantidades”, “planilha orçamentária”, “composição de preços”, “curva ABC”, “cronograma físico-financeiro”, “auditoria”; [Rebomundi](https://www.rebomundi.com.br/), [IK3](https://ik3.com.br/servicos/orcamentacao-com-bdi/) | Tomar decisão de custo/contratação com quantidades, premissas e memória conferíveis; sem isso, comparação de propostas e mudança de escopo viram discussão sem base comum. | Rota própria, separada de BIM: o artefato terminal é quantitativo/orçamento auditável, não coordenação de modelo. |
| `inspeção predial`, `vistoria recebimento obra`, `patologias construtivas`, `laudo entrega chaves` | “anomalias”, “patologias”, “não conformidades”, “relatório fotográfico”, “prioridades”, “antes de aceitar as chaves”; [BIM Projeção](https://bimprojecaoengenharia.com/servicos), [JOF](https://jofengenharia.com.br/), [Indagine](https://indagineengenharia.com.br/) | Verificar condição existente/entrega e decidir o que registrar, priorizar ou encaminhar antes de aceitar, contratar ou intervir. | Rota própria, se — e somente se — a atribuição, a inspeção presencial e a responsabilidade técnica forem confirmadas para o caso. |
| `plano de reforma condomínio`, `laudo reforma apartamento`, `engenharia condominial` | “plano de reforma”, “documentação antes do início”, “análise para síndico”, “ART/RRT”, “paredes, sobrecarga e instalações”; [CAU/BR](https://caubr.gov.br/normadereformas/), [BWLopes](https://www.bwlopes.com.br/servicos/laudo-reformas/), [Brechtson](https://brechtson.com.br/servicos/laudos/laudo-art/) | Condômino e condomínio precisam do mesmo fluxo: delimitar intervenção, documentação e responsável antes de liberar/executar. | Âncora/caso de uso na rota de inspeção e documentação, não quarta money page; não prometer ART, aprovação ou análise de disciplina sem enquadramento profissional/local. |
| `as built`, `como construído`, `levantamento cadastral` | “como construído”, “reconciliação entre projeto e executado”, “alterações documentadas”, “histórico rastreável”; [Arquivo Nacional](https://www.gov.br/arquivonacional/pt-br/servicos/publicacoes/arquivos-de-engenharia.pdf), [PBH](https://prefeitura.pbh.gov.br/sudecap/manual-de-uso-operacao-e-manutencao) | Entregar documentação que represente o executado para uso, manutenção, reforma ou encerramento. | Caso de uso/entrega na rota de inspeção e documentação; não página isolada até haver prova de capacidade específica. |
| `incorporadora compatibilização orçamento`, `desenvolvimento imobiliário` | A SERP mistura viabilidade, coordenação, orçamento e aprovação; [onBIM](https://www.onbim.com.br/), [Gencons](https://gencons.com.br/viabilidade-analise-de-projetos-em-loteamentos/) | Incorporadora compra um dos três jobs acima conforme fase; não há um job único demonstrado que justifique rota própria. | Segmento/âncora no hub e nas páginas correspondentes. |
| `loteamento infraestrutura` | “diretrizes municipais”, redes, drenagem, vias, aprovação e infraestrutura; [Lei 6.766/1979](https://www.planalto.gov.br/ccivil_03/leis/l6766compilado.htm) define loteamento e sua infraestrutura básica. | É escopo multidisciplinar, municipal e de atribuição/risco altos. | `DEFER`: não anunciar nem criar rota. Só reconsiderar com prova pública de atribuição e contrato de escopo/local. |

O Decreto federal BIM é evidência técnica útil, não prova de demanda privada: ele enumera interoperabilidade de disciplinas, detecção de interferências, quantitativos, documentação gráfica, orçamento e as built como usos BIM ([Decreto 10.306/2020, art. 4º](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/decreto/d10306.htm)). Isso confirma que coordenação, quantidade/orçamento e documentação são entregas distinguíveis.

## Arquitetura mínima recomendada

1. Hub: **Engenharia para projetos e obras** — escolha por momento: antes da obra (coordenação), antes de contratar (quantitativos/orçamento) e no existente/entrega (inspeção e documentação).
2. **Compatibilização e revisão de projetos** — inclui coordenação BIM quando os arquivos, disciplinas e nível de informação forem compatíveis; pode atender escritórios, construtoras, incorporadoras e plataformas sem a CONFENGE se chamar de escritório de arquitetura.
3. **Quantitativos e revisão de orçamento de obra** — levantamento, memória de cálculo, planilha e premissas; sem preço publicado e sem confundir com orçamento de licitação/obra pública.
4. **Inspeção e documentação para obras e edificações** — recebimento/entrega, anomalias, prioridades e documentação/as built; reforma condominial como caso de uso. Campo, ART e responsabilidade técnica precisam ser confirmados por escopo, local e atribuições antes da contratação.

Não recomendar rota de “engenharia para incorporadoras”, “engenharia para arquitetos” ou “engenharia para condomínios”: mudam o comprador, não necessariamente o artefato ou a decisão. A primeira experiência deve medir pedido de escopo qualificado por job, não pageviews ou número de rotas.

## Matriz de canibalização com o site atual

| Superfície atual | Sobreposição | Regra de fronteira proposta |
| --- | --- | --- |
| [`/auditoria-orcamento-licitacao/`](../../../../auditoria-orcamento-licitacao/index.html) e biblioteca sobre planilha/quantitativos públicos | Vocabulário “orçamento”, quantitativo e planilha. | Atual é B2G/licitação ou contrato público; nova rota trata orçamento privado de projeto/obra. Qualquer menção a SINAPI/SICRO/BDI só se o escopo comprovado a sustentar. |
| [`/bid-room-licitacoes-obras/`](../../../../bid-room-licitacoes-obras/index.html) | Revisão de projeto, orçamento e cronograma pode parecer similar. | Bid Room decide proposta de licitação; nova rota produz artefato para projeto/obra privada. Não reutilizar preço, SLA, formulário/CTA genérico ou promessa de proposta. |
| [`/defesa-margem-contratos-publicos/`](../../../../defesa-margem-contratos-publicos/index.html) e conteúdos sobre as built/medição | Documentação, divergência de quantitativo e as built. | Atual reconstrói prova para evento contratual público; novo fluxo documenta/inspeciona o ativo ou projeto privado. |
| [`/servicos-obras-publicas/`](../../../../servicos-obras-publicas/index.html), home e perfil | A prova atual é engenharia, orçamento e fiscalização. | Não estender a alegação B2G para inspeção, BIM, projeto complementar, condomínios ou loteamentos. Usar apenas a prova literal abaixo. |
| Catálogo canônico [`deliverables-registry`](../../../../data/commercial/deliverables-registry.v1.json) | Catálogo é exclusivamente B2G, 54 entregáveis e dois contêineres. | Nenhum candidato deve dizer que é item do catálogo ou ter preço/SLA até nova autoridade comercial; MV-09 deve declarar nova família pública e captura fail-closed. |

## Inventário de prova pública CONFENGE utilizável

Fonte primária disponível no repositório e publicada no perfil: [Engº Tiago Sasaki](../../../../especialista/tiago-jun-sasaki/index.html).

| Afirmação segura | Fonte local | O que não autoriza |
| --- | --- | --- |
| Engenheiro Civil pela EESC-USP; experiência na iniciativa privada e Administração Pública. | Perfil: meta e primeiro bloco de conteúdo. | Capacidade em BIM, projetos complementares, inspeção, perícia, patologia, condomínio, incorporação ou loteamento. |
| Áreas declaradas: fiscalização e gestão de contratos de obras; orçamentação com referências oficiais; tecnologia, automação e IA aplicada à engenharia. | Perfil, seção “Áreas de experiência”. | Vistoria presencial nacional, emissão de ART, laudo, responsabilidade por disciplina ou resultado de obra. |
| Atendimento comercial nacional. | Perfil, cartão “Atendimento nacional”. | Execução presencial, responsabilidade técnica ou cobertura profissional nacional sem análise de local/escopo. |

O [Confea](https://www.confea.org.br/servicos-prestados/anotacao-de-responsabilidade-tecnica-art) informa que a ART é obrigatória para contratos de obra ou serviço abrangidos e com habilitação legal; a rota deve, portanto, condicionar — nunca prometer — responsabilidade/ART. Para reforma, o [CAU/BR](https://caubr.gov.br/normadereformas/) descreve a apresentação prévia de plano e documentos ao responsável legal da edificação. São limites operacionais, não autorização automática para prestar o serviço.

## Riscos e critérios de promoção para MV-09

- A autoridade publicamente demonstrada é B2G, orçamentação com referências oficiais e fiscalização/gestão contratual; as três rotas privadas exigem revisão comercial/profissional antes de qualquer publicação.
- Separar análise documental remota de vistoria/campo na primeira dobra e na captura. Campo, emissão de documento com responsabilidade técnica e validação de disciplina dependem de escopo, local, atribuições e formalidades.
- Não alegar “inspeção predial”, “laudo”, “patologia”, “projetos complementares”, “BIM”, “as built”, “ART” ou “auditoria” como capacidade pronta sem aprovar o que será efetivamente entregue. Para condomínio, não prometer aprovação pelo síndico/condomínio.
- Loteamentos/infraestrutura são `DEFER`; legislação municipal, rede e aprovação impedem uma promessa nacional genérica.
- Nova página indexável precisa de família declarada, ação terminal com captura fail-closed, atribuição `CONFENGE_WEB` e contexto de próxima ação para Warmbly, nos termos de [ADR-STRAT-002](../../../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md) e [MARKET-CAPTURE-OS](../../../strategy/MARKET-CAPTURE-OS.md). Preço só após autorização e captura de lead.

**Recomendação final:** aprovar candidatos apenas como `VALIDATE`, com copy que nomeie artefatos condicionais (“escopo após análise técnica”) e CTAs de job (“Solicitar escopo para compatibilização”, “Enquadrar uma demanda de projeto”, “Solicitar análise de documentação/inspeção”). Promover primeiro a rota cujo delivery owner consiga confirmar, por escrito, artefato, limites, execução remota/campo e responsabilidade profissional. Isso gera aprendizagem comercial reutilizável; criar uma rota por persona geraria apenas volume editorial.
