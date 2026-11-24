import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)); const deps = resolve(process.env.AEC_PDFLIB_DEPS || dir);
const require = createRequire(resolve(deps, 'package.json')); const { build } = require('esbuild'); const out = resolve(process.argv[2] || resolve(dir, '../../../ferramentas/organizar-pranchas-pdf/vendor/pdf-lib'));
const result = await build({ absWorkingDir: deps, entryPoints: { engine: resolve(dir, 'engine.mjs') }, outdir: out, bundle: true, minify: true, format: 'esm', platform: 'browser', conditions: ['browser','production'], legalComments: 'linked', metafile: true });
const notices = ['Organizador de pranchas CONFENGE: PDF local no navegador.', 'Construção: npm ci nesta pasta; node build.mjs CAMINHO-DE-SAÍDA.']; const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) { const hit = [...input.replaceAll('\\','/').matchAll(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/g)].at(-1); if (hit) packages.add(input.replaceAll('\\','/').slice(0, hit.index + hit[0].length)); }
await mkdir(resolve(out,'licenses'), { recursive: true }); for (const path of [...packages].sort()) { const folder = resolve(deps,path); const pkg = JSON.parse(await readFile(resolve(folder,'package.json'),'utf8')); notices.push(`${pkg.name}@${pkg.version} — ${pkg.license ?? 'consultar fonte'}`); for (const name of await readdir(folder)) if (/^(?:license|copying|notice)(?:[.-].*)?$/i.test(name)) await cp(resolve(folder,name),resolve(out,'licenses',`${pkg.name.replace(/[^a-zA-Z0-9_-]/g,'-')}-${pkg.version}-${name}`)); }
await writeFile(resolve(out,'NOTICE.txt'), notices.join('\n')+'\n');
