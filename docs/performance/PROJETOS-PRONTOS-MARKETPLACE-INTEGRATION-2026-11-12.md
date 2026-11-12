# Integração das ofertas residenciais com a PR #830

A PR #832 foi validada integralmente na cabeça `5bccf24684bdd90f3a09f96205778fd4291b360d`, sobre a main `ba3f9df4ef3eba356ccfe4c6a6553c2979c967c1`. Antes do merge, a main avançou para `e28f1e3652def6e64e84a3463376d36c765c442f`, que incorporou a contratação de profissionais da PR #830. Esta integração preserva ambos os trabalhos e exige nova validação obrigatória da combinação.

## Resolução conferida

Foram preservados os dois conjuntos de scripts, rotas públicas, handlers e casos de paridade. O inventário canônico confirmou 59 arquivos, 24 handlers carregados sem erro e 33 bibliotecas de suporte. O censo de marca confirmou 291 HTMLs, 549 imagens, 263 ocorrências de cabeçalho e 269 de rodapé; os arquivos de marca e os critérios de aprovação não mudaram. O mapa de decisão foi vinculado ao SHA256 real do registro de famílias combinado e seu documento foi regenerado pelo produtor existente.

O inventário de formulários preserva as 42 rotas de captação e 293 ações, com os cinco formulários de ferramenta da área Profissionais acrescentados pela PR #830. Os modos de operação e os pagamentos das duas frentes permanecem independentes. A integração não inicia a aplicação privada do marketplace, não configura contas financeiras e não habilita compras.

## Evidência de primeira dobra preservada

O contrato e a medição de fonte são os arquivos íntegros da cabeça `5bccf24`, com a medição verdadeira vinculada a `dacbcb7376b53c758bbe44af0e101e045f6d9834`. A rotina canônica de identidade confirmou os mesmos 56 hashes de entrada no código combinado. O censo derivado continua com as mesmas 25 rotas, e o teste do contrato passou nas 1942 verificações.

A família de `/profissionais/` usa o perfil `commercial_content` e não altera as regras atuais que derivam esse censo. Isso não cria uma dispensa genérica para páginas noindex. Não foi realizada nova coleta de Chrome para a fonte, não foram renomeados o SHA ou a data da medição e não foram compostos resultados de execuções diferentes.

Os 17 arquivos protegidos continuam idênticos ao checkpoint `dacbcb7`. O histórico de 41 registros, os seis pilares e as autorizações permanecem intactos; não houve nova recaptura.

## Relatórios anteriores e próxima validação

A execução [site-ci 43172180537](https://github.com/tjsasakifln/web-cfg/actions/runs/43172180537) aprovou o código anterior à incorporação da PR #830. Seu candidato de teste `83e36f5897df91b9f20298d3b3d528b686dd5608` tem a mesma árvore de `5bccf24`. A prova contém 25 rotas em dois viewports e 82 medições Lighthouse em 66 rotas, além dos percursos residenciais. Essas provas continuam ligadas àquela versão.

A matriz combinada tem 67 rotas de pacote e prevê 83 medições Lighthouse, mantendo três medições para cada uma das oito rotas críticas. O representante de `/profissionais/` permanece noindex conforme a autoridade da PR #830. O summary histórico não recebeu resultados inventados para essa página; a execução obrigatória do site-ci deve medir o novo artefato integralmente. A publicação depende da aprovação dessa execução e da aceitação Netcup sobre o SHA real de produção.
