# CONFENGE SST Revenue Engine 2026-09-26

Decisão: EXECUTE_NOW. Prioridade: P0 para correções materiais de SST e conversão da rota existente. P1 para medição e fechamento dos gaps herdados. Família canônica: `organizar_sst`. Rota canônica: `/seguranca-trabalho-apoio-tecnico/`.

## Decisão de arquitetura

A campanha enriquece a rota canônica existente. Não cria novas URLs para PGR, revisão de PGR, PGR de obra ou documentação remota neste ciclo.

Motivos:

1. O contrato `data/bofu-dominance/core/purchase-route-map.v1.json` classifica a rota existente como `EXISTING_COMPLETE` e determina `ENRICH` para a compra `organizar-sst`.
2. A demanda observável na SERP separa revisão de PGR, PGR ocupacional e PGR de canteiro, mas o histórico local do GSC está indisponível para confirmar volume ou intenção própria por URL.
3. As ofertas documentais conclusivas permanecem condicionadas a insumos, capacidade, atribuição, campo e método. Criar páginas filhas agora aumentaria canibalização e poderia sugerir disponibilidade irrestrita.

Gatilho para nova página: evidência conjunta de intenção de compra distinta, demanda observada, capacidade confirmada e entrega que não possa ser explicada como seção da rota atual.

## O que mudou

- Primeiro bloco orientado ao problema documental e ao início remoto condicionado.
- Entradas separadas para revisão ou atualização do PGR ocupacional, organização documental e exigência de cliente, auditoria, fiscalização ou obra.
- Seção própria para PGR de canteiro conforme NR 18, com atualização por etapa, projetos, medidas e inventários de contratadas.
- Seção sobre escopo remoto, com corte explícito quando campo, medição, participação ou evidência representativa forem necessários.
- Comparação revisada entre PGR ocupacional, LTCAT, AET e laudo pontual.
- Riscos psicossociais relacionados ao trabalho incluídos no inventário de riscos.
- FAQ comercial sobre preço, prazo, eSocial, saúde ocupacional e dados mínimos.
- CTAs contextuais com `data-journey`, `data-tema`, `data-cta-id`, `data-route-family` e mensagens de WhatsApp distintas.
- Três pontes contextuais para o formulário existente da home. A rota SST continua sem formulário próprio e sem upload no primeiro contato.
- Todas as credenciais pessoais foram classificadas como `VERIFIED` com base nos documentos primários e registros oficiais conferidos. O HTML público inclui os títulos Civil e Segurança do Trabalho. Números de registro não são projetados no HTML, embora o registro auditável do repositório ainda contenha identificadores preexistentes.
- O gate estático de acessibilidade voltou a ficar verde com a inclusão do link de salto e do alvo principal que faltavam em um kit de dados preexistente.

## Limites regulatórios incorporados

- PGR é processo contínuo. A avaliação é revista em regra a cada dois anos, podendo chegar a três anos na hipótese normativa de certificação aplicável. A página também nomeia implementação das medidas, mudanças que criem novos riscos ou modifiquem os existentes, inadequação, insuficiência ou ineficácia, acidente ou doença, alteração legal e solicitação justificada dos trabalhadores ou da CIPA como gatilhos. Não usa validade universal ou simples vencimento.
- A organização permanece responsável por implementar e manter o gerenciamento de riscos.
- PGR de canteiro acompanha a etapa da obra e observa a habilitação e a exceção específica previstas na NR 18.
- LTCAT é expedido por médico do trabalho ou engenheiro de segurança do trabalho.
- AET considera trabalho real, organização, participação dos trabalhadores, restituição e validação.
- Medição exige profissional legalmente habilitado quando a atividade for reservada, além de objetivo, método, critérios, instrumentos e representatividade.
- Insalubridade pode depender de avaliação quantitativa ou qualitativa conforme o agente e a norma aplicável.
- PCMSO, ASO, exame, aptidão, diagnóstico e nexo clínico ficam fora da oferta.
- O eSocial recebe eventos, não o PGR em si.
- ART quando aplicável ao serviço contratado.

Revisão técnica e regulatória não substitui liberação jurídica nem consulta ao conselho profissional para um caso específico.

## Demanda e evidência

Sinais atuais de SERP, verificados em 26/09/2026:

- Busca de preço e contratação para PGR.
- Busca por PGR online, com contaminação de intenção por software.
- Busca por revisão e atualização de PGR.
- Busca por PGR de construção e NR 18.
- Busca por documentos necessários de SST.

O dado local do GSC está indisponível e defasado. Ausência de linhas SST no snapshot não foi interpretada como demanda zero.

Fontes oficiais usadas:

- [NR 1 vigente](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-1)
- [PGR no Ministério do Trabalho e Emprego](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/pgr)
- [NR 18 vigente](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadoras/normas-regulamentadoras-vigentes/NR18atualizada2026I.pdf)
- [NR 7 vigente](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-07-atualizada-2022-1.pdf/%40%40download/file)
- [NR 15 vigente](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-15-nr-15)
- [NR 17 vigente](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-17-atualizada-2022.pdf)
- [Lei 8.213, artigo 58](https://www.planalto.gov.br/ccivil_03/leis/l8213cons.htm)
- [CLT, artigo 195](https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm)
- [Lei 6.496, ART](https://www.planalto.gov.br/ccivil_03/leis/l6496.htm)

## Fechamento dos gaps herdados da campanha anterior

| Gap | Estado nesta campanha | Evidência ou critério de retomada |
| --- | --- | --- |
| G03, passagem humana Turnstile e correlação ponta a ponta | PENDENTE_HUMANO | Não automatizar nem contornar. Executar no navegador real por pessoa autorizada e correlacionar recibo, persistência, notificação e operação no mesmo identificador. |
| Matriz antes e depois de todas as famílias, inclusive quantitativos, SINAPI e jornadas privadas | FECHADO_NO_REPOSITORIO | `evidence/coverage-matrix.json`, validada contra as 13 famílias do contrato. |
| Issue #705, implementação inbound | EM_RECONCILIACAO | Atualizar após PR e publicação com SHA, antes e depois, pendências e critério de retomada. |
| Issue #706, contagem de propostas e receita | AINDA_NAO_MEDIDO | CTAs e temas contextuais instrumentados. Janela de leitura começa após publicação e depende da reconciliação Warmbly. |
| Issue #707, distribuição | PENDENTE_DECISAO_DO_PROPRIETARIO | Nenhuma publicação externa é inferida. A janela começa somente após ação expressamente aprovada e executada. |
| Resultado comercial de tráfego para contato e proposta | AINDA_NAO_MEDIDO | Contato, proposta e receita permanecem estados distintos. #706 continua dona da medição. |
| Rota própria de avaliação de imóvel | FORA_DO_ESCOPO_SST | Decisão do proprietário, com família, sitemap e prova próprios antes de publicar. |
| Nota sem JavaScript no pilar de diagnóstico pré-licitação | PENDENTE_PROXIMO_DESBLOQUEIO | Retomar quando o pilar congelado for liberado. |
| Publicação da NBR 13752 | BLOQUEADA_PELO_CATALOGO | Só publicar depois do registro no catálogo da oferta de assistência. |
| Readout GSC dos `KEEP_NOINDEX` | PENDENTE_NO_HOST | Retomar com leitura fresca por página da coorte. Ausência de dado não é zero. |

Estados são independentes: implementação, integração, publicação, recebimento comprovado e resultado comercial não são sinônimos.

## Medição pós-publicação

Eventos e dimensões esperados:

- `page_view` e `service_page_view` na família `seguranca-trabalho-apoio-tecnico`.
- `cta_click` e `whatsapp_click` por `data-cta-id`.
- `data-tema` separado para revisão de PGR, PGR de canteiro, rotina documental e exigência documental.
- Formulário da home preserva `data-journey=sst`, tema e origem.
- Contato, proposta e receita permanecem separados. Resultado só pode ser declarado com reconciliação Warmbly e o contrato de #706.

Janela inicial: leitura técnica logo após publicação. Leitura comercial comparável após 14 dias ou volume mínimo definido no contrato de medição, o que ocorrer depois.

## Gates de liberação

1. Registro de credenciais válido e superfícies regeneradas.
2. Teste dirigido SST e mutação adversarial verdes.
3. Testes de jornada e canais verdes.
4. SEO, acessibilidade, integridade HTML e build verdes.
5. Revisão independente da cópia final e do diff.
6. CI da PR verde.
7. Release do SHA exato verde.
8. Produção com canonical, conteúdo, CTAs e build-info do SHA promovido.
