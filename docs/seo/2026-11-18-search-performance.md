# Busca orgânica: prioridades para atrair clientes

## Decisão e objetivo

- **Decisão:** `EXECUTE_NOW`, conforme pedido do fundador em 18/11/2026 para corrigir o site, validar a PR e realizar o merge.
- **Frente:** `INBOUND ENGINE`.
- **Responsável:** `web-cfg`, pela apresentação pública, aquisição, captura e medição sem dados pessoais.
- **Necessidade do visitante:** entender uma dúvida de orçamento ou contrato, encontrar o serviço correspondente e apresentar sua demanda à CONFENGE.
- **Hipótese:** responder melhor à intenção de busca pode ampliar a distribuição (`distribution`); explicações coerentes com a entrega sustentam confiança (`trust`); o encaminhamento contextual pode gerar oportunidades comerciais e receita (`revenue`). Esses efeitos ainda precisam ser medidos.
- **Prazo para evidência:** comportamento técnico antes do merge e após a publicação; desempenho de busca em 28 dias completos após a reindexação observada das páginas prioritárias.

As [ADR-STRAT-002](../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md) e [ADR-STRAT-004](../architecture/ADR-STRAT-004-commercial-constitution-and-finite-portfolio.md) permanecem preservadas. Aplicam-se os contratos `CONFENGE_COMMERCIAL_CONSTITUTION/1.0.0`, `CONFENGE_CORPORATE_TAXONOMY/1.0.0` e `CONFENGE_PUBLIC_INTENT_MATRIX/1.0.0`. A iniciativa trabalha nas rotas existentes, mantendo a marca e a superfície canônica `confenge.com.br`, o catálogo e a vertical de obras públicas. A ação comercial, as propostas e os recebimentos continuam sob responsabilidade do Warmbly; fatos e proveniência de dados adquiridos permanecem no `extra-cli`.

## Base conferida

Exportação fornecida pelo fundador: `confenge.com.br-Performance-on-Search-2026-11-18.zip`. SHA-256:

`f03a64705fffe4f918eb012f60980874b653cf998d38730363f5f661319307c0`

O arquivo original e as consultas detalhadas permanecem fora deste repositório. Este registro contém somente os agregados necessários à decisão.

| Indicador | Resultado |
| --- | ---: |
| Período efetivo | 20/10/2026 a 16/11/2026 |
| Pesquisa | Web, com base em texto |
| Cliques da propriedade | 94 |
| Impressões da propriedade | 3.575 |
| CTR calculado | 2,63% |
| URLs da tabela de páginas | 95 |
| URLs sem clique | 71 |
| Impressões somadas por URL | 3.919 |
| Impressões das URLs sem clique | 698 |

As tabelas de datas, países e dispositivos reconciliam 94 cliques e 3.575 impressões. A tabela de páginas usa outra agregação: suas 3.919 impressões não substituem o total da propriedade. O CTR foi recalculado como cliques divididos por impressões, sem média dos percentuais das linhas.

## Onde concentrar o trabalho

| Tema e rota | Impressões | Cliques | CTR | Posição média |
| --- | ---: | ---: | ---: | ---: |
| SINAPI desonerado e não desonerado: `/conteudos/sinapi-desonerado-nao-desonerado/` | 1.436 | 4 | 0,28% | 5,96 |
| Medições e glosas: `/medicoes-glosas-obras-publicas/` | 288 | 2 | 0,69% | 5,01 |
| Empreitada global e unitária: `/conteudos/empreitada-preco-global-preco-unitario/` | 258 | 1 | 0,39% | 7,80 |
| Comparação de propostas: `/conteudos/comparar-propostas-execucao-obra/` | 42 | 0 | 0% | 6,45 |
| Revisão de orçamento: `/conteudos/revisar-ou-refazer-orcamento-obra/` | 35 | 0 | 0% | 6,34 |
| Quantitativos e orçamento: `/quantitativos-orcamento-obras/` | 27 | 0 | 0% | 6,52 |

As três primeiras páginas concentram 1.982 impressões, equivalentes a 50,57% das impressões por URL, e somente sete cliques. A prioridade é verificar se título, descrição, resposta inicial e próximo passo atendem à necessidade do visitante e se o HTML publicado preserva essa correspondência. Os três zeros seguintes têm relação comercial direta, mas exposição menor; são prioridades de inspeção, não falhas comprovadas pelo zero isolado.

Repetir o processo deve melhorar as mesmas fontes, geradores e verificações. Cem análises devem produzir aprendizado reutilizável sobre intenção, conteúdo e conversão, sem criar cem páginas ou exceções manuais.

## Limites da interpretação

- **Amostra pequena:** 52 das 71 URLs sem clique têm de uma a nove impressões; 16 têm de dez a 49 e três têm de 50 a 99. Nenhuma URL zerada supera 99 impressões. Não há fundamento para remover ou bloquear indexação apenas por zero clique.
- **Consultas incompletas:** a tabela de consultas soma 401 impressões e 25 cliques. Ela não representa todas as 3.575 impressões e 94 cliques da propriedade. Não permite estimar a participação total de marca nem relacionar cada consulta a uma página, pois esse cruzamento não foi exportado.
- **Posição e apresentação:** posição média mistura buscas e formatos de resultado. Páginas de navegação podem aparecer como links adicionais; o arquivo não confirma esse mecanismo nem identifica o título efetivamente exibido pelo Google.
- **Versões diferentes:** o período inclui dias anteriores e posteriores ao merge da [PR #842](https://github.com/tjsasakifln/web-cfg/pull/842), em 13/11/2026, commit `de81f1be7b409d765a7cf4d76ef6ca619e138f8b`. Data de merge, publicação e rastreamento são eventos diferentes. Esta base não isola o desempenho daquela revisão nem demonstra uma regressão causada por ela.
- **Causalidade:** baixo CTR pode orientar a inspeção, mas não comprova sozinho erro de canônica, conteúdo inadequado ou efeito de resultados com IA. O agregado também não mede qualidade dos contatos, contratos ou recebimentos.

## Validação, publicação e reversão

Antes do merge, registrar na PR a revisão independente e o resultado real das verificações afetadas: geração do site, HTML renderizado, títulos, descrições, canônicas, links, contato contextual e controles de conversão e privacidade. Preservar preços, condições e contratos vigentes. Este documento não registra esses testes como concluídos.

Após a integração, acompanhar o fluxo canônico Netcup descrito em [RUNTIME-AUTHORITY](../architecture/RUNTIME-AUTHORITY.md). Confirmar a execução de publicação, o SHA servido em `https://confenge.com.br/.well-known/build-info.json` e as respostas das rotas alteradas, incluindo metadados, conteúdo e ações de contato. Preview aprovado e merge isolado não comprovam publicação.

Reversão editorial: reverter o commit da alteração, reconstruir, validar e publicar pelo mesmo fluxo. Para recuperação imediata de uma publicação defeituosa, seguir o retorno à versão anterior aceita em [deploy/netcup/README.md](../../deploy/netcup/README.md). Registrar o SHA restaurado e conferir novamente o conteúdo servido.

## Como avaliar o resultado

1. Registrar por URL a publicação e a primeira inspeção que confirme rastreamento posterior à alteração, indexação e canônica adequadas. Se essa evidência não estiver disponível, identificar a janela como posterior à publicação, sem chamá-la de posterior à reindexação.
2. Medir 28 dias completos a partir do dia seguinte à confirmação, usando o fuso do Search Console. Comparar com os 28 dias completos anteriores à publicação e manter esta exportação como referência histórica separada. Registrar alterações concorrentes e diferenças de posição, país, dispositivo e composição das buscas.
3. Recalcular cliques, impressões e CTR por URL. Usar o mesmo recorte e denominador em cada comparação, com número de observações explícito. Quando houver poucos dados, manter o resultado inconclusivo e observar a janela seguinte, sem declarar ganho ou perda causal.
4. Relacionar a entrada orgânica aos eventos já existentes de intenção, contato e solicitação, sem dados pessoais nos eventos e preservando a origem `CONFENGE_WEB` na entrega do contato. Conferir os identificadores efetivamente disponíveis antes de atribuir uma conversão. Clique em contato, solicitação persistida, proposta, contrato e recebimento são etapas distintas; a qualificação e os resultados comerciais pertencem ao Warmbly.
5. Manter ou ajustar a hipótese conforme tráfego relevante e oportunidades qualificadas observadas. Não estabelecer 2,5% como meta universal nem prometer aumento de cliques, posição ou receita. A publicação será um resultado técnico; o efeito comercial depende de evidência posterior.

## Referências de método

- [Google: agregação por propriedade e página](https://support.google.com/webmasters/answer/17011364?hl=en).
- [Google: consultas omitidas e diferenças entre os totais](https://support.google.com/webmasters/answer/17010575?hl=en).
- [Google: dimensões, consultas e atribuição à URL canônica](https://support.google.com/webmasters/answer/17011259?hl=en).
- [Google: análise de páginas com CTR baixo](https://support.google.com/webmasters/answer/17010961?hl=en).
