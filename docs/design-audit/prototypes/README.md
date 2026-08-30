# Protótipos de design: caminho único e isolado

Este diretório é o **único** lugar onde protótipos visuais versionados podem
existir neste repositório. A regra é de caminho, não de julgamento: qualquer
arquivo sob `docs/design-audit/prototypes/**` é protótipo.

## Por que o caminho é fixo

Um protótipo que vaza para o artefato público vira rota não declarada em
`data/organic/public-family-registry.json`. O portão de conversão é fail-closed,
então o vazamento seria detectado tarde e com a mensagem errada (erro de
família, não erro de protótipo). Com o caminho fixo, o build reconhece o
protótipo antes de qualquer hash, normalização ou publicação.

## Como o isolamento é garantido

`scripts/pseo/build_site.py` define `PROTOTYPE_SOURCE_DIR` e roda
`enforce_prototype_isolation()` logo depois de montar o artefato público:

1. remove do `_site` qualquer caminho de protótipo, para que o artefato que
   sobe seja seguro;
2. registra a remoção em `seo/pseo-site-build-report.json`
   (`prototype_isolation`) e **falha o build**, porque um protótipo dentro do
   artefato significa que a allowlist de origem regrediu.

`scripts/pseo/tests/test_prototype_isolation.py` prova as duas metades: o
comportamento da função em árvore sintética e a ausência do caminho no `_site`
efetivamente construído.

## O que não fazer

Não publicar protótipo em rota pública, não capturar rota de protótipo em CI
público e não mover protótipo para fora deste diretório para "testar rápido".
