# TerriaMap runtime reproduction

The published runtime is a reduced, static production build of [TerriaMap](https://github.com/TerriaJS/TerriaMap), pinned to commit `6e6de6ed4133e401901ed3cb9c3fc68d4123d66c` (TerriaMap 0.4.8; Apache-2.0). It is not a proxy, catalogue service, uploader, or storage service.

Rebuild in an isolated Linux working directory with Node 24:

```sh
git clone https://github.com/TerriaJS/TerriaMap.git terriamap
cd terriamap && git checkout 6e6de6ed4133e401901ed3cb9c3fc68d4123d66c
npm install --legacy-peer-deps --ignore-scripts --no-audit --no-fund
npx gulp release
node /path/to/web-cfg/scripts/aec/terria/patch-csp-runtime.mjs wwwroot
AEC_TERRIA_DEPS=/path/to/node-dependencies node /path/to/web-cfg/scripts/aec/terria/control-css.mjs wwwroot/build/TerriaMap.css wwwroot/build/217.TerriaMap.css wwwroot/build/901.TerriaMap.css wwwroot/build/314.TerriaMap.css
node /path/to/web-cfg/scripts/aec/terria/strip-analytics-runtime.mjs wwwroot
```

Copy only the files enumerated in `runtime/build/SOURCE-INVENTORY.json`, plus runtime HTML/configuration, local IBGE data and `LICENSES/`. The exact-string patch is fail-closed: it neutralizes an unreachable Node worker `eval` branch in the browser bundle and replaces one regenerator global fallback with `globalThis`. It also changes the chunk public path only for the nested finite runtime views, avoiding duplicated chunks. It deliberately does not remove WebAssembly compilation. The runtime therefore requires route-only `wasm-unsafe-eval`, but never JavaScript `unsafe-eval`.

After rebuild, run the isolated browser smoke against each finite state. Runtime requests must be same-origin only. The landing page remains a normal static SEO page and must not inherit the runtime CSP.

The production bundle also carries an unused `react-ga4` dependency. The final transform replaces only its uniquely delimited module with an inert export after verifying its measurement-required and loader-method literals plus its pinned module SHA-256 (`5f3e7627353113a699cd3bb588bf626955829e8061e7c2cfffb5af6b21f51ae1`). It does not change CONFENGE's reviewed first-party/consented GA4 runtime; it prevents the Geoportal vendor bundle from shipping a second, unapproved browser exporter.
