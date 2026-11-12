# Revisão do checkpoint: projetos residenciais

Data: 12/11/2026. PR: #832. Revisão técnica autônoma, sem alegação de nova
aprovação humana ou de revisão técnica dos projetos comercializáveis.

## Autorização e limites

A decisão expressa de Tiago para implantar a consulta de projetos residenciais,
registrada em [ADR-PROJECTS-001](../../architecture/ADR-PROJECTS-001-ready-projects.md),
abrange a oferta de consulta, navegação, formulário, medição e sitemap. O catálogo
continua vazio. Esta revisão não autoriza campanha, gasto, envio de mensagens,
preço, produto técnico, cobrança ou ativação de checkout.

O [plano histórico](../../../data/bofu-dominance/frozen-specs/unlock-plan.v1.json)
separa a manutenção comercial autorizada em 09/09/2026 das substituições
experimentais antigas. Permanecem intactos `html_mutation_authorized=false`,
as condições do experimento, o estado da medição e todas as autorizações
históricas. Os seis HTML de pilares protegidos não foram alterados por esta PR.

## Comparação examinada

Base de comparação: `277aaca97aa456c9f90e83778846a7b59ea7a246`, o `main` usado
na implementação. Os 17 hashes do checkpoint anterior correspondem exatamente
aos arquivos dessa base. A diferença entre essa base e o commit revisado
compreende somente estes cinco arquivos protegidos:

| Arquivo protegido | Mudança revisada |
| --- | --- |
| `js/modules/analytics.js` | Acrescenta somente o vínculo `/projetos-prontos/` → `ready-projects`. O coletor, os eventos, os filtros de dados pessoais e a política de consentimento permanecem iguais. |
| `script.js` | Recompilação exata dos módulos existentes, descrita abaixo. |
| `sitemap.xml` | Acrescenta `/projetos-prontos/` e `/projetos-prontos/condicoes/`, ambas com `lastmod` de 12/11/2026. Nenhuma URL anterior é removida ou alterada. |
| `sitemap.txt` | Acrescenta as mesmas duas URLs, preservando as demais. |
| `sitemap-index.xml` | Atualiza somente o `lastmod` do sitemap principal, de 09/11/2026 para 12/11/2026. |

Os HTML da landing e das condições declaram os mesmos canonical e
`index,follow`. `/projetos-prontos/pedidos/` declara
`noindex,nofollow,noarchive` e não entra nos sitemaps examinados.

### Conteúdo completo do bundle

Para revisar `script.js`, foram examinados os deltas completos dos módulos
`analytics.js`, `nav.js`, `form.js` e `offer-fit.js` contra a mesma base. A
reprodução com a configuração existente de Terser confirmou igualdade byte a
byte dos dois bundles, o anterior e o atual. Portanto, o diff minificado não
contém código alheio aos módulos examinados.

- `analytics.js`: apenas o vínculo de rota descrito na tabela.
- `nav.js`: acrescenta a situação `projetos-prontos`, sua rota, texto de consulta
  e contexto de contato. O texto informa que a consulta não gera cobrança e
  que preço, prazo e escopo são definidos antes da contratação.
- `form.js`: inclui os campos de interesse residencial no material usado pela
  idempotência quando `data-intent="ready_project_interest"`; acrescenta a
  confirmação inline optativa, bloqueio de reenvio após sucesso, seleção do
  interesse a partir dos links e tratamento da rejeição de qualificação pelo
  servidor. A confirmação continua condicionada a resposta HTTP 200/201,
  `ok=true` e protocolo retornado. Os novos campos não são acrescentados aos
  parâmetros de analytics.
- `offer-fit.js`: sem alteração.

O bundle anterior tem 99.558 bytes; o revisado, 101.195 bytes. A confirmação
inline é selecionada por atributo; o formulário residencial declara também
`data-receipt-required="true"`. A mudança não ativa compra nem modifica o
contrato de pagamento.

## Evidência de bytes revisados

| Arquivo | SHA-256 revisado |
| --- | --- |
| `js/modules/analytics.js` | `073d397b3c064f5cb7cdbc9a9f8c174385b6d154a08fca57033859025af32c5e` |
| `script.js` | `088c57970426f0c555483521ee61b4020ae6d3a24bc2b3e46404ed62b368f89a` |
| `sitemap.xml` | `13e457b81b3dbe5ef8bd5f3fbebc1305018725aa057a9bbbf418fa56df52548b` |
| `sitemap.txt` | `9bb2cdab9478f89ad94286178f773c3468f083959d99d86b27cd8a776d0aeb27` |
| `sitemap-index.xml` | `23f69b96a2f678fd5b75ce9cc9d2b95bcd75417078d7cf73dee7220bceae940f` |

Os outros 12 arquivos protegidos, incluindo os seis pilares, conservam seus
hashes. A atualização deste checkpoint não altera regras de verificação,
listas de proteção ou testes.

## Verificações realizadas

- Recompilação em memória do bundle de `main` e do bundle revisado: igualdade
  byte a byte nos dois casos, sem escrita de arquivos.
- `node scripts/site/build_script_modules.mjs`: `CHECK_OK`.
- `node seo/scripts/test_analytics_pii.mjs`: `ANALYTICS_UNIT_OK`.
- Dez testes focados, incluindo os quatro testes de `test_recapture_history.py`,
  dois de autorização e condições históricas, os três que detectaram o desvio
  e o teste de proveniência dos blobs: 10 aprovados em 0,12 s após a recaptura.
- Comparação dos 17 hashes anteriores com `main` e confirmação de que o desvio
  contém exatamente os cinco arquivos da tabela: aprovada.

Essas verificações cobrem fonte, HTML presente e contratos. Não constituem
prova de execução em navegador nem aprovação de release; os testes de interface
e os demais controles de publicação continuam obrigatórios no fluxo da PR.

## Checkpoint recapturado

O `baseline_commit` agora aponta para
`dd11d3591ef7c57566c90d7db9ec1b27920e832b`, commit real da PR #832, conferido
como ancestral de `HEAD` antes da escrita. Os blobs dos 17 arquivos desse commit
coincidem com os hashes recapturados e com os arquivos presentes. O teste de
proveniência executou essa comparação com o commit alcançável; não utilizou o
caminho mais fraco reservado a arquivos exportados sem histórico Git.

A atualização ficou limitada aos cinco hashes e aos metadados de proveniência.
O checkpoint anterior completo, `df8bdd1d569658a8b8cb38decee9ee3a4be21cb0`, foi
acrescentado por `frozen_recapture_provenance` ao histórico, preservando os 38
registros anteriores. O histórico tem agora 39 registros; `html_mutation=false`
permanece igual, assim como todas as autorizações e condições do experimento.

Os três testes que detectaram o desvio passaram:

- `test_entry_twice_html_mutation_false`;
- `test_reviewed_forbidden_checkpoint_matches_current_protected_bytes`;
- `test_reviewed_baseline_preserves_historical_campaign_authorization`.

Também passou
`test_recapture_provenance_snapshot_matches_baseline_bytes_with_or_without_git`.
O desvio observado após a recaptura é vazio. Esta recaptura não altera testes,
regras de proteção, snapshots de pilares ou autorizações históricas.
