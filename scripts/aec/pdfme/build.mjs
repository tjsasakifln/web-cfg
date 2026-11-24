import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const dependencies = resolve(process.env.AEC_PDFME_DEPS || sourceDirectory);
const require = createRequire(resolve(dependencies, 'package.json'));
const { build } = require('esbuild');
const output = resolve(process.argv[2] || resolve(sourceDirectory, '../../../ferramentas/relatorio-fotografico-vistoria/vendor/pdfme'));
const modules = resolve(dependencies, 'node_modules');
const result = await build({
  absWorkingDir: dependencies, entryPoints: { engine: resolve(sourceDirectory, 'engine.mjs') }, outdir: output,
  nodePaths: [modules], bundle: true, splitting: false, minify: true, format: 'esm', platform: 'browser',
  conditions: ['browser', 'production'], legalComments: 'linked', metafile: true,
});
const notices = [
  'Relatório fotográfico CONFENGE: dependências locais, empacotadas para navegador.',
  'Construção: npm ci nesta pasta; node build.mjs CAMINHO-DE-SAÍDA.',
];
const packagePaths = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const match = [...input.replaceAll('\\', '/').matchAll(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/g)].at(-1);
  if (match) packagePaths.add(input.replaceAll('\\', '/').slice(0, match.index + match[0].length));
}
await mkdir(resolve(output, 'licenses'), { recursive: true });
for (const path of [...packagePaths].sort()) {
  const directory = resolve(dependencies, path);
  const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  notices.push(`${manifest.name}@${manifest.version} — ${manifest.license ?? 'consultar fonte do componente'}`);
  for (const name of await readdir(directory)) {
    if (/^(?:license|copying|notice)(?:[.-].*)?$/i.test(name)) await cp(resolve(directory, name), resolve(output, 'licenses', `${manifest.name.replace(/[^a-zA-Z0-9_-]/g, '-')}-${manifest.version}-${name}`));
  }
}
await writeFile(resolve(output, 'NOTICE.txt'), notices.join('\n') + '\n', 'utf8');
