# Gerador de Estudo Técnico Preliminar

Decisão de 26/11/2026: EXECUTE_NOW para implementação e PR, sem merge ou publicação nesta etapa. Frente INBOUND ENGINE. Alavancas de distribuição, confiança e automação. Receita e margem em VALIDATE.

Trabalho do visitante: levantar as informações de uma contratação pública, verificar lacunas e obter uma minuta em Word e PDF para a equipe de planejamento revisar. A hipótese de aquisição é que uma página útil para “gerador de ETP”, “modelo de ETP Lei 14.133” e “como fazer um Estudo Técnico Preliminar” converte parte da demanda em entrevistas e gerações válidas. Não criar versões de página por município, tipo de compra ou variação de palavra-chave.

A rota canônica reaproveita a família `ferramentas` e a carteira do ADR-TOOLS-001. O catálogo, sitemap, página da Lei 14.133, guia HTML e arquivos próprios residem no mesmo domínio. O sitemap contém somente a página pública. A API e os resultados exigem conta verificada e mesmo domínio, não permitem cache e não entram em busca. A origem comercial dos movimentos permanece `CONFENGE_WEB`. Não levar respostas, anexos, nomes de arquivos, identificadores ou conteúdo da minuta para analytics.

## Modelo e escopo

A sequência de identificação, diagnóstico, prospecção e solução é uma adaptação da estrutura do modelo de referência fornecido para o trabalho. Não reproduz dados do caso, brasão, nomes, profissão, matrícula, logotipo nem o sistema de processo eletrônico. Referência opcional de processo e campos de equipe em branco na minuta.

- [Lei nº 14.133/2021, art. 18](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm#art18): 13 elementos. I, IV, VI, VIII e XIII não podem ser omitidos. Os demais exigem conteúdo ou omissão motivada. Valores e quantidades mantêm memória e referência informada.
- [IN SEGES nº 58/2022](https://www.gov.br/compras/pt-br/acesso-a-informacao/legislacao/instrucoes-normativas/instrucao-normativa-seges-no-58-de-8-de-agosto-de-2022): orientações de acordo com a esfera e a transferência voluntária, sem aplicar a norma federal indistintamente.
- [IN SGD/ME nº 94/2022, art. 11](https://www.gov.br/governodigital/pt-br/contratacoes-de-tic/legislacao/instrucao-normativa-sgd-me-no-94-de-23-de-dezembro-de-2022): recorte de TIC quando informado SISP. A minuta não substitui instrução, registro ou assinatura no rito do órgão.

Os arquivos são abertos localmente. O servidor recebe apenas respostas e trechos que o visitante escolheu para análise. Sigilo orçamentário desativa anexos e exclui o item VI da redação externa. O orçamento e sua memória permanecem sob custódia do órgão. O documento geral registra apenas a motivação pública e a referência.

## Processamento e cobrança

As funções de entrevista e redação são agentes distintos, com instruções versionadas, sem busca, ferramentas externas ou capacidade de alterar o processo oficial. Usam Responses API com saída estruturada, `store:false` e a chave `OPENAI_API_KEY` do runtime Netcup. A separação dos agentes não exige a criação de sessões armazenadas como no fluxo editorial de notícias. As respostas e os PDFs/DOCX finais são minutas, não pareceres ou certificações. `store:false` não implica retenção zero pelo provedor, conforme [documentação de dados da OpenAI](https://developers.openai.com/api/docs/guides/your-data).

O servidor exige uma entrevista recente no mesmo contexto e valida a cobertura antes da cotação de um crédito. Só emite o débito após formar e cifrar os dois arquivos. A transação da carteira publica a disponibilidade e debita em conjunto. O mesmo pedido e os downloads repetidos não consomem novo crédito. Se o saldo ou a origem mudarem entre a confirmação e o débito, os arquivos ficam indisponíveis até novo aceite da origem atual, sem repetir a chamada de redação. A janela de download é de 24 horas. O TTL do Firestore remove registros vencidos de forma assíncrona, não necessariamente no instante da expiração. O texto submetido não é salvo no Firestore. O resultado cifrado usa a chave operacional da carteira com domínio criptográfico distinto e não deve ser migrado para armazenamento público.

Créditos de carteira e cortesias seguem a política existente. Ciclos Pro são elegíveis somente quando sua política econômica vinculada inclui `gerador-etp:bundle`. Ciclos antigos mantêm os direitos e o custo da política original, sem ativação retroativa desse produto. Se o operador testar a inclusão no Pro, o relatório econômico deve cobrir as seis emissões possíveis da competência e o custo das entrevistas, tentativas malsucedidas, armazenamento, tráfego e suporte atribuível. ETP não é elegível ao crédito experimental.

## Custo e medição

Modelo fixo `gpt-5.4-mini-2026-03-17`. Cada entrevista pede somente os trechos necessários para sugerir perguntas e tem 550 tokens de saída. Redação usa uma chamada, sem repetição automática, com até 7.000 tokens de saída incluindo raciocínio. O servidor reserva o custo conservador antes de cada chamada, usando bytes UTF-8 como limite conservador dos tokens de entrada e a tarifa pública de US$ 0,75 entrada/US$ 4,50 saída por milhão de tokens. Confira a tarifa na [página do modelo](https://developers.openai.com/api/docs/models/gpt-5.4-mini) ao homologar.

No limite de 84 KiB de corpo da chamada, a reserva de uma redação é de aproximadamente US$ 0,097. Referência ilustrativa de 11 mil tokens de entrada e 4 mil de saída: cerca de US$ 0,026, antes de eventuais entrevistas, tentativas e demais custos, sem representar uso medido. O teto mensal é persistente e a fatia de entrevistas é limitada a 25%. Há cotas diárias por conta e no máximo uma redação simultânea por conta. O fluxo não busca novos clientes, gerencia leads ou emite nota fiscal.

Acompanhar Search Console por URL e entrevista/geração agregadas. `node runtime/tools-commerce/ops.cjs etp-cost-usage AAAA-MM` mostra custo reservado, custo informado pelo provedor e volume por mês. Contagens do relatório não são o número de documentos efetivamente emitidos. Compare separadamente usos confirmados no ledger por `toolId: gerador-etp`, impressões e cliques orgânicos, taxa de conclusão, recuperação e pedidos de ajuda. Primeira leitura depois de 30 dias ou 100 emissões, o que vier primeiro. Reportar custo observado por emissão e margem em reais, com câmbio, tributos e taxas do checkout aplicáveis.

## Homologar e publicar quando autorizado

1. Assegurar que o runtime da Netcup dispõe da chave já usada para chamadas a OpenAI, sem copiar o valor para GitHub ou para o navegador. Conferir projeto, disponibilidade do modelo, política externa de tratamento e limites de API. Não mexer na configuração das notícias.
2. No projeto Firebase aplicável, habilitar TTL no grupo `etpJobs`, campo `deleteAfter`, e aguardar estado ativo. Manter as regras Admin-only existentes. Não abrir leitura de dados ao navegador.
3. Configurar `CONFENGE_ETP_ENABLED=1`, `CONFENGE_ETP_MONTHLY_BUDGET_USD_CENTS` (inteiro de 10 a 20000) e, no ambiente live, `CONFENGE_ETP_RETENTION_READY=1` após verificar o TTL. Sem essas condições a ferramenta pública não afirma que o processamento está disponível. A chave existente deve estar em `/etc/confenge-web/runtime.env` para o processo web.
4. Em um ambiente de homologação, verificar login real e amostras sintéticas de bens, obras, serviços e TIC. Conferir a prosa e os arquivos lado a lado, a falha sem débito, o replay sem recobrança, o consumo observado, a leitura em celular e a disponibilidade na origem. Não utilizar documentos institucionais reais para esse teste.
5. O merge dispara o fluxo normal de publicação Netcup. Depois da autorização, verifique o SHA publicado em `/.well-known/build-info.json`, a rota do gerador, o sitemap e o início da entrevista. Desligar `CONFENGE_ETP_ENABLED` suspende novas entrevistas e emissões, preservando a leitura antes do vencimento para quem já recebeu os documentos. Para rollback de código, seguir o runbook da Netcup e considerar a janela de recuperação antes de retirar o endpoint.

Verificação automatizada: `npm run test:tools-commerce`, verificador da vitrine, verificação do sitemap e CI normal do site. Testes locais usam respostas sintéticas, sem gastar créditos ou chamar o provedor real.
