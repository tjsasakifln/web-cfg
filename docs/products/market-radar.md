# Radar de Mercado Público

Decisão do fundador em 2026-11-09: estruturar, implementar e publicar uma ferramenta estratégica para empresas que vendem ao governo, integrada à caixa de ferramentas existente. Estado EXECUTE_NOW; frente INBOUND ENGINE / MARKET INTELLIGENCE MOAT; alavancas dados, distribuição e confiança. Evidência inicial: uma consulta real reproduzível em produção; resultado comercial será observado posteriormente, sem atribuição presumida.

## Trabalho do visitante

Pesquisar objetos contratados e identificar compradores, fornecedores e datas de fim de vigência que merecem investigação. Rankings por quantidade de contratos permitem abrir o conjunto de um comprador ou fornecedor. Filtros por publicação, UF e vigência usam o mesmo universo dos indicadores e da lista. A exportação CSV compreende a página visível, não a base integral. Copiar link indica a ferramenta sem revelar a consulta.

Rota única: `/ferramentas/radar-mercado-publico/`. Continuidade comercial: `/inteligencia/pesquisa-sob-encomenda/`, família `market_intelligence_research`, intenção `investigar_mercado_expansao_produtos`, ownership `public_works_b2g`. Não cria marca, domínio, CRM, preço, checkout, oportunidade comercial ou autorização outbound.

## Limites que mudam a decisão

- A base operacional tem contratos de fontes PNCP, mas não demonstra cobertura censitária. A projeção declara recorte, exclusões e atualização.
- Publicação usa somente `data_publicacao_fonte`; assinatura ou ingestão não são substitutos.
- A projeção pública restringe fornecedores a pessoas jurídicas com qualidade VALID. Deduplicação usa a identidade oficial do contrato PNCP. Aditivos não se tornam contratos adicionais.
- `valor_total` no produtor legado recebe `valorGlobal`, `valorInicial` ou `valorTotalEstimado` sem preservar o discriminante. Portanto o radar não soma valores, não ordena por valor e não usa valor para ranking. Uma linha pode mostrar “valor informado”; isso não é pagamento, preço comparável, receita ou margem.
- Contagens medem contratos observados, não participação no mercado nacional. Organizações são agrupadas pela identidade fiscal registrada, e nomes de unidades podem aparecer na fonte.
- Localização é do órgão/unidade registrado, não garantia do local de execução.
- Fim de vigência registrado é um sinal para pesquisa. Não confirma renovação, edital, contratação futura, continuidade do serviço ou disponibilidade de disputa.

## Contrato e isolamento

O `extra-cli` continua dono da aquisição, identidade e proveniência. O exportador `scripts/public_exports/market_radar.py` lê o Data Lake em transação READ ONLY e publica uma projeção derivada, descartável e sanitizada. Ela não é um segundo Data Lake. Não há consulta ao PNCP durante a busca do visitante nem credencial de banco no runtime público.

O snapshot SQLite FTS5 fica fora do pacote e fora do diretório público, em `/var/lib/confenge-market-radar`. Arquivo imutável por digest, permissões de leitura para o grupo web e `current.json` trocado atomicamente. O produtor dedicado `confenge-radar` mantém os direitos de escrita e usa papel PostgreSQL limitado a SELECT nas colunas contratadas. Código instalado em release isolada não modifica o checkout operacional. Retenção limitada ao snapshot atual e duas versões anteriores, com verificação prévia de espaço.

O leitor valida contrato, tamanho, hash e integridade antes de usar; ausência ou expiração afeta somente o radar. Os metadados dentro do SQLite devem corresponder aos do pointer, vinculando datas e cobertura ao digest. `generated_at` é o início da preparação da projeção; `source_as_of` é o corte transacional da base persistida, não confirmação de completude ou atualização de cada registro. `ingestion_latest_at` conserva a última observação registrada (`COALESCE(last_seen_at, ingested_at)`) no mesmo universo elegível. Validade: até 36 horas desde geração e 48 horas desde corte e observação, conferidas contra o relógio atual.

O endpoint `/api/web/market-radar` recebe consultas por POST JSON. Não grava termos em URL, analytics ou logs próprios. GET/HEAD retornam metadados sem busca. Campos, tamanho de entrada, tokens FTS, ordenação, paginação, fila, cache e frequência são limitados. Consultas SQLite rodam em worker separado e são parametrizadas. Nenhuma tabela bruta ou arquivo do snapshot é servido por URL. Erros não retornam resultados vazios com aparência de sucesso.

A fonte oficial define campos de contratos e empenhos: https://pncp.gov.br/manual/pt-br/latest/contrato_empenho/consultar_contratos_ou_empenhos_de_uma_contratacao.html . O catálogo de dados abertos está em https://www.gov.br/pncp/pt-br/acesso-a-informacao/dados-abertos . A interpretação dos campos foi confrontada com o código de ingestão e o schema efetivo da base.

## Validação, operação e recuperação

Testar projeção e consumidor com SQLite real: deduplicação, identidade PJ, datas, exclusões, valores não agregados, reconciliação de contagens, busca hostil, limites, falha de arquivo, hash, expiração e worker. Testar no navegador busca, filtro por ranking, paginação, CSV seguro, erros, teclado e telas estreitas. A publicação usa os mesmos gates do site e a promoção atômica Netcup por SHA; não editar `_site` em produção.

Validação real em 2026-11-09 no ec-prod: projeção de 2.119.086 contratos, 2.036.903.936 bytes, derivada de 2.119.145 linhas elegíveis com 59 rejeições adicionais e nenhuma duplicação. Hash, integridade, permissões e reconciliação foram conferidos. Uma rodada de consultas pelo consumidor mediu carga inicial de 7,456 s e consultas com o arquivo carregado entre 0,240 s e 4,589 s. O ranking por agrupamento e busca indexada do nome recente preservou exatamente os dez primeiros resultados em três recortes comparados. Paginação real 20/21 retornou 25 registros por página, total igual e nenhum ID repetido. São medições desta rodada, não percentis ou prova de operação contínua. Aquecer a API com GET após publicação antes de anunciar a ferramenta.

A projeção tem cadência própria de quatro horas; não altera os coletores, estados comerciais ou seus locks. Falha conserva a última projeção apenas dentro do prazo de validade. O rollback do site usa o controlador do bundle aprovado; o rollback dos dados restaura um pointer anterior somente se o snapshot continuar válido. Parar o timer ou tornar a projeção indisponível fecha somente a API do radar. Preservar evidências da versão e da cobertura em cada execução, sem registrar buscas dos visitantes.

Hipótese de aquisição: utilidade recorrente em pesquisa aumenta descoberta e pedidos contextualizados. Abertura de ferramenta, volume de consultas ou publicação não provam receita. Nenhuma nova telemetria contém termos, objetos, identidades ou resultados do visitante. Cem consultas reutilizam o mesmo contrato, índices e atualização, sem criar cem estudos manuais.
