# Auditoria de evidência e integração — MV-02

## Base e produção observadas

- Repositório: `tjsasakifln/web-cfg`
- Branch producer: `feat/mv-02-trust-authority-proof-20260905`
- `BASE_SHA` observado na abertura: `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`
- `origin/main` final usado no rebase da producer: `470a5ffafeaf45a59649109742ce5885f9789328`
- Produção observada: build/runtime no mesmo SHA, com superfícies Cloudflare e Netcup identificadas
- Checks do SHA: site-ci, Netcup release, pSEO e CodeQL aprovados; falha posterior de RevOps agendado não pertence ao commit nem a este WRITE_SET

## Issues e doadores auditados

| Referência | Uso nesta campanha |
| --- | --- |
| #243 | relato de certidão oficial CREA-SC e fonte para reconciliação; sem bytes/hash acessíveis nesta execução |
| #581 | separação obrigatória entre registro CPTEC, especialidade, quantidade de trabalhos e nomeação |
| #585 | contrato e gate multivertical de conflitos |
| #531 | arquitetura de prova positiva e retirada |
| #328 | prova de cliente bloqueada; total autorizado permanece zero |
| PR #595 | doador sem merge cego para contrato, intérprete e casos do gate de conflitos |
| PR #599 | doador auditado; claims profissionais retidos por ausência de revalidação acessível |
| PR #604 | doador seletivo de registro/projeção e sanitização de identidade; depois de integrado ao `main`, a producer foi rebaseada e preservou a cobertura da ferramenta privada sem editar essa superfície fora do WRITE_SET |

## Decisão sobre a certidão da issue #243

A issue registra que o fundador forneceu certidão oficial contendo CREA-PJ, responsável técnico, CREA individual, RNP, títulos, vínculo e endereço cadastral. A busca nesta árvore, artefatos locais acessíveis, metadados de issues e branches não encontrou o documento material, sua identidade verificável nem seu hash.

Portanto, “não revalidável por URL pública” não foi tratado como inexistência; porém, sem acesso material ao documento, os claims continuam `WITHHELD`. A classe `DOCUMENTARY_PRIMARY` só aceita projeção quando a referência contém identidade do documento, SHA-256, owner, classe de armazenamento e `materially_accessible=true`. Não é necessário publicar os bytes sensíveis.

| Claim | Estado | Motivo |
| --- | --- | --- |
| razão social, CNPJ, situação, CNAE e endereço cadastral/fiscal | `VERIFIED` | consulta oficial de CNPJ, com data e recheck |
| nome civil do responsável | `VERIFIED` | fonte pública registrada, com limite de escopo |
| Engenharia Civil/EESC-USP | `SELF_ATTESTED` | informação pública declarada pelo titular; não apresentada como certidão acadêmica |
| regra de ART/NF e atuação nacional | `SELF_ATTESTED` | regra operacional delimitada por atribuição, escopo, jurisdição, registro/visto e ART aplicável |
| CREA-PJ, CREA individual, RNP, vínculo e título de Segurança do Trabalho | `WITHHELD` | documento relatado, mas não materialmente acessível nesta execução |
| registro, especialidade e quantidade de trabalhos CPTEC | `WITHHELD` | artefato durável inacessível; claims continuam separados |
| nomeação judicial e casos ativos | `WITHHELD`/`never_project` | cadastro não prova nomeação; casos ativos não viram prova comercial |
| clientes, depoimentos e resultados | bloqueado | nenhuma permissão ativa na #328 |

## Formalidades nacionais

A copy pública evita prometer atuação irrestrita. Ela informa verificação de atribuições, responsabilidade técnica, ART quando aplicável e formalidades de registro ou visto perante o Crea competente conforme natureza, duração e jurisdição do escopo. Fontes oficiais e data de consulta estão em [national-professional-formalities-research.md](national-professional-formalities-research.md).

## Dados, privacidade e analytics

- Owner canônico de fatos e identidade: `extra-cli`; o registro local é uma projeção SELECT-only de publicação e retirada, não um segundo modelo de identidade.
- Owner de ação comercial: Warmbly; nenhuma integração de envio foi criada nesta campanha.
- A triagem roda no navegador, sem upload ou POST. Partes, processo, contrato, órgão, profissionais, motivos e documentos ficam fora de HTML público e analytics.
- Eventos existentes de CTA permanecem normalizados; nenhum evento novo com PII foi adicionado.

## Rollback e ADR

Rollback de credencial: alterar para `WITHHELD` ou `revoked=true` e reprojetar; HTML visível e JSON-LD são removidos juntos. Rollback do gate: restaurar contrato selado, página e intérprete da mesma versão.

ADR afetado: [ADR-STRAT-002](../../../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md), sem mudança de limite arquitetural. A CONFENGE permanece única marca e superfície pública; B2G é uma vertical, não toda a categoria corporativa.

## Gates esperados antes da integração

Validação de registro, paridade visível/schema, revogação, aliases retidos, distinção CPTEC/nomeação, endereço cadastral, ausência de prova de cliente, contrato/hash de conflitos, equivalência Python/JavaScript, 100 triagens, privacidade, linguagem pública, acessibilidade e geometria em 390×844 e 1366×768.
