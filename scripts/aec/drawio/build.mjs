import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { useConfengeControlSurfaces } from '../vendor-controls.mjs';

const root = resolve(import.meta.dirname, '../../..');
const require = createRequire(process.env.AEC_POSTCSS_PACKAGE || resolve(root, 'scripts/aec/excalidraw/package.json'));
const postcss = require('postcss');
const files = {
  'grapheditor.css': 'styles/grapheditor.css',
  'high-contrast.css': 'styles/high-contrast.css',
  'common.css': 'mxgraph/css/common.css',
};
for (const [name, destination] of Object.entries(files)) {
  const source = await readFile(resolve(root, 'scripts/aec/drawio/source', name), 'utf8');
  const result = await postcss([useConfengeControlSurfaces]).process(source, { from: undefined });
  await writeFile(resolve(root, 'ferramentas/diagrama-fluxo-de-obra/runtime', destination), result.css, 'utf8');
}
