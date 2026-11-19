# Evidência Lighthouse dos projetos residenciais

## Origem e integridade

Coleta da PR #832, execução
[43167069678, tentativa 1](https://github.com/tjsasakifln/web-cfg/actions/runs/43167069678),
concluída com sucesso em 12/11/2026. Fonte medida:
`9c425bad6ee3b3dc51152d8ee0d275a5c6d221e4`; árvore Git:
`5d4a3d69feb30f4dc010909fbcdb9a2668e9e372`. A existência da revisão, sua árvore
e a ancestralidade em relação ao checkout foram conferidas antes da importação.

O build canônico foi medido no servidor estático local do runner GitHub, com
Lighthouse 13.4.1 e Chrome 152.0.7977.42. O resultado foi `MEASURED_PASS`:
66 rotas representativas e 82 medições, sendo três execuções para cada uma das
oito rotas críticas e uma para as demais. Não houve medição incompleta nem
erro terminal. A verificação com `LH_REQUIRE_RAW_EVIDENCE=1` passou no mesmo job.

O [resumo completo](../lighthouse-runs/summary.json) foi importado byte a byte,
sem combinar linhas de execuções distintas. Seu SHA-256 é
`79cca4fdf8be2daa96f3765f0df537497872b73541692fea18fc286f44812837`.
Os três relatórios brutos abaixo também são cópias integrais; juntos ocupam
1.883.387 bytes. Os 82 relatórios foram confrontados com o resumo antes da
importação e permanecem no artefato completo da execução.

O artefato GitHub `13921192276` tem 24.720.364 bytes e SHA-256
`3bc6b5ade247176870c49bb9f54930bc75f2cea3d8e2c00b7f3bb6037c78b579`,
conferido depois do download. A cópia integral extraída contém 85 JSON:
82 relatórios, resumo, proveniência e identidade do build.

Foram preservados os arquivos originais de
[proveniência](projetos-prontos-lighthouse-2026-11-12/provenance.json),
[identidade do build](projetos-prontos-lighthouse-2026-11-12/build-info.json) e
[metadados do artefato](projetos-prontos-lighthouse-2026-11-12/github-artifact.json).
Eles registram SHA, árvore, execução, tentativa e hashes do resumo, política,
registro de famílias e build-info. Esses hashes foram conferidos. O pacote de
evidência não contém o `_site` completo; o hash do artefato público é a identidade
registrada pelo build, sem alegação de uma segunda recomputação dessa árvore.

## Resultados das três novas rotas

As notas abaixo são as observadas. LCP está arredondado para milissegundos e CLS
para seis casas; os JSON preservam a precisão original.

| Rota e relatório bruto | Desempenho | Acessibilidade | Boas práticas | SEO | LCP (ms) | CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [/projetos-prontos/](../lighthouse-runs/projetos-prontos.json) | 100 | 100 | 100 | 100 | 1.654 | 0 |
| [/projetos-prontos/condicoes/](../lighthouse-runs/projetos-prontos_condicoes.json) | 100 | 100 | 100 | 100 | 1.726 | 0 |
| [/projetos-prontos/pedidos/](../lighthouse-runs/projetos-prontos_pedidos.json) | 100 | 100 | 96 | 69 | 1.732 | 0,013586 |

Na área de pedidos, o SEO 69 registra o bloqueio intencional
`noindex,nofollow,noarchive`; o cálculo registrado sem crawlability é 100.
A exceção legada `seo_exempt` também retira acessibilidade e boas práticas das
condições obrigatórias dessa rota no avaliador. As notas observadas continuam
sendo 100 e 96; não se afirma que os quatro limites foram exigidos ali.

O relatório de pedidos registra um erro de console por HTTP 404 em
`/api/web/project-orders?op=config`, endpoint ausente no servidor puramente
estático do laboratório. Essa coleta não comprova o funcionamento da API nem o
fluxo de pedidos. A prova de interface com backend controlado e as verificações
da versão publicada continuam separadas.

## Diferenças posteriores e publicação

Após o commit medido, foram corrigidas a repetição da nota de privacidade do
formulário residencial e a apresentação de 11 links de conteúdo nas duas
páginas públicas, com sublinhados restritos a `.ready-projects-page`.
Esses ajustes não foram medidos nesta execução. A presente evidência conserva
a origem em `9c425bad`; a versão final exige nova medição completa no `site-ci`
obrigatório e os demais controles de release.

O workflow temporário de coleta foi removido após a importação. Na coleta e
nesta importação, nenhum critério, teste, exceção de indexação ou baseline
histórico de CLS foi alterado, e não foi solicitada uma nova execução para
melhorar notas.
