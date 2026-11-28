const fs = require('node:fs');
const path = require('node:path');
const raiz = path.resolve(__dirname, '..');
const destino = path.join(raiz, 'dist/web/vendor-cad');
fs.mkdirSync(destino, {recursive:true});
for (const [arquivo, nome] of [
  ['pdfjs-dist/build/pdf.min.mjs','pdf.mjs'], ['pdfjs-dist/build/pdf.worker.min.mjs','pdf.worker.mjs'],
  ['pdfjs-dist/standard_fonts','standard_fonts'], ['pdfjs-dist/wasm','wasm'], ['pdfjs-dist/cmaps','cmaps'],
  ['pdfjs-dist/LICENSE','PDFjs-LICENSE'], ['@node-projects/acad-ts/dist/index-min.js','acad.mjs'],
  ['@node-projects/acad-ts/LICENSE','acad-LICENSE']
]) fs.cpSync(path.join(raiz,'node_modules',arquivo),path.join(destino,nome),{recursive:true});
// Clipper is already pinned for the machining tools. Bundle it as an ES module for clipping CAD geometry.
const clipper=require.resolve('clipper-lib');
const aviso=fs.readFileSync(clipper,'utf8').split('(function')[0].trim();
require('esbuild').buildSync({
  entryPoints:[clipper],banner:{js:aviso},outfile:path.join(destino,'clipper.mjs'),
  bundle:true,format:'esm',platform:'browser',minify:true,legalComments:'eof',
});
