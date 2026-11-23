# Distribuição local draw.io

O runtime da ferramenta `ferramentas/diagrama-fluxo-de-obra/runtime/` é uma seleção reproduzível do webapp oficial draw.io 32.7.4, commit `f411a11`. Copie os arquivos listados em `FILES.txt` a partir de `src/main/webapp`, preservando os caminhos. O smoke `work/drawio-aec-smoke.mjs` confirma o protocolo `init`, `load` e exportação SVG sob origem única.

Os CSS de distribuição passam por `node scripts/aec/drawio/build.mjs`. O comando usa PostCSS 8.5.33 fixado em `scripts/aec/excalidraw/package-lock.json` e remove cantos arredondados, sombras e gradientes pelo mesmo controle visual aplicado aos demais motores. As entradas imutáveis ficam em `source/`.

Antes de publicar, aplique `node scripts/aec/drawio/patch-runtime.mjs <app.min.js oficial> <app.min.js local>`. O script exige SHA-256 `191af27513db065361156b6d8b5d262b6ae11657c0b28c51a0e28ee8b3dac94c` e elimina o registro inativo de configurações de IA do upstream. Assim o runtime local não carrega modelos, rotas ou modelos de credencial de provedores externos.
