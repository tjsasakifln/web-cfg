// Monta um site estático que não precisa de CDN em tempo de uso.
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.resolve(__dirname, '..');
const dist = path.join(raiz, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const pasta of ['web', 'examples']) {
  fs.cpSync(path.join(raiz, pasta), path.join(dist, pasta), { recursive: true });
}
const artefatos = {
  'web-ifc': {
    'web-ifc-api.js': 'web-ifc-api.js', 'web-ifc.wasm': 'web-ifc.wasm', 'LICENSE.md': 'LICENSE.md'
  },
  three: {
    'build/three.module.js': 'three.module.js', 'build/three.core.js': 'three.core.js',
    'examples/jsm/controls/OrbitControls.js': 'addons/controls/OrbitControls.js', 'LICENSE': 'LICENSE'
  },
  fflate: { 'esm/browser.js': 'fflate.mjs', 'LICENSE': 'LICENSE' },
  exceljs: { 'dist/exceljs.min.js': 'exceljs.min.js', 'dist/LICENSE': 'LICENSE' }
};
for (const [pacote, arquivos] of Object.entries(artefatos)) {
  for (const [origem, nome] of Object.entries(arquivos)) {
    const destino = path.join(dist, 'web/vendor', pacote, nome);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(path.join(raiz, 'node_modules', pacote, origem), destino);
  }
}
// OrbitControls ships one bare import. Resolve it to the adjacent pinned copy
// so the viewer can run without inline scripts or a site-wide import map.
const controles = path.join(dist, 'web/vendor/three/addons/controls/OrbitControls.js');
const orbit = fs.readFileSync(controles, 'utf8');
if (!orbit.includes("from 'three'")) throw Error('Confira a importação de three em OrbitControls.');
fs.writeFileSync(controles, orbit.replace("from 'three'", "from '../../three.module.js'"));
const avisos = fs.readFileSync(path.join(raiz, 'docs/avisos-exceljs.txt'), 'utf8');
const excel = fs.readFileSync(path.join(dist, 'web/vendor/exceljs/exceljs.min.js'));
const shaExcel = require('node:crypto').createHash('sha256').update(excel).digest('hex');
if (!avisos.includes('dist/exceljs.min.js, SHA-256 ' + shaExcel + '.')) {
  throw new Error('Confira os avisos de componentes da versão distribuída de ExcelJS.');
}
const licencas = fs.readFileSync(path.join(raiz, 'docs/LICENCAS-WEB.txt'), 'utf8');
fs.writeFileSync(path.join(dist, 'web/vendor/FONTES.txt'), licencas + '\n' + avisos);
fs.writeFileSync(path.join(dist,'index.html'), '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=web/"><title>CONFENGE BIM</title><a href="web/">Abrir CONFENGE BIM</a></html>\n');
console.log('Site preparado em dist/.');
