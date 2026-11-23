# Patch local do motor

O pacote `o3dv.min.js` foi gerado a partir do Online 3D Viewer 0.19.0,
commit `d025663dcdd101527e87971d9ae2cf16f02949b4`.

Alteração única em `source/engine/import/importerutils.js`:

- o carregador OCCT instancia o worker estático local
  `/ferramentas/visualizador-step-iges/vendor/occt-import-js/occt-import-js-worker.js`;
- a versão upstream baixava o worker, alterava seu texto e o executava por uma
  URL `blob:`. A substituição mantém a importação do OCCT em origem local e
  permite aplicar a política `unsafe-eval` somente à resposta do worker.

O motor Online 3D Viewer permanece MIT. Os avisos LGPL-2.1 de
`occt-import-js` e Open CASCADE estão em `occt-import-js/`.
