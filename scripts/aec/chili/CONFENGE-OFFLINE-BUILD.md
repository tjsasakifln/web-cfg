# CONFENGE isolated Chili3D build

This directory is the corresponding source for the CONFENGE isolated runtime built from
Chili3D v0.8.0, upstream commit `a7a176bab5706cb2376635ba7c070e37efbbd69e`.
Chili3D remains licensed under AGPL-3.0; see `LICENSE`. Dependency versions and their declared
licenses remain recorded in `package-lock.json`.

## Intended public location

Deploy the contents of `dist/` only at:

`/ferramentas/modelador-parametrico-3d/ambiente-leve/app/`

All application assets are relative URLs. The isolated runtime is deliberately `noindex`; the
canonical, indexable CONFENGE landing page remains outside this source tree. No service worker is
emitted, so this runtime cannot claim the site root or any sibling route.

## Rebuild

Requirements:

- Node.js 24.19.0 (Linux x64 was used for the recorded build)
- dependencies resolved from the checked-in `package-lock.json`
- no network access at runtime

After dependency restoration, build with:

```sh
NODE_ENV=production node node_modules/@rspack/cli/bin/rspack.js build
```

The build intentionally does not run `scripts/build-plugins.mjs` or
`scripts/finalize-pwa.mjs`. `scripts/csp-safe-emscripten-loader.cjs` replaces the two dynamic
Emscripten embind code generators with closure-based equivalents at bundle time. A future native
WASM rebuild should retain `-sDYNAMIC_EXECUTION=0` from `cpp/CMakeLists.txt` and use Emscripten's
static embind path; the checked-in WASM binary itself is unchanged in this artifact.

## Curated surface

- removed analytics, remote videos/thumbnails and external home links;
- removed the AI panel, AI command, bridge and remote startup URL parameters;
- removed default, query-string and dropped-file plugin loading;
- omitted macro/visual-programming plugin builds and public plugin manifests;
- removed the WeChat entry point and asset;
- loads the local icon font as a same-origin script instead of evaluating fetched text;
- applies CONFENGE naming and an explicit `noindex, nofollow, noarchive` policy;
- keeps native `.cd` save/open and same-origin lazy JavaScript/WASM chunks.

## Required response policy

The tested Content-Security-Policy is:

```text
default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; script-src-attr 'none';
worker-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
connect-src 'self'; font-src 'self' data:; manifest-src 'self'; object-src 'none';
base-uri 'self'; form-action 'none'; frame-ancestors 'self'
```

Do not add JavaScript `unsafe-eval`. Serve `.wasm` as `application/wasm`. Also send
`X-Robots-Tag: noindex, nofollow, noarchive` for defense in depth. The static host must preserve
the trailing-slash app directory and must not rewrite missing app assets to the site shell.

## Recorded acceptance

The browser acceptance run served the production `dist/` at the intended nested path with the
policy above. It created a box using numeric height input (`4`, then `0`, Enter), downloaded a real
native `.cd` containing `BoxNode`, reloaded the page, reopened that file through **Abrir Documento**,
and observed the box plus an active canvas. Result: zero page errors, zero CSP violations, zero
external-origin requests, zero HTTP errors, and zero service-worker registrations.

## Distribuição no site

O arquivo de fontes publicado inclui a adaptação de controles CSS e o shell acessível em `confenge/`.

SHA-256 do arquivo publicado: `e3d1bc88e71b4a06c15475ca3f239432ad0910cc50f113c56793225fe790ead8`.
