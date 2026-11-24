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

O mesmo arquivo de origem também troca o carregamento remoto de `rhino3dm`
8.17.0 por `vendor/rhino3dm/rhino3dm.min.js`. O WebAssembly permanece ao lado
para o carregador localizar em mesma origem. Integridade do tarball npm:
`sha512-6m3nE/DUwu8vgc4Y7ffmLvV+WvUgjGYAf68q5WAn/CJZvboAPRlU6wTM7PpPU+wxiKfyfkOKKEkXVyPGIQyGeg==`.

O wrapper JavaScript do pacote é uma reconstrução local estreita e auditável:
substitui quatro geradores de função do Emscripten (`new Function` e o
fallback `Function("return this")`) por closures e `Reflect.construct` de
mesma semântica. Isso elimina a exigência de `unsafe-eval` no documento; não
altera o `.wasm`. Ver `rhino3dm/PROVENANCE.md` e `rhino3dm/LICENSE-MIT.txt`.
