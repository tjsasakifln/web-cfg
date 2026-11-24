import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { useConfengeControlSurfaces } from '../vendor-controls.mjs';

const folder = process.argv[2];
if (!folder) throw new Error('Informe a pasta pública do ambiente Chili3D.');
const require = createRequire(process.env.AEC_CHILI_POSTCSS_PACKAGE || import.meta.url);
const postcss = require('postcss');

for (const name of (await readdir(folder)).filter(file => file.endsWith('.css'))) {
  const path = join(folder, name);
  const sheet = postcss.parse(await readFile(path, 'utf8'));
  sheet.walkRules(rule => {
    const decorativeMask = rule.nodes.some(node => node.type === 'decl'
      && node.prop.endsWith('mask-image') && node.value.includes('gradient('));
    if (decorativeMask) {
      rule.walkDecls(declaration => {
        if (declaration.value.includes('gradient(')) declaration.remove();
      });
    }
  });
  sheet.walkDecls(/^--resizer-gradient/, declaration => {
    const stops = declaration.value.match(/rgba\([^)]+\)/g);
    if (stops) declaration.value = stops.at(-1);
  });
  await writeFile(path, useConfengeControlSurfaces(sheet).toString(), 'utf8');
}