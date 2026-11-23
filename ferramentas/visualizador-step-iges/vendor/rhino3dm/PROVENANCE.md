# rhino3dm 8.17.0

Arquivos distribuídos: `rhino3dm.min.js` e `rhino3dm.wasm`, derivados do
pacote npm
[`rhino3dm@8.17.0`](https://registry.npmjs.org/rhino3dm/-/rhino3dm-8.17.0.tgz),
obtido em 2026-11-23. O carregamento é sempre de mesma origem; não há CDN em
tempo de uso.

- Licença: MIT, em `LICENSE-MIT.txt` (fonte:
  [mcneel/rhino3dm](https://github.com/mcneel/rhino3dm), ramo `8.x`).
- Integridade do tarball npm:
  `sha512-6m3nE/DUwu8vgc4Y7ffmLvV+WvUgjGYAf68q5WAn/CJZvboAPRlU6wTM7PpPU+wxiKfyfkOKKEkXVyPGIQyGeg==`.
- `rhino3dm.min.js` remove quatro usos de avaliação dinâmica do wrapper
  Emscripten: criação de funções nomeadas, alocador `emval`, invocador de
  binding Embind e fallback para objeto global. Eles são substituídos por
  closures genéricas e `Reflect.construct`; a mudança permite CSP sem
  `unsafe-eval`. SHA-256 original do pacote:
  `afbbd13cdbdf5e89af0c1de44e0b8cedf4f74845e70ae4d87ed0d1c5ef5d97b1`;
  SHA-256 da reconstrução distribuída:
  `9dc18ebb56d23ae2db58d30792f5737fa5a5ce121913ead27de4d30dca15c47e`.
- SHA-256 `rhino3dm.wasm`:
  `c831ea5e235603437f6f8f260b0083eebca186a75f8be03efbfc2bb06aa37e21`.
