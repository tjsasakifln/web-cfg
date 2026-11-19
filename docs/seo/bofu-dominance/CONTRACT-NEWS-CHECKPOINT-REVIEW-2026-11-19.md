# Revisão do checkpoint: notícias de contratos públicos

Data: 19/11/2026. PR: [#849](https://github.com/tjsasakifln/web-cfg/pull/849).
Recaptura executada em `2026-11-19T17:09:06Z`, após revisão técnica por agentes.

## Autorização e escopo

Tiago autorizou nesta sessão a criação da seção de notícias sobre contratos
públicos, sua geração e publicação automáticas, a PR e a entrada em produção.
O [README dos frozen specs](frozen-specs/README.md), o `AGENTS.md` e o
[plano histórico](../../../data/bofu-dominance/frozen-specs/unlock-plan.v1.json)
permitem a manutenção comercial autorizada com revisão e recaptura real.

Esta atualização registra somente dois arquivos de descoberta da seção.
`html_mutation=false`, os hashes dos seis pilares, os snapshots, as propostas
históricas, as condições dos experimentos e as aprovações existentes permanecem
iguais. Os testes e as regras de proteção continuam integrais. A revisão é
técnica por agentes; nenhuma nova aprovação humana é alegada.

## Fonte verificável

- Base de comparação: main `71c608ffad6e317573ab2a8312587ab6cb45dfe7`.
- Commit fonte remoto: [472ee95884863254316ce099c8f240739fc0ec8e](https://github.com/tjsasakifln/web-cfg/commit/472ee95884863254316ce099c8f240739fc0ec8e).
- Árvore fonte: `d65b4327452ed99040289f804dfa812dd387c7d5`.
- Checkpoint anterior: `4f2fcefb36e57526495af8f9ebf3800b403ecf04`.

A API do GitHub confirmou o commit remoto. `git merge-base --is-ancestor`
confirmou que ele é ancestral de `HEAD`. Os 17 blobs protegidos foram lidos
com `git show <commit>:<arquivo>` e seus SHA-256 conferidos com a rotina
canônica de hashes. Todos coincidem com os arquivos atuais. Os 17 hashes do
checkpoint anterior coincidem com a main usada na comparação.

## Mudanças examinadas

| Arquivo | Delta contra main |
| --- | --- |
| `robots.txt` | Acrescenta uma única linha: `Sitemap: https://confenge.com.br/noticias/contratos-publicos/sitemap.xml`. As regras anteriores permanecem iguais. |
| `sitemap.xml` | Atualiza somente os `lastmod` de `/politica-editorial/` e `/politica-editorial/historico/`, de `2026-09-19` para `2026-11-19`. Preserva as 148 URLs deste arquivo e sua ordem. |

Os outros 15 arquivos protegidos conservam exatamente os hashes anteriores.
`sitemap.txt` e `sitemap-index.xml` permanecem iguais. A rotina existente
`forbidden_drift_policy` classificou os dois deltas como
`non_rendering_collateral`, com ação `commit_reviewed_hash_recapture`.

### Conteúdo e apresentação conferidos

Os dois HTMLs da política, presentes no commit fonte, foram examinados e
analisados como documentos HTML. Ambos apresentam canonical único, diretiva
`index,follow,max-snippet:-1`, versão editorial `1.5.0`, data visível
`19 de novembro de 2026` e `WebPage.dateModified=2026-11-19`. A política contém
a nova seção de notícias automáticas, com fonte oficial, autoria institucional,
checagem de fatos, distinção de datas e correções. O histórico registra essa
mudança material na versão 1.5.0. As duas datas do sitemap correspondem a esse
conteúdo e aos metadados efetivamente presentes.

O agente coordenador conferiu as capturas desktop e mobile das notícias no
[run 44568614316](https://github.com/tjsasakifln/web-cfg/actions/runs/44568614316),
head `19c65aeb0a6391be97325fe4002aeff620dfd8fe`. A verificação funcional em
navegador também passou no head fonte 472ee958, no
[run 44570317697](https://github.com/tjsasakifln/web-cfg/actions/runs/44570317697).
Entre esses heads houve somente a recontagem do contrato de marca. Esses
resultados se referem às notícias. A política foi conferida no HTML e nos
controles automatizados; não houve uma nova captura visual específica dela.

## Hashes recapturados

| Arquivo | SHA-256 anterior | SHA-256 do commit fonte |
| --- | --- | --- |
| `robots.txt` | `aa58f365ca9d63bad59c6bd95349b3d027c95571ea061c349af9721ffbadd5a0` | `52a0487f466e9801b7c810319e82c02a57c1770258b8cd39a735b085de1073c9` |
| `sitemap.xml` | `8c956d1e374890bc5cd3872a833d47a5ecf780f77183d0a5aa2ab12d651df7e5` | `4fc64c2e37246d6244c680bf75025f12574d448da152a7646b0751881c2acfe0` |

## Procedimento e preservação do histórico

A recaptura usou `forbidden_path_hashes` para medir os bytes e
`frozen_recapture_provenance`, da
[rotina existente](../../campaigns/design-institucional/expansao/tools/recapture_chain.py),
para conservar a proveniência. A escrita ficou restrita a
`data/bofu-dominance/frozen-specs/hashes.json` e a este documento. A rotina
ampla `materialize` não foi executada.

O novo `baseline_commit` aponta para o commit remoto examinado. O checkpoint
anterior, com seus hashes, motivo, metadados de recaptura e evidência, foi
acrescentado ao histórico pela função existente. Os 53 registros anteriores
permanecem idênticos; o histórico contém agora 54 registros. `schema`,
`campaign`, `html_mutation` e `pillars` permanecem iguais. A conferência
posterior confirmou que nenhum dos 17 arquivos protegidos foi alterado pela
recaptura.

## Verificações após a recaptura

- `npm run test:bofu-dominance`: 123 testes aprovados, incluindo correspondência
  dos hashes atuais, proveniência por blobs do commit alcançável, conservação
  do histórico e condições de autorização dos experimentos.
- `python3 -m pytest scripts/organic/tests/test_sitemap_graph.py scripts/organic/tests/test_contract_news_sitemap.py -q`:
  47 testes aprovados, cobrindo o grafo de sitemaps e o acervo de notícias.
- `forbidden_drift()`: resultado vazio.
- `git diff --check`: sem erros nos arquivos desta recaptura.

Os demais controles da PR e de publicação continuam obrigatórios. Este
checkpoint registra os bytes examinados e preserva as condições de promoção.
