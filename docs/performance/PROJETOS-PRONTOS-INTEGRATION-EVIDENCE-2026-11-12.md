# Proveniência da integração das PRs #831 e #832

A integração combina a PR #832, no commit `04c32e526c15cf8fef61eac7b9ac95227dfeb63a`, com a nova `main`, no commit `ba3f9df4ef3eba356ccfe4c6a6553c2979c967c1`, que incorporou a PR #831 de comunicação técnica. As provas anteriores permanecem ligadas aos respectivos códigos. Nenhuma medição anterior é apresentada como resultado do código combinado.

## Provas históricas preservadas

O diretório [projetos-prontos-integration-2026-11-12](projetos-prontos-integration-2026-11-12/parent-evidence.json) guarda os dois pares completos de contrato e medição de primeira dobra, copiados dos objetos Git sem transformação. O manifesto registra o commit e a árvore de cada pai, o SHA efetivamente medido, o tamanho e o SHA256 de cada arquivo.

| Origem | Commit efetivamente medido | Rotas e viewports |
| --- | --- | --- |
| PR #832 | `dd11d3591ef7c57566c90d7db9ec1b27920e832b` | 25 rotas, `1366x768` e `390x844` |
| PR #831 | `177e591f4d596dc76de8070b84b05ce17c7434d4` | 25 rotas, `1366x768` e `390x844` |

O arquivo corrente de medição conserva provisoriamente o par íntegro da PR #831, compatível com o contrato de conteúdo incorporado da `main`. Seu SHA e seus hashes de entrada continuam originais. O teste de identidade deve rejeitar essa prova enquanto as entradas do código combinado forem diferentes. Não foram compostas linhas, coordenadas ou vereditos de medições distintas.

## Histórico dos arquivos protegidos

Os dois pais contêm os mesmos 39 registros anteriores em `recapture_history`. Esses registros foram preservados integralmente. O checkpoint `52c2d8258e561a599ded066688ea5cd1fc86a3a4`, pertencente à PR #831, foi acrescentado como registro histórico completo, com seu motivo, data, hashes e referência anterior originais. O topo provisório continua sendo o checkpoint `dd11d3591ef7c57566c90d7db9ec1b27920e832b`, já revisado para a PR #832.

Essa combinação de históricos não recaptura os arquivos do código integrado nem altera autorizações. O motivo da recaptura, a campanha, a política de mutação, os seis pilares e os limites de cada revisão conservam seus valores. O checkpoint atual só poderá ser atualizado depois de existir um commit real e alcançável que contenha os dois pais e os bytes finais revisados.

No confronto dos arquivos protegidos com o checkpoint `dd11d3591ef7c57566c90d7db9ec1b27920e832b`, a integração acrescenta somente os 13 ajustes de `lastmod` de `2026-11-07` para `2026-11-11` em `sitemap.xml`, já presentes na PR #831. As URLs permanecem iguais às do checkpoint da PR #832. Os outros 16 arquivos protegidos conservam os mesmos bytes; a recaptura pendente não deve ampliar esse escopo.

## Coleta necessária para o código combinado

O workflow temporário `projetos-prontos-first-fold-evidence` faz checkout do SHA exato da cabeça da PR #832, confirma os dois pais na ancestralidade e exige árvore limpa. Usa Node 22, `npm ci --engine-strict` e a versão de Chrome resolvida pelo contrato existente do Puppeteer.

O medidor canônico executa as 25 rotas do censo nos viewports `1366x768` e `390x844`, na superfície `source`. O artefato contém o relatório completo, o contrato e a medição gerados, os hashes dos arquivos de controle, o SHA e a árvore da fonte, os pais Git, a versão do Chrome e os identificadores da execução. Falhas medidas são preservadas como evidência e continuam reprovando a execução. Não se atribui compreensão humana aos resultados automáticos.

Depois da publicação do commit de integração, a coleta verdadeira deve substituir os arquivos correntes sem recomposição manual. A importação terá seus hashes conferidos contra o artefato e o SHA alcançável, e a recaptura dos arquivos protegidos nomeará esse mesmo código revisado. O helper será removido após a coleta. Os gates normais de `site-ci` e pSEO continuam obrigatórios para a versão final.

Na integração dos históricos e na preparação desta coleta, nenhum critério de aprovação, limite comercial, autorização de campanha ou estado de compra foi alterado.
