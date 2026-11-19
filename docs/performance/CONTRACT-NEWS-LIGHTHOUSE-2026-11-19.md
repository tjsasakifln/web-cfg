# Evidência Lighthouse da seção de notícias de contratos públicos

## Origem e integridade

A coleta da PR #849 foi concluída com sucesso na
[execução 44580916689, tentativa 1](https://github.com/tjsasakifln/web-cfg/actions/runs/44580916689).
O [job site-validation](https://github.com/tjsasakifln/web-cfg/actions/runs/44580916689/job/135760990805)
mediu o site estático local no passo 58, entre `18:29:09Z` e `18:40:22Z`
de 19/11/2026. O resultado foi `MEASURED_PASS`, com 70 rotas representativas
e 86 medições: três execuções para cada uma das oito rotas críticas e uma
para as demais. Não houve erro terminal nem medição incompleta.

O head da PR era `03aed0004e1bb60faa71ca86fa323e51695c24a3`. O checkout do
runner foi o merge sintético `786154235cc1a6b04414d88fb3131716739cea10`, com
pais `71c608ffad6e317573ab2a8312587ab6cb45dfe7` e o head da PR. O head da PR e o merge sintético
compartilham a árvore `f9657ece701f821af468620202f96b095389d5e3`, conferida
na API e no registro do checkout. Essa identificação se refere à árvore Git
original. O relatório de primeira dobra registra `tree_dirty=true` depois
da geração do site.

O ZIP do artefato GitHub `14564260186`, chamado `site-ci-reports`, contém
98.106.560 bytes. Seu SHA-256 foi recomputado após o download e coincide
com o digest da API:
`54b3ba3324fcee9cd4209db0aa9b8f566c04c07055889670b888891ef027af2f`.
Os [metadados originais do artefato](contract-news-lighthouse-2026-11-19/github-artifact.json)
foram preservados sem reescrita.

O [resumo completo](../lighthouse-runs/summary.json) foi copiado byte a byte
de uma única execução. Ele tem 381.864 bytes, foi gerado às
`18:39:55.267Z` e conserva o SHA-256
`2efc2d97a22aae39493397df2e3d36b2d94dfe605a8553631593d5cea871e22f`.
Os 86 relatórios brutos referenciados por suas linhas foram confrontados;
seus horários de coleta ficam entre `18:29:12.646Z` e `18:39:49.699Z`,
dentro do passo de medição. Outros JSON presentes no ZIP não foram
contados como novas medições.

O pacote registra a identidade do build dentro de
`build/reports/first-fold-current.json`: commit `786154235cc1a6b04414d88fb3131716739cea10`,
ambiente `local`, `artifact_hash`
`84ff0865bfa6a0dba9854f287f2291bcc124248b665bdb7554fdc23de9360757`
e `manifest_hash`
`8ab2420158ce146a6b5095fc6ad1af0f5e9e63eab96bfeb9ee04a8008695e326`.
Essa identidade é aninhada no relatório original. O ZIP não contém um
`build-info.json` independente nem o `_site` completo, portanto esta revisão
não afirma uma segunda recomputação do hash desse artefato público.

## Resultado do índice de notícias

A rota `/noticias/contratos-publicos/` foi medida como o índice estático
vazio que acompanha o pacote. O
[relatório bruto original](../lighthouse-runs/noticias_contratos-publicos.json)
tem 542.380 bytes, horário de coleta `18:38:35.203Z` e SHA-256
`1545e03e50495818187172cc82fc030fd8d0dc29ce2b87cfadcef4c6c9844e33`.
A emissão da linha no log ocorreu depois, às `18:38:40.1208689Z`.

A coleta usou Lighthouse 13.4.1, navegador identificado como
`HeadlessChrome/152.0.0.0`, viewport móvel de 390 × 844 e escala 2.

| Métrica | Resultado observado | Condição aplicada nesta rota |
| --- | ---: | --- |
| Desempenho | 100 | Pelo menos 90 |
| Acessibilidade | 100 | Pelo menos 95 |
| Boas práticas | 100 | Pelo menos 95 |
| SEO bruto | 69 | Registra o bloqueio intencional `noindex,follow` |
| SEO local sem `is-crawlable` | 100 | Pelo menos 95 nas demais auditorias SEO |
| CLS | 0 | No máximo 0,05 |
| LCP | 1.728,3934 ms | Valor observado; a rota não pertence ao grupo crítico |

O bruto comprova `is-crawlable` com nota 0 e aponta o meta
`<meta name="robots" content="noindex,follow" />`. A política inclui a rota
somente em `seo_only_exempt_pages`; ela não integra a lista ampla
`seo_exempt_pages`. Acessibilidade, boas práticas, desempenho, CLS e as
demais auditorias SEO mantiveram suas exigências.

O valor ajustado 100 descreve somente o cálculo local sem essa auditoria.
Ele não é uma nota de SEO da origem pública. A medição também não contém
uma notícia sintética nem comprova a geração e publicação de um artigo real.

## Conferência independente e alcance

O [recibo de revisão](contract-news-lighthouse-2026-11-19/review-receipt.json)
é um registro derivado desta conferência. Ele identifica os dados originais,
os 86 hashes dos brutos, a consulta final do workflow como `completed/success`,
os limites e os resultados dos comandos. Não é um arquivo de proveniência
emitido pelo runner.

Uma cópia privada, detached no head `03aed000`, passou pelo build canônico
com Node v22.23.5. Nela foram inseridos os relatórios originais recebidos,
e os dois confrontos seguintes passaram com código de saída 0:

```sh
LH_REQUIRE_RAW_EVIDENCE=1 npm run test:lighthouse-gates
npm run audit:performance
```

A conferência não abriu uma nova sessão de medição Lighthouse. O primeiro
comando verificou os brutos contra o resumo e recalculou a avaliação;
o segundo aplicou os orçamentos atuais, inclusive o CLS observado. Os
limites de nota continuam 90/95/95/95, o teto de CLS permanece 0,05 e os
orçamentos das rotas críticas seguem em 2.000 ms de LCP e 153.600 bytes
de conteúdo. Nenhum teste, limite ou arquivo de orçamento foi alterado nesta importação.

Esta evidência mede a árvore `f9657` anterior ao commit de evidência. O delta
preparado sobre `03aed000` contém somente o resumo integral, o bruto de
notícias, os metadados do artefato, o recibo derivado e este documento.
Os relatórios históricos das outras rotas permanecem preservados. Os
controles normais da PR e de release seguem exigidos após a importação.

A aceitação da seção servida em produção continua vinculada a
`deploy/contract-news/verify_public.py`, com seu HTML real, fontes, datas,
feed e sitemap. O estado inicial 503 do runtime, antes do primeiro snapshot
aceito, conserva seu tratamento específico de bootstrap.
