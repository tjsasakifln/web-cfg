import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dependencies = resolve(process.env.AEC_SVG_DEPS || here);
const require = createRequire(resolve(dependencies, 'package.json'));
const { transform } = require('esbuild');
const entry = require.resolve('@svgedit/svgcanvas');
const output = resolve(process.argv[2] || resolve(here, '../../../ferramentas/editor-svg/vendor'));
let source = await readFile(entry, 'utf8');
const controls = new Map([
  ['style: `cursor:${t}-resize`', 'class: `svg-resize-${t}`'],
  ['e.setAttribute("style", `cursor:${t[n]}-resize`)', 'e.style.cursor = `\${t[n]}-resize`'],
  ['style: `cursor:url(${zw.curConfig.imgPath}/rotate.svg) 12 12, auto;`', 'class: "svg-rotate"'],
]);
for (const [original, replacement] of controls) {
  if (source.split(original).length !== 2) throw new Error('As alças do SVG-Edit mudaram e precisam de revisão.');
  source = source.replace(original, replacement);
}
source = source
  .replaceAll('style: "pointer-events:none"', '"pointer-events": "none"')
  .replace(/\.setAttribute\("style", "pointer-events:\s*(inherit|none)"\)/g, '.setAttribute("pointer-events", "$1")');
const result = await transform(source.replace(/^\/\/# sourceMappingURL=.*$/m, ''), {
  minify: true, format: 'esm', legalComments: 'inline',
});
const digest = createHash('sha256').update(result.code).digest('hex');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'svgcanvas.js'), result.code);
await cp(resolve(here, 'LICENSE-MIT.txt'), resolve(output, 'LICENSE-MIT.txt'));
await writeFile(resolve(output, 'NOTICE.txt'), [
  'SVG-Edit / @svgedit/svgcanvas 7.4.2. Licença MIT.',
  'Fonte: https://github.com/SVG-Edit/svgedit/tree/e2ab43cfa9ed27bf268d8484eacf35cc25e3681c',
  'Adaptação CONFENGE: classes CSS e atributos de apresentação SVG para alças e seleção sob CSP.',
  'Distribuição: https://www.npmjs.com/package/@svgedit/svgcanvas/v/7.4.2',
  'SHA-256 do módulo distribuído: ' + digest,
  'Reprodução: npm ci e node build.mjs CAMINHO-DE-SAÍDA neste diretório.',
  '',
].join('\n'));
