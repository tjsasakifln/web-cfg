# Perguntas do público e páginas que já respondem por elas

## Decisão e objetivo

`EXECUTE_NOW`, decisão do fundador de 26/11/2026, frente `INBOUND ENGINE`.
Distribuição e confiança são as alavancas. Receita é hipótese, não resultado.
O visitante precisa entender o que foi medido, como a medição entra no custo e
qual entrega pedir antes de comparar propostas ou contratar a execução.

`web-cfg` responde pela apresentação, captura e medição sem dados pessoais.
O registro `organic-demand-v2` aponta para a compra `quantitativos-orcamento`
no contrato `purchase-route-map.v1.json` e para a família já declarada
`orcar_planejar_decidir` da matriz corporativa. Nenhuma nova família ou oferta.
A produção continua em `confenge.com.br`, conforme ADR-STRAT-002,
ADR-STRAT-004 e RUNTIME-AUTHORITY. `extra-cli` segue dono de fatos e proveniência
adquiridos. Warmbly recebe o contexto de `CONFENGE_WEB` e é dono da qualificação,
da proposta, do contrato e do recebimento.

A primeira evidência é técnica, antes do merge e na publicação. Cem rodadas
melhoram o registro, a página canônica e as verificações já usadas, sem cem
páginas novas. A hipótese é que explicar as entregas com um roteiro conferível
atraia visitas pertinentes e ajude o visitante a pedir o serviço apropriado.

## Base conferida

HEAD examinado `76ad8dfb39e05c6aa71b6064d97639d594302e9d`.
`ATP_EXPORT_DIR` não estava configurado e não foi encontrado um diretório de
exportação de ATP no ambiente. Não há SHA de ATP, lista de sementes fornecida,
linhas novas de consulta, volume ou coleta de autocomplete. As prioridades da
tabela são decisões editoriais, não resultados dessa ferramenta.

| Fonte | SHA-256 da base examinada | Uso |
| --- | --- | --- |
| `data/organic/demand-map.json` | `ad85b6fdb44871ac5d47b9acd2941598ea0fba31932d5419534803709860a2b4` | Perguntas existentes e nós de demanda |
| `data/bofu-dominance/core/intent-registry.v2.json` | `6abc9fe2d63d88a675121c2a854ca15c4d687c65e3defa59e87d2b7fcfa61a69` | Grupos `primary_queries`, posse e congelamento |
| [Busca orgânica, 18/11](2026-11-18-search-performance.md) | `05bbdcc62f0b6252dd3bd56e65a2e582dc64309e0a76d167c3b5584f675ba0d8` | Agregados, não cruzamento consulta por URL |
| Exportação GSC de 18/11 | `f03a64705fffe4f918eb012f60980874b653cf998d38730363f5f661319307c0` | Hash registrado no relatório de 18/11, não recalculado neste lote |
| `data/editorial/striking-distance-noindex.v1.json` | `6101388d84e0edf2003f2b1354b9a76d01258ee0c5633b2acb2b6a2f12132eff` | Estado vigente e evidência histórica do candidato |
| `data/demonstrative/private-project-pilot/source.v1.json` | `48e149a11bfa238d73f1ff0b2186321e75668201494d171261a02c3ef1982a90` | Fonte do exemplo de piso da revisão R01 |

Censo de `/conteudos/` na base: 134 diretórios, 36 URLs de artigo no `sitemap.xml`
e 98 artigos `RETAIN_NOINDEX` na matriz, todos com meta robots `noindex,follow`.
O `content-index.json` inventaria artigos e `/conteudos/` os organiza. A rota
alterada é de serviço, não é artigo e não entra nessas duas projeções. O HTML de
serviço foi regenerado da fonte. Nos sitemaps mudam apenas a data da rota no
`core` e, por derivação, a data do sitemap filho no `sitemap-index.xml`.

## Matriz curada de consulta, intenção, rota dona e ação

`DM` identifica uma pergunta ou nó já no mapa de demanda. `IR` designa o grupo
`primary_queries` da família indicada, sem duplicar suas variantes como novos
registros. `GSC` indica apenas evidência agregada por página no relatório de
18/11. O texto das perguntas de contratação é editorial, não consulta observada.
A matriz não substitui contratos mais específicos de posse.

| Pergunta, comparação ou grupo | Fonte | Nó ou família existente | Rota dona ou situação | Ação |
| --- | --- | --- | --- | --- |
| Diferença entre quantitativo e orçamento | GSC da rota, FAQ já visível e contrato de compra | `orcar_planejar_decidir` | `/quantitativos-orcamento-obras/` | Enriquecer o FAQ existente com a distinção, a conferência da memória e o uso na obra privada. A ponte para a contratação fica na própria rota. |
| Comparar propostas e revisar ou refazer orçamento | GSC, 42 e 35 impressões por URL | `orcar_planejar_decidir`, com guias de apoio distintos | `/conteudos/comparar-propostas-execucao-obra/` e `/conteudos/revisar-ou-refazer-orcamento-obra/` | Manter posse e links. Os dois guias já estão no escopo da PR #908. |
| SINAPI desonerado ou não e comparação de referências | DM, IR, GSC | `need-sinapi-desonerado`, `need-edital-orcamento`, `orcamento-bdi` | `/conteudos/sinapi-desonerado-nao-desonerado/` para a comparação específica; `/auditoria-orcamento-licitacao/` para compra | Preservar a PR #907, o pilar e a separação de funções. SINAPI ou SICRO também está na #908. |
| Empreitada global ou unitária e decisão pré-licitação | IR, DM, GSC | `edital-proposta`, `need-edital-orcamento` | `/conteudos/empreitada-preco-global-preco-unitario/` para a comparação; `/diagnostico-pre-licitacao/` para compra | Preservar a PR #907 e o pilar. Artigo também no escopo de #908. |
| Reequilíbrio, documentação do pleito e distinção entre mecanismos | DM, IR | `need-reequilibrio-pleito`, `reequilibrio` | `/reequilibrio-obras-publicas/` | Pilar congelado. Artigos relacionados já estão na #909. |
| Limites de aditivo e distinção qualitativo ou quantitativo | DM, IR | `need-aditivo-limite`, `aditivos` | `/aditivos-obras-publicas/` para a decisão comercial, sem transferir suas consultas | Pilar congelado. O artigo sobre tipos de aditivo permanece `KEEP_NOINDEX`: o registro já aponta sobreposição e falta de resposta distinta. |
| Contestação de glosa e fluxo de caixa | DM, IR, GSC | `need-medicao-glosa`, `medicoes-pagamentos` | `/medicoes-glosas-obras-publicas/` para compra, com consultas específicas no contrato de medição | Preservar pilar e contrato de posse de consultas. |
| Prorrogação, notificação e efeito da chuva | DM, IR | `need-atraso-prorrogacao`, `atrasos-prorrogacao`, `defesa-sancoes` | `/atrasos-prorrogacao-obras-publicas/` ou `/defesa-tecnica-contratos-publicos/` conforme a decisão. A chuva tem canário próprio. | Sem edição de material jurídico nem dos guias da #908. A candidata de vigência e execução permanece `noindex`. |
| Prazo de vigência ou de execução | Registro editorial histórico | Braço informacional adjacente a `need-atraso-prorrogacao` | `/conteudos/prazo-vigencia-prazo-execucao-contrato-obra/`, `RETAIN_NOINDEX` | Propor reescrita em separado, sem aprovação, sem segundo canário e sem alterar robots. |
| Acompanhamento contratado ou equipe própria | DM, IR | `need-gestao-contratual`, `gestao-contratual` | `/acompanhamento-contratos-obras/` para compra | Manter a posse. A variante tem artigo retido e não há evidência nova de utilidade distinta. |
| Diagnóstico do contrato e segunda leitura | DM, IR | `need-defesa-margem-diagnostico`, `defesa-margem` | `/ferramentas/diagnostico-defesa-margem/` para o exame factual; `/defesa-margem-contratos-publicos/` para compra | Manter o recorte B2G e separar ferramenta de contratação. Sem frase nova de busca comprovada. |
| Direção B2G, operação da carteira, sala de proposta e expansão | IR | `carteira-operacao`, `diretoria-b2g`, `bid-room`, `diagnostico-expansao` | `/diagnostico-b2g-360/`, `/diretoria-b2g/`, `/bid-room-licitacoes-obras/`, `/diagnostico-b2g-expansao/` | Preservar as quatro posses. A primeira segue congelada. Não reutilizar para engenharia privada. |
| Referência de mercado público | DM | `need-benchmark-mercado` | O nó não declara dona; o radar é um ativo de apoio | Manter em observação até distinguir uso do radar de contratação de pesquisa. |
| Prontidão para licitar e integridade de parceiros | IR | `bid-readiness`, `partner-integrity` | Sem rota dona no registro | Oportunidades sem página nova. Primeiro testar utilidade distinta e verificar os donos adjacentes. |

As seis famílias com `freeze.frozen=true` e `html_edit=false` ficam intocadas.
O campo de data mais antiga de ação não é autorização de edição. Permanecem
congelados também os dois títulos e descrições de #907, o robots, o rastreio de
IA e as rotas da #909, cuja decisão é independente desta. A #909 também escreve
arquivos compartilhados de sitemap e recaptura; suas mudanças não foram trazidas
para este lote. Conferir a base e a compatibilidade das projeções antes do merge.

## Implementação e pacote do fundador

Somente `/quantitativos-orcamento-obras/` ganha texto. As duas respostas saem
da configuração institucional para os elementos `details` e o `FAQPage`, sem
alterar a contratação existente. A primeira explica como conferir um item da
planilha até a prancha. O [demonstrativo publicado](../../casos/demonstrativo-projeto-privado/index.html#quantitativos)
continua separado e já ligado à página. Nele, o piso de `4,32 m²` aparece
na memória e no item de revestimento. O conteúdo institucional preserva essa
separação e não repete números da amostra. A segunda resposta mostra como
comparar propostas e separar medidas de estimativas.
O contato contextual existente `#triagem-quantitativos`, WhatsApp e formulário
continuam; não há passagem entre dois serviços ou novo evento. A data visível
é projetada no `WebPage.dateModified` e corresponde ao `lastmod` da rota.

O [pacote de candidatos](2026-11-26-candidatos-rewrite-then-index.json) não
altera o registro ativo. Ordem 1, vigência versus execução: 18 impressões e zero
cliques no histórico do registro, amostra muito baixa. O valor armazenado é o
hash do material antigo, não um hash de aprovação. O fundador pode autorizar
análise da reescrita em rodada própria, com fontes primárias conferidas, outro
revisor, hash do texto final e decisão explícita sobre o canário já ocupado.
O `canary_cap` continua 1 e esta proposta não torna a página apta à indexação.

No backlog ficam os temas privados de projeto estrutural, elétrico e
hidrossanitário, coordenação e compatibilização, PGR e SST, imóveis, perícia,
inspeção, laudo de reforma e condomínios. Levantar perguntas observadas antes de
escolher uma rota ou alterar FAQ. Para ferramentas, buscar um `como calcular`
associado a uma utilidade não explicada pela landing atual e manter a página
canônica da ferramenta. Não promover guias apenas porque explicam a contratação.
Não há página nova neste lote.

## Limites e como medir

De 20/10 a 16/11, a página de quantitativos teve 27 impressões e zero cliques,
com posição média 6,52. As três primeiras páginas do relatório somaram 1.982
impressões. Duas eram comparações, mas a concentração não prova um efeito
causal do formato nem descreve a demanda privada. A tabela de consultas do
relatório não cruza consulta e URL. Não interpretar as perguntas redigidas como
termos observados, nem a amostra pequena como falta de demanda. O FAQ serve para
leitura e coerência do HTML, sem expectativa de resultado enriquecido.

O dono do acompanhamento é `web-cfg` para busca e navegação e Warmbly para
resultados comerciais. Depois da validação da Netcup, cabe ao operador enviar
ou confirmar o `sitemap-index.xml` no Search Console, inspecionar a rota, pedir
indexação e registrar a evidência de rastreamento posterior à publicação com
canônica correta. Merge, publicação e rastreamento são datas diferentes.

Chamar de D o dia observado da reindexação, no fuso do Search Console. Comparar
os 28 dias completos D+1 a D+28 com D-28 a D-1. A leitura é elegível a partir de
D+29, quando os dados estiverem completos. Comparar a mesma URL e filtros de
Pesquisa Web, país e dispositivo, recalcular CTR por cliques/impressões, anotar
posição e mudanças concorrentes e não misturar impressão por página com
impressão da propriedade. Sem D confirmado não há data de leitura. Volume
pequeno permanece inconclusivo, sem promessa de clique, posição ou receita.

Usar somente medições existentes, distinguindo visita, clique em contato,
solicitação persistida, oportunidade qualificada, proposta, contrato e
recebimento. Não atribuir receita a clique nem transportar dados pessoais nos
eventos. `content_to_service` só é pertinente numa passagem real entre páginas
com esse contrato, que não foi adicionada aqui.

## Validação, publicação e reversão

A evidência de testes e revisão independente fica na PR. Merge só com a revisão
registrada, `site-ci` e `pSEO quality gates` verdes e as proteções satisfeitas.
Acompanhar `netcup-release` até o fim, conferir SHA integrado em
`/.well-known/build-info.json`, header da arquitetura, `npm run test:prod-build-info`,
HTML, canonical, robots, contato e consistência dos sitemaps raiz e filhos.
A criação da PR e o preview não significam release.

Reverter a alteração e publicar pelo mesmo fluxo. Se a produção servir uma
versão defeituosa, seguir `deploy/netcup/README.md` com o controlador verificado
e o SHA anterior, registrar o SHA restaurado e conferir as respostas públicas.
Não existe migração de dados nem alteração de captura ou armazenamento.
