# Proveniência da integração das PRs #831 e #832

A integração combina a PR #832, no commit `04c32e526c15cf8fef61eac7b9ac95227dfeb63a`, com a nova `main`, no commit `ba3f9df4ef3eba356ccfe4c6a6553c2979c967c1`, que incorporou a PR #831 de comunicação técnica. As provas anteriores permanecem ligadas aos respectivos códigos. Nenhuma medição anterior é apresentada como resultado do código combinado.

O commit real de integração é [`dacbcb7376b53c758bbe44af0e101e045f6d9834`](https://github.com/tjsasakifln/web-cfg/commit/dacbcb7376b53c758bbe44af0e101e045f6d9834), com árvore `04d1918dce7e72fffcc76f512965e1bdc7799a25` e os dois commits acima como pais explícitos. A medição combinada descrita abaixo foi produzida nesse SHA.

## Provas históricas preservadas

O diretório [projetos-prontos-integration-2026-11-12](projetos-prontos-integration-2026-11-12/parent-evidence.json) guarda os dois pares completos de contrato e medição de primeira dobra, copiados dos objetos Git sem transformação. O manifesto registra o commit e a árvore de cada pai, o SHA efetivamente medido, o tamanho e o SHA256 de cada arquivo.

| Origem | Commit efetivamente medido | Rotas e viewports |
| --- | --- | --- |
| PR #832 | `dd11d3591ef7c57566c90d7db9ec1b27920e832b` | 25 rotas, `1366x768` e `390x844` |
| PR #831 | `177e591f4d596dc76de8070b84b05ce17c7434d4` | 25 rotas, `1366x768` e `390x844` |

Na preparação do merge, o arquivo corrente de medição conservou provisoriamente o par íntegro da PR #831, compatível com o contrato de conteúdo incorporado da `main`. Seu SHA e seus hashes de entrada permaneceram originais; o teste de identidade rejeitou a diferença do `script.js` combinado. A coleta verdadeira substituiu essa evidência corrente. Não foram compostas linhas, coordenadas ou vereditos de medições distintas.

## Histórico dos arquivos protegidos

Os dois pais contêm os mesmos 39 registros anteriores em `recapture_history`. Esses registros foram preservados integralmente. O checkpoint `52c2d8258e561a599ded066688ea5cd1fc86a3a4`, pertencente à PR #831, foi acrescentado como registro histórico completo, com seu motivo, data, hashes e referência anterior originais. A recaptura posterior preservou também o topo `dd11d3591ef7c57566c90d7db9ec1b27920e832b`, já revisado para a PR #832. O histórico resultante contém 41 registros, e o checkpoint corrente aponta para `dacbcb7376b53c758bbe44af0e101e045f6d9834`.

Os motivos e limites de cada revisão permanecem nos registros originais. A recaptura usou o procedimento existente `frozen_recapture_provenance`, depois de confirmar que o commit fonte era real e alcançável e que seus 17 blobs protegidos coincidiam com os bytes locais. A campanha, a política de mutação e os hashes dos seis pilares permaneceram inalterados.

No confronto dos arquivos protegidos com o checkpoint `dd11d3591ef7c57566c90d7db9ec1b27920e832b`, a integração acrescenta somente os 13 ajustes de `lastmod` de `2026-11-07` para `2026-11-11` em `sitemap.xml`, já presentes na PR #831. As URLs permanecem iguais às do checkpoint da PR #832. Os outros 16 arquivos protegidos conservam os mesmos bytes. Somente o hash de `sitemap.xml` mudou, para `f73fb1c0816f273bd9fb6af370d8aecd3ad5315672aa6230064d19daa4ddf65e`.

## Coleta concluída do código combinado

O workflow temporário `projetos-prontos-first-fold-evidence` concluiu com sucesso na [execução 43171512778](https://github.com/tjsasakifln/web-cfg/actions/runs/43171512778), tentativa 1. Fez checkout do SHA exato da cabeça da PR #832, confirmou os dois pais na ancestralidade e exigiu árvore limpa. Usou Node `v22.23.4`, `npm ci --engine-strict` e Chrome for Testing `152.0.7977.42`, resolvido pelo contrato existente do Puppeteer.

O medidor canônico registrou a medição em `2026-11-12T06:56:58.756Z`: **25 rotas aprovadas, zero falhas e zero pendências**, com os 50 pares de rota e viewport completos na superfície `source`. Os viewports são `1366x768` e `390x844`. Cada par registrou uma ação primária na dobra, sem rolagem horizontal. Não se atribui compreensão humana aos resultados automáticos.

O artefato `13922307877`, com nome `projetos-prontos-first-fold-dacbcb7376b53c758bbe44af0e101e045f6d9834`, tem 45.025 bytes em ZIP. Seu SHA256 foi conferido contra os metadados do GitHub antes da extração. O relatório completo, a [proveniência](projetos-prontos-integration-2026-11-12/combined/provenance.json), a captura de origem e os metadados do artefato permanecem em `projetos-prontos-integration-2026-11-12/combined/`.

| Arquivo ou pacote | SHA256 |
| --- | --- |
| ZIP original | `0e6457e17e0629a59b7707edbc7c4bf47c4d4e6aa4cf68da33f745581d1e781d` |
| `data/commercial/first-fold-measurements.v1.json` | `d99138a389645037384e4a67be11ae2d197199f5baf5621e168192f0436bc78d` |
| `data/commercial/first-fold-contract.v1.json` | `a8b7f1d478bea5d998fd6e6af1d97853e63cfb116243f076f186a6de4a9396e2` |
| `combined/first-fold-report.json` | `0c6edc6ea716df8a4a19b9d687cc9a90c850a870ccb59b7a439f634a790f3a35` |

Os dois arquivos canônicos de `data/commercial/` foram importados byte a byte das saídas `contracts/` do artefato. O contrato produzido é idêntico ao contrato do commit fonte; a medição agora identifica o SHA combinado e seu `script.js`. Foram conferidos o SHA, a árvore, os pais, os hashes dos arquivos de controle, os hashes dos HTMLs por rota, a coincidência entre relatório e medição e a ausência de alteração nos critérios do contrato.

O helper temporário foi removido após a coleta. Os gates normais de `site-ci` e pSEO continuam obrigatórios para a versão final. O censo de primeira dobra permanece o do contrato existente; as novas rotas residenciais seguem sujeitas às suas provas específicas e aos gates completos da versão final.

Na integração dos históricos, nesta coleta e na importação, nenhum critério de aprovação, limite comercial, autorização de campanha ou estado de compra foi alterado.
