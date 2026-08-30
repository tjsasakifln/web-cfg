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

## O que vive aqui hoje (breakthrough 2026-08-30)

`breakthrough-2026-08-30/` guarda as três direções da campanha
`CONFENGE_DESIGN_BREAKTHROUGH_CANARY_20260830`, que superou a conclusão
estética `KEEP_CURRENT` da #494 depois da revisão do brand owner em produção.
São **estudos de direção**, não um protocolo de medida: a #494 comparava dois
mecanismos sob uma direção única e por isso não podia produzir ruptura
perceptível; aqui a variável em disputa é a composição inteira.

- `a-planilha/` — a grade da planilha orçamentária é o motor de layout da
  página inteira. **Venceu e foi implementada na home.**
- `b-parecer/` — espinha assimétrica com aparato de margem: fonte, artigo,
  data de corte, unidade e limite na linha de cada afirmação.
- `c-folha-de-rosto/` — folha de rosto e sumário com linha de chamada, no
  formato de relatório técnico brasileiro.

`shell.css` é a casca comum às três (reset, tipografia, foco, reduced motion),
para que a composição seja a única variável. A copy é a mesma nas três, e é a
copy congelada da home real.

Diferente do par da #494, este diretório é **autoral**, não gerado: as três
direções são estudos, e um gerador que impusesse a mesma estrutura às três
teria impedido justamente a divergência que a campanha exigia.

Estes protótipos declaram `@font-face`. A proibição de webfont continua valendo
para a subárvore da #494, onde ela registra um fato medido daquela comparação;
aqui vale a regra que a substitui e que é mais forte no que importa: a face
declarada precisa resolver para um arquivo versionado em `/assets/`. Fonte
remota, recurso de terceiro, script inline, estilo inline, mexida em CSP e
ausência de `noindex` continuam proibidos em **todos** os protótipos, e o
isolamento de caminho é o mesmo.

O registro da decisão está em
[`../issues/12-breakthrough-canary.md`](../issues/12-breakthrough-canary.md).

## O que vive aqui hoje (#494)

`fixed-content.json` é o conteúdo fixo do protocolo de comparação (§11 do
brief): mesma copy, mesmos dados, mesmas fontes para as duas variantes. A copy
não vive no gerador — vive aqui, uma vez —, porque qualquer diferença de texto
entre as variantes invalidaria a comparação.

Os dois diretórios de variante são **gerados**, nunca editados à mão:

- `a-trilho-de-memoria/` — a coluna numérica é o motor de layout; fonte, data
  de corte, artigo, unidade e versão na linha de base da afirmação. Afirmação
  sem proveniência aparece incompleta, não some.
- `b-estado-de-revisao/` — o estado de revisão governa a renderização. Data de
  corte vencida renderiza degradada e marcada; sem data de corte, nasce
  marcada. **Carimbo desenhado é proibido** e há teste que o impede.

Cada variante tem `{comercial,leitura,instrumento}/` (os três jobs),
`g1-nulos/{job}/` (o mesmo template com todos os campos de domínio nulos, que é
a barreira G1) e `specimen/` (os nove artefatos tipográficos do §6).

```
npm run design:prototypes   # regenera as duas variantes a partir do conteúdo fixo
npm run design:palette      # G3 — separação de luminância e call sites de --lime
npm run design:probe        # G1, G2, G4, G5, G8 e M1–M3 em Chrome headless
npm run design:capture      # os cinco viewports do protocolo, full-page/JS-off/reduced-motion
npm run test:design-direction
```

`npm run test:design-direction` falha se os arquivos gerados divergirem do
gerador, se a copy fixa não chegar às duas variantes, se a subárvore de
conversão divergir entre elas, se algum protótipo declarar `@font-face` ou
carregar ativo de terceiro, ou se o desfecho registrado na regra de decisão
deixar de ser o que as medidas produzem.

O resultado da comparação está em
[`../DECISION_RULE_494_PRE_REGISTERED.md`](../DECISION_RULE_494_PRE_REGISTERED.md) §7,
e a especificação que completa a constituição em
[`../DESIGN_SYSTEM_COMPLETION_494.md`](../DESIGN_SYSTEM_COMPLETION_494.md).
