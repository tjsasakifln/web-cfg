# Primeira dobra das 25 rotas obrigadas, 2026-08-30

Evidência da issue #327. Cinquenta telas: as 25 rotas do censo de
`data/commercial/first-fold-contract.v1.json`, nos dois viewports que o
contrato declara, mais seis recortes de componente que o harness captura por
padrão nas rotas que ele já cobria.

- commit: `dedcb0c69a0b0cf8f91f47581d107ca153d19881`
- árvore limpa na captura: `tree_dirty: false` em `manifest.json`
- viewports: `1366x768` (laptop) e `390x844` (mobile)

Comando:

```
CAPTURE_VIEWPORTS="1366x768,390x844" \
CAPTURE_PATHS="<as 25 rotas do censo>" \
CAPTURE_ALLOW_EPHEMERAL=1 \
node scripts/site/capture_screenshots.mjs <diretório temporário>
```

O `output_dir` gravado no manifesto nomeia um diretório temporário, e não esta
pasta, de propósito. `capture_screenshots.mjs` recusa carimbar um SHA sobre
uma árvore suja, e escrever direto aqui sujaria a árvore com os próprios
arquivos antes da verificação. Capturar fora e versionar depois é o único
caminho que produz `tree_dirty: false`, que é o fato que importa: estes pixels
saíram exatamente da árvore daquele commit.

As coordenadas medidas sobre a mesma árvore estão em
`data/commercial/first-fold-measurements.v1.json`, que carimba o mesmo commit.
